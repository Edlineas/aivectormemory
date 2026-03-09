package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	goRuntime "runtime"
	"sort"
	"strconv"
	"strings"

	"io"
	"net/http"
	"os/exec"
	"time"

	"desktop/internal/auth"
	"desktop/internal/backup"
	"desktop/internal/db"
	"desktop/internal/embedding"
	"desktop/internal/settings"
	"desktop/internal/webserver"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const AppVersion = "1.0.14"

type App struct {
	ctx        context.Context
	database   *db.DB
	engine     *embedding.Engine
	settings   *settings.Settings
	launcher   *webserver.Launcher
	auth       *auth.Manager
	startupErr error
}

type releaseAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

type githubRelease struct {
	TagName string         `json:"tag_name"`
	HTMLURL string         `json:"html_url"`
	Assets  []releaseAsset `json:"assets"`
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if a.settings == nil {
		a.settings = normalizeSettings(settings.Load())
	} else {
		a.settings = normalizeSettings(a.settings)
	}

	runtime, err := buildRuntime(a.settings)
	if err != nil {
		a.startupErr = err
		a.clearRuntime()
		fmt.Fprintf(os.Stderr, "failed to initialize desktop runtime: %v\n", err)
	} else {
		a.setRuntime(runtime, a.settings)
	}

	// Restore window position if previously saved
	if a.settings.WindowX >= 0 && a.settings.WindowY >= 0 {
		wailsRuntime.WindowSetPosition(ctx, a.settings.WindowX, a.settings.WindowY)
	}
}

func (a *App) shutdown(ctx context.Context) {
	// Save window size and position
	if a.settings != nil {
		w, h := wailsRuntime.WindowGetSize(ctx)
		x, y := wailsRuntime.WindowGetPosition(ctx)
		if w > 0 && h > 0 {
			a.settings.WindowWidth = w
			a.settings.WindowHeight = h
			a.settings.WindowX = x
			a.settings.WindowY = y
			settings.Save(a.settings)
		}
	}

	closeRuntime(a.snapshotRuntime(), true)
	a.clearRuntime()
}

// ============== Projects ==============

func (a *App) GetProjects() ([]db.Project, error) {
	database, err := a.requireDatabase()
	if err != nil {
		return nil, err
	}
	return database.GetProjects()
}

func (a *App) AddProject(projectDir string) error {
	database, err := a.requireDatabase()
	if err != nil {
		return err
	}
	return database.AddProject(projectDir)
}

func (a *App) DeleteProject(projectDir string) (int, error) {
	database, err := a.requireDatabase()
	if err != nil {
		return 0, err
	}
	return database.DeleteProject(projectDir)
}

func (a *App) GetStats(projectDir string) (map[string]interface{}, error) {
	database, err := a.requireDatabase()
	if err != nil {
		return nil, err
	}

	// Memory counts
	projResult, _ := database.GetMemories("project", projectDir, "", "", "", 1, 0)
	userResult, _ := database.GetMemories("user", "", "", "", "", 1, 0)
	allResult, _ := database.GetMemories("all", projectDir, "", "", "", 1, 0)

	// Issue status counts
	statusCounts := map[string]int{}
	for _, s := range []string{"pending", "in_progress", "completed"} {
		result, _ := database.GetIssues(projectDir, s, "", "", 1, 0)
		if result != nil {
			statusCounts[s] = result.Total
		}
	}
	archivedResult, _ := database.GetIssues(projectDir, "archived", "", "", 1, 0)
	if archivedResult != nil {
		statusCounts["archived"] = archivedResult.Total
	}

	// Tag counts
	tags, _ := database.GetTags(projectDir, "")

	projCount := 0
	if projResult != nil {
		projCount = projResult.Total
	}
	userCount := 0
	if userResult != nil {
		userCount = userResult.Total
	}
	totalCount := 0
	if allResult != nil {
		totalCount = allResult.Total
	}

	tagCounts := map[string]int{}
	for _, t := range tags {
		tagCounts[t.Name] = t.Count
	}

	return map[string]interface{}{
		"memories": map[string]int{"project": projCount, "user": userCount, "total": totalCount},
		"issues":   statusCounts,
		"tags":     tagCounts,
	}, nil
}

