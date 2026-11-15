# -*- coding: utf-8 -*-
"""数据层：唯一真源 data/data.json 的原子读写、版本号、每日备份、损坏恢复。

设计要点（对应 PRD 第 7 章）：
- 原子写：先写 .tmp 再 os.replace，避免断电产生半个坏文件
- rev：服务端自增版本号，客户端提交需带 baseRev，防止两个标签页静默覆盖
- 备份：每天首次写入生成一份 backups/YYYY-MM-DD.json；保留 N 天
- 损坏恢复：data.json 解析失败时保留坏文件，改用最近可用备份
"""

import copy
import datetime
import json
import os
import threading
from pathlib import Path

SCHEMA_VERSION = 1
APP_VERSION = "1.0.0"

_lock = threading.RLock()


def now_iso() -> str:
    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


def today_str() -> str:
    return datetime.date.today().isoformat()


def count_summary(doc: dict) -> dict:
    """各表格条数，用于备份预览与数据页总览。"""
    media = doc.get("media") or {}
    dev = doc.get("dev") or {}
    consult = doc.get("consult") or {}
    fitness = doc.get("fitness") or {}
    diet = doc.get("diet") or {}
    games = doc.get("games") or {}
    return {
        "tasks": len(doc.get("tasks") or []),
        "memos": len(doc.get("memos") or []),
        "ideas": len(media.get("ideas") or []),
        "posts": len(media.get("posts") or []),
        "followers": len(media.get("followers") or []),
        "projects": len(dev.get("projects") or []),
        "needs": len(dev.get("needs") or []),
        "todos": len(dev.get("todos") or []),
        "bugs": len(dev.get("bugs") or []),
        "logs": len(dev.get("logs") or []),
        "versions": len(dev.get("versions") or []),
        "leads": len(consult.get("leads") or []),
        "talks": len(consult.get("talks") or []),
        "incomes": len(consult.get("incomes") or []),
        "sessions": len(fitness.get("sessions") or []),
        "body": len(fitness.get("body") or []),
        "meals": len(diet.get("meals") or []),
        "daily": len(diet.get("daily") or []),
        "games": len(games.get("library") or []),
        "plays": len(games.get("plays") or []),
        "watchlist": len(games.get("watchlist") or []),
        "reviews": len(doc.get("reviews") or []),
    }


DEFAULT_SETTINGS = {
    "theme": "dark",
    "fontSize": "normal",
    "autoBackup": True,
    "backupKeepDays": 30,
    "carryOverYesterday": True,
    "homeSummary": ["media", "dev", "fitness", "games"],
    "projectProgressMode": "auto",
    "calorieGoal": 2200,
    "waterGoal": 8,
    "entertainmentWeeklyLimit": 10,
    "lastBackupDate": None,
}


def default_doc() -> dict:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "rev": 1,
        "meta": {
            "createdAt": now_iso(),
            "lastSavedAt": now_iso(),
            "appVersion": APP_VERSION,
        },
        "settings": copy.deepcopy(DEFAULT_SETTINGS),
        "tasks": [],
        "memos": [],
        "media": {"ideas": [], "posts": [], "followers": [], "nextUpdateAt": None},
        "dev": {"projects": [], "needs": [], "todos": [], "bugs": [], "logs": [], "versions": []},
        "consult": {"leads": [], "talks": [], "incomes": []},
        "fitness": {"weekTemplate": [], "sessions": [], "body": [], "exerciseLib": []},
        "diet": {"meals": [], "foodLib": [], "daily": []},
        "games": {"library": [], "plays": [], "watchlist": []},
        "reviews": [],
    }


REQUIRED_NAMESPACES = ("media", "dev", "consult", "fitness", "diet", "games")


def validate_doc(doc) -> tuple:
    """恢复/提交前的结构校验。返回 (ok, 人话原因)。"""
    if not isinstance(doc, dict):
        return False, "文件不是一个数据对象"
    if not isinstance(doc.get("schemaVersion"), int):
        return False, "缺少 schemaVersion，可能不是本应用的数据文件"
    for key in ("tasks", "memos", "reviews"):
        if not isinstance(doc.get(key), list):
            return False, f"{key} 不是列表"
    if not isinstance(doc.get("settings"), dict):
        return False, "settings 不是对象"
    for ns in REQUIRED_NAMESPACES:
        if not isinstance(doc.get(ns), dict):
            return False, f"缺少 {ns} 分区"
    return True, ""


