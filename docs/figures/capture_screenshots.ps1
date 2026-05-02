# Headless screenshot capture for the 4 Sysblade demo pages.
#
# Uses Microsoft Edge / Chrome's built-in headless mode (no Playwright needed).
# Run from repo root:
#   pwsh -File docs/figures/capture_screenshots.ps1
#
# Override base URL (e.g. local dev) with:
#   pwsh -File docs/figures/capture_screenshots.ps1 -Base "http://localhost:3000"

param(
    [string]$Base = "https://sysblade-atcc.vercel.app",
    [int]$Width  = 1440,
    [int]$Height = 2400  # tall viewport so charts below the fold are captured
)

$ErrorActionPreference = "Stop"

$browser = $null
foreach ($p in @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
)) {
    if (Test-Path $p) { $browser = $p; break }
}
if (-not $browser) { throw "Chrome / Edge not found in standard install paths" }

$outDir = Join-Path $PSScriptRoot "screenshots"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$pages = @(
    @{ name = "01_landing";   path = "/" },
    @{ name = "02_tco";       path = "/tco" },
    @{ name = "03_twin";      path = "/twin" },
    @{ name = "04_dashboard"; path = "/dashboard" }
)

foreach ($page in $pages) {
    $url = "$Base$($page.path)"
    $out = Join-Path $outDir "$($page.name).png"
    Write-Host "[*] $($page.name)  ->  $url"

    # --headless=new is the modern Chromium headless;
    # --virtual-time-budget gives JS hydration time to finish before snap;
    # --hide-scrollbars keeps the right edge clean.
    & $browser `
        --headless=new `
        --disable-gpu `
        --hide-scrollbars `
        --window-size="$Width,$Height" `
        --virtual-time-budget=8000 `
        "--screenshot=$out" `
        $url | Out-Null

    if (Test-Path $out) {
        $kb = [math]::Round((Get-Item $out).Length / 1KB, 1)
        Write-Host "    saved: $out  ($kb KB)" -ForegroundColor Green
    } else {
        Write-Host "    FAILED: $out not produced" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Done. Screenshots in: $outDir" -ForegroundColor Cyan
Write-Host "Browser used: $browser"
