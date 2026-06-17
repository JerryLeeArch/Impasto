$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RuntimeRoot = Join-Path $ProjectRoot ".runtime"
$DownloadRoot = Join-Path $RuntimeRoot "downloads"
$AppPort = 4310

if ($env:PORT) {
  $parsedPort = 0
  if ([int]::TryParse($env:PORT, [ref]$parsedPort) -and $parsedPort -gt 0) {
    $AppPort = $parsedPort
  }
}

$AppUrl = "http://127.0.0.1:$AppPort"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message"
}

function Get-NodeVersion {
  $versionFile = Join-Path $ProjectRoot ".node-version"

  if (Test-Path $versionFile) {
    $version = (Get-Content -Raw -Path $versionFile).Trim()
  } else {
    $version = "25.6.1"
  }

  if ([string]::IsNullOrWhiteSpace($version)) {
    throw ".node-version is empty."
  }

  if ($version -notmatch "^v") {
    $version = "v$version"
  }

  return $version
}

function Get-WindowsNodeArch {
  $arch = $env:PROCESSOR_ARCHITEW6432

  if ([string]::IsNullOrWhiteSpace($arch)) {
    $arch = $env:PROCESSOR_ARCHITECTURE
  }

  if ($arch -match "ARM64") {
    return "arm64"
  }

  return "x64"
}

function Invoke-Download {
  param(
    [string]$Url,
    [string]$OutFile
  )

  Write-Host "Downloading $Url"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
}

function Get-ExpectedHash {
  param(
    [string]$ShasumsFile,
    [string]$FileName
  )

  $escapedFileName = [System.Text.RegularExpressions.Regex]::Escape($FileName)
  $match = Select-String -Path $ShasumsFile -Pattern "^\s*([A-Fa-f0-9]{64})\s+$escapedFileName\s*$" | Select-Object -First 1

  if (-not $match) {
    throw "Could not find $FileName in SHASUMS256.txt."
  }

  return $match.Matches[0].Groups[1].Value.ToLowerInvariant()
}

function Test-Hash {
  param(
    [string]$File,
    [string]$ExpectedHash
  )

  if (-not (Test-Path $File)) {
    return $false
  }

  $actualHash = (Get-FileHash -Algorithm SHA256 -Path $File).Hash.ToLowerInvariant()
  return $actualHash -eq $ExpectedHash
}

function Ensure-NodeRuntime {
  $nodeVersion = Get-NodeVersion
  $nodeArch = Get-WindowsNodeArch
  $nodeFolderName = "node-$nodeVersion-win-$nodeArch"
  $nodeRoot = Join-Path $RuntimeRoot $nodeFolderName
  $nodeExe = Join-Path $nodeRoot "node.exe"
  $npmCmd = Join-Path $nodeRoot "npm.cmd"

  if (Test-Path $nodeExe) {
    try {
      $installedVersion = (& $nodeExe -p "process.version").Trim()
    } catch {
      $installedVersion = ""
    }

    if ($LASTEXITCODE -eq 0 -and $installedVersion -eq $nodeVersion -and (Test-Path $npmCmd)) {
      Write-Host "Using local Node.js $installedVersion ($nodeArch)."
      return [pscustomobject]@{
        Version = $nodeVersion
        Arch = $nodeArch
        Root = $nodeRoot
        Node = $nodeExe
        Npm = $npmCmd
      }
    }

    Write-Step "Replacing mismatched local Node.js runtime"
    Remove-Item -LiteralPath $nodeRoot -Recurse -Force
  }

  Write-Step "Preparing local Node.js $nodeVersion ($nodeArch)"
  New-Item -ItemType Directory -Force -Path $DownloadRoot | Out-Null

  $zipName = "$nodeFolderName.zip"
  $zipPath = Join-Path $DownloadRoot $zipName
  $shasumsPath = Join-Path $DownloadRoot "$nodeVersion-SHASUMS256.txt"
  $baseUrl = "https://nodejs.org/dist/$nodeVersion"

  Invoke-Download -Url "$baseUrl/SHASUMS256.txt" -OutFile $shasumsPath
  $expectedHash = Get-ExpectedHash -ShasumsFile $shasumsPath -FileName $zipName

  if (-not (Test-Hash -File $zipPath -ExpectedHash $expectedHash)) {
    if (Test-Path $zipPath) {
      Remove-Item -LiteralPath $zipPath -Force
    }

    Invoke-Download -Url "$baseUrl/$zipName" -OutFile $zipPath

    if (-not (Test-Hash -File $zipPath -ExpectedHash $expectedHash)) {
      throw "Downloaded Node.js archive failed SHA256 verification."
    }
  } else {
    Write-Host "Using cached $zipName."
  }

  if (Test-Path $nodeRoot) {
    Remove-Item -LiteralPath $nodeRoot -Recurse -Force
  }

  Write-Host "Extracting $zipName..."
  Expand-Archive -LiteralPath $zipPath -DestinationPath $RuntimeRoot -Force

  if (-not (Test-Path $nodeExe) -or -not (Test-Path $npmCmd)) {
    throw "Node.js archive extracted, but node.exe or npm.cmd was not found."
  }

  $installedVersion = (& $nodeExe -p "process.version").Trim()
  if ($installedVersion -ne $nodeVersion) {
    throw "Expected Node.js $nodeVersion, but extracted $installedVersion."
  }

  Write-Host "Installed local Node.js $installedVersion."

  return [pscustomobject]@{
    Version = $nodeVersion
    Arch = $nodeArch
    Root = $nodeRoot
    Node = $nodeExe
    Npm = $npmCmd
  }
}

