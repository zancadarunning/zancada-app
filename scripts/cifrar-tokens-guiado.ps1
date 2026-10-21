# Cifrado guiado de los tokens de relojes (paso 4 de docs/cifrado-de-tokens.md).
# Pide las dos claves en pantalla (no se guardan en ningún archivo), hace un simulacro, pide confirmación y cifra de verdad.
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)

function Read-Secret($prompt) {
    $secure = Read-Host $prompt -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)).Trim() }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
function Limpiar {
    Remove-Item Env:SUPABASE_SERVICE_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:TOKEN_ENCRYPTION_KEY -ErrorAction SilentlyContinue
}

Clear-Host
Write-Host ''
Write-Host '  CIFRADO DE LOS TOKENS DE RELOJES' -ForegroundColor Green
Write-Host '  ---------------------------------'
Write-Host '  Te voy a pedir dos claves. Pegalas con clic derecho y apretá Enter.'
Write-Host '  No se ve lo que pegás (es a propósito) y no se guarda en ningún archivo.'
Write-Host ''

$env:SUPABASE_URL = 'https://smcicgaraqlvalxvdriz.supabase.co'
Write-Host '  1) Clave de servicio de Supabase (Project Settings > API Keys > service_role > Reveal)' -ForegroundColor Cyan
$env:SUPABASE_SERVICE_KEY = Read-Secret '     Pegala acá y Enter'
Write-Host ''
Write-Host '  2) Clave de cifrado (la que guardaste en tu gestor de contraseñas y cargaste en Vercel)' -ForegroundColor Cyan
$env:TOKEN_ENCRYPTION_KEY = Read-Secret '     Pegala acá y Enter'
Write-Host ''

if (-not $env:SUPABASE_SERVICE_KEY -or -not $env:TOKEN_ENCRYPTION_KEY) {
    Write-Host '  Falta una de las dos claves. Cerrá esta ventana y probá de nuevo.' -ForegroundColor Red
    Limpiar; Read-Host '  Enter para cerrar'; exit 1
}

Write-Host '  Paso A: simulacro (no escribe nada)...' -ForegroundColor Yellow
node scripts/encrypt-existing-tokens.js --dry-run
if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host '  El simulacro dio un error. NO se cifró nada. Copiá el mensaje de arriba (sin claves) y mandáselo a Claude.' -ForegroundColor Red
    Limpiar; Read-Host '  Enter para cerrar'; exit 1
}

Write-Host ''
Write-Host '  El simulacro salió bien. Ahora se cifra de verdad.' -ForegroundColor Green
$resp = Read-Host '  Escribí SI (en mayúsculas) y Enter para continuar, o cualquier otra cosa para cancelar'
if ($resp -ne 'SI') { Write-Host '  Cancelado. No se cifró nada.'; Limpiar; Read-Host '  Enter para cerrar'; exit 0 }

Write-Host ''
Write-Host '  Paso B: cifrando...' -ForegroundColor Yellow
node scripts/encrypt-existing-tokens.js
$codigo = $LASTEXITCODE
Limpiar
Write-Host ''
if ($codigo -eq 0) {
    Write-Host '  LISTO. Las claves ya se borraron de esta ventana.' -ForegroundColor Green
    Write-Host '  Volvé al chat y escribile a Claude: "listo".'
} else {
    Write-Host '  Terminó con errores. Copiá el mensaje de arriba (sin claves) y mandáselo a Claude.' -ForegroundColor Red
}
Read-Host '  Enter para cerrar esta ventana'
