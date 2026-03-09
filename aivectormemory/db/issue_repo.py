import json

from .base import BaseRepo


class IssueRepo(BaseRepo):
    def __init__(self, conn, project_dir: str = "", engine=None):
        super().__init__(conn, project_dir)
        self.engine = engine

    def _next_number(self) -> int:
        r1 = self.conn.execute(
            "SELECT MAX(issue_number) as m FROM issues WHERE project_dir=?",
            (self.project_dir,)
        ).fetchone()
        r2 = self.conn.execute(
            "SELECT MAX(issue_number) as m FROM issues_archive WHERE project_dir=?",
            (self.project_dir,)
        ).fetchone()
        return max(r1["m"] or 0, r2["m"] or 0) + 1

    def get_by_number(self, num: int) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM issues WHERE issue_number=? AND project_dir=?",
            (num, self.project_dir)
        ).fetchone()
        return self._normalize_issue(row)

    def get_archived_by_number(self, num: int) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM issues_archive WHERE issue_number=? AND project_dir=?",
            (num, self.project_dir)
        ).fetchone()
        return self._normalize_issue(row)

    def create(self, date: str, title: str, content: str = "", tags: list[str] | None = None,
               memory_id: str = "", parent_id: int = 0) -> dict:
        # 去重：同项目 + 同标题 + 未归档 → 返回已有记录
        existing = self.conn.execute(
            "SELECT * FROM issues WHERE project_dir=? AND title=? AND status!='archived'",
            (self.project_dir, title)
        ).fetchone()
        if existing:
            return {"id": existing["id"], "issue_number": existing["issue_number"], "date": existing["date"], "deduplicated": True}
        now = self._now()
        num = self._next_number()
        tags_json = json.dumps(self._normalize_tags(tags), ensure_ascii=False)
        cur = self.conn.execute(
            "INSERT INTO issues (project_dir, issue_number, date, title, status, content, tags, memory_id, parent_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (self.project_dir, num, date, title, "pending", content, tags_json, memory_id, parent_id, now, now)
        )
        self._commit()
        return {"id": cur.lastrowid, "issue_number": num, "date": date, "tags": self._normalize_tags(tags)}

    def update(self, issue_id: int, **fields) -> dict | None:
        row = self.conn.execute("SELECT * FROM issues WHERE id=? AND project_dir=?",
                                (issue_id, self.project_dir)).fetchone()
        if not row:
            return None
        allowed = {"title", "status", "content", "memory_id",
                   "description", "investigation", "root_cause", "solution",
                   "files_changed", "test_result", "notes", "feature_id", "tags"}
        updates = {k: v for k, v in fields.items() if k in allowed}
        if not updates:
            return self._normalize_issue(row)
        if "tags" in updates:
            updates["tags"] = json.dumps(self._normalize_tags(updates["tags"]), ensure_ascii=False)
        updates["updated_at"] = self._now()
        set_clause = ",".join(f"{k}=?" for k in updates)
        self.conn.execute(f"UPDATE issues SET {set_clause} WHERE id=?", [*updates.values(), issue_id])
        self._commit()
        return self._normalize_issue(self.conn.execute("SELECT * FROM issues WHERE id=?", (issue_id,)).fetchone())

    def archive(self, issue_id: int) -> dict | None:
        row = self.conn.execute("SELECT * FROM issues WHERE id=? AND project_dir=?",
                                (issue_id, self.project_dir)).fetchone()
        if not row:
            return None
        now = self._now()
        r = dict(row)
        cur = self.conn.execute(
            """INSERT INTO issues_archive (project_dir, issue_number, date, title, content, tags, memory_id,
               description, investigation, root_cause, solution, files_changed, test_result, notes,
               feature_id, parent_id, status, original_issue_id, archived_at, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (r["project_dir"], r["issue_number"], r["date"], r["title"], r["content"],
             json.dumps(self._normalize_tags(r.get("tags")), ensure_ascii=False),
             r.get("memory_id", ""),
             r.get("description", ""), r.get("investigation", ""), r.get("root_cause", ""),
             r.get("solution", ""), r.get("files_changed", "[]"), r.get("test_result", ""),
             r.get("notes", ""), r.get("feature_id", ""), r.get("parent_id", 0),
             r.get("status", ""), issue_id, now, r["created_at"])
        )
        archive_id = cur.lastrowid
        if self.engine:
            text = f"{r['title']} {r.get('description','')} {r.get('root_cause','')} {r.get('solution','')}"
            emb = self.engine.encode(text)
            self.conn.execute(
                "INSERT INTO vec_issues_archive (id, embedding) VALUES (?,?)",
                (archive_id, json.dumps(emb))
            )
        self.conn.execute("DELETE FROM issues WHERE id=?", (issue_id,))
        self._commit()
        return {"issue_id": issue_id, "archived_at": now, "memory_id": r.get("memory_id", "")}

    _BRIEF_COLS = "id, issue_number, date, title, status, feature_id, created_at"

    def list_by_date(self, date: str | None = None, status: str | None = None,
                     brief: bool = True, limit: int = 50, offset: int = 0,
                     keyword: str | None = None) -> tuple[list[dict], int]:
        cols = self._BRIEF_COLS if brief else "*"
        where, params = "WHERE project_dir=?", [self.project_dir]
        if date:
            where += " AND date=?"
            params.append(date)
        if status:
            where += " AND status=?"
            params.append(status)
        if keyword:
            where += " AND title LIKE ?"
            params.append(f"%{keyword}%")
        total = self.conn.execute(f"SELECT COUNT(*) as c FROM issues {where}", params).fetchone()["c"]
        sql = f"SELECT {cols} FROM issues {where} ORDER BY issue_number DESC LIMIT ? OFFSET ?"
        rows = [self._normalize_issue(r) for r in self.conn.execute(sql, params + [limit, offset]).fetchall()]
        return rows, total

    def list_all(self, date: str | None = None, keyword: str | None = None,
                 limit: int = 50, offset: int = 0) -> tuple[list[dict], int]:
        """UNION issues + issues_archive, return all issues."""
        cols = "id, issue_number, date, title, status, feature_id, created_at"
        w1, w2, p = "WHERE project_dir=?", "WHERE project_dir=?", [self.project_dir]
        p2 = [self.project_dir]
        if date:
            w1 += " AND date=?"; w2 += " AND date=?"
            p.append(date); p2.append(date)
        if keyword:
            w1 += " AND title LIKE ?"; w2 += " AND title LIKE ?"
            p.append(f"%{keyword}%"); p2.append(f"%{keyword}%")
        cnt = (f"SELECT COUNT(*) as c FROM ("
               f"SELECT id FROM issues {w1} UNION ALL "
               f"SELECT id FROM issues_archive {w2})")
        total = self.conn.execute(cnt, p + p2).fetchone()["c"]
        sql = (f"SELECT {cols}, NULL as archived_at FROM issues {w1} UNION ALL "
               f"SELECT {cols}, archived_at FROM issues_archive {w2} "
               f"ORDER BY issue_number DESC LIMIT ? OFFSET ?")
        rows = [self._normalize_issue(r) for r in self.conn.execute(sql, p + p2 + [limit, offset]).fetchall()]
        for r in rows:
            if r.get("archived_at"):
                r["status"] = "archived"
        return rows, total

    _BRIEF_COLS_ARCHIVE = "id, issue_number, date, title, status, feature_id, created_at, archived_at"

    def list_archived(self, date: str | None = None, brief: bool = True,
                      limit: int = 50, offset: int = 0,
                      keyword: str | None = None) -> tuple[list[dict], int]:
        cols = self._BRIEF_COLS_ARCHIVE if brief else "*"
        where, params = "WHERE project_dir=?", [self.project_dir]
        if date:
            where += " AND date=?"
            params.append(date)
        if keyword:
            where += " AND title LIKE ?"
            params.append(f"%{keyword}%")
        total = self.conn.execute(f"SELECT COUNT(*) as c FROM issues_archive {where}", params).fetchone()["c"]
        sql = f"SELECT {cols} FROM issues_archive {where} ORDER BY issue_number DESC LIMIT ? OFFSET ?"
        rows = [self._normalize_issue(r) for r in self.conn.execute(sql, params + [limit, offset]).fetchall()]
        return rows, total

    def get_by_id(self, issue_id: int) -> dict | None:
        row = self.conn.execute("SELECT * FROM issues WHERE id=? AND project_dir=?",
                                (issue_id, self.project_dir)).fetchone()
        return self._normalize_issue(row)

    def get_archived_by_id(self, issue_id: int) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM issues_archive WHERE original_issue_id=? AND project_dir=?",
            (issue_id, self.project_dir)
        ).fetchone()
        if not row:
            row = self.conn.execute("SELECT * FROM issues_archive WHERE id=? AND project_dir=?",
                                    (issue_id, self.project_dir)).fetchone()
        return self._normalize_issue(row)

    def delete(self, issue_id: int) -> dict | None:
        row = self.conn.execute("SELECT * FROM issues WHERE id=? AND project_dir=?",
                                (issue_id, self.project_dir)).fetchone()
        if not row:
            return None
        memory_id = row["memory_id"] if "memory_id" in row.keys() else ""
        self.conn.execute("DELETE FROM issues WHERE id=?", (issue_id,))
        self._commit()
        return {"issue_id": issue_id, "deleted": True, "memory_id": memory_id}

    def delete_archived(self, archive_id: int) -> dict | None:
        row = self.conn.execute("SELECT * FROM issues_archive WHERE id=? AND project_dir=?",
                                (archive_id, self.project_dir)).fetchone()
        if not row:
            return None
        memory_id = row["memory_id"] if "memory_id" in row.keys() else ""
        self.conn.execute("DELETE FROM issues_archive WHERE id=?", (archive_id,))
        self._commit()
        return {"archive_id": archive_id, "deleted": True, "memory_id": memory_id}

    def search_archive_by_vector(self, embedding: list[float], top_k: int = 5) -> list[dict]:
        rows = self.conn.execute(
            "SELECT id, distance FROM vec_issues_archive WHERE embedding MATCH ? AND k = ?",
            (json.dumps(embedding), top_k * 2)
        ).fetchall()
        results = []
        for r in rows:
            archive = self.conn.execute(
                "SELECT * FROM issues_archive WHERE id=? AND project_dir=?",
                (r["id"], self.project_dir)
            ).fetchone()
            if archive:
                d = self._normalize_issue(archive)
                d["similarity"] = round(1 - (r["distance"] ** 2) / 2, 4)
                results.append(d)
            if len(results) >= top_k:
                break
        return results

    def list_by_feature_id(self, feature_id: str) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM issues WHERE project_dir=? AND feature_id=?",
            (self.project_dir, feature_id)
        ).fetchall()
        return [self._normalize_issue(r) for r in rows]

    def count_active_by_feature(self, feature_id: str) -> int:
        row = self.conn.execute(
            "SELECT COUNT(*) as c FROM issues WHERE project_dir=? AND feature_id=?",
            (self.project_dir, feature_id)
        ).fetchone()
        return row["c"]

    @staticmethod
    def _normalize_tags(value) -> list[str]:
        if isinstance(value, list):
            return [str(tag) for tag in value if str(tag).strip()]
        if isinstance(value, str):
            if not value.strip():
                return []
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                return []
            if isinstance(parsed, list):
                return [str(tag) for tag in parsed if str(tag).strip()]
        return []

    def _normalize_issue(self, row) -> dict | None:
        if not row:
            return None
        issue = dict(row)
        if "tags" in issue:
            issue["tags"] = self._normalize_tags(issue.get("tags"))
        return issue

