package db

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func setupTestDB(t *testing.T) *DB {
	t.Helper()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.db")

	d, err := Open(dbPath)
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}

	// Create tables
	tables := []string{
		"CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL DEFAULT 0)",
		"CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, content TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]', scope TEXT NOT NULL DEFAULT 'project', source TEXT NOT NULL DEFAULT 'manual', project_dir TEXT NOT NULL DEFAULT '', session_id INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
		"CREATE TABLE IF NOT EXISTS user_memories (id TEXT PRIMARY KEY, content TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]', source TEXT NOT NULL DEFAULT 'manual', session_id INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
		"CREATE TABLE IF NOT EXISTS session_state (id INTEGER PRIMARY KEY AUTOINCREMENT, project_dir TEXT NOT NULL DEFAULT '', is_blocked INTEGER NOT NULL DEFAULT 0, block_reason TEXT NOT NULL DEFAULT '', next_step TEXT NOT NULL DEFAULT '', current_task TEXT NOT NULL DEFAULT '', progress TEXT NOT NULL DEFAULT '[]', recent_changes TEXT NOT NULL DEFAULT '[]', pending TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL, UNIQUE(project_dir))",
		"CREATE TABLE IF NOT EXISTS issues (id INTEGER PRIMARY KEY AUTOINCREMENT, project_dir TEXT NOT NULL DEFAULT '', issue_number INTEGER NOT NULL, date TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', content TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]', description TEXT NOT NULL DEFAULT '', investigation TEXT NOT NULL DEFAULT '', root_cause TEXT NOT NULL DEFAULT '', solution TEXT NOT NULL DEFAULT '', files_changed TEXT NOT NULL DEFAULT '[]', test_result TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', feature_id TEXT NOT NULL DEFAULT '', parent_id INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
		"CREATE TABLE IF NOT EXISTS issues_archive (id INTEGER PRIMARY KEY AUTOINCREMENT, project_dir TEXT NOT NULL DEFAULT '', issue_number INTEGER NOT NULL, date TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]', description TEXT NOT NULL DEFAULT '', investigation TEXT NOT NULL DEFAULT '', root_cause TEXT NOT NULL DEFAULT '', solution TEXT NOT NULL DEFAULT '', files_changed TEXT NOT NULL DEFAULT '[]', test_result TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', feature_id TEXT NOT NULL DEFAULT '', parent_id INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT '', original_issue_id INTEGER NOT NULL DEFAULT 0, archived_at TEXT NOT NULL, created_at TEXT NOT NULL)",
		"CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_dir TEXT NOT NULL DEFAULT '', feature_id TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', sort_order INTEGER NOT NULL DEFAULT 0, parent_id INTEGER NOT NULL DEFAULT 0, task_type TEXT NOT NULL DEFAULT 'manual', metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
		"CREATE TABLE IF NOT EXISTS tasks_archive (id INTEGER PRIMARY KEY AUTOINCREMENT, project_dir TEXT NOT NULL DEFAULT '', feature_id TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', sort_order INTEGER NOT NULL DEFAULT 0, parent_id INTEGER NOT NULL DEFAULT 0, task_type TEXT NOT NULL DEFAULT 'manual', metadata TEXT NOT NULL DEFAULT '{}', original_task_id INTEGER NOT NULL DEFAULT 0, archived_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
		"CREATE TABLE IF NOT EXISTS memory_tags (memory_id TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (memory_id, tag))",
		"CREATE TABLE IF NOT EXISTS user_memory_tags (memory_id TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (memory_id, tag))",
		"CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), last_login TEXT)",
	}
	for _, sql := range tables {
		if _, err := d.Exec(sql); err != nil {
			t.Fatalf("create table: %v", err)
		}
	}

	t.Cleanup(func() {
		d.Close()
		os.RemoveAll(dir)
	})

	return d
}

func TestProjectsCRUD(t *testing.T) {
	d := setupTestDB(t)
	pdir := "/test/project"

	// Add project
	if err := d.AddProject(pdir); err != nil {
		t.Fatalf("AddProject: %v", err)
	}

	// Get projects
	projects, err := d.GetProjects()
	if err != nil {
		t.Fatalf("GetProjects: %v", err)
	}
	if len(projects) != 1 {
		t.Fatalf("expected 1 project, got %d", len(projects))
	}
	if projects[0].ProjectDir != pdir {
		t.Fatalf("expected %s, got %s", pdir, projects[0].ProjectDir)
	}

	// Delete project
	deleted, err := d.DeleteProject(pdir)
	if err != nil {
		t.Fatalf("DeleteProject: %v", err)
	}
	if deleted != 0 {
		t.Fatalf("expected 0 deleted memories, got %d", deleted)
	}

	// Verify deleted
	projects, _ = d.GetProjects()
	if len(projects) != 0 {
		t.Fatalf("expected 0 projects after delete, got %d", len(projects))
	}
}