// ============== Memories ==============

func (a *App) GetMemories(scope, projectDir, query, tag, source string, limit, offset int) (*db.MemoryListResult, error) {
	database, err := a.requireDatabase()
	if err != nil {
		return nil, err
	}
	return database.GetMemories(scope, projectDir, query, tag, source, limit, offset)
}

func (a *App) GetMemoryDetail(id string) (*db.Memory, error) {
	database, err := a.requireDatabase()
	if err != nil {
		return nil, err
	}
	return database.GetMemoryDetail(id)
}

func (a *App) UpdateMemory(id, content string, tags []string, scope string) (*db.Memory, error) {
	database, err := a.requireDatabase()
	if err != nil {
		return nil, err
	}
	return database.UpdateMemory(id, content, tags, scope)
}

func (a *App) DeleteMemory(id string) error {
	database, err := a.requireDatabase()
	if err != nil {
		return err
	}
	return database.DeleteMemory(id)
}

func (a *App) DeleteMemoriesBatch(ids []string) (int, error) {
	database, err := a.requireDatabase()
	if err != nil {
		return 0, err
	}
	return database.DeleteMemoriesBatch(ids)
}

func (a *App) ExportMemories(scope, projectDir string) ([]db.MemoryExport, error) {
	database, err := a.requireDatabase()
	if err != nil {
		return nil, err
	}
	return database.ExportMemories(scope, projectDir)
}

func (a *App) ImportMemories(itemsJSON string, projectDir string) (map[string]int, error) {
	var items []map[string]interface{}
	if err := json.Unmarshal([]byte(itemsJSON), &items); err != nil {
		return nil, fmt.Errorf("invalid JSON: %w", err)
	}
	database, err := a.requireDatabase()
	if err != nil {
		return nil, err
	}
	imported, skipped, err := database.ImportMemories(items, projectDir)
	if err != nil {
		return nil, err
	}
	return map[string]int{"imported": imported, "skipped": skipped}, nil
}

func (a *App) SearchMemories(query, scope, projectDir string, tags []string, topK int) ([]db.Memory, error) {
	engine, err := a.requireEngine()
	if err != nil {
		return nil, err
	}
	database, err := a.requireDatabase()
	if err != nil {
		return nil, err
	}
	emb, err := engine.Encode(query)
	if err != nil {
		return nil, err
	}
	return database.SearchMemories(emb, scope, projectDir, tags, topK)
}

// ============== Issues ==============

func (a *App) GetIssues(projectDir, status, date, keyword string, limit, offset int) (*db.IssueListResult, error) {
	database, err := a.requireDatabase()
	if err != nil {
		return nil, err
	}
	return database.GetIssues(projectDir, status, date, keyword, limit, offset)
}

func (a *App) GetIssueDetail(id int, projectDir string) (*db.Issue, error) {
	database, err := a.requireDatabase()
	if err != nil {
		return nil, err
	}
	return database.GetIssueDetail(id, projectDir)
}

func (a *App) CreateIssue(projectDir, title, content, status string, tags []string, parentID int) (map[string]interface{}, error) {
	database, err := a.requireDatabase()
	if err != nil {
		return nil, err
	}
	issue, dedup, err := database.CreateIssue(projectDir, title, content, status, tags, parentID)
	if err != nil {
		return nil, err
	}
	if dedup {
		return map[string]interface{}{
			"deduplicated": true,
			"duplicate":    true,
			"title":        title,
		}, nil
	}
	result := map[string]interface{}{
		"id":           issue.ID,
		"issue_number": issue.IssueNumber,
		"title":        issue.Title,
		"deduplicated": false,
		"duplicate":    false,
	}
	return result, nil
}

func (a *App) UpdateIssue(id int, projectDir string, fieldsJSON string) (*db.Issue, error) {
	var fields map[string]interface{}
	json.Unmarshal([]byte(fieldsJSON), &fields)
	database, err := a.requireDatabase()
	if err != nil {
		return nil, err
	}
	return database.UpdateIssue(id, projectDir, fields)
}

