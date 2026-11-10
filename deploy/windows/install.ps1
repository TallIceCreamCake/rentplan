<#
  Installe RentPlan sous Windows : tâche planifiée lancée au démarrage de la machine,
  avec mises à jour automatiques depuis GitHub.

    powershell -ExecutionPolicy Bypass -File deploy\windows\install.ps1
    powershell -ExecutionPolicy Bypass -File deploy\windows\install.ps1 -Port 9000
    powershell -ExecutionPolicy Bypass -File deploy\windows\install.ps1 -Uninstall

  Le script demande les droits administrateur si nécessaire.
#>
param(
  [int]$Port = 0,
  [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'
$AppDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$TaskName = 'RentPlan'

function Say($m) { Write-Host "`n> $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "! $m" -ForegroundColor Yellow }
function Die($m) { Write-Host "x $m" -ForegroundColor Red; Read-Host 'Appuyez sur Entrée pour fermer'; exit 1 }

# --- Droits administrateur (nécessaires pour la tâche planifiée et le pare-feu)
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
  if ($Port) { $argList += @('-Port', $Port) }
  if ($Uninstall) { $argList += '-Uninstall' }
  Start-Process powershell.exe -Verb RunAs -ArgumentList $argList
  exit
}

function Stop-RentPlan {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue }
  # La tâche lance PowerShell puis Node : on arrête aussi les processus de ce dossier encore actifs
  Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='powershell.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -like "*$AppDir\deploy\*" -and $_.ProcessId -ne $PID } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

if ($Uninstall) {
  Stop-RentPlan
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Get-NetFirewallRule -DisplayName 'RentPlan' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  Write-Host "Tâche RentPlan retirée. Les fichiers de $AppDir et la base Supabase sont conservés."
  Read-Host 'Appuyez sur Entrée pour fermer'
  exit
}

function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Ensure-Tool($cmd, $wingetId, $label) {
  if (Get-Command $cmd -ErrorAction SilentlyContinue) { return }
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { Die "$label est introuvable et winget n'est pas disponible : installez $label puis relancez ce script." }
  Write-Host "  Installation de $label (winget)…"
  winget install -e --id $wingetId --silent --accept-source-agreements --accept-package-agreements | Out-Host
  Refresh-Path
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Die "$label installé mais introuvable : fermez cette fenêtre et relancez le script." }
}

Say 'Prérequis'
Ensure-Tool 'node' 'OpenJS.NodeJS.LTS' 'Node.js'
Ensure-Tool 'git' 'Git.Git' 'Git'
$node = (Get-Command node).Source
$major = [int](& $node -p "process.versions.node.split('.')[0]")
if ($major -lt 20) { Die "Node.js $(& $node -v) est trop ancien : version 20 ou plus requise (winget upgrade OpenJS.NodeJS.LTS)." }
Write-Host "  node $(& $node -v) ($node), $(git --version)"
$dockerReboot = $false
if (-not (Get-Command docker -ErrorAction SilentlyContinue) -and -not (Test-Path "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe")) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host '  Installation de Docker Desktop (winget)…'
    winget install -e --id Docker.DockerDesktop --silent --accept-source-agreements --accept-package-agreements | Out-Host
    $dockerReboot = $true
  } else {
    Warn "Docker Desktop est absent : la base ne pourra pas démarrer. https://www.docker.com/products/docker-desktop/"
  }
}

Stop-RentPlan

Say 'Préparation de l''application'
$setupArgs = @("$AppDir\deploy\agent.mjs", 'setup')
if ($Port) { $setupArgs += @('--port', $Port) }
& $node @setupArgs
if ($LASTEXITCODE -ne 0) { Die "La préparation a échoué (voir les messages ci-dessus et $AppDir\.rentplan\logs\agent.log)." }

Say 'Tâche planifiée'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$AppDir\deploy\windows\run.ps1`"" `
  -WorkingDirectory $AppDir
$trigger = New-ScheduledTaskTrigger -AtStartup
# S4U : tourne au démarrage, même sans session ouverte, sous le compte courant (sans stocker de mot de passe)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
  -Description 'RentPlan : application web et mises à jour automatiques depuis GitHub' -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

$appPort = (Get-Content "$AppDir\deploy\config.json" -Raw | ConvertFrom-Json).port
Get-NetFirewallRule -DisplayName 'RentPlan' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName 'RentPlan' -Direction Inbound -Protocol TCP -LocalPort $appPort -Action Allow -Profile Domain,Private | Out-Null

Write-Host @"

RentPlan est installé et démarre avec Windows.
  Ouvrez http://localhost:$appPort puis créez le compte administrateur :
  un assistant vous guide pour le reste.

  Mises à jour  : automatiques depuis GitHub
  Journal       : $AppDir\.rentplan\logs\agent.log
  Désinstaller  : powershell -ExecutionPolicy Bypass -File "$AppDir\install.ps1" -Uninstall
"@ -ForegroundColor Green
if ($dockerReboot) {
  Warn "Docker Desktop vient d'être installé : redémarrez Windows, puis ouvrez Docker Desktop une fois pour accepter ses conditions.
  La base de données démarrera ensuite toute seule."
}
Read-Host 'Appuyez sur Entrée pour fermer'
