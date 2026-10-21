# Activa el secreto del webhook de Strava (STRAVA_WEBHOOK_SECRET) en tres pasos guiados.
# Las claves se piden en pantalla (no se guardan en ningún archivo) y se borran al terminar.
param([switch]$Reintentar, [switch]$CronYaCargada)   # -CronYaCargada: la CRON_SECRET ya está cargada y desplegada en Vercel; se pega en vez de generar otra   # -Reintentar: salta el paso 1 (el secreto ya está cargado en Vercel); sirve si el paso 2 falló
$ErrorActionPreference = 'Stop'

function Read-Secret($prompt) {
    $secure = Read-Host $prompt -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)).Trim() }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
function Fin($msg) { Write-Host ''; Write-Host "  $msg"; Read-Host '  Enter para cerrar esta ventana'; exit }

Clear-Host
Write-Host ''
Write-Host '  SECRETO DEL WEBHOOK DE STRAVA' -ForegroundColor Green
Write-Host '  -----------------------------'
Write-Host '  Strava no firma sus avisos. Este secreto va dentro de la dirección a la que Strava llama,'
Write-Host '  y así el servidor ignora a cualquiera que no lo conozca.'
Write-Host ''

if (-not $Reintentar) {
# ---------- PASO 1: generar el secreto ----------
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$secret = ([BitConverter]::ToString($bytes) -replace '-', '').ToLower()
Set-Clipboard -Value $secret
Write-Host '  PASO 1 de 3: cargar el secreto en Vercel' -ForegroundColor Cyan
Write-Host '  Ya está copiado en tu portapapeles (no lo muestro en pantalla).'
Write-Host '   a) Abrí Vercel > tu proyecto > Settings > Environment Variables'
Write-Host '   b) Add New: Name = STRAVA_WEBHOOK_SECRET, Value = pegá (Ctrl+V), todos los entornos, Save'
Write-Host '   c) Deployments > el último > menú de los tres puntos > Redeploy, y esperá a que termine'
Write-Host ''
$ok = Read-Host '  Cuando el redeploy haya terminado escribí SI y Enter (o cualquier otra cosa para cancelar)'
Set-Clipboard -Value ' '
if ($ok -ne 'SI') { Fin 'Cancelado. No se cambió nada en Strava.' }
}

# ---------- PASO 2: pedir las claves y reemplazar la suscripción ----------
Write-Host ''
Write-Host '  PASO 2 de 3: reemplazar la suscripción en Strava' -ForegroundColor Cyan
if ($Reintentar -and -not $CronYaCargada) {
    # La CRON_SECRET se genera ACÁ y se muestra en esta ventana: la copiás de acá a Vercel, y este programa usa exactamente el mismo valor (sin pegar nada a mano).
    $cb = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($cb)
    $cron = ([BitConverter]::ToString($cb) -replace '-', '').ToLower()
    Set-Clipboard -Value $cron
    Write-Host '  Esta es la CRON_SECRET nueva (ya está copiada en tu portapapeles):' -ForegroundColor Yellow
    Write-Host "  $cron" -ForegroundColor White
    Write-Host ''
    Write-Host '   a) Vercel > Settings > Environment Variables > CRON_SECRET > Edit > pegá (Ctrl+V) > Save'
    Write-Host '   b) Deployments > Redeploy del último, y esperá a que diga Ready'
    Write-Host ''
    $okc = Read-Host '  Cuando diga Ready escribí SI y Enter (no cierres esta ventana)'
    if ($okc -ne 'SI') { Fin 'Cancelado. No se cambió nada.' }
} else {
    $cron = Read-Secret '  CRON_SECRET (Vercel; no se ve al pegar)'
}
do {
    $clientId = Read-Host '  STRAVA_CLIENT_ID (el número; está en Vercel)'
    $clientId = $clientId.Trim()
    if ($clientId -notmatch '^[0-9]{3,10}$') { Write-Host '  El Client ID es SOLO un numero corto (por ejemplo 123456). Lo que pegaste no lo parece; probá de nuevo.' -ForegroundColor Yellow; $clientId = '' }
} while (-not $clientId)
$clientSecret = Read-Secret '  STRAVA_CLIENT_SECRET (Vercel; no se ve al pegar)'
$site = 'https://www.zancada.org'

try {
    $subs = Invoke-RestMethod -Method Get -Uri "https://www.strava.com/api/v3/push_subscriptions?client_id=$clientId&client_secret=$clientSecret"
    $subs = @($subs)
    if ($subs.Count -gt 0) {
        $old = $subs[0].id
        Write-Host "  Suscripción actual: $old"
        $c = Read-Host '  Se borra y se crea una nueva con el secreto. Escribí SI y Enter para seguir'
        if ($c -ne 'SI') { Fin 'Cancelado. La suscripción quedó como estaba.' }
        Invoke-RestMethod -Method Delete -Uri "https://www.strava.com/api/v3/push_subscriptions/${old}?client_id=$clientId&client_secret=$clientSecret" | Out-Null
        Write-Host '  Suscripción vieja borrada.'
    } else { Write-Host '  No había ninguna suscripción; se crea una nueva.' }

    $new = Invoke-RestMethod -Method Post -Uri "$site/api/strava-setup-webhook" -Headers @{ Authorization = "Bearer $cron" }
    if (-not $new.id) { throw "Strava no devolvió un id. Respuesta: $($new | ConvertTo-Json -Compress)" }
    Write-Host ''
    Write-Host "  Suscripción nueva creada. Su número es: $($new.id)" -ForegroundColor Green
    Set-Clipboard -Value "$($new.id)"
    Write-Host '  (el número quedó copiado en el portapapeles)'
} catch {
    $clientSecret = $null; $cron = $null
    Write-Host ''
    Write-Host '  Hubo un error. Copiá este mensaje (no tiene claves) y mandáselo a Claude:' -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)"
    Write-Host '  Si la suscripción vieja ya se borró, no pasa nada grave: los relojes se siguen sincronizando cada 15 minutos.'
    Fin ''
}
$clientSecret = $null; $cron = $null

# ---------- PASO 3: el número nuevo ----------
Write-Host ''
Write-Host '  PASO 3 de 3: actualizar el número en Vercel' -ForegroundColor Cyan
Write-Host '   a) Vercel > Settings > Environment Variables > STRAVA_SUBSCRIPTION_ID > Edit'
Write-Host '   b) Pegá el número nuevo (Ctrl+V), Save'
Write-Host '   c) Redeploy otra vez'
Write-Host ''
Write-Host '  Mientras no hagas el paso 3, los avisos instantáneos de Strava se ignoran (los trae igual la sincronización de cada 15 minutos).'
Fin 'LISTO. Volvé al chat y escribile a Claude: "listo".'