def normalize_doc(doc: dict) -> dict:
    """补齐缺失字段（只做补字段，不做破坏性改动）。"""
    base = default_doc()
    out = copy.deepcopy(doc)
    for key, value in base.items():
        if key not in out:
            out[key] = copy.deepcopy(value)
    if not isinstance(out.get("meta"), dict):
        out["meta"] = copy.deepcopy(base["meta"])
    merged_settings = copy.deepcopy(DEFAULT_SETTINGS)
    merged_settings.update(out.get("settings") or {})
    out["settings"] = merged_settings
    if not isinstance(out.get("rev"), int):
        out["rev"] = 1
    for ns, sub in (
        ("media", ("ideas", "posts", "followers")),
        ("dev", ("projects", "needs", "todos", "bugs", "logs", "versions")),
        ("consult", ("leads", "talks", "incomes")),
        ("fitness", ("weekTemplate", "sessions", "body", "exerciseLib")),
        ("diet", ("meals", "foodLib", "daily")),
        ("games", ("library", "plays", "watchlist")),
    ):
        block = out.get(ns)
        if not isinstance(block, dict):
            block = {}
            out[ns] = block
        for sub_key in sub:
            if not isinstance(block.get(sub_key), list):
                block[sub_key] = []
    if not isinstance(out.get("media", {}).get("nextUpdateAt"), (str, type(None))):
        out["media"]["nextUpdateAt"] = None
    return out


class ConflictError(Exception):
    def __init__(self, current_rev: int):
        super().__init__("rev conflict")
        self.current_rev = current_rev


