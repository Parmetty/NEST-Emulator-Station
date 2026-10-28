# Builds the small C# helpers in tools/ into resources/tools/*.exe using the
# C# compiler that ships with the .NET Framework (no SDK needed).
#
#   tools/capture/NestCapture.cs -> resources/tools/nest-capture.exe
#   tools/input/NestInput.cs     -> resources/tools/nest-input.exe
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$wpf = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\WPF'
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) {
  $csc = 'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe'
}
if (-not (Test-Path $csc)) {
  throw 'csc.exe not found: install .NET Framework 4.x'
}

$outDir = Join-Path $root 'resources\tools'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$targets = @(
  @{ Source = 'capture\NestCapture.cs'; Exe = 'nest-capture.exe'; Extra = @('/reference:System.Drawing.dll') },
  @{ Source = 'input\NestInput.cs';     Exe = 'nest-input.exe';   Extra = @() },
  @{ Source = 'window\NestWindow.cs';   Exe = 'nest-window.exe';  Extra = @() },
  @{ Source = 'pads\NestPads.cs';       Exe = 'nest-pads.exe';    Extra = @() },
  @{ Source = 'menu\NestMenu.cs';       Exe = 'nest-menu.exe';    Extra = @("/reference:$wpf\UIAutomationClient.dll", "/reference:$wpf\UIAutomationTypes.dll", "/reference:$wpf\WindowsBase.dll") }
)

foreach ($target in $targets) {
  $source = Join-Path $PSScriptRoot $target.Source
  $exe = Join-Path $outDir $target.Exe
  & $csc /nologo /optimize+ /target:exe /platform:anycpu `
    "/out:$exe" `
    /reference:System.dll `
    @($target.Extra) `
    $source
  if ($LASTEXITCODE -ne 0) { throw "csc failed for $($target.Exe): $LASTEXITCODE" }
  Write-Host ("built " + $exe + " (" + (Get-Item $exe).Length + " bytes)")
}