function Get-InstallFingerprint {
  param([object]$Runtime)

  $packageJson = Join-Path $ProjectRoot "package.json"
  $packageLock = Join-Path $ProjectRoot "package-lock.json"

  if (-not (Test-Path $packageJson)) {
    throw "package.json was not found."
  }

  if (-not (Test-Path $packageLock)) {
    throw "package-lock.json was not found."
  }

  $packageJsonHash = (Get-FileHash -Algorithm SHA256 -Path $packageJson).Hash
  $packageLockHash = (Get-FileHash -Algorithm SHA256 -Path $packageLock).Hash

  return "$($Runtime.Version)|win-$($Runtime.Arch)|$packageJsonHash|$packageLockHash"
}

function Test-DependenciesReady {
  param(
    [object]$Runtime,
    [string]$Fingerprint,
    [string]$InstallMarker
  )

  $nodeModules = Join-Path $ProjectRoot "node_modules"

  if (-not (Test-Path $nodeModules)) {
    return $false
  }

  $requiredDirs = @(
    "next",
    "react",
    "react-dom",
    "lucide-react",
    "@next\swc-win32-$($Runtime.Arch)-msvc"
  )

  foreach ($dir in $requiredDirs) {
    if (-not (Test-Path (Join-Path $nodeModules $dir))) {
      return $false
    }
  }

  if (-not (Test-Path $InstallMarker)) {
    return $false
  }

  $currentFingerprint = (Get-Content -Raw -Path $InstallMarker).Trim()
  return $currentFingerprint -eq $Fingerprint
}

function Ensure-Dependencies {
  param([object]$Runtime)

  $env:PATH = "$($Runtime.Root);$env:PATH"
  $env:NPM_CONFIG_CACHE = Join-Path $RuntimeRoot "npm-cache"
  $env:NPM_CONFIG_UPDATE_NOTIFIER = "false"
  $env:NEXT_TELEMETRY_DISABLED = "1"

  $fingerprint = Get-InstallFingerprint -Runtime $Runtime
  $installMarker = Join-Path $RuntimeRoot "npm-install-win-$($Runtime.Arch).txt"

  if (Test-DependenciesReady -Runtime $Runtime -Fingerprint $fingerprint -InstallMarker $installMarker) {
    Write-Host "Dependencies are ready."
    return
  }

  Write-Step "Installing app dependencies"
  Push-Location $ProjectRoot
  try {
    $npmCmd = $Runtime.Npm
    & $npmCmd ci

    if ($LASTEXITCODE -ne 0) {
      throw "npm ci failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }

  Set-Content -Path $installMarker -Value $fingerprint -Encoding ASCII
}

function Test-AppReady {
  param([string]$Url)

  try {
    Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Start-BrowserWhenReady {
  param([string]$Url)

  Start-Job -Name "ImpastoOpenBrowser" -ArgumentList $Url -ScriptBlock {
    param([string]$ReadyUrl)

    for ($i = 0; $i -lt 80; $i++) {
      try {
        Invoke-WebRequest -Uri $ReadyUrl -UseBasicParsing -TimeoutSec 2 | Out-Null
        Start-Process $ReadyUrl
        return
      } catch {
        Start-Sleep -Milliseconds 500
      }
    }

    Start-Process $ReadyUrl
  } | Out-Null
}

try {
  Set-Location $ProjectRoot
  New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot "data") | Out-Null
  New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null

  $runtime = Ensure-NodeRuntime
  Ensure-Dependencies -Runtime $runtime

  if (Test-AppReady -Url $AppUrl) {
    Write-Host "Impasto is already running at $AppUrl."
    Start-Process $AppUrl
    exit 0
  }

  Write-Step "Starting Impasto"
  Start-BrowserWhenReady -Url $AppUrl
  Write-Host "Keep this window open while using Impasto."
  $npmCmd = $runtime.Npm
  & $npmCmd run dev -- -p $AppPort
  exit $LASTEXITCODE
} catch {
  Write-Host ""
  Write-Host "Impasto setup failed:"
  Write-Host $_.Exception.Message
  exit 1
}
