param(
    [switch]$SkipZip
)

$ErrorActionPreference = "Stop"

$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$app = Join-Path $root "app"
$runtime = Join-Path $app "runtime"
$releaseRoot = Join-Path $root "release"

if (-not (Test-Path -LiteralPath $runtime -PathType Container)) {
    throw "缺少 app\runtime，无法生成含运行时的 Windows 一键包。"
}

$versionLine = Select-String -LiteralPath (Join-Path $app "data_store.py") -Pattern '^APP_VERSION\s*=\s*"([^"]+)"' | Select-Object -First 1
if (-not $versionLine) {
    throw "无法从 app\data_store.py 读取 APP_VERSION。"
}
$version = $versionLine.Matches[0].Groups[1].Value
$packageName = "工作生活台-v$version-Windows-x64"
$stage = [IO.Path]::GetFullPath((Join-Path $releaseRoot $packageName))
$zipPath = Join-Path $releaseRoot "$packageName.zip"
$hashPath = "$zipPath.sha256"

$releaseFull = [IO.Path]::GetFullPath($releaseRoot)
$stageFull = [IO.Path]::GetFullPath($stage)
if (-not $stageFull.StartsWith($releaseFull, [StringComparison]::OrdinalIgnoreCase)) {
    throw "暂存目录不在 release 目录内，已停止。"
}

if (-not (Test-Path -LiteralPath $releaseRoot -PathType Container)) {
    New-Item -ItemType Directory -Path $releaseRoot | Out-Null
}

if (Test-Path -LiteralPath $stage) {
    Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Path $stage | Out-Null

Copy-Item -LiteralPath $app -Destination $stage -Recurse
Copy-Item -LiteralPath (Join-Path $root "docs") -Destination $stage -Recurse
foreach ($name in @("README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "使用说明.txt", "启动.bat", "关闭.bat")) {
    $source = Join-Path $root $name
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "缺少发布文件：$name"
    }
    Copy-Item -LiteralPath $source -Destination $stage
}

# 不把缓存、个人数据、测试和子项目的 Git 元数据带进发布包
Get-ChildItem -LiteralPath $stage -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue |
    Remove-Item -Recurse -Force
Get-ChildItem -LiteralPath $stage -Recurse -File -Filter "*.pyc" -ErrorAction SilentlyContinue |
    Remove-Item -Force
if (Test-Path -LiteralPath (Join-Path $stage "data")) {
    throw "发布包中出现 data 目录，已停止；请检查复制范围。"
}
if (Test-Path -LiteralPath (Join-Path $stage ".git")) {
    throw "发布包中出现 .git 目录，已停止。"
}

# 明确写入一个空 data 占位说明之外的运行目录由程序首次启动时创建
$runtimePython = Join-Path $stage "app\runtime\python.exe"
$runtimePythonW = Join-Path $stage "app\runtime\pythonw.exe"
if (-not (Test-Path -LiteralPath $runtimePython -PathType Leaf) -or -not (Test-Path -LiteralPath $runtimePythonW -PathType Leaf)) {
    throw "发布包中的 Python 运行时不完整。"
}

if ($SkipZip) {
    Write-Output "STAGE=$stage"
    Write-Output "VERSION=$version"
    exit 0
}

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path $stage -DestinationPath $zipPath -CompressionLevel Optimal -Force

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $entries = @($archive.Entries | ForEach-Object { $_.FullName })
    if ($entries -match '(^|/)data(/|$)') {
        throw "ZIP 中出现 data 路径，已停止。"
    }
    if (-not ($entries -match 'app/runtime/pythonw.exe$')) {
        throw "ZIP 中缺少 app/runtime/pythonw.exe。"
    }
    if (-not ($entries -match '启动.bat$')) {
        throw "ZIP 中缺少启动.bat。"
    }
} finally {
    $archive.Dispose()
}

$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
$zipName = Split-Path -Leaf $zipPath
Set-Content -LiteralPath $hashPath -Value "$hash  $zipName" -Encoding utf8

$sizeMb = [math]::Round((Get-Item -LiteralPath $zipPath).Length / 1MB, 2)
Write-Output "ZIP=$zipPath"
Write-Output "SIZE_MB=$sizeMb"
Write-Output "SHA256=$hash"
Write-Output "SHA256_FILE=$hashPath"
