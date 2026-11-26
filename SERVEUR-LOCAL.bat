@echo off
REM Lance le serveur multijoueur local (necessite Node.js : https://nodejs.org)
cd /d "%~dp0server"
if not exist node_modules (
  echo Installation de la bibliotheque ws...
  call npm install
)
start "" http://localhost:8080/
node server.js
pause
