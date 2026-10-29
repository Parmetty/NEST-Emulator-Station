# Creates the GitHub release for v0.3.2 with curl (Invoke-RestMethod misbehaves here).
$ErrorActionPreference = 'Stop'
Set-Location 'E:\workstop\nest'

$repo = 'Parmetty/NEST-Emulator-Station'
$zip  = 'E:\workstop\nest\dist\Nest-0.3.2-portable.zip'
if (-not (Test-Path $zip)) { throw "missing zip: $zip" }

$cred = "protocol=https`nhost=github.com`n`n" | git credential fill
$token = ($cred | Where-Object { $_ -match '^password=' } | Select-Object -First 1) -replace '^password=', ''
if (-not $token) { throw 'no stored github credential' }

$headerFile = Join-Path $env:TEMP 'nest-gh-headers.txt'
@(
  "Authorization: token $token"
  'User-Agent: nest-release-script'
  'Accept: application/vnd.github+json'
  'Content-Type: application/json'
) | Set-Content -Path $headerFile -Encoding ASCII

$respFile = 'E:\workstop\nest\diag\gh-release-create.json'
& curl.exe -sS --ssl-no-revoke --max-time 120 -X POST -H "@$headerFile" --data-binary "@E:\workstop\nest\tools\release-0.3.2.json" `
  "https://api.github.com/repos/$repo/releases" | Out-File -FilePath $respFile -Encoding utf8

$release = Get-Content $respFile -Raw | ConvertFrom-Json
if (-not $release.html_url) { throw "release failed: $($release.message) $($release.errors | ConvertTo-Json -Compress)" }
"release: $($release.html_url)"

$uploadBase = $release.upload_url -replace '\{.*\}', ''
@(
  "Authorization: token $token"
  'User-Agent: nest-release-script'
  'Accept: application/vnd.github+json'
  'Content-Type: application/zip'
) | Set-Content -Path $headerFile -Encoding ASCII

$assetFile = 'E:\workstop\nest\diag\gh-asset.json'
& curl.exe -sS --ssl-no-revoke --max-time 1800 -X POST -H "@$headerFile" --data-binary "@$zip" `
  "$($uploadBase)?name=Nest-0.3.2-portable.zip" | Out-File -FilePath $assetFile -Encoding utf8
Remove-Item $headerFile -Force -ErrorAction SilentlyContinue

$asset = Get-Content $assetFile -Raw | ConvertFrom-Json
if ($asset.message) { throw "upload failed: $($asset.message)" }
"asset: $($asset.browser_download_url)"
"asset size: $($asset.size)"
