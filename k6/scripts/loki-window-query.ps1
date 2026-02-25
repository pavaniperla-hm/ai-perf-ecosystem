# loki-window-query.ps1 — Query Loki for exact test time window
param(
    [string]$StartTime = "2026-02-25T16:13:37Z",
    [string]$EndTime   = "2026-02-25T16:25:15Z"
)

[System.Net.ServicePointManager]::CheckCertificateRevocationList = $false
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

$env_vars = @{}
Get-Content (Join-Path $PSScriptRoot "..\..\\.env") | Where-Object { $_ -match "^[^#].+=.+" } | ForEach-Object {
    $parts = $_ -split "=", 2
    $env_vars[$parts[0].Trim()] = $parts[1].Trim()
}
$LOKI_URL      = $env_vars["LOKI_URL"]
$LOKI_USERNAME = $env_vars["LOKI_USERNAME"]
$LOKI_PASSWORD = $env_vars["LOKI_PASSWORD"]

$base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${LOKI_USERNAME}:${LOKI_PASSWORD}"))
$headers = @{ Authorization = "Basic $base64Auth" }

$startNs = ([DateTimeOffset]::Parse($StartTime)).ToUnixTimeMilliseconds() * 1000000L
$endNs   = ([DateTimeOffset]::Parse($EndTime)).ToUnixTimeMilliseconds() * 1000000L

Write-Host "Test window: $StartTime → $EndTime" -ForegroundColor Cyan

function Invoke-LokiQuery([string]$LogQL) {
    $encoded = [Uri]::EscapeDataString($LogQL)
    $url = "${LOKI_URL}/loki/api/v1/query_range?query=${encoded}&start=${startNs}&end=${endNs}&limit=200&direction=backward"
    try {
        return Invoke-RestMethod -Uri $url -Headers $headers -Method Get -TimeoutSec 30
    } catch {
        Write-Warning "Query failed for '$LogQL': $_"
        return $null
    }
}

function Parse-Streams($resp, [string]$label) {
    $total = 0; $byService = @{}; $samples = @()
    if (-not $resp -or -not $resp.data.result) { return @{total=0; byService=@{}; samples=@()} }
    foreach ($stream in $resp.data.result) {
        $svc = if ($stream.stream.service) { $stream.stream.service } else { "unknown" }
        $count = $stream.values.Count
        $total += $count
        if (-not $byService[$svc]) { $byService[$svc] = 0 }
        $byService[$svc] += $count
        $stream.values | Select-Object -First 2 | ForEach-Object {
            $ts  = [DateTimeOffset]::FromUnixTimeMilliseconds([long]$_[0].Substring(0,13)).ToString("HH:mm:ssZ")
            $msg = $_[1] -replace '\x1B\[[0-9;]*m',''
            if ($msg.Length -gt 150) { $msg = $msg.Substring(0,150)+"..." }
            $samples += [PSCustomObject]@{ timestamp=$ts; service=$svc; message=$msg }
        }
    }
    return @{ total=$total; byService=$byService; samples=$samples }
}

Write-Host "`nQuerying errors..." -ForegroundColor Yellow
$errResp  = Invoke-LokiQuery '{job="docker-compose"} |= "error"'
Write-Host "Querying warnings..." -ForegroundColor Yellow
$warnResp = Invoke-LokiQuery '{job="docker-compose"} |= "warn"'
Write-Host "Querying exceptions..." -ForegroundColor Yellow
$excResp  = Invoke-LokiQuery '{job="docker-compose"} |= "exception"'

$errors   = Parse-Streams $errResp  "errors"
$warnings = Parse-Streams $warnResp "warnings"
$exceptions = Parse-Streams $excResp "exceptions"

$totalErrors = $errors.total + $exceptions.total
$affectedServices = @()
foreach ($svc in ($errors.byService.Keys + $warnings.byService.Keys + $exceptions.byService.Keys)) {
    if ($affectedServices -notcontains $svc) { $affectedServices += $svc }
}

$topErrors = ($errors.samples + $exceptions.samples) | Select-Object -First 3

Write-Host "`n════ LOKI LOG SUMMARY ════" -ForegroundColor Green
Write-Host "Window : $StartTime → $EndTime"
Write-Host "Errors + Exceptions : $totalErrors"
Write-Host "Warnings            : $($warnings.total)"
if ($affectedServices.Count -gt 0) {
    Write-Host "Affected services   : $($affectedServices -join ', ')"
} else {
    Write-Host "Affected services   : None"
}
if ($topErrors.Count -gt 0) {
    Write-Host "`nTop errors:"
    $topErrors | ForEach-Object { Write-Host "  [$($_.timestamp)] [$($_.service)] $($_.message)" }
} else {
    Write-Host "Top errors          : None"
}

# Output JSON for pipeline use
@{
    error_count       = $totalErrors
    warning_count     = $warnings.total
    affected_services = $affectedServices
    top_errors        = $topErrors | ForEach-Object { @{timestamp=$_.timestamp; service=$_.service; message=$_.message} }
} | ConvertTo-Json -Depth 4
