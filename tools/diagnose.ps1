# Electron window diagnosis. Run from a normal PowerShell:
#   powershell -ExecutionPolicy Bypass -File tools\diagnose.ps1
$ErrorActionPreference = 'Continue'
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root 'node_modules\electron\dist\electron.exe'
$mini = Join-Path $PSScriptRoot 'mini-electron.cjs'
$diag = Join-Path $root 'diag'
New-Item -ItemType Directory -Force -Path $diag | Out-Null

Write-Host '===== system ====='
Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, ProductType | Format-List
Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, VideoModeDescription | Format-List
Write-Host ('session: ' + [System.Diagnostics.Process]::GetCurrentProcess().SessionId)

$combos = @(
  @('--no-sandbox'),
  @('--no-sandbox', '--disable-gpu'),
  @('--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--in-process-gpu'),
  @('--no-sandbox', '--single-process', '--disable-gpu')
)

$i = 0
foreach ($c in $combos) {
  $i++
  $stdout = Join-Path $diag "run$i.out.txt"
  $stderr = Join-Path $diag "run$i.err.txt"
  Remove-Item $stdout, $stderr -ErrorAction SilentlyContinue

  $argList = @($mini) + $c
  $p = Start-Process -FilePath $exe -ArgumentList $argList -PassThru -Wait -NoNewWindow `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr

  Write-Host ''
  Write-Host ("run{0} [{1}] exit={2}" -f $i, ($c -join ' '), $p.ExitCode)
  if (Test-Path $stdout) {
    Get-Content $stdout | ForEach-Object { Write-Host ("  out| " + $_) }
  }
  if (Test-Path $stderr) {
    Get-Content $stderr | Select-Object -Last 6 | ForEach-Object { Write-Host ("  err| " + $_) }
  }
}

Write-Host ''
Write-Host '===== mini.log (last run) ====='
$miniLog = Join-Path $diag 'mini.log'
if (Test-Path $miniLog) { Get-Content $miniLog }
