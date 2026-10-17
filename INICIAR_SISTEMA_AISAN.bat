@echo off
title AISAN Conectado - DSEI Kaiapo MT
cd /d "C:\Users\CRIS SESANI\.gemini\antigravity\scratch\aisan-tracker-next"

echo ========================================================
echo   AISAN CONECTADO - DSEI KAIAPO MT (SESANI)
echo   Iniciando Servidor e Sincronizacao Definitiva...
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "iniciar_auto.ps1"

echo.
echo ========================================================
echo   SISTEMA AISAN CONECTADO EM OPERACAO!
echo   Link Definitivo: https://sirgasgeo.github.io/aisan-conectado/
echo   Fotos e Relatorios: OneDrive - Ministerio da Saude\AISAN_Dados
echo ========================================================
timeout /t 5
