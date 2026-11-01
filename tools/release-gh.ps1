param(
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][string]$Title,
  [Parameter(Mandatory = $true)][string]$BodyFile,
  [Parameter(Mandatory = $true)][string]$Zip,
  [switch]$PreRelease
)

$ErrorActionPreference = 'Stop'
Set-Location 'E:\workstop\nest'

$repo = 'Parmetty/NEST-Emulator-Station'
if (-not (Test-Path $Zip)) { throw "missing zip: $Zip" }
if (-not (Test-Path $BodyFile)) { throw "missing body: $BodyFile" }

$cred = "protocol=https`nhost=github.com`n`n" | git credential fill
$token = ($cred | Where-Object { $_ -match '^password=' } | Select-Object -First 1) -replace '^password=', ''
if (-not $token) { throw 'no stored github credential' }

$payloadPath = 'tools\release-payload.json'
$body = [System.IO.File]::ReadAllText((Resolve-Path $BodyFile).Path, [System.Text.Encoding]::UTF8)
$json = [ordered]@{
  tag_name   = "v$Version"
  name       = $Title
  body       = $body
  draft      = $false
  prerelease = [bool]$PreRelease
  make_latest = if ($PreRelease) { 'false' } else { 'true' }
} | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText((Join-Path (Get-Location) $payloadPath), $json, (New-Object System.Text.UTF8Encoding($false)))

$headerFile = Join-Path $env:TEMP 'nest-gh-headers.txt'
@(
  "Authorization: token $token"
  'User-Agent: nest-release-script'
  'Accept: application/vnd.github+json'
  'Content-Type: application/json'
) | Set-Content -Path $headerFile -Encoding ASCII

$respFile = 'diag\gh-release-create.json'
New-Item -ItemType Directory -Force -Path 'diag' | Out-Null
& curl.exe -sS --ssl-no-revoke --max-time 120 -X POST -H "@$headerFile" --data-binary "@$payloadPath" `
  "https://api.github.com/repos/$repo/releases" | Out-File -FilePath $respFile -Encoding utf8

$release = Get-Content $respFile -Raw | ConvertFrom-Json
if (-not $release.html_url) { throw "release failed: $($release.message) $($release.errors | ConvertTo-Json -Compress)" }
"release: $($release.html_url)"

$uploadBase = $release.upload_url -replace '\{.*\}', ''
$assetName = [System.IO.Path]::GetFileName($Zip)
@(
  "Authorization: token $token"
  'User-Agent: nest-release-script'
  'Accept: application/vnd.github+json'
  'Content-Type: application/zip'
) | Set-Content -Path $headerFile -Encoding ASCII

$assetFile = 'diag\gh-asset.json'
& curl.exe -sS --ssl-no-revoke --max-time 1800 -X POST -H "@$headerFile" --data-binary "@$Zip" `
  "$($uploadBase)?name=$assetName" | Out-File -FilePath $assetFile -Encoding utf8
Remove-Item $headerFile -Force -ErrorAction SilentlyContinue

$asset = Get-Content $assetFile -Raw | ConvertFrom-Json
if ($asset.message) { throw "upload failed: $($asset.message)" }
"asset: $($asset.browser_download_url)"
"asset size: $($asset.size)"
