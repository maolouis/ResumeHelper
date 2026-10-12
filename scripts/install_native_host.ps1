param(
    [string]$ExtensionId = "fniljchgjfbfaegpaogbddffaiadgcpo"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ExtensionPath = (Resolve-Path (Join-Path $ProjectRoot "extension")).Path
$BuiltHostExecutable = Join-Path $ProjectRoot "dist\ResumeHelperHost.exe"
$BuiltAppExecutable = Join-Path $ProjectRoot "dist\ResumeHelper.exe"

if (-not (Test-Path -LiteralPath $BuiltHostExecutable) -or -not (Test-Path -LiteralPath $BuiltAppExecutable)) {
    throw "找不到构建产物。请先运行 scripts\build.ps1。"
}

function Find-LoadedExtensionId {
    param([string]$ExpectedPath)

    $EdgeRoot = Join-Path $env:LOCALAPPDATA "Microsoft\Edge\User Data"
    if (-not (Test-Path -LiteralPath $EdgeRoot)) {
        return ""
    }
    $Profiles = Get-ChildItem -LiteralPath $EdgeRoot -Directory | Where-Object { $_.Name -eq "Default" -or $_.Name -like "Profile *" }
    foreach ($Profile in $Profiles) {
        foreach ($PreferencesName in @("Secure Preferences", "Preferences")) {
            $PreferencesPath = Join-Path $Profile.FullName $PreferencesName
            if (-not (Test-Path -LiteralPath $PreferencesPath)) {
                continue
            }
            try {
                $Preferences = Get-Content -Raw -LiteralPath $PreferencesPath | ConvertFrom-Json
                $Settings = $Preferences.extensions.settings
                if (-not $Settings) {
                    continue
                }
                foreach ($Property in $Settings.PSObject.Properties) {
                    $ConfiguredPath = $Property.Value.path
                    if (-not $ConfiguredPath) {
                        continue
                    }
                    if ([System.IO.Path]::IsPathRooted($ConfiguredPath)) {
                        $Resolved = [System.IO.Path]::GetFullPath($ConfiguredPath)
                    } else {
                        $Resolved = [System.IO.Path]::GetFullPath((Join-Path $Profile.FullName $ConfiguredPath))
                    }
                    if ($Resolved.TrimEnd('\') -ieq $ExpectedPath.TrimEnd('\')) {
                        return $Property.Name
                    }
                }
            } catch {
                continue
            }
        }
    }
    return ""
}

if (-not $ExtensionId) {
    $ExtensionId = Find-LoadedExtensionId -ExpectedPath $ExtensionPath
}

if (-not $ExtensionId -or $ExtensionId -notmatch '^[a-p]{32}$') {
    throw @"
未找到有效的 Edge 插件 ID。
请先在 edge://extensions 打开“开发人员模式”，选择“加载解压缩的扩展”，加载：
$ExtensionPath
然后重新运行本脚本。也可以使用：
.\scripts\install_native_host.ps1 -ExtensionId <插件ID>
"@
}

$AppRoot = Join-Path $env:LOCALAPPDATA "ResumeHelper"
$BinDir = Join-Path $AppRoot "bin"
$NativeHostDir = Join-Path $AppRoot "native-host"
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
New-Item -ItemType Directory -Force -Path $NativeHostDir | Out-Null
$HostExecutable = Join-Path $BinDir "ResumeHelperHost.exe"
$AppExecutable = Join-Path $BinDir "ResumeHelper.exe"
function Copy-ExecutableIfNeeded {
    param([string]$Source, [string]$Destination)

    if (Test-Path -LiteralPath $Destination) {
        $SourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Source).Hash
        $DestinationHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Destination).Hash
        if ($SourceHash -eq $DestinationHash) {
            return
        }
    }
    try {
        Copy-Item -LiteralPath $Source -Destination $Destination -Force
    } catch {
        throw "无法更新 $Destination。请关闭正在运行的简历快填程序后重试。原始错误：$($_.Exception.Message)"
    }
}

Copy-ExecutableIfNeeded -Source $BuiltHostExecutable -Destination $HostExecutable
Copy-ExecutableIfNeeded -Source $BuiltAppExecutable -Destination $AppExecutable

$ManifestPath = Join-Path $NativeHostDir "cn.resumehelper.native.json"
$Manifest = [ordered]@{
    name = "cn.resumehelper.native"
    description = "简历快填本地数据桥接程序"
    path = $HostExecutable
    type = "stdio"
    allowed_origins = @("chrome-extension://$ExtensionId/")
}
$ManifestJson = $Manifest | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($ManifestPath, $ManifestJson, (New-Object System.Text.UTF8Encoding($false)))

function Register-NativeHost {
    param(
        [string]$BrowserKey,
        [Microsoft.Win32.RegistryView]$View
    )

    $BaseKey = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
        [Microsoft.Win32.RegistryHive]::CurrentUser,
        $View
    )
    try {
        $KeyPath = "Software\$BrowserKey\NativeMessagingHosts\cn.resumehelper.native"
        $Key = $BaseKey.CreateSubKey($KeyPath, $true)
        try {
            $Key.SetValue("", $ManifestPath, [Microsoft.Win32.RegistryValueKind]::String)
        } finally {
            $Key.Dispose()
        }
    } finally {
        $BaseKey.Dispose()
    }
}

foreach ($BrowserKey in @("Microsoft\Edge", "Google\Chrome")) {
    Register-NativeHost -BrowserKey $BrowserKey -View ([Microsoft.Win32.RegistryView]::Registry64)
    Register-NativeHost -BrowserKey $BrowserKey -View ([Microsoft.Win32.RegistryView]::Registry32)
}

$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "简历快填.lnk"
$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $AppExecutable
$Shortcut.WorkingDirectory = $BinDir
$Shortcut.IconLocation = "$AppExecutable,0"
$Shortcut.Description = "简历快填本地资料管理"
$Shortcut.Save()

Write-Host "Native Messaging 已注册。" -ForegroundColor Green
Write-Host "插件 ID：$ExtensionId"
Write-Host "配置文件：$ManifestPath"
Write-Host "桌面程序：$AppExecutable"
Write-Host "请回到 edge://extensions 重新加载插件。"

