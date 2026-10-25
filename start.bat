@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Проверка версии Node.js...
node -v
if errorlevel 1 (
  echo Node.js не найден. Установите Node.js версии 22.5.0 или новее: https://nodejs.org/
  pause
  exit /b 1
)
echo.
echo Запуск интернет-магазина Marketly...
echo Чтобы открыть магазин, перейдите в браузере по адресу http://localhost:3000
 echo Для остановки сервера нажмите Ctrl+C в этом окне.
echo.
npm start
pause
