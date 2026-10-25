# Builds tools/capture/NestCapture.cs into resources/tools/nest-capture.exe
# using the C# compiler that ships with the .NET Framework (no SDK needed).
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) {
  $csc = 'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe'
}
if (-not (Test-Path $csc)) {
  throw 'csc.exe not found: install .NET Framework 4.x'
}

$source = Join-Path $PSScriptRoot 'capture\NestCapture.cs'
$outDir = Join-Path $root 'resources\tools'
$exe = Join-Path $outDir 'nest-capture.exe'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

& $csc /nologo /optimize+ /target:exe /platform:anycpu `
  "/out:$exe" `
  /reference:System.dll `
  /reference:System.Drawing.dll `
  $source

if ($LASTEXITCODE -ne 0) { throw "csc failed with $LASTEXITCODE" }
Write-Host ("built " + $exe + " (" + (Get-Item $exe).Length + " bytes)")
