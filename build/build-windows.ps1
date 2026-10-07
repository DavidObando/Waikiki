<#
.SYNOPSIS
    Builds a self-contained Windows zip for Waikiki.
.PARAMETER Runtime
    win-x64 (default) or win-arm64.
.PARAMETER Configuration
    Release (default) or Debug.
.PARAMETER OutputDir
    Where artifacts are written. Default: ./artifacts
#>
param(
    [string]$Runtime = "win-x64",
    [string]$Configuration = "Release",
    [string]$OutputDir = "./artifacts"
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$appDir = Join-Path $repoRoot "src/Waikiki.App"
$project = Join-Path $appDir "Waikiki.App.gsproj"

Push-Location $repoRoot
try {
    dotnet tool restore | Out-Null
    $version = (dotnet nbgv get-version -v SimpleVersion --project $appDir).Trim()
    Write-Host "=== Waikiki Windows build: $version ($Runtime, $Configuration) ==="

    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
    $OutputDir = (Resolve-Path $OutputDir).Path
    $name = "Waikiki-$version-$Runtime"
    $stage = Join-Path $OutputDir $name
    if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
    $zip = Join-Path $OutputDir "$name.zip"
    if (Test-Path $zip) { Remove-Item -Force $zip }

    dotnet publish $project -c $Configuration -r $Runtime --self-contained true `
        -p:PublishSingleFile=false -p:PublishTrimmed=false -o $stage
    if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed" }

    Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip
    Remove-Item -Recurse -Force $stage
    Write-Host ""
    Write-Host "Artifact: $zip"
}
finally {
    Pop-Location
}
