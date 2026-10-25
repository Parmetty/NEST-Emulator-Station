@echo off
rem ---------------------------------------------------------------
rem  Nest launcher. Double-click this file.
rem  Kept ASCII-only on purpose: cmd's default code page mangles
rem  UTF-8 batch files, and a launcher should never fail on that.
rem ---------------------------------------------------------------
setlocal
cd /d "%~dp0"

if not exist "node_modules\electron\dist\electron.exe" (
  echo [Nest] Dependencies are missing.
  echo        Run:  npm install
  pause
  exit /b 1
)

if not exist "out\main\index.js" (
  echo [Nest] First run, building...
  call npm run build
  if errorlevel 1 (
    echo [Nest] Build failed. See the messages above.
    pause
    exit /b 1
  )
)

rem This machine sets ELECTRON_RUN_AS_NODE globally; without clearing it
rem electron starts as plain node and no window ever appears.
set "ELECTRON_RUN_AS_NODE="

start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0." --no-sandbox --user-data-dir="%~dp0.profile"
exit /b 0
