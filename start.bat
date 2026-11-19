@echo off
rem Chay MiniChain tai http://localhost:8000 - nhan Ctrl + C de dung
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
