# Iniciar AISAN Conectado no Windows
$projectDir = "C:\Users\CRIS SESANI\.gemini\antigravity\scratch\aisan-tracker-next"
$desktop = [System.Environment]::GetFolderPath('Desktop')
Set-Location $projectDir

# 1. Inicia o Vite se nao estiver rodando
$viteProc = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*vite*" }
if (-not $viteProc) {
    Start-Process -FilePath "npm.cmd" -ArgumentList "run dev" -WorkingDirectory $projectDir -WindowStyle Hidden
    Start-Sleep -Seconds 3
}

# 2. Inicia o Tunnel Cloudflare
$cfLog = "$env:TEMP\cf.log"
if (Test-Path $cfLog) { Remove-Item $cfLog -Force -ErrorAction SilentlyContinue }

Start-Process -FilePath "cmd.exe" -ArgumentList "/c npx --yes cloudflared tunnel --protocol http2 --url http://localhost:5173 2> `"$cfLog`"" -WorkingDirectory $projectDir -WindowStyle Hidden

# 3. Aguarda o link ser gerado e extrai
$link = ""
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 2
    if (Test-Path $cfLog) {
        $found = Get-Content $cfLog -ErrorAction SilentlyContinue | Select-String "https://.*trycloudflare.com"
        if ($found) {
            $link = ($found.Line -replace ".*(https://[a-zA-Z0-9\-\.]+\.trycloudflare\.com).*", '$1').Trim()
            if ($link -match "^https://") { break }
        }
    }
}

if ($link) {
    # 4. Atualiza o atalho na Area de Trabalho
    $urlContent = "[InternetShortcut]`nURL=$link"
    Set-Content -Path "$desktop\ABRIR NO NAVEGADOR - AISAN.url" -Value $urlContent
    
    $txtContent = @"
=====================================================
  AISAN CONECTADO - DSEI KAIAPO MT
  SISTEMA ATIVO NO SEU COMPUTADOR!
=====================================================

LINK ATUAL PARA ACESSAR NO CELULAR:
$link

* Seus relatorios, fotos e PDFs continuam sendo salvos 
  automaticamente na pasta do OneDrive!
=====================================================
"@
    Set-Content -Path "$desktop\LINK_DO_CELULAR_ATUAL.txt" -Value $txtContent
}
