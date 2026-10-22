# Respaldo de la base de Supabase (lo corre el Programador de tareas de Windows, ver scripts/instalar-respaldo-semanal.ps1).
# Lee la clave de servicio de un archivo cifrado con tu usuario de Windows (nunca en texto plano), corre scripts/backup-supabase.js, CIFRA el resultado con la
# clave pública (scripts/backup-cifrado.js: solo quien tenga la clave privada y su frase puede leerlo), borra la copia en claro, conserva los últimos 12
# y deja un registro en ~\Backups\zancada\respaldo.log. Los respaldos quedan fuera de OneDrive y del repo.
param([string]$NodePath = 'node')
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$dest = Join-Path $env:USERPROFILE 'Backups\zancada'
$confDir = Join-Path $env:USERPROFILE '.zancada-backup'
$keyFile = Join-Path $confDir 'supabase-key.txt'
$pubFile = Join-Path $confDir 'backup-public.pem'
$extraFile = Join-Path $confDir 'destino-extra.txt'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$log = Join-Path $dest 'respaldo.log'
function Log($m) { Add-Content -Path $log -Value ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $m) }
# La política de privacidad promete que lo borrado desaparece de las copias en un máximo de 90 días: además de conservar solo las 12 más nuevas, se borra
# todo lo que tenga más de 90 días (por la fecha del nombre, supabase-AAAA-MM-DD.zbk), dejando siempre las 2 más nuevas por si la PC estuvo apagada mucho tiempo.
function Remove-OldBackups($dir) {
    $limite = (Get-Date).AddDays(-90)
    Get-ChildItem $dir -File -Filter 'supabase-*.zbk' | Sort-Object Name -Descending | Select-Object -Skip 2 | ForEach-Object {
        $fecha = $_.LastWriteTime
        try { $fecha = [datetime]::ParseExact($_.BaseName.Substring(9, 10), 'yyyy-MM-dd', $null) } catch { }
        if ($fecha -lt $limite) { Remove-Item $_.FullName -Force -Confirm:$false; Log "borrado por antigüedad (más de 90 días): $($_.Name)" }
    }
}

$carpeta = $null
try {
    if (-not (Test-Path $keyFile)) { throw "Falta el archivo de la clave ($keyFile). Corré scripts/instalar-respaldo-semanal.ps1 de nuevo." }
    $secure = Get-Content $keyFile | ConvertTo-SecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $env:SUPABASE_SERVICE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    $env:SUPABASE_URL = 'https://smcicgaraqlvalxvdriz.supabase.co'

    $carpeta = Join-Path $dest ("supabase-{0:yyyy-MM-dd}" -f (Get-Date))
    & $NodePath (Join-Path $repo 'scripts\backup-supabase.js') $carpeta
    if ($LASTEXITCODE -ne 0) { throw "backup-supabase.js terminó con código $LASTEXITCODE" }

    # cifrar: sin clave pública NO se deja nada en claro
    if (-not (Test-Path $pubFile)) { throw "Falta la clave pública de cifrado ($pubFile). Corré scripts/activar-respaldo-cifrado.ps1. La copia sin cifrar se borró." }
    $enc = "$carpeta.zbk"
    & $NodePath (Join-Path $repo 'scripts\backup-cifrado.js') cifrar $carpeta $pubFile $enc
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $enc) -or (Get-Item $enc).Length -lt 200) { throw "No se pudo cifrar el respaldo. La copia sin cifrar se borró." }
    Remove-Item $carpeta -Recurse -Force -Confirm:$false
    $carpeta = $null
    Log "OK (cifrado) -> $enc"

    # segundo disco, si está configurado
    if (Test-Path $extraFile) {
        $extra = (Get-Content $extraFile -Raw).Trim()
        if ($extra -and (Test-Path (Split-Path $extra -Qualifier))) {
            New-Item -ItemType Directory -Force -Path $extra | Out-Null
            Copy-Item $enc (Join-Path $extra (Split-Path $enc -Leaf)) -Force
            Get-ChildItem $extra -File -Filter 'supabase-*.zbk' | Sort-Object Name -Descending | Select-Object -Skip 12 | ForEach-Object { Remove-Item $_.FullName -Force -Confirm:$false }
            Remove-OldBackups $extra
            Log "copia en $extra"
        }
    }

    # se conservan los 12 más nuevos
    Get-ChildItem $dest -File -Filter 'supabase-*.zbk' | Sort-Object Name -Descending | Select-Object -Skip 12 | ForEach-Object {
        Remove-Item $_.FullName -Force -Confirm:$false
        Log "borrado el respaldo viejo $($_.Name)"
    }
    Remove-OldBackups $dest
} catch {
    Log "ERROR: $($_.Exception.Message)"
    exit 1
} finally {
    Remove-Item Env:SUPABASE_SERVICE_KEY -ErrorAction SilentlyContinue
    if ($carpeta -and (Test-Path $carpeta)) { Remove-Item $carpeta -Recurse -Force -Confirm:$false -ErrorAction SilentlyContinue }   # nunca queda una copia en claro
}
