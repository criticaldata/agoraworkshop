param(
  [Parameter(Mandatory = $true)]
  [string]$PreflightReceiptPath,
  [string]$BaseUrl = $(if ($env:NVIDIA_VLLM_BASE_URL) { $env:NVIDIA_VLLM_BASE_URL } else { 'http://127.0.0.1:18002/v1' }),
  [string]$OutDir = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath $PreflightReceiptPath)) {
  throw "Preflight receipt does not exist: $PreflightReceiptPath"
}
if (-not $OutDir) {
  $OutDir = Join-Path $repoRoot ("phase0_1_nvidia_vllm_campaign_" + (Get-Date -Format 'yyyyMMdd_HHmmss'))
}
$OutDir = [System.IO.Path]::GetFullPath($OutDir)
$dbName = "agora_phase0_1_nvidia_vllm_" + ((New-Guid).Guid) + '.sqlite'
$dbPath = Join-Path ([System.IO.Path]::GetTempPath()) $dbName

$env:NVIDIA_VLLM_BASE_URL = $BaseUrl
$env:AGORA_DB_PATH = $dbPath
Push-Location $repoRoot
try {
  npm run agora -- validate `
    --config configs/agora_phase0_1_nvidia_vllm_live_canary.yaml `
    --fault-config configs/agora_phase0_1_nvidia_vllm_live_fault.yaml `
    --moderator-config configs/agora_phase0_1_nvidia_vllm_moderator_scripted.yaml `
    --preflight $PreflightReceiptPath `
    --out $OutDir
  if ($LASTEXITCODE -ne 0) { throw "NVIDIA VLLM linked canary did not close with ready=true" }
  Write-Output ("Live campaign written to " + $OutDir)
  Write-Output ("SQLite evidence written to " + $dbPath)
}
finally {
  Pop-Location
}
