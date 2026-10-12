@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if errorlevel 1 (
  echo.
  echo ResumeHelper installation failed. Error code: %errorlevel%
  pause
  exit /b %errorlevel%
)
exit /b 0