func (a *App) ArchiveIssue(id int, projectDir string) error {
	database, err := a.requireDatabase()
	if err != nil {
		return err
	}
	return database.ArchiveIssue(id, projectDir)
}

func (a *App) DeleteIssue(id int, projectDir string, archived bool) error {
	database, err := a.requireDatabase()
	if err != nil {
		return err
	}
	return database.DeleteIssue(id, projectDir, archived)
}

// ============== Tasks ==============

func (a *App) GetTasks(projectDir, featureID, status, keyword string) ([]db.TaskGroup, error) {
	database, err := a.requireDatabase()
	if err != nil {
		return nil, err
	}
	return database.GetTasks(projectDir, featureID, status, keyword)
}

func (a *App) GetArchivedTasks(projectDir, featureID string) ([]db.TaskGroup, error) {
	database, err := a.requireDatabase()
	if err != nil {
		return nil, err
	}
	return database.GetArchivedTasks(projectDir, featureID)
}

func (a *App) CreateTasks(projectDir, featureID, tasksJSON, taskType string) (int, error) {
	var tasks []map[string]interface{}
	json.Unmarshal([]byte(tasksJSON), &tasks)
	database, err := a.requireDatabase()
	if err != nil {
		return 0, err
	}
	return database.CreateTasks(projectDir, featureID, tasks, taskType)
}

func (a *App) UpdateTask(id int, projectDir, fieldsJSON string) (*db.Task, error) {
	var fields map[string]interface{}
	json.Unmarshal([]byte(fieldsJSON), &fields)
	database, err := a.requireDatabase()
	if err != nil {
		return nil, err
	}
	return database.UpdateTask(id, projectDir, fields)
}

func (a *App) DeleteTask(id int, projectDir string) error {
	database, err := a.requireDatabase()
	if err != nil {
		return err
	}
	return database.DeleteTask(id, projectDir)
}

func (a *App) DeleteTasksByFeature(featureID, projectDir string) (int, error) {
	database, err := a.requireDatabase()
	if err != nil {
		return 0, err
	}
	return database.DeleteTasksByFeature(featureID, projectDir)
}

// ============== Tags ==============

func (a *App) GetTags(projectDir, query string) ([]db.TagInfo, error) {
	database, err := a.requireDatabase()
	if err != nil {
		return nil, err
	}
	return database.GetTags(projectDir, query)
}

func (a *App) RenameTag(projectDir, oldName, newName string) (int, error) {
	database, err := a.requireDatabase()
	if err != nil {
		return 0, err
	}
	return database.RenameTag(projectDir, oldName, newName)
}

func (a *App) MergeTags(projectDir string, sourceTags []string, targetName string) (int, error) {
	database, err := a.requireDatabase()
	if err != nil {
		return 0, err
	}
	return database.MergeTags(projectDir, sourceTags, targetName)
}

func (a *App) DeleteTags(projectDir string, tagNames []string) (int, error) {
	database, err := a.requireDatabase()
	if err != nil {
		return 0, err
	}
	return database.DeleteTags(projectDir, tagNames)
}

// ============== Session Status ==============

func (a *App) GetStatus(projectDir string) (*db.SessionState, error) {
	database, err := a.requireDatabase()
	if err != nil {
		return nil, err
	}
	return database.GetStatus(projectDir)
}

func (a *App) UpdateStatus(projectDir, fieldsJSON string, clearFields []string) (*db.SessionState, error) {
	var fields map[string]interface{}
	json.Unmarshal([]byte(fieldsJSON), &fields)
	database, err := a.requireDatabase()
	if err != nil {
		return nil, err
	}
	return database.UpdateStatus(projectDir, fields, clearFields)
}

// ============== Maintenance ==============

func (a *App) HealthCheck() (*db.HealthReport, error) {
	database, err := a.requireDatabase()
	if err != nil {
		return nil, err
	}
	return database.HealthCheck()
}

func (a *App) GetDBStats() (*db.DBStats, error) {
	database, err := a.requireDatabase()
	if err != nil {
		return nil, err
	}
	return database.GetDBStats(a.currentSettings().DBPath)
}

