# Installation de RentPlan sous Windows, en une commande (PowerShell) :
#
#   irm https://raw.githubusercontent.com/TallIceCreamCake/rentplan/main/install.ps1 | iex
#
# Options : & ([scriptblock]::Create((irm https://raw.githubusercontent.com/TallIceCreamCake/rentplan/main/install.ps1))) -Port 9000 -Dir D:\RentPlan
#   -Dir        dossier d'installation (defaut : %USERPROFILE%\RentPlan)
#   -Port       port de l'application (defaut : 8080)
#   -Uninstall  retirer le service (les fichiers et la base sont conserves)
#
# Ce script ne contient que des caracteres ASCII : il telecharge RentPlan puis lance
# l'installateur complet deploy\windows\install.ps1 (droits administrateur demandes).
param(
  [string]$Dir = '',
  [int]$Port = 0,
  [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'
$repo = if ($env:RENTPLAN_REPO) { $env:RENTPLAN_REPO -replace '\.git$', '' } else { 'https://github.com/TallIceCreamCake/rentplan' }
$branch = if ($env:RENTPLAN_BRANCH) { $env:RENTPLAN_BRANCH } else { 'main' }
if (-not $Dir) { $Dir = if ($env:RENTPLAN_DIR) { $env:RENTPLAN_DIR } else { Join-Path $env:USERPROFILE 'RentPlan' } }

# Lance depuis un dossier RentPlan (git clone ou ZIP decompresse) : on l'installe tel quel
if ($PSScriptRoot -and (Test-Path (Join-Path $PSScriptRoot 'deploy\agent.mjs'))) {
  $Dir = $PSScriptRoot
} elseif (Test-Path (Join-Path $Dir 'deploy\agent.mjs')) {
  Write-Host "> RentPlan est deja present dans $Dir : reinstallation."
} else {
  if ((Test-Path $Dir) -and (Get-ChildItem $Dir -Force | Select-Object -First 1)) {
    throw "Le dossier $Dir existe deja et n'est pas vide : choisissez-en un autre avec -Dir."
  }
  Write-Host "> Telechargement de RentPlan dans $Dir"
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $zip = Join-Path $env:TEMP "rentplan-$branch.zip"
  $tmp = Join-Path $env:TEMP 'rentplan-extract'
  $ProgressPreference = 'SilentlyContinue'
  Invoke-WebRequest -UseBasicParsing -Uri "$repo/archive/refs/heads/$branch.zip" -OutFile $zip
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  New-Item -ItemType Directory -Force -Path $Dir | Out-Null
  $root = Get-ChildItem $tmp -Directory | Select-Object -First 1
  Get-ChildItem $root.FullName -Force | Move-Item -Destination $Dir -Force
  Remove-Item $zip, $tmp -Recurse -Force
}

$installer = Join-Path $Dir 'deploy\windows\install.ps1'
$installerArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $installer)
if ($Port) { $installerArgs += @('-Port', $Port) }
if ($Uninstall) { $installerArgs += '-Uninstall' }
& powershell.exe @installerArgs
