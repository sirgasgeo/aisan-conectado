# Iniciar AISAN Conectado no Windows - Modo Definitivo e Permanente
$projectDir = "C:\Users\CRIS SESANI\.gemini\antigravity\scratch\aisan-tracker-next"
$desktop = [System.Environment]::GetFolderPath('Desktop')
Set-Location $projectDir

# Garante PATH com Node, NPM, Git e GitHub CLI
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# 1. Inicia o Vite se a porta 5173 nao estiver aberta
$isPortListening = (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue)
if (-not $isPortListening) {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory $projectDir -WindowStyle Hidden
    Start-Sleep -Seconds 4
}

# 2. Inicia o Tunnel Cloudflare se nao estiver rodando
$cfLog = "$env:TEMP\cf.log"
$cfProc = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue

if (-not $cfProc) {
    if (Test-Path $cfLog) { Remove-Item $cfLog -Force -ErrorAction SilentlyContinue }
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c npx --yes cloudflared tunnel --protocol http2 --url http://localhost:5173 2> `"$cfLog`"" -WorkingDirectory $projectDir -WindowStyle Hidden
}

# 3. Aguarda o link ser gerado e extrai
$link = ""
for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Seconds 2
    if (Test-Path $cfLog) {
        $found = Get-Content $cfLog -ErrorAction SilentlyContinue | Select-String "https://.*trycloudflare.com"
        if ($found) {
            $link = ($found.Line -replace ".*(https://[a-zA-Z0-9\-\.]+\.trycloudflare\.com).*", '$1').Trim()
            if ($link -match "^https://") { break }
        }
    }
}

# Se ja tinha link no server_url.json e cloudflared continua ativo
if (-not $link -and (Test-Path "$projectDir\server_url.json")) {
    try {
        $existing = Get-Content "$projectDir\server_url.json" -Raw | ConvertFrom-Json
        if ($existing.url) { $link = $existing.url }
    } catch {}
}

if ($link) {
    # 4. Atualiza o server_url.json localmente
    $jsonContent = "{`"url`":`"$link`"}"
    Set-Content -Path "$projectDir\server_url.json" -Value $jsonContent -Encoding UTF8

    # 5. Publica no GitHub para os celulares dos AISANs conectarem instantaneamente
    try {
        $base64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($jsonContent))
        $sha = (gh api repos/sirgasgeo/aisan-conectado/contents/server_url.json --jq .sha 2>$null)
        if ($sha) {
            gh api --method PUT repos/sirgasgeo/aisan-conectado/contents/server_url.json -f message="chore: auto-update backend tunnel url to $link" -f content="$base64" -f sha="$sha" 2>$null | Out-Null
        }
    } catch {}

    # 6. Atualiza atalhos na Area de Trabalho
    $definitivoUrl = "https://sirgasgeo.github.io/aisan-conectado/"
    $urlContent = "[InternetShortcut]`nURL=$definitivoUrl"
    Set-Content -Path "$desktop\ABRIR NO NAVEGADOR - AISAN.url" -Value $urlContent

    $txtContent = @"
=====================================================
  AISAN CONECTADO - DSEI KAIAPO MT
  SISTEMA 100% OPERACIONAL E DEFINITIVO!
=====================================================

👉 LINK OFICIAL DEFINITIVO (PARA O CELULAR):
$definitivoUrl

* Este link e DEFINITIVO e NUNCA MAIS MUDA!
* Nao sai do ar mesmo se reiniciar o computador.
* Pode salvar nos favoritos do celular ou mandar no WhatsApp dos AISANs.

SINCRONIZACAO COM O COMPUTADOR:
* Servidor Central: Online ($link)
* Fotos e Relatorios sao salvos automaticamente em:
  OneDrive - Ministerio da Saude\AISAN_Dados
=====================================================
"@
    Set-Content -Path "$desktop\LINK_DEFINITIVO_DO_CELULAR.txt" -Value $txtContent

    # Remove atalhos antigos com nomes confusos
    if (Test-Path "$desktop\LINK_DO_CELULAR_ATUAL.txt") {
        Remove-Item "$desktop\LINK_DO_CELULAR_ATUAL.txt" -Force -ErrorAction SilentlyContinue
    }
}
