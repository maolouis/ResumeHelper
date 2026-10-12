param(
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $ProjectRoot
$PythonCommand = Get-Command py -ErrorAction SilentlyContinue
if (-not $PythonCommand) {
    $PythonCommand = Get-Command python -ErrorAction Stop
}
$Python = $PythonCommand.Source

if (-not $SkipInstall) {
    & $Python -m pip install --upgrade pyinstaller
    & $Python -m pip install -r requirements.txt
}

& $Python -m PyInstaller --noconfirm --clean --onefile --windowed --name ResumeHelper run_app.py
if ($LASTEXITCODE -ne 0) {
    throw "ResumeHelper build failed with exit code $LASTEXITCODE"
}
& $Python -m PyInstaller --noconfirm --clean --onefile --name ResumeHelperHost run_native_host.py
if ($LASTEXITCODE -ne 0) {
    throw "ResumeHelperHost build failed with exit code $LASTEXITCODE"
}

Write-Host ""
Write-Host "Build complete:" -ForegroundColor Green
Write-Host "  $ProjectRoot\dist\ResumeHelper.exe"
Write-Host "  $ProjectRoot\dist\ResumeHelperHost.exe"