class DataStore:
    def __init__(self, base_dir):
        self.base_dir = Path(base_dir)
        self.data_dir = self.base_dir / "data"
        self.backup_dir = self.data_dir / "backups"
        self.data_path = self.data_dir / "data.json"
        self.log_path = self.data_dir / "runtime.log"
        self.warning = None
        self.doc = None
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        self.load()

    # ---------- 加载 ----------
    def load(self) -> None:
        with _lock:
            if not self.data_path.exists():
                self.doc = default_doc()
                self._write(self.doc)
                return
            try:
                text = self.data_path.read_text(encoding="utf-8")
                parsed = json.loads(text)
                ok, reason = validate_doc(parsed)
                if not ok:
                    raise ValueError(reason)
                self.doc = normalize_doc(parsed)
            except Exception as exc:  # 损坏 → 尝试备份
                self._recover_from_broken(str(exc))

    def _recover_from_broken(self, reason: str) -> None:
        stamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        broken_name = f"data.broken-{stamp}.json"
        broken_path = self.data_dir / broken_name
        try:
            if self.data_path.exists():
                os.replace(self.data_path, broken_path)
        except OSError:
            broken_path = None
        recovered = None
        for item in sorted(self.backup_dir.glob("*.json"), reverse=True):
            try:
                parsed = json.loads(item.read_text(encoding="utf-8"))
                ok, _ = validate_doc(parsed)
                if ok:
                    recovered = (item, normalize_doc(parsed))
                    break
            except Exception:
                continue
        if recovered:
            self.doc = recovered[1]
            self.doc["rev"] = int(self.doc.get("rev") or 1) + 1
            self._write(self.doc)
            self.warning = (
                f"数据文件读不了（{reason}），已用 {recovered[0].name} 的备份打开；"
                f"原文件已保留为 {broken_name}"
            )
        else:
            self.doc = default_doc()
            self.doc["rev"] = 1
            self._write(self.doc)
            self.warning = (
                f"数据文件读不了（{reason}），且没有可用备份，已新建空数据；"
                f"原文件已保留为 {broken_name if broken_path else '（无法改名）'}"
            )
        self._log(self.warning)

    # ---------- 写入 ----------
    def _write(self, doc: dict) -> None:
        doc["meta"]["lastSavedAt"] = now_iso()
        tmp_path = self.data_path.with_suffix(".json.tmp")
        payload = json.dumps(doc, ensure_ascii=False, indent=1)
        with open(tmp_path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_path, self.data_path)

    def save(self, incoming: dict, base_rev) -> dict:
        with _lock:
            ok, reason = validate_doc(incoming)
            if not ok:
                raise ValueError(reason)
            current_rev = int(self.doc.get("rev") or 1)
            if base_rev is None:
                raise ConflictError(current_rev)
            if int(base_rev) != current_rev:
                raise ConflictError(current_rev)
            doc = normalize_doc(incoming)
            doc["rev"] = current_rev + 1
            doc["meta"]["lastSavedAt"] = now_iso()
            self._write(doc)
            self.doc = doc
            backup_written = self._maybe_daily_backup()
            return {
                "rev": doc["rev"],
                "lastSavedAt": doc["meta"]["lastSavedAt"],
                "backupWritten": backup_written,
            }

    # ---------- 备份 ----------
    def _maybe_daily_backup(self) -> bool:
        settings = self.doc.get("settings") or {}
        if not settings.get("autoBackup", True):
            return False
        day = today_str()
        target = self.backup_dir / f"{day}.json"
        if target.exists():
            return False
        try:
            with open(target, "w", encoding="utf-8", newline="\n") as handle:
                handle.write(json.dumps(self.doc, ensure_ascii=False, indent=1))
                handle.flush()
                os.fsync(handle.fileno())
        except OSError as exc:
            self._log(f"每日备份失败：{exc}")
            return False
        settings["lastBackupDate"] = day
        self.doc["settings"] = settings
        self._write(self.doc)
        self._rotate_backups()
        return True

    def _rotate_backups(self) -> None:
        keep_days = int((self.doc.get("settings") or {}).get("backupKeepDays") or 30)
        if keep_days <= 0:
            return
        cutoff = (datetime.date.today() - datetime.timedelta(days=keep_days)).isoformat()
        for item in list(self.backup_dir.glob("*.json")):
            day = item.name[:10]
            if len(day) == 10 and day < cutoff:
                try:
                    item.unlink()
                except OSError as exc:
                    self._log(f"删除旧备份失败 {item.name}: {exc}")

    def make_backup(self, prefix: str = "", kind: str = "manual") -> dict:
        with _lock:
            stamp = datetime.datetime.now().strftime("%H%M%S")
            day = today_str()
            name = f"{day}-{prefix}{stamp}.json" if prefix else f"{day}-{stamp}.json"
            target = self.backup_dir / name
            with open(target, "w", encoding="utf-8", newline="\n") as handle:
                handle.write(json.dumps(self.doc, ensure_ascii=False, indent=1))
                handle.flush()
                os.fsync(handle.fileno())
            return {
                "name": name,
                "size": target.stat().st_size,
                "createdAt": now_iso(),
                "kind": kind,
            }

    def list_backups(self) -> list:
        items = []
        for path in self.backup_dir.glob("*.json"):
            try:
                stat = path.stat()
                parsed = json.loads(path.read_text(encoding="utf-8"))
                ok, _ = validate_doc(parsed)
                counts = count_summary(parsed) if ok else {}
                items.append({
                    "name": path.name,
                    "date": path.name[:10],
                    "size": stat.st_size,
                    "mtime": datetime.datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
                    "counts": counts,
                    "valid": ok,
                    "kind": "pre-restore" if "pre-restore" in path.name else ("auto" if len(path.name) == 15 else "manual"),
                })
            except Exception as exc:
                items.append({
                    "name": path.name,
                    "date": path.name[:10],
                    "size": path.stat().st_size if path.exists() else 0,
                    "mtime": "",
                    "counts": {},
                    "valid": False,
                    "kind": "unknown",
                    "error": str(exc),
                })
        items.sort(key=lambda item: item["name"], reverse=True)
        return items

    def restore(self, name=None, doc=None) -> dict:
        with _lock:
            pre = self.make_backup(prefix="pre-restore-", kind="pre-restore")
            if name:
                safe_name = Path(str(name)).name
                path = self.backup_dir / safe_name
                if not path.exists():
                    raise FileNotFoundError(f"备份不存在：{safe_name}")
                parsed = json.loads(path.read_text(encoding="utf-8"))
            else:
                parsed = doc
            ok, reason = validate_doc(parsed)
            if not ok:
                raise ValueError(reason)
            restored = normalize_doc(parsed)
            restored["rev"] = int(self.doc.get("rev") or 1) + 1
            self._write(restored)
            self.doc = restored
            return {
                "restoredFrom": name or "上传的文件",
                "rev": restored["rev"],
                "preBackupName": pre["name"],
            }

    # ---------- 元信息 ----------
    def meta(self) -> dict:
        size = self.data_path.stat().st_size if self.data_path.exists() else 0
        return {
            "path": str(self.data_path),
            "size": size,
            "baseDir": str(self.base_dir),
            "appVersion": APP_VERSION,
            "schemaVersion": SCHEMA_VERSION,
            "counts": count_summary(self.doc),
        }

    def _log(self, message: str) -> None:
        try:
            with open(self.log_path, "a", encoding="utf-8") as handle:
                handle.write(f"[{now_iso()}] {message}\n")
        except OSError:
            pass
