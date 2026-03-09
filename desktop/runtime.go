package main

import (
	"fmt"
	"os"
	"strings"

	"desktop/internal/auth"
	"desktop/internal/db"
	"desktop/internal/embedding"
	"desktop/internal/settings"
	"desktop/internal/webserver"
)

type appRuntime struct {
	database *db.DB
	engine   *embedding.Engine
	launcher *webserver.Launcher
	auth     *auth.Manager
}

func cloneSettings(s *settings.Settings) *settings.Settings {
	if s == nil {
		return nil
	}
	copy := *s
	return &copy
}

func normalizeSettings(s *settings.Settings) *settings.Settings {
	defaults := settings.DefaultSettings()
	if s == nil {
		return defaults
	}

	normalized := *s
	if normalized.Theme == "" {
		normalized.Theme = defaults.Theme
	}
	if normalized.Language == "" {
		normalized.Language = defaults.Language
	}
	if normalized.DBPath == "" {
		normalized.DBPath = defaults.DBPath
	}
	if normalized.WebPort == 0 {
		normalized.WebPort = defaults.WebPort
	}
	if normalized.WindowWidth == 0 {
		normalized.WindowWidth = defaults.WindowWidth
	}
	if normalized.WindowHeight == 0 {
		normalized.WindowHeight = defaults.WindowHeight
	}

	normalized.DBPath = expandHome(strings.TrimSpace(normalized.DBPath))
	normalized.PythonPath = expandHome(strings.TrimSpace(normalized.PythonPath))

	return &normalized
}

func (a *App) currentSettings() *settings.Settings {
	if a.settings == nil {
		a.settings = normalizeSettings(settings.Load())
	}
	return a.settings
}

func buildRuntime(s *settings.Settings) (*appRuntime, error) {
	normalized := normalizeSettings(s)

	database, err := db.Open(normalized.DBPath)
	if err != nil {
		return nil, fmt.Errorf("open database %q: %w", normalized.DBPath, err)
	}

	if err := database.LoadVecExtension(); err != nil {
		fmt.Fprintf(os.Stderr, "sqlite-vec not loaded: %v\n", err)
	}

	engine := embedding.NewEngine(normalized.PythonPath)
	launcherPythonPath := normalized.PythonPath
	if launcherPythonPath == "" {
		launcherPythonPath = engine.PythonPath
	}

	return &appRuntime{
		database: database,
		engine:   engine,
		launcher: webserver.NewLauncher(launcherPythonPath, normalized.WebPort),
		auth:     auth.NewManager(database),
	}, nil
}

func closeRuntime(runtime *appRuntime, detachLauncher bool) {
	if runtime == nil {
		return
	}
	if runtime.launcher != nil {
		if detachLauncher {
			runtime.launcher.Detach()
		} else {
			runtime.launcher.Stop()
		}
	}
	if runtime.database != nil {
		runtime.database.Close()
	}
}

func (a *App) snapshotRuntime() *appRuntime {
	if a.database == nil && a.engine == nil && a.launcher == nil && a.auth == nil {
		return nil
	}
	return &appRuntime{
		database: a.database,
		engine:   a.engine,
		launcher: a.launcher,
		auth:     a.auth,
	}
}

func (a *App) clearRuntime() {
	a.database = nil
	a.engine = nil
	a.launcher = nil
	a.auth = nil
}

func (a *App) setRuntime(runtime *appRuntime, s *settings.Settings) {
	if runtime == nil {
		a.clearRuntime()
		a.settings = normalizeSettings(s)
		return
	}
	a.database = runtime.database
	a.engine = runtime.engine
	a.launcher = runtime.launcher
	a.auth = runtime.auth
	a.settings = normalizeSettings(s)
	a.startupErr = nil
}

func (a *App) runtimeNeedsReload(next *settings.Settings) bool {
	current := normalizeSettings(a.settings)
	next = normalizeSettings(next)

	if a.database == nil || a.engine == nil || a.launcher == nil || a.auth == nil {
		return true
	}

	return current.DBPath != next.DBPath ||
		current.PythonPath != next.PythonPath ||
		current.WebPort != next.WebPort
}

func (a *App) runtimeUnavailableError(component string) error {
	if a.startupErr != nil {
		return fmt.Errorf("%s unavailable: %w", component, a.startupErr)
	}
	return fmt.Errorf("%s unavailable: desktop runtime is not initialized", component)
}

func (a *App) requireDatabase() (*db.DB, error) {
	if a.database == nil {
		return nil, a.runtimeUnavailableError("database")
	}
	return a.database, nil
}

func (a *App) requireEngine() (*embedding.Engine, error) {
	if a.engine == nil {
		return nil, a.runtimeUnavailableError("embedding engine")
	}
	return a.engine, nil
}

func (a *App) requireAuth() (*auth.Manager, error) {
	if a.auth == nil {
		return nil, a.runtimeUnavailableError("auth manager")
	}
	return a.auth, nil
}

func (a *App) requireLauncher() (*webserver.Launcher, error) {
	if a.launcher == nil {
		return nil, a.runtimeUnavailableError("web dashboard launcher")
	}
	return a.launcher, nil
}
