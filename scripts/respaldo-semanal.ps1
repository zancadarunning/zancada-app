# Respaldo de la base de Supabase (lo corre el Programador de tareas de Windows, ver scripts/instalar-respaldo-semanal.ps1).
# Lee la clave de servicio de un archivo cifrado con tu usuario de Windows (nunca en texto plano), corre scripts/backup-supabase.js, conserva
# los últimos 12 respaldos y deja un registro en ~\Backups\zancada\respaldo.log. Los respaldos tienen datos personales: quedan fuera de OneDrive y del repo.
param([string]$NodePath = 'node')
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$dest = Join-Path $env:USERPROFILE 'Backups\zancada'
$keyFile = Join-Path $env:USERPROFILE '.zancada-backup\supabase-key.txt'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$log = Join-Path $dest 'respaldo.log'
function Log($m) { Add-Content -Path $log -Value ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $m) }

try {
    if (-not (Test-Path $keyFile)) { throw "Falta el archivo de la clave ($keyFile). Corré scripts/instalar-respaldo-semanal.ps1 de nuevo." }
    $secure = Get-Content $keyFile | ConvertTo-SecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $env:SUPABASE_SERVICE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    $env:SUPABASE_URL = 'https://smcicgaraqlvalxvdriz.supabase.co'

    $carpeta = Join-Path $dest ("supabase-{0:yyyy-MM-dd}" -f (Get-Date))
    & $NodePath (Join-Path $repo 'scripts\backup-supabase.js') $carpeta
    if ($LASTEXITCODE -ne 0) { throw "backup-supabase.js terminó con código $LASTEXITCODE" }
    Log "OK -> $carpeta"

    # se conservan los 12 más nuevos
    Get-ChildItem $dest -Directory -Filter 'supabase-*' | Sort-Object Name -Descending | Select-Object -Skip 12 | ForEach-Object {
        Remove-Item $_.FullName -Recurse -Force -Confirm:$false
        Log "borrado el respaldo viejo $($_.Name)"
    }
} catch {
    Log "ERROR: $($_.Exception.Message)"
    exit 1
} finally {
    Remove-Item Env:SUPABASE_SERVICE_KEY -ErrorAction SilentlyContinue
}
