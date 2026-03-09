import json
import sqlite3
import uuid
from datetime import datetime
from typing import Any

_UNSET = object()


class BaseRepo:
    """所有 Repo 的基类"""

    def __init__(self, conn: sqlite3.Connection, project_dir: str = ""):
        self.conn = conn
        self.project_dir = project_dir

    def _now(self) -> str:
        return datetime.now().astimezone().isoformat()

    def _commit(self) -> None:
        from aivectormemory.db.connection import _in_transaction
        if not _in_transaction:
            self.conn.commit()


class BaseMemoryRepo(BaseRepo):
    """MemoryRepo 和 UserMemoryRepo 的公共基类"""

    TABLE = ""
    VEC_TABLE = ""
    TAG_TABLE = ""

    def _sync_tags(self, mid: str, tags: list[str]) -> None:
        self.conn.execute(f"DELETE FROM {self.TAG_TABLE} WHERE memory_id=?", (mid,))
        if tags:
            self.conn.executemany(
                f"INSERT OR IGNORE INTO {self.TAG_TABLE} (memory_id, tag) VALUES (?,?)",
                [(mid, t) for t in tags])

    def insert(self, content: str, tags: list[str], session_id: int,
               embedding: list[float], dedup_threshold: float = 0.95,
               source: str = "manual", **extra) -> dict:
        dup = self._find_duplicate(embedding, dedup_threshold)
        if dup:
            return self._update_existing(dup["id"], content, tags, session_id, embedding)
        now = self._now()
        mid = uuid.uuid4().hex[:12]
        cols, vals = self._build_insert(mid, content, tags, source, session_id, now, extra)
        placeholders = ",".join("?" * len(vals))
        self.conn.execute(f"INSERT INTO {self.TABLE} ({cols}) VALUES ({placeholders})", vals)
        self.conn.execute(f"INSERT INTO {self.VEC_TABLE} (id, embedding) VALUES (?,?)", (mid, json.dumps(embedding)))
        self._sync_tags(mid, tags)
        self._commit()
        return {"id": mid, "action": "created"}

    def _build_insert(self, mid: str, content: str, tags: list[str], source: str,
                       session_id: int, now: str, extra: dict[str, Any]) -> tuple[str, list]:
        """子类覆盖以添加额外字段"""
        raise NotImplementedError

    def _update_existing(self, mid: str, content: str, tags: list[str],
                         session_id: int, embedding: list[float]) -> dict:
        now = self._now()
        self.conn.execute(
            f"UPDATE {self.TABLE} SET content=?, tags=?, session_id=?, updated_at=? WHERE id=?",
            (content, json.dumps(tags, ensure_ascii=False), session_id, now, mid))
        self.conn.execute(f"DELETE FROM {self.VEC_TABLE} WHERE id=?", (mid,))
        self.conn.execute(f"INSERT INTO {self.VEC_TABLE} (id, embedding) VALUES (?,?)", (mid, json.dumps(embedding)))
        self._sync_tags(mid, tags)
        self._commit()
        return {"id": mid, "action": "updated"}

    def _find_duplicate(self, embedding: list[float], threshold: float) -> dict | None:
        rows = self.conn.execute(
            f"SELECT id, distance FROM {self.VEC_TABLE} WHERE embedding MATCH ? AND k = 5",
            (json.dumps(embedding),)
        ).fetchall()
        for r in rows:
            if not self._is_same_scope(r["id"]):
                continue
            similarity = 1 - (r["distance"] ** 2) / 2
            if similarity >= threshold:
                return dict(r)
        return None

    def _is_same_scope(self, mid: str) -> bool:
        """子类覆盖：MemoryRepo 需检查 project_dir，UserMemoryRepo 直接返回 True"""
        return True

    def search_by_vector(self, embedding: list[float], top_k: int = 5, **filters) -> list[dict]:
        multiplier = 3
        while multiplier <= 10:
            k = top_k * multiplier
            rows = self.conn.execute(
                f"SELECT id, distance FROM {self.VEC_TABLE} WHERE embedding MATCH ? AND k = ?",
                (json.dumps(embedding), k)
            ).fetchall()
            results = self._filter_and_collect(rows, top_k, filters)
            if len(results) >= top_k or multiplier >= 10:
                return results
            multiplier += 2
        return results

    def _filter_and_collect(self, rows: list, top_k: int, filters: dict) -> list[dict]:
        results = []
        for r in rows:
            mem = self.conn.execute(f"SELECT * FROM {self.TABLE} WHERE id=?", (r["id"],)).fetchone()
            if not mem or not self._match_filters(mem, filters):
                continue
            d = dict(mem)
            d["distance"] = r["distance"]
            results.append(d)
            if len(results) >= top_k:
                break
        return results

    def _match_filters(self, mem: dict, filters: dict) -> bool:
        """子类覆盖以添加过滤逻辑"""
        return True

    def update(self, mid: str, *, content: Any = _UNSET, tags: Any = _UNSET) -> dict | None:
        row = self.conn.execute(f"SELECT * FROM {self.TABLE} WHERE id=?", (mid,)).fetchone()
        if not row:
            return None

        updates: dict[str, Any] = {}
        if content is not _UNSET:
            updates["content"] = content
        if tags is not _UNSET:
            normalized_tags = tags or []
            updates["tags"] = json.dumps(normalized_tags, ensure_ascii=False)

        if not updates:
            return dict(row)

        updates["updated_at"] = self._now()
        set_clause = ",".join(f"{k}=?" for k in updates)
        self.conn.execute(
            f"UPDATE {self.TABLE} SET {set_clause} WHERE id=?",
            [*updates.values(), mid],
        )
        if tags is not _UNSET and self.TAG_TABLE:
            self._sync_tags(mid, normalized_tags)
        self._commit()
        return self.get_by_id(mid)

    def search_by_vector_with_tags(self, embedding: list[float], tags: list[str],
                                    top_k: int = 5, **filters) -> list[dict]:
        import numpy as np
        candidates = self.list_by_tags(tags, limit=1000, tags_mode="any", **filters)
        if not candidates:
            return []
        query_vec = np.array(embedding, dtype=np.float32)
        final = []
        for mem in candidates:
            row = self.conn.execute(f"SELECT embedding FROM {self.VEC_TABLE} WHERE id=?", (mem["id"],)).fetchone()
            if not row:
                continue
            raw = row["embedding"]
            vec = np.frombuffer(raw, dtype=np.float32) if isinstance(raw, (bytes, memoryview)) else np.array(json.loads(raw), dtype=np.float32)
            cos_sim = float(np.dot(query_vec, vec) / (np.linalg.norm(query_vec) * np.linalg.norm(vec) + 1e-9))
            d = dict(mem)
            d["distance"] = 1 - cos_sim
            final.append(d)
        final.sort(key=lambda x: x["distance"])
        return final[:top_k]

    def delete(self, mid: str) -> bool:
        cur = self.conn.execute(f"DELETE FROM {self.TABLE} WHERE id=?", (mid,))
        self.conn.execute(f"DELETE FROM {self.VEC_TABLE} WHERE id=?", (mid,))
        if self.TAG_TABLE:
            self.conn.execute(f"DELETE FROM {self.TAG_TABLE} WHERE memory_id=?", (mid,))
        self._commit()
        return cur.rowcount > 0

    def get_by_id(self, mid: str) -> dict | None:
        row = self.conn.execute(f"SELECT * FROM {self.TABLE} WHERE id=?", (mid,)).fetchone()
        return dict(row) if row else None

    def list_by_tags(self, tags: list[str], limit: int = 100, **filters) -> list[dict]:
        """子类覆盖"""
        raise NotImplementedError

    def get_tag_counts(self, **filters) -> dict[str, int]:
        """子类覆盖"""
        raise NotImplementedError

    def get_ids_with_tag(self, tag: str, **filters) -> list[dict]:
        """子类覆盖"""
        raise NotImplementedError
