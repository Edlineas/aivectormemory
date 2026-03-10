package db

import (
	"database/sql"
	"fmt"
	"sync"

	_ "github.com/mattn/go-sqlite3"
)

type DB struct {
	conn *sql.DB
	mu   sync.RWMutex
}

// Core tables that the desktop app needs (matches Python schema.py)
var coreTables = []string{
	`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL DEFAULT 0)`,
	`CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT (datetime('now')),
		last_login TEXT
	)`,
	`CREATE TABLE IF NOT EXISTS memories (
		id TEXT PRIMARY KEY,
		content TEXT NOT NULL,
		tags TEXT NOT NULL DEFAULT '[]',
		scope TEXT NOT NULL DEFAULT 'project',
		source TEXT NOT NULL DEFAULT 'manual',
		project_dir TEXT NOT NULL DEFAULT '',
		session_id INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS user_memories (
		id TEXT PRIMARY KEY,
		content TEXT NOT NULL,
		tags TEXT NOT NULL DEFAULT '[]',
		source TEXT NOT NULL DEFAULT 'manual',
		session_id INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS session_state (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		project_dir TEXT NOT NULL DEFAULT '',
		is_blocked INTEGER NOT NULL DEFAULT 0,
		block_reason TEXT NOT NULL DEFAULT '',
		next_step TEXT NOT NULL DEFAULT '',
		current_task TEXT NOT NULL DEFAULT '',
		progress TEXT NOT NULL DEFAULT '[]',
		recent_changes TEXT NOT NULL DEFAULT '[]',
		pending TEXT NOT NULL DEFAULT '[]',
		updated_at TEXT NOT NULL,
		last_session_id INTEGER NOT NULL DEFAULT 0,
		UNIQUE(project_dir)
	)`,
	`CREATE TABLE IF NOT EXISTS issues (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		project_dir TEXT NOT NULL DEFAULT '',
		issue_number INTEGER NOT NULL,
		date TEXT NOT NULL,
		title TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'pending',
		content TEXT NOT NULL DEFAULT '',
		tags TEXT NOT NULL DEFAULT '[]',
		description TEXT NOT NULL DEFAULT '',
		investigation TEXT NOT NULL DEFAULT '',
		root_cause TEXT NOT NULL DEFAULT '',
		solution TEXT NOT NULL DEFAULT '',
		files_changed TEXT NOT NULL DEFAULT '[]',
		test_result TEXT NOT NULL DEFAULT '',
		notes TEXT NOT NULL DEFAULT '',
		feature_id TEXT NOT NULL DEFAULT '',
		parent_id INTEGER NOT NULL DEFAULT 0,
		memory_id TEXT NOT NULL DEFAULT '',
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS issues_archive (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		project_dir TEXT NOT NULL DEFAULT '',
		issue_number INTEGER NOT NULL,
		date TEXT NOT NULL,
		title TEXT NOT NULL,
		content TEXT NOT NULL DEFAULT '',
		tags TEXT NOT NULL DEFAULT '[]',
		description TEXT NOT NULL DEFAULT '',
		investigation TEXT NOT NULL DEFAULT '',
		root_cause TEXT NOT NULL DEFAULT '',
		solution TEXT NOT NULL DEFAULT '',
		files_changed TEXT NOT NULL DEFAULT '[]',
		test_result TEXT NOT NULL DEFAULT '',
		notes TEXT NOT NULL DEFAULT '',
		feature_id TEXT NOT NULL DEFAULT '',
		parent_id INTEGER NOT NULL DEFAULT 0,
		status TEXT NOT NULL DEFAULT '',
		original_issue_id INTEGER NOT NULL DEFAULT 0,
		memory_id TEXT NOT NULL DEFAULT '',
		archived_at TEXT NOT NULL,
		created_at TEXT NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS tasks (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		project_dir TEXT NOT NULL DEFAULT '',
		feature_id TEXT NOT NULL DEFAULT '',
		title TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'pending',
		sort_order INTEGER NOT NULL DEFAULT 0,
		parent_id INTEGER NOT NULL DEFAULT 0,
		task_type TEXT NOT NULL DEFAULT 'manual',
		metadata TEXT NOT NULL DEFAULT '{}',
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS tasks_archive (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		project_dir TEXT NOT NULL DEFAULT '',
		feature_id TEXT NOT NULL DEFAULT '',
		title TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'pending',
		sort_order INTEGER NOT NULL DEFAULT 0,
		parent_id INTEGER NOT NULL DEFAULT 0,
		task_type TEXT NOT NULL DEFAULT 'manual',
		metadata TEXT NOT NULL DEFAULT '{}',
		original_task_id INTEGER NOT NULL DEFAULT 0,
		archived_at TEXT NOT NULL,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS memory_tags (
		memory_id TEXT NOT NULL,
		tag TEXT NOT NULL,
		PRIMARY KEY (memory_id, tag)
	)`,
	`CREATE TABLE IF NOT EXISTS user_memory_tags (
		memory_id TEXT NOT NULL,
		tag TEXT NOT NULL,
		PRIMARY KEY (memory_id, tag)
	)`,
}

