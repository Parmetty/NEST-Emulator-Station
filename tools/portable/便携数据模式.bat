@echo off
rem Launches Nest with its library/covers/logs inside this folder instead of
rem %APPDATA%\Nest. Delete the "data" folder to reset everything.
cd /d "%~dp0"
start "" "%~dp0Nest.exe" --user-data-dir="%~dp0data"
