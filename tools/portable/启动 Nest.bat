@echo off
rem Portable launch: keeps library/covers/logs inside this folder.
cd /d "%~dp0"
start "" "%~dp0Nest.exe" --no-sandbox --user-data-dir="%~dp0data"
