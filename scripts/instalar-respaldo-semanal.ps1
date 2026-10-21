# Deja programado un respaldo semanal de la base de Supabase (domingo 22:00; si la PC estaba apagada, corre al encenderse).
# Te pide UNA vez la clave de servicio de Supabase en pantalla; se guarda cifrada con tu usuario de Windows (solo este usuario en esta PC puede leerla).
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$wrapper = Join-Path $PSScriptRoot 'respaldo-semanal.ps1'
$keyDir = Join-Path $env:USERPROFILE '.zancada-backup'
$keyFile = Join-Path $keyDir 'supabase-key.txt'

Clear-Host
Write-Host ''
Write-Host '  RESPALDO SEMANAL DE LA BASE' -ForegroundColor Green
Write-Host '  ---------------------------'
$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) { Write-Host '  No encuentro Node.js en esta PC. Instalalo (nodejs.org) y volvé a correr esto.' -ForegroundColor Red; Read-Host '  Enter para cerrar'; exit 1 }

Write-Host '  Pegá la clave de servicio de Supabase (Project Settings > API Keys > service_role > Reveal).'
Write-Host '  No se ve al pegar y no se guarda en texto plano.'
$secure = Read-Host '  Clave' -AsSecureString
if ($secure.Length -lt 20) { Write-Host '  La clave parece incompleta. Cerrá y probá de nuevo.' -ForegroundColor Red; Read-Host '  Enter para cerrar'; exit 1 }
New-Item -ItemType Directory -Force -Path $keyDir | Out-Null
$secure | ConvertFrom-SecureString | Set-Content -Path $keyFile
icacls $keyDir /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" | Out-Null

$accion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$wrapper`" -NodePath `"$($node.Source)`""
$cuando = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 22:00
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName 'Zancada respaldo semanal' -Action $accion -Trigger $cuando -Settings $ajustes -Description 'Respaldo semanal de la base de Zancada (Supabase) a ~\Backups\zancada' -Force | Out-Null
Write-Host ''
Write-Host '  Programado: todos los domingos a las 22:00.' -ForegroundColor Green

$prueba = Read-Host '  Escribí SI y Enter para hacer un respaldo de prueba ahora (tarda unos segundos)'
if ($prueba -eq 'SI') {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $wrapper -NodePath $node.Source
    $log = Join-Path $env:USERPROFILE 'Backups\zancada\respaldo.log'
    if (Test-Path $log) { Write-Host ''; Write-Host '  Último registro:'; Get-Content $log -Tail 3 | ForEach-Object { Write-Host "   $_" } }
}
$secure = $null
Write-Host ''
Write-Host '  Listo. Los respaldos quedan en ~\Backups\zancada (fuera de OneDrive). Volvé al chat y escribile a Claude: "listo".'
Read-Host '  Enter para cerrar esta ventana'