var coreIndexes = []string{
	"CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_dir)",
	"CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope)",
	"CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories(tags)",
	"CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source)",
	"CREATE INDEX IF NOT EXISTS idx_issues_date ON issues(date)",
	"CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status)",
	"CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(project_dir)",
	"CREATE INDEX IF NOT EXISTS idx_issues_archive_project ON issues_archive(project_dir)",
	"CREATE INDEX IF NOT EXISTS idx_issues_archive_date ON issues_archive(date)",
	"CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_dir)",
	"CREATE INDEX IF NOT EXISTS idx_tasks_feature ON tasks(feature_id)",
	"CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)",
	"CREATE INDEX IF NOT EXISTS idx_tasks_archive_project ON tasks_archive(project_dir)",
	"CREATE INDEX IF NOT EXISTS idx_tasks_archive_feature ON tasks_archive(feature_id)",
	"CREATE INDEX IF NOT EXISTS idx_user_memories_tags ON user_memories(tags)",
	"CREATE INDEX IF NOT EXISTS idx_memory_tags_tag ON memory_tags(tag)",
	"CREATE INDEX IF NOT EXISTS idx_user_memory_tags_tag ON user_memory_tags(tag)",
}

func Open(dbPath string) (*DB, error) {
	dsn := fmt.Sprintf("%s?_journal_mode=WAL&_busy_timeout=5000", dbPath)
	conn, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	conn.SetMaxOpenConns(1)

	if _, err := conn.Exec("PRAGMA journal_mode=WAL"); err != nil {
		conn.Close()
		return nil, fmt.Errorf("set WAL mode: %w", err)
	}

	// Create all core tables (IF NOT EXISTS — safe for existing databases)
	for _, ddl := range coreTables {
		if _, err := conn.Exec(ddl); err != nil {
			conn.Close()
			return nil, fmt.Errorf("init schema: %w", err)
		}
	}
	if err := ensureIssueTagColumns(conn); err != nil {
		conn.Close()
		return nil, fmt.Errorf("migrate issue tags columns: %w", err)
	}
	for _, idx := range coreIndexes {
		conn.Exec(idx) // indexes are non-fatal
	}

	// Migrate: add tags column to issues/issues_archive if missing
	for _, tbl := range []string{"issues", "issues_archive"} {
		conn.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'", tbl))
	}

	return &DB{conn: conn}, nil
}

func (d *DB) Close() error {
	return d.conn.Close()
}

func (d *DB) RLock()   { d.mu.RLock() }
func (d *DB) RUnlock() { d.mu.RUnlock() }
func (d *DB) Lock()    { d.mu.Lock() }
func (d *DB) Unlock()  { d.mu.Unlock() }

func (d *DB) Query(query string, args ...interface{}) (*sql.Rows, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.conn.Query(query, args...)
}

func (d *DB) QueryRow(query string, args ...interface{}) *sql.Row {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.conn.QueryRow(query, args...)
}

func (d *DB) Exec(query string, args ...interface{}) (sql.Result, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.conn.Exec(query, args...)
}

func (d *DB) Begin() (*sql.Tx, error) {
	d.mu.Lock()
	return d.conn.Begin()
}

func (d *DB) UnlockAfterTx() {
	d.mu.Unlock()
}

func ensureIssueTagColumns(conn *sql.DB) error {
	for _, table := range []string{"issues", "issues_archive"} {
		exists, err := columnExists(conn, table, "tags")
		if err != nil {
			return err
		}
		if exists {
			continue
		}
		if _, err := conn.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'", table)); err != nil {
			return err
		}
	}
	return nil
}

func columnExists(conn *sql.DB, table, column string) (bool, error) {
	rows, err := conn.Query(fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return false, err
	}
	defer rows.Close()

	for rows.Next() {
		var (
			cid        int
			name       string
			columnType string
			notNull    int
			defaultVal sql.NullString
			primaryKey int
		)
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultVal, &primaryKey); err != nil {
			return false, err
		}
		if name == column {
			return true, nil
		}
	}

	return false, rows.Err()
}
