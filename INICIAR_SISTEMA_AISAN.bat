@echo off
title AISAN Conectado - DSEI Kaiapo MT
cd /d "C:\Users\CRIS SESANI\.gemini\antigravity\scratch\aisan-tracker-next"

echo ========================================================
echo   AISAN CONECTADO - DSEI KAIAPO MT (SESANI)
echo   Iniciando Servidor e Sincronizacao com OneDrive...
echo ========================================================
echo.

start /b npm run dev
timeout /t 3 >nul

echo Servidor ativo! Conectando link dos celulares...
echo.
npx --yes cloudflared tunnel --protocol http2 --url http://localhost:5173
