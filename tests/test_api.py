# -*- coding: utf-8 -*-
"""本地服务接口测试：启动真实子进程，用 HTTP 逐条验证。"""

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PYTHON = ROOT / "app" / "runtime" / "python.exe"
SERVER = ROOT / "app" / "server.py"


class ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="wld-api-")
        cls.proc = subprocess.Popen(
            [str(PYTHON), str(SERVER), "--port", "0", "--base", cls.tmp, "--no-browser"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8",
        )
        cls.port = None
        for _ in range(50):
            line = cls.proc.stdout.readline()
            if line.startswith("PORT="):
                cls.port = int(line.strip().split("=", 1)[1])
                break
        if cls.port is None:
            cls.proc.kill()
            raise RuntimeError("服务没有启动成功")
        cls.base = f"http://127.0.0.1:{cls.port}"

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        try:
            cls.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            cls.proc.kill()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def call(self, path, method="GET", body=None):
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            try:
                payload = json.loads(exc.read().decode("utf-8"))
            except Exception:
                payload = {}
            return exc.code, payload

    def get_doc(self):
        status, payload = self.call("/api/data")
        self.assertEqual(status, 200)
        return payload

    # ---- 基础 ----
    def test_health(self):
        status, payload = self.call("/api/health")
        self.assertEqual(status, 200)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["port"], self.port)

    def test_data_default(self):
        payload = self.get_doc()
        self.assertIsInstance(payload["rev"], int)
        self.assertGreaterEqual(payload["rev"], 1)
        self.assertIsInstance(payload["doc"]["tasks"], list)
        self.assertIn("settings", payload["doc"])
        self.assertIn("path", payload["meta"])
        self.assertTrue(Path(payload["meta"]["path"]).exists())

    def test_static_index(self):
        with urllib.request.urlopen(self.base + "/", timeout=5) as resp:
            body = resp.read().decode("utf-8")
            self.assertIn("工作生活台", body)
            self.assertEqual(resp.headers.get_content_type(), "text/html")

    def test_static_js_mime(self):
        with urllib.request.urlopen(self.base + "/js/schema.js", timeout=5) as resp:
            self.assertIn("javascript", resp.headers["Content-Type"])
            self.assertIn("SCHEMA_VERSION", resp.read().decode("utf-8"))

    # ---- 保存与冲突 ----
    def test_save_roundtrip(self):
        payload = self.get_doc()
        doc = payload["doc"]
        doc["tasks"] = [{"id": "t1", "title": "接口测试任务", "date": "2026-11-15", "priority": "p2", "done": False}]
        status, result = self.call("/api/data", "POST", {"doc": doc, "baseRev": payload["rev"]})
        self.assertEqual(status, 200)
        self.assertEqual(result["rev"], payload["rev"] + 1)
        self.assertEqual(len(self.get_doc()["doc"]["tasks"]), 1)

    def test_stale_rev_conflict(self):
        rev = self.get_doc()["rev"]
        doc = self.get_doc()["doc"]
        self.call("/api/data", "POST", {"doc": doc, "baseRev": rev})
        status, result = self.call("/api/data", "POST", {"doc": doc, "baseRev": rev})
        self.assertEqual(status, 409)
        self.assertEqual(result["error"], "conflict")

    def test_invalid_doc_rejected(self):
        status, result = self.call("/api/data", "POST", {"doc": {"schemaVersion": 1}, "baseRev": self.get_doc()["rev"]})
        self.assertEqual(status, 400)

    # ---- 备份与恢复 ----
    def test_backup_and_restore(self):
        status, backup = self.call("/api/backup", "POST", {})
        self.assertEqual(status, 200)
        self.assertTrue((Path(self.tmp) / "data" / "backups" / backup["name"]).exists())
        status, listing = self.call("/api/backups")
        self.assertEqual(status, 200)
        self.assertTrue(any(item["name"] == backup["name"] for item in listing["items"]))
        # 改动数据后恢复
        payload = self.get_doc()
        doc = payload["doc"]
        doc["tasks"] = []
        self.call("/api/data", "POST", {"doc": doc, "baseRev": payload["rev"]})
        status, result = self.call("/api/restore", "POST", {"name": backup["name"]})
        self.assertEqual(status, 200)
        self.assertIn("pre-restore", result["preBackupName"])
        self.assertTrue((Path(self.tmp) / "data" / "backups" / result["preBackupName"]).exists())

    def test_restore_by_doc(self):
        payload = self.get_doc()
        status, result = self.call("/api/restore", "POST", {"doc": payload["doc"]})
        self.assertEqual(status, 200)
        status, bad = self.call("/api/restore", "POST", {"doc": {"schemaVersion": 1}})
        self.assertEqual(status, 400)

    def test_restore_missing_name(self):
        status, result = self.call("/api/restore", "POST", {"name": "2099-99-99.json"})
        self.assertEqual(status, 404)

    def test_unknown_api(self):
        status, result = self.call("/api/nothing")
        self.assertEqual(status, 404)

    def test_path_traversal_blocked(self):
        req = urllib.request.Request(self.base + "/../data/data.json")
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                body = resp.read().decode("utf-8", "ignore")
                self.assertNotIn("schemaVersion", body)
        except urllib.error.HTTPError as exc:
            self.assertIn(exc.code, (403, 404))


if __name__ == "__main__":
    unittest.main()