func (a *App) RepairMissingEmbeddings() error {
	engine, err := a.requireEngine()
	if err != nil {
		return err
	}
	database, err := a.requireDatabase()
	if err != nil {
		return err
	}
	return embedding.BatchRepair(a.ctx, database, engine, 50)
}

func (a *App) RebuildAllEmbeddings() error {
	engine, err := a.requireEngine()
	if err != nil {
		return err
	}
	database, err := a.requireDatabase()
	if err != nil {
		return err
	}
	embedding.RebuildAllEmbeddings(a.ctx, database, engine)
	return nil
}

// ============== Backup ==============

func (a *App) BackupDB() (*backup.BackupInfo, error) {
	return backup.BackupDB(a.currentSettings().DBPath, "")
}

func (a *App) RestoreDB(backupPath string) error {
	return backup.RestoreDB(a.currentSettings().DBPath, backupPath)
}

func (a *App) ListBackups() ([]backup.BackupInfo, error) {
	return backup.ListBackups(a.currentSettings().DBPath)
}

// ============== Web Dashboard ==============

func (a *App) LaunchWebDashboard() error {
	launcher, err := a.requireLauncher()
	if err != nil {
		return err
	}
	return launcher.Start()
}

func (a *App) StopWebDashboard() error {
	launcher, err := a.requireLauncher()
	if err != nil {
		return err
	}
	return launcher.Stop()
}

func (a *App) IsWebDashboardRunning() bool {
	if a.launcher == nil {
		return false
	}
	return a.launcher.IsRunning()
}

// ============== Settings ==============

func (a *App) GetSettings() *settings.Settings {
	return cloneSettings(a.currentSettings())
}

func (a *App) SaveSettings(s *settings.Settings) error {
	next := normalizeSettings(s)

	if !a.runtimeNeedsReload(next) {
		if err := settings.Save(next); err != nil {
			return err
		}
		a.settings = next
		return nil
	}

	nextRuntime, err := buildRuntime(next)
	if err != nil {
		return err
	}
	if err := settings.Save(next); err != nil {
		closeRuntime(nextRuntime, false)
		return err
	}

	oldRuntime := a.snapshotRuntime()
	a.setRuntime(nextRuntime, next)
	closeRuntime(oldRuntime, false)
	return nil
}

func (a *App) SetLanguage(lang string) error {
	// 1. 更新桌面设置
	current := cloneSettings(a.currentSettings())
	current.Language = lang
	if err := settings.Save(current); err != nil {
		return fmt.Errorf("save desktop settings: %w", err)
	}
	a.settings = current
	// 2. 写入 Python 侧 settings.json
	home, _ := os.UserHomeDir()
	settingsPath := filepath.Join(home, ".aivectormemory", "settings.json")
	pySettings := map[string]interface{}{}
	if data, err := os.ReadFile(settingsPath); err == nil {
		json.Unmarshal(data, &pySettings)
	}
	pySettings["language"] = lang
	data, _ := json.MarshalIndent(pySettings, "", "  ")
	os.MkdirAll(filepath.Dir(settingsPath), 0755)
	os.WriteFile(settingsPath, append(data, '\n'), 0644)
	// 3. 调用 regenerate 更新所有项目文件
	pythonPath := a.findPython()
	if pythonPath == "" {
		return fmt.Errorf("python not found")
	}
	cmd := exec.Command(pythonPath, "-m", "aivectormemory", "regenerate", "--lang", lang)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("regenerate failed: %s\n%s", err, string(output))
	}
	return nil
}

func (a *App) SetAutoStart(enabled bool) error {
	return settings.SetAutoStart(enabled)
}

// ============== System ==============

func (a *App) BrowseDirectory(path string) (map[string]interface{}, error) {
	if path == "" {
		home, _ := os.UserHomeDir()
		path = home
	}
	path = expandHome(path)

	info, err := os.Stat(path)
	if err != nil || !info.IsDir() {
		return map[string]interface{}{"error": "not a directory", "path": path}, nil
	}

	entries, err := os.ReadDir(path)
	if err != nil {
		return map[string]interface{}{"error": "permission denied", "path": path}, nil
	}

	var dirs []string
	for _, e := range entries {
		if e.IsDir() && !strings.HasPrefix(e.Name(), ".") {
			dirs = append(dirs, e.Name())
		}
	}
	sort.Strings(dirs)

	return map[string]interface{}{
		"path": strings.Replace(path, "\\", "/", -1),
		"dirs": dirs,
	}, nil
}

