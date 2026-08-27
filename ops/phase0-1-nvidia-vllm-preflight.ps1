param(
  [string]$BaseUrl = $(if ($env:NVIDIA_VLLM_BASE_URL) { $env:NVIDIA_VLLM_BASE_URL } else { 'http://127.0.0.1:18002/v1' }),
  [string]$Model = 'leoclaw-qwen3-32b',
  [string]$OutDir = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutDir) {
  $OutDir = Join-Path $repoRoot ("phase0_1_nvidia_vllm_preflight_" + (Get-Date -Format 'yyyyMMdd_HHmmss'))
}
$OutDir = [System.IO.Path]::GetFullPath($OutDir)
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$env:NVIDIA_VLLM_BASE_URL = $BaseUrl
Push-Location $repoRoot
try {
  npm run agora -- provider-probe --provider nvidia_vllm --model $Model --out $OutDir
  if ($LASTEXITCODE -ne 0) { throw "NVIDIA VLLM provider preflight failed" }

  # Read-only node provenance. This script never starts, stops, or reconfigures VLLM.
  $snapshot = & ssh -o BatchMode=yes -o ConnectTimeout=10 mit-critical-data-1 `
    "hostname; date -Is; df -h /data; nvidia-smi --query-gpu=index,uuid,name,memory.used,memory.total,utilization.gpu --format=csv,noheader; pgrep -af 'vllm serve' || true"
  $snapshot | Set-Content -Path (Join-Path $OutDir 'node_snapshot.txt') -Encoding utf8
  Write-Output ("Preflight written to " + $OutDir)
}
finally {
  Pop-Location
}