func TestIssuesCRUD(t *testing.T) {
	d := setupTestDB(t)
	pdir := "/test/project"
	d.AddProject(pdir)

	// Create
	issue, dedup, err := d.CreateIssue(pdir, "2026-03-07", "Test Issue", "test content", []string{"desktop", "data-loss"}, 0)
	if err != nil {
		t.Fatalf("CreateIssue: %v", err)
	}
	if dedup {
		t.Fatal("unexpected dedup")
	}
	if issue.Title != "Test Issue" {
		t.Fatalf("expected 'Test Issue', got '%s'", issue.Title)
	}
	if issue.IssueNumber != 1 {
		t.Fatalf("expected issue_number 1, got %d", issue.IssueNumber)
	}
	if len(issue.Tags) != 2 || issue.Tags[0] != "desktop" || issue.Tags[1] != "data-loss" {
		t.Fatalf("expected tags to persist on create, got %#v", issue.Tags)
	}

	// Dedup check
	_, dedup2, _ := d.CreateIssue(pdir, "2026-03-07", "Test Issue", "dup content", nil, 0)
	if !dedup2 {
		t.Fatal("expected dedup=true for duplicate title")
	}

	// Update
	updated, err := d.UpdateIssue(issue.ID, pdir, map[string]interface{}{"status": "in_progress", "tags": []string{"desktop", "fixed"}})
	if err != nil {
		t.Fatalf("UpdateIssue: %v", err)
	}
	if updated.Status != "in_progress" {
		t.Fatalf("expected in_progress, got %s", updated.Status)
	}
	if len(updated.Tags) != 2 || updated.Tags[1] != "fixed" {
		t.Fatalf("expected tags to update, got %#v", updated.Tags)
	}

	// List
	result, err := d.GetIssues(pdir, "", "", "", 20, 0)
	if err != nil {
		t.Fatalf("GetIssues: %v", err)
	}
	if result.Total != 1 {
		t.Fatalf("expected total 1, got %d", result.Total)
	}
	if len(result.Issues) != 1 || len(result.Issues[0].Tags) != 2 {
		t.Fatalf("expected listed issue tags, got %#v", result.Issues)
	}

	// Archive
	if err := d.ArchiveIssue(issue.ID, pdir); err != nil {
		t.Fatalf("ArchiveIssue: %v", err)
	}
	result, _ = d.GetIssues(pdir, "active", "", "", 20, 0)
	if result.Total != 0 {
		t.Fatalf("expected 0 active issues after archive, got %d", result.Total)
	}

	// Archived list
	archived, _ := d.GetIssues(pdir, "archived", "", "", 20, 0)
	if archived.Total != 1 {
		t.Fatalf("expected 1 archived issue, got %d", archived.Total)
	}
	if len(archived.Issues) != 1 || len(archived.Issues[0].Tags) != 2 {
		t.Fatalf("expected archived issue tags, got %#v", archived.Issues)
	}
}

func TestOpenMigratesIssueTagsColumns(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "legacy.db")

	conn, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		t.Fatalf("open legacy db: %v", err)
	}
	defer conn.Close()

	legacyTables := []string{
		"CREATE TABLE schema_version (version INTEGER NOT NULL DEFAULT 0)",
		"CREATE TABLE issues (id INTEGER PRIMARY KEY AUTOINCREMENT, project_dir TEXT NOT NULL DEFAULT '', issue_number INTEGER NOT NULL, date TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', content TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', investigation TEXT NOT NULL DEFAULT '', root_cause TEXT NOT NULL DEFAULT '', solution TEXT NOT NULL DEFAULT '', files_changed TEXT NOT NULL DEFAULT '[]', test_result TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', feature_id TEXT NOT NULL DEFAULT '', parent_id INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
		"CREATE TABLE issues_archive (id INTEGER PRIMARY KEY AUTOINCREMENT, project_dir TEXT NOT NULL DEFAULT '', issue_number INTEGER NOT NULL, date TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', investigation TEXT NOT NULL DEFAULT '', root_cause TEXT NOT NULL DEFAULT '', solution TEXT NOT NULL DEFAULT '', files_changed TEXT NOT NULL DEFAULT '[]', test_result TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', feature_id TEXT NOT NULL DEFAULT '', parent_id INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT '', original_issue_id INTEGER NOT NULL DEFAULT 0, archived_at TEXT NOT NULL, created_at TEXT NOT NULL)",
	}
	for _, ddl := range legacyTables {
		if _, err := conn.Exec(ddl); err != nil {
			t.Fatalf("create legacy table: %v", err)
		}
	}
	conn.Close()

	d, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open migrated db: %v", err)
	}
	defer d.Close()

	for _, table := range []string{"issues", "issues_archive"} {
		exists, err := columnExists(d.conn, table, "tags")
		if err != nil {
			t.Fatalf("check migrated column for %s: %v", table, err)
		}
		if !exists {
			t.Fatalf("expected tags column to be added for %s", table)
		}
	}
}

