# -*- coding: utf-8 -*-
"""数据层单元测试：原子写、rev 冲突、备份、恢复、损坏恢复、校验。"""

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent / "app"
sys.path.insert(0, str(APP_DIR))

from data_store import (  # noqa: E402
    ConflictError,
    DataStore,
    count_summary,
    default_doc,
    normalize_doc,
    validate_doc,
)


class DataStoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="wld-test-")
        self.store = DataStore(self.tmp)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    # ---- 首次启动 ----
    def test_creates_data_file_with_defaults(self):
        path = Path(self.tmp) / "data" / "data.json"
        self.assertTrue(path.exists(), "首次启动必须自动创建 data.json")
        doc = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(doc["schemaVersion"], 1)
        self.assertEqual(doc["rev"], 1)
        self.assertIsInstance(doc["tasks"], list)
        self.assertTrue((Path(self.tmp) / "data" / "backups").is_dir())

    # ---- 保存与版本号 ----
    def test_save_increments_rev_and_persists(self):
        doc = json.loads(json.dumps(self.store.doc))
        doc["tasks"].append({"id": "t1", "title": "写测试", "date": "2026-11-15", "priority": "p2", "done": False})
        result = self.store.save(doc, self.store.doc["rev"])
        self.assertEqual(result["rev"], 2)
        reloaded = json.loads((Path(self.tmp) / "data" / "data.json").read_text(encoding="utf-8"))
        self.assertEqual(len(reloaded["tasks"]), 1)
        self.assertEqual(reloaded["rev"], 2)

    def test_save_with_stale_rev_raises_conflict(self):
        doc = json.loads(json.dumps(self.store.doc))
        self.store.save(doc, self.store.doc["rev"])
        with self.assertRaises(ConflictError) as ctx:
            self.store.save(doc, 1)
        self.assertEqual(ctx.exception.current_rev, 2)

    def test_no_tmp_file_left_after_save(self):
        doc = json.loads(json.dumps(self.store.doc))
        self.store.save(doc, self.store.doc["rev"])
        leftovers = list((Path(self.tmp) / "data").glob("*.tmp"))
        self.assertEqual(leftovers, [], "保存后不应残留临时文件")

    def test_invalid_doc_rejected(self):
        with self.assertRaises(ValueError):
            self.store.save({"schemaVersion": 1}, self.store.doc["rev"])

    # ---- 备份 ----
    def test_daily_backup_created_once_per_day(self):
        doc = json.loads(json.dumps(self.store.doc))
        first = self.store.save(doc, self.store.doc["rev"])
        self.assertTrue(first["backupWritten"], "当天首次保存应生成每日备份")
        second = self.store.save(self.store.doc, self.store.doc["rev"])
        self.assertFalse(second["backupWritten"], "同一天再次保存不应重复生成")
        backups = list((Path(self.tmp) / "data" / "backups").glob("*.json"))
        self.assertEqual(len(backups), 1)

    def test_daily_backup_disabled(self):
        doc = json.loads(json.dumps(self.store.doc))
        doc["settings"]["autoBackup"] = False
        result = self.store.save(doc, self.store.doc["rev"])
        self.assertFalse(result["backupWritten"])
        self.assertEqual(list((Path(self.tmp) / "data" / "backups").glob("*.json")), [])

    def test_manual_backup_does_not_overwrite_daily(self):
        manual = self.store.make_backup()
        self.assertTrue((Path(self.tmp) / "data" / "backups" / manual["name"]).exists())
        doc = json.loads(json.dumps(self.store.doc))
        daily = self.store.save(doc, self.store.doc["rev"])
        self.assertTrue(daily["backupWritten"])
        self.assertTrue((Path(self.tmp) / "data" / "backups" / manual["name"]).exists())

    def test_list_backups_returns_counts(self):
        self.store.make_backup()
        items = self.store.list_backups()
        self.assertTrue(items)
        self.assertIn("counts", items[0])
        self.assertIn("tasks", items[0]["counts"])

    def test_rotation_deletes_old_backups(self):
        backup_dir = Path(self.tmp) / "data" / "backups"
        old = backup_dir / "2020-01-01.json"
        old.write_text("{}", encoding="utf-8")
        doc = json.loads(json.dumps(self.store.doc))
        doc["settings"]["backupKeepDays"] = 7
        self.store.save(doc, self.store.doc["rev"])
        self.assertFalse(old.exists(), "超出保留天数的备份应被删除")

    # ---- 恢复 ----
    def test_restore_from_backup_creates_pre_backup(self):
        doc = json.loads(json.dumps(self.store.doc))
        doc["tasks"].append({"id": "t1", "title": "旧数据", "date": "2026-11-15", "priority": "p2", "done": False})
        self.store.save(doc, self.store.doc["rev"])
        backup = self.store.make_backup()
        # 改为空任务后再恢复
        cleared = json.loads(json.dumps(self.store.doc))
        cleared["tasks"] = []
        self.store.save(cleared, self.store.doc["rev"])
        result = self.store.restore(name=backup["name"])
        self.assertEqual(len(self.store.doc["tasks"]), 1, "恢复后应回到备份状态")
        self.assertIn("pre-restore", result["preBackupName"])
        self.assertTrue((Path(self.tmp) / "data" / "backups" / result["preBackupName"]).exists())

    def test_restore_rejects_broken_doc(self):
        before = json.dumps(self.store.doc, ensure_ascii=False)
        with self.assertRaises(ValueError):
            self.store.restore(doc={"schemaVersion": "not-int"})
        after = json.dumps(self.store.doc, ensure_ascii=False)
        self.assertEqual(before, after, "校验失败时不得改动现有数据")

    def test_restore_missing_backup_raises(self):
        with self.assertRaises(FileNotFoundError):
            self.store.restore(name="2020-99-99.json")

    # ---- 损坏恢复 ----
    def test_corrupt_data_recovers_from_backup(self):
        self.store.make_backup()
        broken = Path(self.tmp) / "data" / "data.json"
        broken.write_text('{"schemaVersion": 1, "tasks": [', encoding="utf-8")
        store2 = DataStore(self.tmp)
        self.assertTrue(store2.warning, "损坏时必须给出提示")
        self.assertIsInstance(store2.doc["tasks"], list)
        preserved = list((Path(self.tmp) / "data").glob("data.broken-*.json"))
        self.assertTrue(preserved, "坏文件应改名保留")

    def test_corrupt_without_backup_starts_empty(self):
        broken = Path(self.tmp) / "data" / "data.json"
        broken.write_text("not json at all", encoding="utf-8")
        store2 = DataStore(self.tmp)
        self.assertTrue(store2.warning)
        self.assertEqual(store2.doc["tasks"], [])


class SchemaTest(unittest.TestCase):
    def test_default_doc_is_valid(self):
        ok, reason = validate_doc(default_doc())
        self.assertTrue(ok, reason)

    def test_validate_rejects_missing_namespace(self):
        doc = default_doc()
        del doc["dev"]
        ok, reason = validate_doc(doc)
        self.assertFalse(ok)
        self.assertIn("dev", reason)

    def test_normalize_fills_missing(self):
        doc = {"schemaVersion": 1}
        out = normalize_doc(doc)
        self.assertEqual(out["dev"]["bugs"], [])
        self.assertEqual(out["settings"]["waterGoal"], 8)

    def test_count_summary(self):
        doc = default_doc()
        doc["tasks"] = [{"id": "a"}, {"id": "b"}]
        doc["diet"]["meals"] = [{"id": "m"}]
        summary = count_summary(doc)
        self.assertEqual(summary["tasks"], 2)
        self.assertEqual(summary["meals"], 1)
        self.assertEqual(summary["projects"], 0)


if __name__ == "__main__":
    unittest.main()
