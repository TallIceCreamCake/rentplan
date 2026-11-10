# Lancé par la tâche planifiée « RentPlan » : garde le superviseur Node en vie.
# (Le superviseur s'arrête volontairement quand une mise à jour le modifie : il est alors relancé ici.)
$AppDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$LogDir = Join-Path $AppDir '.rentplan\logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$ServiceLog = Join-Path $LogDir 'service.log'

while ($true) {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if ($node) {
    # Tout est déjà écrit dans .rentplan\logs\agent.log par l'agent et le superviseur
    & $node (Join-Path $AppDir 'deploy\start.mjs') *> $null
  } else {
    "$(Get-Date -Format o) node introuvable dans le PATH" | Out-File -FilePath $ServiceLog -Append -Encoding utf8
  }
  Start-Sleep -Seconds 5
}
