<#
Simple PowerShell smoke test for the server.

Usage:
1. Start the server: `npm start` (ensure Node/npm and LibreOffice `soffice` are installed).
2. Run this script from the repo root:
   powershell -ExecutionPolicy Bypass -File .github\smoke-test.ps1 -FilePath C:\path\to\sample.docx

This script uploads a single DOCX to `/convert`, polls `/status/:jobId`, and downloads the result when complete.
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$FilePath
)

if (-not (Test-Path $FilePath)) {
    Write-Error "File not found: $FilePath"
    exit 1
}

$uri = 'http://localhost:3000/convert'
Write-Host "Uploading $FilePath to $uri"

$form = @{ files = Get-Item $FilePath }

try {
    $resp = Invoke-RestMethod -Uri $uri -Method Post -Form $form
} catch {
    Write-Error "Upload failed: $_"
    exit 2
}

if (-not $resp.jobId) {
    Write-Error "No jobId received: $($resp | ConvertTo-Json -Depth 3)"
    exit 3
}

$jobId = $resp.jobId
Write-Host "Job started: $jobId"

# Poll status
$statusUri = "http://localhost:3000/status/$jobId"
while ($true) {
    Start-Sleep -Seconds 1
    try {
        $s = Invoke-RestMethod -Uri $statusUri -Method Get
    } catch {
        Write-Warning "Status fetch failed: $_"
        continue
    }

    Write-Host "Status:" $s.status "Progress:" $s.totalProgress "Message:" $s.message

    if ($s.status -eq 'done') {
        $downloadUri = "http://localhost:3000/result/$jobId"
        $outFile = "merged-$jobId.pdf"
        Write-Host "Downloading result to $outFile"
        Invoke-WebRequest -Uri $downloadUri -OutFile $outFile
        Write-Host "Downloaded: $outFile"
        break
    }

    if ($s.status -eq 'error') {
        Write-Error "Job error: $($s.error)"
        exit 4
    }
}

Write-Host "Smoke test complete."
