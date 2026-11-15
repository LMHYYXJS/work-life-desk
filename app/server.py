# -*- coding: utf-8 -*-
"""本地服务：只监听 127.0.0.1，提供静态页面与 data 读写接口。

用法：
    pythonw app/server.py          # 正常启动（启动.bat 用它）
    python  app/server.py --no-browser --port 0 --base <临时目录>   # 测试用
"""

import argparse
import json
import mimetypes
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
WEB_DIR = APP_DIR / "web"
DEFAULT_BASE = APP_DIR.parent
PORT_RANGE = (8848, 8878)
MAX_BODY = 32 * 1024 * 1024

sys.path.insert(0, str(APP_DIR))
from data_store import APP_VERSION, ConflictError, DataStore, validate_doc  # noqa: E402

STORE = None  # 由 main() 注入
STATE = {"port": 0}


MIME_EXTRA = {
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}


def content_type_for(path: Path) -> str:
    return MIME_EXTRA.get(path.suffix.lower()) or (mimetypes.guess_type(path.name)[0] or "application/octet-stream")


class Handler(BaseHTTPRequestHandler):
    server_version = "WorkLifeDesk/" + APP_VERSION
    protocol_version = "HTTP/1.1"

    # ---- 基础 ----
    def log_message(self, fmt, *args):  # 静默：不刷控制台
        return

    def _send(self, status: int, body: bytes, ctype: str, extra=None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._send(status, body, "application/json; charset=utf-8")

    def _error(self, status: int, message: str, extra=None) -> None:
        payload = {"error": message}
        if extra:
            payload.update(extra)
        self._json(status, payload)

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        if length > MAX_BODY:
            raise ValueError("请求体过大")
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    # ---- 路由 ----
    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/health":
            self._json(200, {"ok": True, "appVersion": APP_VERSION, "port": STATE["port"]})
            return
        if path == "/api/data":
            self._json(200, {
                "doc": STORE.doc,
                "rev": STORE.doc.get("rev", 1),
                "meta": STORE.meta(),
                "warning": STORE.warning,
            })
            return
        if path == "/api/backups":
            self._json(200, {"items": STORE.list_backups()})
            return
        if path.startswith("/api/"):
            self._error(404, "未知接口")
            return
        self._serve_static(path)

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        try:
            payload = self._read_json()
        except ValueError as exc:
            self._error(400, f"请求体不是合法 JSON：{exc}")
            return
        except json.JSONDecodeError as exc:
            self._error(400, f"请求体不是合法 JSON：{exc}")
            return

        if path == "/api/data":
            try:
                result = STORE.save(payload.get("doc"), payload.get("baseRev"))
            except ConflictError as exc:
                self._json(409, {
                    "error": "conflict",
                    "message": "另一个标签页也改了数据",
                    "currentRev": exc.current_rev,
                })
                return
            except ValueError as exc:
                self._error(400, str(exc))
                return
            self._json(200, result)
            return

        if path == "/api/backup":
            try:
                info = STORE.make_backup(kind="manual")
            except OSError as exc:
                self._error(500, f"备份失败：{exc}")
                return
            self._json(200, info)
            return

        if path == "/api/restore":
            name = payload.get("name")
            doc = payload.get("doc")
            if not name and not doc:
                self._error(400, "缺少 name 或 doc")
                return
            try:
                result = STORE.restore(name=name, doc=doc)
            except FileNotFoundError as exc:
                self._error(404, str(exc))
                return
            except ValueError as exc:
                self._error(400, str(exc))
                return
            except json.JSONDecodeError as exc:
                self._error(400, f"备份文件不是合法 JSON：{exc}")
                return
            self._json(200, result)
            return

        self._error(404, "未知接口")

    # ---- 静态文件 ----
    def _serve_static(self, url_path: str) -> None:
        rel = "index.html" if url_path in ("", "/") else url_path.lstrip("/")
        candidate = (WEB_DIR / rel).resolve()
        try:
            candidate.relative_to(WEB_DIR.resolve())
        except ValueError:
            self._send(403, b"forbidden", "text/plain; charset=utf-8")
            return
        if not candidate.exists() or candidate.is_dir():
            index = WEB_DIR / "index.html"
            self._send(200, index.read_bytes(), "text/html; charset=utf-8")
            return
        try:
            body = candidate.read_bytes()
        except OSError:
            self._send(404, b"not found", "text/plain; charset=utf-8")
            return
        self._send(200, body, content_type_for(candidate))


def find_port(preferred=None):
    """顺序找可用端口；若已有实例在跑，返回 (None, 已存在端口)。"""
    ports = [preferred] if preferred is not None else []
    ports += [p for p in range(PORT_RANGE[0], PORT_RANGE[1] + 1) if p != preferred]
    for port in ports:
        if port == 0:
            return 0, None
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("127.0.0.1", port))
            except OSError:
                if _health_ok(port):
                    return None, port
                continue
        return port, None
    return None, None


def _health_ok(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1.2) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return bool(data.get("ok"))
    except Exception:
        return False


def build_server(port: int):
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.allow_reuse_address = False
    server.daemon_threads = True
    return server


def main(argv=None):
    parser = argparse.ArgumentParser(description="工作生活台本地服务")
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--base", default=str(DEFAULT_BASE))
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args(argv)

    global STORE
    STORE = DataStore(args.base)

    if args.port == 0:
        server = build_server(0)
        STATE["port"] = server.server_address[1]
        print(f"PORT={STATE['port']}", flush=True)
        _serve(server, open_browser=False)
        return

    port, existing = find_port(args.port)
    if port is None and existing:
        print(f"已在运行：http://127.0.0.1:{existing}/", flush=True)
        if not args.no_browser:
            webbrowser.open(f"http://127.0.0.1:{existing}/")
        return
    if port is None:
        print("没有可用端口（8848--8878 全被占用）", flush=True)
        return

    server = build_server(port)
    STATE["port"] = port
    print(f"PORT={port}", flush=True)
    _serve(server, open_browser=not args.no_browser)


def _serve(server, open_browser: bool):
    if open_browser:
        url = f"http://127.0.0.1:{STATE['port']}/"
        threading.Timer(0.9, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever(poll_interval=0.4)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
