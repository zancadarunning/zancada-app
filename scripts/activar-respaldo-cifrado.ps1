# Activa el CIFRADO de los respaldos: crea el par de claves, cifra los respaldos que ya tenés en claro (verificando que se pueden descifrar antes de
# borrar nada) y deja el respaldo semanal cifrando solo. Se corre UNA vez.
param([string]$DiscoExtra = 'D:\Backups\zancada', [string]$DestinoClavePrivada = '')   # solo para pruebas: otra carpeta de segundo disco / destino de la clave privada
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$tool = Join-Path $PSScriptRoot 'backup-cifrado.js'
$confDir = Join-Path $env:USERPROFILE '.zancada-backup'
$pubFile = Join-Path $confDir 'backup-public.pem'
$privDesktop = if ($DestinoClavePrivada) { $DestinoClavePrivada } else { Join-Path ([Environment]::GetFolderPath('Desktop')) 'ZANCADA-CLAVE-PRIVADA-RESPALDOS.pem' }

function Read-Secret($prompt) {
    $secure = Read-Host $prompt -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
function Fin($m) { Write-Host ''; Write-Host "  $m"; Read-Host '  Enter para cerrar esta ventana'; exit }

Clear-Host
Write-Host ''
Write-Host '  CIFRADO DE LOS RESPALDOS' -ForegroundColor Green
Write-Host '  ------------------------'
Write-Host '  Se crea una clave para CIFRAR (queda en esta PC, no sirve para leer nada) y una clave para DESCIFRAR (privada, protegida con una frase).'
Write-Host '  Sin la clave privada Y la frase, nadie puede leer los respaldos, ni siquiera tú. Guardalas bien.'
Write-Host ''
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Fin 'No encuentro Node.js. Instalalo (nodejs.org) y volvé a correr esto.' }
if (Test-Path $pubFile) { Fin 'Ya hay una clave de cifrado creada. Si querés una nueva, borrá primero el archivo backup-public.pem de la carpeta .zancada-backup (y guardá bien la clave privada anterior: la necesitás para leer los respaldos viejos).' }

Write-Host '  Elegí una FRASE larga (mínimo 12 caracteres; mejor 4 o 5 palabras sin relación). No se ve al escribir.' -ForegroundColor Cyan
if ($env:ZANCADA_ACTIVAR_FRASE) { $p1 = $env:ZANCADA_ACTIVAR_FRASE; $p2 = $p1 }   # solo para pruebas automáticas
else { $p1 = Read-Secret '  Frase'; $p2 = Read-Secret '  Repetila' }
if ($p1 -ne $p2) { Fin 'Las frases no coinciden. No se hizo nada. Volvé a correr esto.' }
if ($p1.Length -lt 12) { Fin 'La frase es muy corta (mínimo 12 caracteres). No se hizo nada.' }