func (a *App) SelectDirectory() (string, error) {
	dir, err := wailsRuntime.OpenDirectoryDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Select Project Directory",
	})
	return dir, err
}

func (a *App) GetPythonPath() string {
	return a.findPython()
}

func (a *App) DetectPython() string {
	return embedding.DetectPython()
}

// ============== Auth ==============

func (a *App) Register(username, password string) error {
	authManager, err := a.requireAuth()
	if err != nil {
		return err
	}
	return authManager.Register(username, password)
}

func (a *App) Login(username, password string) (map[string]string, error) {
	authManager, err := a.requireAuth()
	if err != nil {
		return nil, err
	}
	token, err := authManager.Login(username, password)
	if err != nil {
		return nil, err
	}
	return map[string]string{"token": token, "username": username}, nil
}

func (a *App) Logout(token string) error {
	if a.auth != nil {
		a.auth.Logout(token)
	}
	return nil
}

func (a *App) GetCurrentUser(token string) (map[string]string, error) {
	authManager, err := a.requireAuth()
	if err != nil {
		return nil, err
	}
	username, err := authManager.Verify(token)
	if err != nil {
		return nil, err
	}
	return map[string]string{"username": username}, nil
}

// ============== Environment & Install ==============

func (a *App) GetAppVersion() string {
	return AppVersion
}

func (a *App) CheckEnvironment() map[string]interface{} {
	result := map[string]interface{}{
		"python_found":  false,
		"python_path":   "",
		"avm_installed": false,
		"avm_version":   "",
	}

	// Find Python (reuse candidate logic from embedding.DetectPython)
	pythonPath := a.findPython()
	if pythonPath == "" {
		return result
	}
	result["python_found"] = true
	result["python_path"] = pythonPath

	// Check aivectormemory installed + version
	out, err := exec.Command(pythonPath, "-c",
		"from importlib.metadata import version; print(version('aivectormemory'))").CombinedOutput()
	if err != nil {
		result["error"] = fmt.Sprintf("import failed: %v\n%s", err, string(out))
		return result
	}
	version := strings.TrimSpace(string(out))
	if version != "" {
		result["avm_installed"] = true
		result["avm_version"] = version
	}
	return result
}

func (a *App) CheckUpgrade(currentAvmVersion string) map[string]interface{} {
	result := map[string]interface{}{
		"avm_latest":           "",
		"avm_update_available": false,
		"app_latest":           "",
		"app_update_available": false,
		"app_download_url":     "",
	}

	pythonPath := a.findPython()
	if latest := latestPyPIVersion(pythonPath); latest != "" {
		result["avm_latest"] = latest
		if isNewerVersion(latest, currentAvmVersion) {
			result["avm_update_available"] = true
		}
	}

	client := &http.Client{Timeout: 10 * time.Second}
	release, err := fetchLatestDesktopRelease(client)
	if err == nil && release.TagName != "" {
		appLatest := strings.TrimPrefix(release.TagName, "v")
		result["app_latest"] = appLatest
		result["app_download_url"] = releaseDownloadURL(release, goRuntime.GOOS, goRuntime.GOARCH)
		if isNewerVersion(appLatest, AppVersion) {
			result["app_update_available"] = true
		}
	}

	return result
}

func latestPyPIVersion(pythonPath string) string {
	if pythonPath == "" {
		return ""
	}

	out, err := exec.Command(pythonPath, "-m", "pip", "install", "aivectormemory==___").CombinedOutput()
	if err != nil && len(out) == 0 {
		return ""
	}

	outStr := string(out)
	idx := strings.LastIndex(outStr, "from versions:")
	if idx < 0 {
		return ""
	}

	tail := outStr[idx+len("from versions:"):]
	end := strings.Index(tail, ")")
	if end < 0 {
		return ""
	}

	versions := strings.TrimSpace(tail[:end])
	parts := strings.Split(versions, ",")
	if len(parts) == 0 {
		return ""
	}

	return strings.TrimSpace(parts[len(parts)-1])
}

