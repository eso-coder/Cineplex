@echo off
echo.
echo  MOVIE Backend ishga tushirilmoqda...
echo.

cd /d "%~dp0backend"

if not exist node_modules (
  echo  Paketlar o'rnatilmoqda...
  npm install
  echo.
)

npm run dev
pause
