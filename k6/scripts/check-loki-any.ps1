# check-loki-any.ps1 — verify any logs exist in Loki for docker-compose job

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

$endNs   = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() * 1000000L
$startNs = ([DateTimeOffset]::UtcNow.AddMinutes(-60)).ToUnixTimeMilliseconds() * 1000000L

$encoded = [Uri]::EscapeDataString('{job="docker-compose"}')
$url = "${LOKI_URL}/loki/api/v1/query_range?query=${encoded}&start=${startNs}&end=${endNs}&limit=10&direction=backward"

Write-Host "URL: $url" -ForegroundColor Yellow
$resp = Invoke-RestMethod -Uri $url -Headers $headers -Method Get -TimeoutSec 30

Write-Host "Status: $($resp.status)"
Write-Host "Streams returned: $($resp.data.result.Count)"

foreach ($stream in $resp.data.result) {
    Write-Host "`nStream labels: $($stream.stream | ConvertTo-Json -Compress)" -ForegroundColor Cyan
    Write-Host "  Lines in stream: $($stream.values.Count)"
    if ($stream.values.Count -gt 0) {
        $line = $stream.values[0][1]
        if ($line.Length -gt 200) { $line = $line.Substring(0, 200) + "..." }
        Write-Host "  Sample: $line"
    }
}

# Also list unique label names to see what's available
Write-Host "`n--- Available label names ---" -ForegroundColor Yellow
$labelUrl = "${LOKI_URL}/loki/api/v1/labels?start=${startNs}&end=${endNs}"
$labelResp = Invoke-RestMethod -Uri $labelUrl -Headers $headers -Method Get -TimeoutSec 30
Write-Host ($labelResp.data -join ", ")
