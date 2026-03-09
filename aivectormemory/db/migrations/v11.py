"""v11: issues/issues_archive 新增 tags 字段"""


def upgrade(conn, **_):
    issue_cols = {row[1] for row in conn.execute("PRAGMA table_info(issues)").fetchall()}
    if "tags" not in issue_cols:
        conn.execute("ALTER TABLE issues ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'")

    archive_cols = {row[1] for row in conn.execute("PRAGMA table_info(issues_archive)").fetchall()}
    if "tags" not in archive_cols:
        conn.execute("ALTER TABLE issues_archive ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'")