func TestTasksCRUD(t *testing.T) {
	d := setupTestDB(t)
	pdir := "/test/project"

	// Create
	tasks := []map[string]interface{}{
		{"title": "Parent Task", "children": []interface{}{
			map[string]interface{}{"title": "Child 1"},
			map[string]interface{}{"title": "Child 2"},
		}},
		{"title": "Standalone Task"},
	}
	created, err := d.CreateTasks(pdir, "test-feature", tasks, "manual")
	if err != nil {
		t.Fatalf("CreateTasks: %v", err)
	}
	if created != 4 {
		t.Fatalf("expected 4 tasks created, got %d", created)
	}

	// List
	groups, err := d.GetTasks(pdir, "", "", "")
	if err != nil {
		t.Fatalf("GetTasks: %v", err)
	}
	if len(groups) != 1 {
		t.Fatalf("expected 1 group, got %d", len(groups))
	}
	if groups[0].FeatureID != "test-feature" {
		t.Fatalf("expected test-feature, got %s", groups[0].FeatureID)
	}
	if groups[0].Total != 4 {
		t.Fatalf("expected total 4, got %d", groups[0].Total)
	}

	// Update
	taskID := groups[0].Tasks[0].ID
	updated, err := d.UpdateTask(taskID, pdir, map[string]interface{}{"status": "completed"})
	if err != nil {
		t.Fatalf("UpdateTask: %v", err)
	}
	if updated.Status != "completed" {
		t.Fatalf("expected completed, got %s", updated.Status)
	}

	// Delete by feature
	deleted, err := d.DeleteTasksByFeature("test-feature", pdir)
	if err != nil {
		t.Fatalf("DeleteTasksByFeature: %v", err)
	}
	if deleted != 4 {
		t.Fatalf("expected 4 deleted, got %d", deleted)
	}
}

func TestStatusCRUD(t *testing.T) {
	d := setupTestDB(t)
	pdir := "/test/project"
	d.AddProject(pdir)

	// Get
	s, err := d.GetStatus(pdir)
	if err != nil {
		t.Fatalf("GetStatus: %v", err)
	}
	if s.IsBlocked {
		t.Fatal("expected not blocked")
	}

	// Update
	s, err = d.UpdateStatus(pdir, map[string]interface{}{
		"is_blocked":   true,
		"block_reason": "test block",
		"current_task": "doing something",
	}, nil)
	if err != nil {
		t.Fatalf("UpdateStatus: %v", err)
	}
	if !s.IsBlocked {
		t.Fatal("expected blocked after update")
	}
	if s.BlockReason != "test block" {
		t.Fatalf("expected 'test block', got '%s'", s.BlockReason)
	}
}

func TestTagsCRUD(t *testing.T) {
	d := setupTestDB(t)
	pdir := "/test/project"

	// Insert test memories with tags
	d.Exec("INSERT INTO memories (id,content,tags,scope,project_dir,created_at,updated_at) VALUES ('m1','content1','[\"go\",\"test\"]','project',?,datetime('now'),datetime('now'))", pdir)
	d.Exec("INSERT INTO memories (id,content,tags,scope,project_dir,created_at,updated_at) VALUES ('m2','content2','[\"go\",\"debug\"]','project',?,datetime('now'),datetime('now'))", pdir)
	d.Exec("INSERT INTO memory_tags (memory_id,tag) VALUES ('m1','go'),('m1','test'),('m2','go'),('m2','debug')")

	// Get tags
	tags, err := d.GetTags(pdir, "")
	if err != nil {
		t.Fatalf("GetTags: %v", err)
	}
	if len(tags) < 2 {
		t.Fatalf("expected at least 2 tags, got %d", len(tags))
	}

	// Rename tag
	updated, err := d.RenameTag(pdir, "test", "testing")
	if err != nil {
		t.Fatalf("RenameTag: %v", err)
	}
	if updated != 1 {
		t.Fatalf("expected 1 updated, got %d", updated)
	}

	// Delete tags
	deleted, err := d.DeleteTags(pdir, []string{"debug"})
	if err != nil {
		t.Fatalf("DeleteTags: %v", err)
	}
	if deleted != 1 {
		t.Fatalf("expected 1 deleted, got %d", deleted)
	}
}

func TestHealthCheck(t *testing.T) {
	d := setupTestDB(t)

	// Need vec tables for health check - skip if not available
	// Just test the function doesn't panic
	report, err := d.HealthCheck()
	if err != nil {
		// vec tables don't exist in test, that's ok
		t.Skipf("HealthCheck requires vec tables: %v", err)
	}
	if report.MemoriesTotal != 0 {
		t.Fatalf("expected 0 memories, got %d", report.MemoriesTotal)
	}
}
