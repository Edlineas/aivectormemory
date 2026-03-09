package main

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"desktop/internal/settings"
)

func TestReleaseDownloadURLPrefersMatchingIntelDmg(t *testing.T) {
	release := githubRelease{
		HTMLURL: "https://example.com/release",
		Assets: []releaseAsset{
			{Name: "AIVectorMemory-1.0.12-macos-arm64.dmg", BrowserDownloadURL: "https://example.com/arm64.dmg"},
			{Name: "AIVectorMemory-1.0.12-darwin-amd64.dmg", BrowserDownloadURL: "https://example.com/amd64.dmg"},
		},
	}

	got := releaseDownloadURL(release, "darwin", "amd64")
	if got != "https://example.com/amd64.dmg" {
		t.Fatalf("expected intel dmg url, got %q", got)
	}
}

func TestReleaseDownloadURLFallsBackToReleasePage(t *testing.T) {
	release := githubRelease{
		HTMLURL: "https://example.com/release",
		Assets: []releaseAsset{
			{Name: "AIVectorMemory-1.0.12-linux-x64.tar.gz", BrowserDownloadURL: "https://example.com/linux.tar.gz"},
		},
	}

	got := releaseDownloadURL(release, "darwin", "amd64")
	if got != release.HTMLURL {
		t.Fatalf("expected fallback release page, got %q", got)
	}
}

func TestIsNewerVersion(t *testing.T) {
	tests := []struct {
		name   string
		remote string
		local  string
		want   bool
	}{
		{name: "major", remote: "2.0.0", local: "1.9.9", want: true},
		{name: "minor", remote: "1.2.0", local: "1.1.9", want: true},
		{name: "patch", remote: "1.0.13", local: "1.0.12", want: true},
		{name: "same", remote: "1.0.12", local: "1.0.12", want: false},
		{name: "lower", remote: "1.0.11", local: "1.0.12", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isNewerVersion(tt.remote, tt.local); got != tt.want {
				t.Fatalf("isNewerVersion(%q, %q) = %v, want %v", tt.remote, tt.local, got, tt.want)
			}
		})
	}
}

func TestSaveSettingsReloadsRuntimeDependencies(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	app := NewApp()
	initial := normalizeSettings(&settings.Settings{
		Theme:      "dark",
		Language:   "zh-CN",
		DBPath:     filepath.Join(home, "memory-one.db"),
		PythonPath: "/usr/bin/python3",
		WebPort:    9080,
		WindowX:    -1,
		WindowY:    -1,
	})

	runtime, err := buildRuntime(initial)
	if err != nil {
		t.Fatalf("buildRuntime(initial): %v", err)
	}
	app.setRuntime(runtime, initial)
	t.Cleanup(func() { closeRuntime(app.snapshotRuntime(), false) })

	oldDB := app.database
	oldEngine := app.engine
	oldAuth := app.auth
	oldLauncher := app.launcher

	next := cloneSettings(initial)
	next.DBPath = filepath.Join(home, "memory-two.db")
	next.PythonPath = "/usr/local/bin/python3"
	next.WebPort = 9099

	if err := app.SaveSettings(next); err != nil {
		t.Fatalf("SaveSettings: %v", err)
	}

	if app.database == oldDB {
		t.Fatal("expected database runtime to be reloaded")
	}
	if app.engine == oldEngine {
		t.Fatal("expected embedding runtime to be reloaded")
	}
	if app.auth == oldAuth {
		t.Fatal("expected auth runtime to be reloaded")
	}
	if app.launcher == oldLauncher {
		t.Fatal("expected launcher runtime to be reloaded")
	}
	if app.settings.DBPath != next.DBPath {
		t.Fatalf("expected db path %q, got %q", next.DBPath, app.settings.DBPath)
	}
	if app.engine.PythonPath != next.PythonPath {
		t.Fatalf("expected python path %q, got %q", next.PythonPath, app.engine.PythonPath)
	}
	if app.launcher.Port != next.WebPort {
		t.Fatalf("expected launcher port %d, got %d", next.WebPort, app.launcher.Port)
	}
	if app.launcher.PythonPath != next.PythonPath {
		t.Fatalf("expected launcher python path %q, got %q", next.PythonPath, app.launcher.PythonPath)
	}
}

func TestSaveSettingsKeepsPreviousRuntimeWhenReloadFails(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	app := NewApp()
	initial := normalizeSettings(&settings.Settings{
		Theme:      "dark",
		Language:   "zh-CN",
		DBPath:     filepath.Join(home, "memory.db"),
		PythonPath: "/usr/bin/python3",
		WebPort:    9080,
		WindowX:    -1,
		WindowY:    -1,
	})

	runtime, err := buildRuntime(initial)
	if err != nil {
		t.Fatalf("buildRuntime(initial): %v", err)
	}
	app.setRuntime(runtime, initial)
	t.Cleanup(func() { closeRuntime(app.snapshotRuntime(), false) })

	oldDB := app.database
	oldEngine := app.engine
	oldAuth := app.auth
	oldLauncher := app.launcher

	bad := cloneSettings(initial)
	bad.DBPath = filepath.Join(home, "missing", "nested", "memory.db")
	bad.WebPort = 9100

	if err := app.SaveSettings(bad); err == nil {
		t.Fatal("expected SaveSettings to fail for invalid db path")
	}

	if app.database != oldDB {
		t.Fatal("expected database runtime to stay unchanged on failure")
	}
	if app.engine != oldEngine {
		t.Fatal("expected embedding runtime to stay unchanged on failure")
	}
	if app.auth != oldAuth {
		t.Fatal("expected auth runtime to stay unchanged on failure")
	}
	if app.launcher != oldLauncher {
		t.Fatal("expected launcher runtime to stay unchanged on failure")
	}
	if app.settings.DBPath != initial.DBPath {
		t.Fatalf("expected settings db path to stay %q, got %q", initial.DBPath, app.settings.DBPath)
	}
	if app.launcher.Port != initial.WebPort {
		t.Fatalf("expected launcher port to stay %d, got %d", initial.WebPort, app.launcher.Port)
	}
}

func TestStartupFailureLeavesMethodsInSafeDegradedState(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	app := NewApp()
	app.settings = &settings.Settings{
		Theme:      "dark",
		Language:   "zh-CN",
		DBPath:     filepath.Join(home, "missing", "nested", "memory.db"),
		PythonPath: "/usr/bin/python3",
		WebPort:    9080,
		WindowX:    -1,
		WindowY:    -1,
	}

	app.startup(context.Background())

	if app.startupErr == nil {
		t.Fatal("expected startupErr to be recorded")
	}

	if _, err := app.GetProjects(); err == nil || !strings.Contains(err.Error(), "database unavailable") {
		t.Fatalf("expected database unavailable error, got %v", err)
	}
	if err := app.LaunchWebDashboard(); err == nil || !strings.Contains(err.Error(), "web dashboard launcher unavailable") {
		t.Fatalf("expected launcher unavailable error, got %v", err)
	}
	if _, err := app.GetCurrentUser("token"); err == nil || !strings.Contains(err.Error(), "auth manager unavailable") {
		t.Fatalf("expected auth unavailable error, got %v", err)
	}
	if app.IsWebDashboardRunning() {
		t.Fatal("expected dashboard to report not running when runtime initialization failed")
	}
}
