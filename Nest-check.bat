@echo off
rem Self-check: typecheck, unit tests, and a window smoke test.
rem Useful before handing a build to someone else.
setlocal
cd /d "%~dp0"
set "ELECTRON_RUN_AS_NODE="

echo === typecheck ===
call npm run typecheck
if errorlevel 1 goto :failed

echo.
echo === unit tests ===
call npm test
if errorlevel 1 goto :failed

echo.
echo === build ===
call npm run build
if errorlevel 1 goto :failed

echo.
echo === window smoke ===
call npm run smoke
if errorlevel 1 goto :failed

echo.
echo [Nest] All checks passed.
pause
exit /b 0

:failed
echo.
echo [Nest] Check failed. See the messages above.
pause
exit /b 1
