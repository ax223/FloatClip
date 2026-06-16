@echo off
setlocal

cd /d "%~dp0"

echo.
echo [FloatClip] Windows build started
echo [FloatClip] Project: %CD%
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Please install Node.js first.
  pause
  exit /b 1
)

where cargo >nul 2>nul
if errorlevel 1 (
  echo [ERROR] cargo was not found. Please install Rust first.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [FloatClip] Installing npm dependencies...
  call npm install
  if errorlevel 1 goto fail
)

if exist "src-tauri\target\release\bundle" (
  echo [FloatClip] Cleaning old bundle output...
  rmdir /s /q "src-tauri\target\release\bundle"
  if errorlevel 1 goto fail
)

echo [FloatClip] Building Tauri app...
call npm run tauri -- build
if errorlevel 1 goto fail

echo [FloatClip] Verifying Windows subsystem...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='src-tauri\target\release\floatclip.exe'; $b=[IO.File]::ReadAllBytes($p); $pe=[BitConverter]::ToInt32($b,0x3C); $sub=[BitConverter]::ToUInt16($b,$pe+0x5C); if ($sub -ne 2) { Write-Host '[ERROR] floatclip.exe is not Windows GUI subsystem.'; exit 1 }; Write-Host '[FloatClip] floatclip.exe subsystem: Windows GUI'"
if errorlevel 1 goto fail

if not exist "dist\bubble.html" (
  echo [ERROR] dist\bubble.html is missing. Floating icon window would be blank.
  goto fail
)

if not exist "dist\settings.html" (
  echo [ERROR] dist\settings.html is missing. Settings window would be blank.
  goto fail
)

echo.
echo [FloatClip] Build completed.
echo [FloatClip] Output folder:
echo %CD%\src-tauri\target\release\bundle
echo.
pause
exit /b 0

:fail
echo.
echo [ERROR] Build failed.
pause
exit /b 1
