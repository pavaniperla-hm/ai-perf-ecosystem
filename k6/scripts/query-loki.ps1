# query-loki.ps1
# Queries Grafana Cloud Loki for errors and warnings from the last 20 minutes
# Outputs JSON summary for use in regression reporting

param(
    [int]$MinutesBack = 20,
    [int]$Limit = 200
)

# Load credentials from .env
$envFile = Join-Path $PSScriptRoot "..\..\\.env" | Resolve-Path
$env_vars = @{}
Get-Content $envFile | Where-Object { $_ -match "^[^#].+=.+" } | ForEach-Object {
    $parts = $_ -split "=", 2
    $env_vars[$parts[0].Trim()] = $parts[1].Trim()
}

$LOKI_URL      = $env_vars["LOKI_URL"]
$LOKI_USERNAME = $env_vars["LOKI_USERNAME"]
$LOKI_PASSWORD = $env_vars["LOKI_PASSWORD"]

if (-not $LOKI_URL -or -not $LOKI_USERNAME -or -not $LOKI_PASSWORD) {
    Write-Error "Missing LOKI_URL, LOKI_USERNAME, or LOKI_PASSWORD in .env"
    exit 1
}

# Disable certificate revocation check (Windows schannel issue)
[System.Net.ServicePointManager]::CheckCertificateRevocationList = $false
# Also handle TLS 1.2
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

$base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${LOKI_USERNAME}:${LOKI_PASSWORD}"))
$headers = @{ Authorization = "Basic $base64Auth" }

$endNs   = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() * 1000000L
$startNs = ([DateTimeOffset]::UtcNow.AddMinutes(-$MinutesBack)).ToUnixTimeMilliseconds() * 1000000L

function Invoke-LokiQuery {
    param([string]$LogQL)
    $encoded = [Uri]::EscapeDataString($LogQL)
    $url = "${LOKI_URL}/loki/api/v1/query_range?query=${encoded}&start=${startNs}&end=${endNs}&limit=${Limit}&direction=backward"
    try {
        $resp = Invoke-RestMethod -Uri $url -Headers $headers -Method Get -TimeoutSec 30
        return $resp
    } catch {
        Write-Warning "Loki query failed: $_"
        return $null
    }
}

# ── Error/Exception query ─────────────────────────────────────────────────────
$errorQuery   = '{job="docker-compose"} |~ "(?i)(error|exception)"'
$warningQuery = '{job="docker-compose"} |~ "(?i)(warn)"'

Write-Host "Querying Loki for errors (last ${MinutesBack} min)..." -ForegroundColor Cyan
$errorResp = Invoke-LokiQuery -LogQL $errorQuery

Write-Host "Querying Loki for warnings (last ${MinutesBack} min)..." -ForegroundColor Cyan
$warnResp = Invoke-LokiQuery -LogQL $warningQuery

# ── Parse results ─────────────────────────────────────────────────────────────
function Parse-LokiResponse {
    param($Response, [string]$Label)
    $results = @{
        label      = $Label
        totalLines = 0
        byService  = @{}
        samples    = @()
    }
    if (-not $Response -or -not $Response.data -or -not $Response.data.result) {
        return $results
    }
    foreach ($stream in $Response.data.result) {
        $svc = $stream.stream.service
        if (-not $svc) { $svc = $stream.stream.container_name }
        if (-not $svc) { $svc = "unknown" }
        $count = $stream.values.Count
        $results.totalLines += $count
        if (-not $results.byService[$svc]) { $results.byService[$svc] = 0 }
        $results.byService[$svc] += $count
        # Grab up to 3 sample messages per stream
        $stream.values | Select-Object -First 3 | ForEach-Object {
            $msg = $_[1] -replace '\x1B\[[0-9;]*m', ''  # strip ANSI
            if ($msg.Length -gt 200) { $msg = $msg.Substring(0, 200) + "..." }
            $results.samples += "[${svc}] $msg"
        }
    }
    return $results
}

$errors   = Parse-LokiResponse -Response $errorResp   -Label "errors"
$warnings = Parse-LokiResponse -Response $warnResp    -Label "warnings"

# ── Output summary JSON ────────────────────────────────────────────────────────
$summary = @{
    queryWindowMinutes = $MinutesBack
    errors   = $errors
    warnings = $warnings
}

$json = $summary | ConvertTo-Json -Depth 6
Write-Output $json