New-Item -ItemType Directory -Force -Path $confDir | Out-Null
$tmpKeys = Join-Path $env:TEMP ('zbk-keys-' + [guid]::NewGuid().ToString('N'))
$env:ZANCADA_BACKUP_PASSPHRASE = $p1
try {
    Write-Host ''; Write-Host '  Creando las claves (tarda unos segundos)...'
    & $node.Source $tool generar-claves $tmpKeys
    if ($LASTEXITCODE -ne 0) { throw 'no se pudieron crear las claves' }
    $pub = Join-Path $tmpKeys 'backup-public.pem'; $priv = Join-Path $tmpKeys 'ZANCADA-CLAVE-PRIVADA-RESPALDOS.pem'

    # prueba de ida y vuelta con la clave privada y la frase, ANTES de tocar nada
    $probe = Join-Path $tmpKeys 'prueba'; New-Item -ItemType Directory -Force -Path $probe | Out-Null
    Set-Content -Path (Join-Path $probe 'a.txt') -Value 'prueba de cifrado'
    & $node.Source $tool cifrar $probe $pub (Join-Path $tmpKeys 'prueba.zbk') | Out-Null
    & $node.Source $tool descifrar (Join-Path $tmpKeys 'prueba.zbk') $priv (Join-Path $tmpKeys 'prueba-out') | Out-Null
    if ($LASTEXITCODE -ne 0 -or (Get-Content (Join-Path $tmpKeys 'prueba-out\a.txt')) -ne 'prueba de cifrado') { throw 'la prueba de cifrar y descifrar falló' }
    Copy-Item $pub $pubFile -Force
    Copy-Item $priv $privDesktop -Force
    icacls $privDesktop /inheritance:r /grant:r "$($env:USERNAME):F" | Out-Null
    Write-Host '  Claves creadas y probadas.' -ForegroundColor Green

    # cifrar lo que ya existe en claro (y borrarlo solo después de comprobar que se descifra igual)
    $carpetas = @((Join-Path $env:USERPROFILE 'Backups\zancada'))
    if ($DiscoExtra -and (Test-Path (Split-Path $DiscoExtra -Qualifier))) { $carpetas += $DiscoExtra }
    foreach ($c in $carpetas) {
        if (-not (Test-Path $c)) { continue }
        $items = @(Get-ChildItem $c -Directory -Filter 'supabase-*') + @(Get-ChildItem $c -File -Filter 'mobile-nativo-*.zip')
        foreach ($it in $items) {
            $enc = if ($it.PSIsContainer) { "$($it.FullName).zbk" } else { [IO.Path]::ChangeExtension($it.FullName, '.zbk') }
            & $node.Source $tool cifrar $it.FullName $pub $enc | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "no se pudo cifrar $($it.Name)" }
            $chk = Join-Path $env:TEMP ('zbk-chk-' + [guid]::NewGuid().ToString('N'))
            & $node.Source $tool descifrar $enc $priv $chk | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "no se pudo verificar $($it.Name)" }
            $igual = $true
            if ($it.PSIsContainer) {
                foreach ($f in Get-ChildItem $it.FullName -File) { if ((Get-FileHash $f.FullName).Hash -ne (Get-FileHash (Join-Path $chk $f.Name)).Hash) { $igual = $false } }
            } else {
                if ((Get-FileHash $it.FullName).Hash -ne (Get-FileHash (Join-Path $chk $it.Name)).Hash) { $igual = $false }
            }
            Remove-Item $chk -Recurse -Force -ErrorAction SilentlyContinue
            if (-not $igual) { throw "El respaldo descifrado de $($it.Name) no coincide. NO se borró nada." }
            Remove-Item $it.FullName -Recurse -Force -Confirm:$false
            Write-Host "  Cifrado y verificado: $($it.Name) -> $(Split-Path $enc -Leaf)"
        }
    }
    if ($DiscoExtra -and (Test-Path (Split-Path $DiscoExtra -Qualifier))) { Set-Content -Path (Join-Path $confDir 'destino-extra.txt') -Value $DiscoExtra }
} catch {
    Write-Host ''; Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '  No se borró ningún respaldo en claro que no se hubiera verificado.'
    Fin ''
} finally {
    Remove-Item Env:ZANCADA_BACKUP_PASSPHRASE -ErrorAction SilentlyContinue
    if (Test-Path $tmpKeys) { Remove-Item $tmpKeys -Recurse -Force -ErrorAction SilentlyContinue }
    $p1 = $null; $p2 = $null
}

Write-Host ''
Write-Host '  LISTO. AHORA, LO MÁS IMPORTANTE:' -ForegroundColor Yellow
Write-Host "   1) En tu ESCRITORIO está el archivo  ZANCADA-CLAVE-PRIVADA-RESPALDOS.pem"
Write-Host '      Copialo a un pendrive o a tu nube personal y guardalo FUERA de esta PC. Después sacalo del escritorio (cortar y pegar).'
Write-Host '   2) Guardá la FRASE en tu gestor de contraseñas (o anotala en papel en un lugar seguro).'
Write-Host '   Sin el archivo Y la frase, los respaldos NO se pueden recuperar. Nadie puede ayudarte a recuperarlos.'
Write-Host '   El respaldo semanal ya cifra solo desde ahora.'
Fin ''
