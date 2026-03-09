package main

import "testing"

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