func fetchLatestDesktopRelease(client *http.Client) (githubRelease, error) {
	resp, err := client.Get("https://api.github.com/repos/Edlineas/aivectormemory/releases/latest")
	if err != nil {
		return githubRelease{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return githubRelease{}, fmt.Errorf("unexpected github status: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return githubRelease{}, err
	}

	var release githubRelease
	if err := json.Unmarshal(body, &release); err != nil {
		return githubRelease{}, err
	}
	return release, nil
}

func releaseDownloadURL(release githubRelease, goos, goarch string) string {
	for _, keyword := range releaseAssetKeywords(goos, goarch) {
		for _, asset := range release.Assets {
			if strings.Contains(strings.ToLower(asset.Name), keyword) && asset.BrowserDownloadURL != "" {
				return asset.BrowserDownloadURL
			}
		}
	}

	return release.HTMLURL
}

func releaseAssetKeywords(goos, goarch string) []string {
	switch goos {
	case "darwin":
		if goarch == "arm64" {
			return []string{"darwin-arm64.dmg", "macos-arm64.dmg", "macos-aarch64.dmg"}
		}
		return []string{"darwin-amd64.dmg", "macos-x64.dmg", "macos-amd64.dmg", "macos-intel.dmg"}
	case "windows":
		if goarch == "arm64" {
			return []string{"windows-arm64-setup.exe", "windows-arm64-installer.exe", "windows-arm64.exe"}
		}
		return []string{"windows-x64-setup.exe", "windows-amd64-setup.exe", "windows-x64-installer.exe", "windows-x64.exe"}
	case "linux":
		if goarch == "arm64" {
			return []string{"linux-arm64.tar.gz", "linux-aarch64.tar.gz"}
		}
		return []string{"linux-x64.tar.gz", "linux-amd64.tar.gz"}
	default:
		return nil
	}
}

// isNewerVersion returns true if remote > local (semver comparison)
func isNewerVersion(remote, local string) bool {
	rParts := strings.Split(remote, ".")
	lParts := strings.Split(local, ".")
	for i := 0; i < len(rParts) || i < len(lParts); i++ {
		var r, l int
		if i < len(rParts) {
			r, _ = strconv.Atoi(rParts[i])
		}
		if i < len(lParts) {
			l, _ = strconv.Atoi(lParts[i])
		}
		if r > l {
			return true
		}
		if r < l {
			return false
		}
	}
	return false
}

func (a *App) InstallPackage(upgrade bool) (string, error) {
	pythonPath := a.findPython()
	if pythonPath == "" {
		return "", fmt.Errorf("Python not found")
	}

	args := []string{"-m", "pip", "install"}
	if upgrade {
		args = append(args, "--upgrade")
	}
	args = append(args, "aivectormemory")

	cmd := exec.Command(pythonPath, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return string(output), fmt.Errorf("install failed: %w\n%s", err, string(output))
	}
	return string(output), nil
}

func (a *App) findPython() string {
	// If settings has a custom python path, try it first
	if current := a.currentSettings(); current.PythonPath != "" {
		if _, err := os.Stat(current.PythonPath); err == nil {
			return current.PythonPath
		}
	}
	// If engine already detected one, use it
	if a.engine != nil && a.engine.PythonPath != "" {
		return a.engine.PythonPath
	}

	// Scan candidates (find Python, not necessarily with aivectormemory)
	home, _ := os.UserHomeDir()
	candidates := []string{
		filepath.Join(home, "item", "run-memory-mcp-server", ".venv", "bin", "python3"),
		"python3", "python",
		"/usr/local/bin/python3",
		"/usr/bin/python3",
		"/opt/homebrew/bin/python3",
	}
	for _, py := range candidates {
		path := py
		if !filepath.IsAbs(path) {
			found, err := exec.LookPath(path)
			if err != nil {
				continue
			}
			path = found
		}
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}
	return ""
}

func expandHome(path string) string {
	if strings.HasPrefix(path, "~") {
		home, _ := os.UserHomeDir()
		return filepath.Join(home, path[1:])
	}
	return path
}
