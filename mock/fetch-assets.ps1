$ErrorActionPreference = 'Stop'
$ua = @{ 'User-Agent' = 'NestMock/0.1 (local design mock)' }
$outDir = Join-Path $PSScriptRoot 'assets'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$targets = @(
  @{ id = 'gba';  title = 'File:Nintendo-Game-Boy-Advance-Purple-FL.png'; ext = 'png' },
  @{ id = 'fc';   title = 'File:NES-Console-Set.jpg';                    ext = 'jpg' },
  @{ id = 'sfc';  title = 'File:SNES-Console-Set.png';                   ext = 'png' },
  @{ id = 'n64';  title = 'File:N64-Console-Set.png';                    ext = 'png' },
  @{ id = 'ngc';  title = 'File:GameCube-Console-Set.png';               ext = 'png' },
  @{ id = 'wii';  title = 'File:Wii-Console.png';                        ext = 'png' },
  @{ id = 'wiiu'; title = 'File:Wii-U-Console-Set.png';                  ext = 'png' }
)

$credits = @()
foreach ($t in $targets) {
  $url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&redirects=1&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1920&titles=' + [uri]::EscapeDataString($t.title)
  try { $r = Invoke-RestMethod -Uri $url -Headers $ua -TimeoutSec 60 } catch { Write-Host "API-ERR $($t.id): $($_.Exception.Message)"; continue }
  $page = @($r.query.pages.PSObject.Properties.Value)[0]
  $ii = $null
  if ($page.imageinfo) { $ii = $page.imageinfo[0] }
  if (-not $ii) { Write-Host "MISS $($t.id) ($($t.title))"; continue }
  $src = $ii.thumburl
  if (-not $src) { $src = $ii.url }
  $path = Join-Path $outDir ($t.id + '.' + $t.ext)
  Invoke-WebRequest -Uri $src -OutFile $path -Headers $ua -TimeoutSec 180
  $meta = $ii.extmetadata
  $artist = ''; $lic = ''
  if ($meta.Artist) { $artist = ($meta.Artist.value -replace '<[^>]+>', '').Trim() }
  if ($meta.LicenseShortName) { $lic = $meta.LicenseShortName.value }
  $credits += [pscustomobject]@{
    system = $t.id; file = $t.id + '.' + $t.ext; title = $page.title
    source = 'https://commons.wikimedia.org/wiki/' + ($page.title -replace ' ', '_')
    artist = $artist; license = $lic; bytes = (Get-Item $path).Length
  }
  Write-Host ("OK  {0,-5} {1,10:N0} B  {2}  [{3}]" -f $t.id, (Get-Item $path).Length, $page.title, $lic)
}
$credits | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $outDir 'credits.json') -Encoding UTF8
