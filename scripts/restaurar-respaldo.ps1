# Descifra un respaldo .zbk a una carpeta (para revisar o restaurar). Pide la ruta del archivo, la de la clave privada y la frase.
$ErrorActionPreference = 'Stop'
$tool = Join-Path $PSScriptRoot 'backup-cifrado.js'
function Read-Secret($prompt) {
    $secure = Read-Host $prompt -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
Clear-Host
Write-Host ''
Write-Host '  DESCIFRAR UN RESPALDO' -ForegroundColor Green
$zbk = (Read-Host '  Ruta del respaldo (.zbk)').Trim('"')
$priv = (Read-Host '  Ruta de la clave privada (ZANCADA-CLAVE-PRIVADA-RESPALDOS.pem)').Trim('"')
$out = (Read-Host '  Carpeta de destino (se crea; tiene datos personales, que no sea OneDrive)').Trim('"')
$env:ZANCADA_BACKUP_PASSPHRASE = Read-Secret '  Frase de la clave privada'
try {
    node $tool descifrar $zbk $priv $out
    if ($LASTEXITCODE -ne 0) { Write-Host '  No se pudo descifrar: revisá la ruta, la clave y la frase.' -ForegroundColor Red }
    else { Write-Host "  Listo: los archivos están en $out. Borrá esa carpeta cuando termines." -ForegroundColor Green }
} finally { Remove-Item Env:ZANCADA_BACKUP_PASSPHRASE -ErrorAction SilentlyContinue }
Read-Host '  Enter para cerrar'
