@echo off
rem Optional portable launch: keeps library/covers/logs inside this folder.
rem Double-clicking Nest.exe directly also works (profile in %%APPDATA%%\Nest).
cd /d "%~dp0"
start "" "%~dp0Nest.exe" --no-sandbox --user-data-dir="%~dp0data"
