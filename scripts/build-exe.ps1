# Builds dist\ToDoApp.exe. Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File scripts/build-exe.ps1
# Needs Node/npm and the .venv (Python 3.13) already created.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root '.venv\Scripts\python.exe'
$pyinstaller = Join-Path $root '.venv\Scripts\pyinstaller.exe'
$icon = Join-Path $root 'packaging\icon.ico'
$spec = Join-Path $root 'packaging\todoapp.spec'

function Invoke-Step([string]$name, [scriptblock]$command) {
    Write-Host "==> $name"
    & $command
    if ($LASTEXITCODE -ne 0) { throw "Step failed ($name), exit code $LASTEXITCODE" }
}

Push-Location $root
try {
    Invoke-Step 'Install web dependencies' { npm --prefix web ci }
    Invoke-Step 'Build the UI' { npm --prefix web run build }
    Invoke-Step 'Install the [windows] extra and PyInstaller' {
        & $python -m pip install -e "server[windows]" pyinstaller
    }
    Invoke-Step 'Generate packaging\icon.ico' {
        & $python -c "import sys; from todoapp.launcher.tray import make_icon_image; make_icon_image(256).save(sys.argv[1], format='ICO', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])" $icon
    }
    Invoke-Step 'Run PyInstaller' {
        & $pyinstaller $spec --noconfirm --distpath (Join-Path $root 'dist') --workpath (Join-Path $root 'build')
    }
    $exe = Join-Path $root 'dist\ToDoApp.exe'
    if (-not (Test-Path $exe)) { throw "PyInstaller finished but $exe is missing" }
    Write-Host ("Built {0} ({1:N1} MB)" -f $exe, ((Get-Item $exe).Length / 1MB))
}
finally {
    Pop-Location
}
