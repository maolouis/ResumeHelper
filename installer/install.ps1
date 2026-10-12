param(
    [string]$InstallRoot = $(if ($env:RESUME_HELPER_INSTALL_ROOT) { $env:RESUME_HELPER_INSTALL_ROOT } else { Join-Path $env:LOCALAPPDATA "ResumeHelper" }),
    [string]$ExtensionId = "fniljchgjfbfaegpaogbddffaiadgcpo",
    [switch]$SkipShortcuts,
    [switch]$SkipRegistry,
    [switch]$SkipLaunch
)

$ErrorActionPreference = "Stop"
if ($env:RESUME_HELPER_INSTALL_TEST -eq "1") {
    $SkipShortcuts = $true
    $SkipRegistry = $true
    $SkipLaunch = $true
}
$PayloadRoot = $PSScriptRoot
$BinDir = Join-Path $InstallRoot "bin"
$ExtensionDir = Join-Path $InstallRoot "extension"
$NativeHostDir = Join-Path $InstallRoot "native-host"

if ($ExtensionId -notmatch '^[a-p]{32}$') {
    throw "无效的扩展 ID：$ExtensionId"
}
foreach ($File in @("ResumeHelper.exe", "ResumeHelperHost.exe", "extension.zip", "uninstall.ps1")) {
    if (-not (Test-Path -LiteralPath (Join-Path $PayloadRoot $File))) {
        throw "安装包缺少文件：$File"
    }
}

New-Item -ItemType Directory -Force -Path $BinDir, $ExtensionDir, $NativeHostDir | Out-Null
Copy-Item -LiteralPath (Join-Path $PayloadRoot "ResumeHelper.exe") -Destination (Join-Path $BinDir "ResumeHelper.exe") -Force
Copy-Item -LiteralPath (Join-Path $PayloadRoot "ResumeHelperHost.exe") -Destination (Join-Path $BinDir "ResumeHelperHost.exe") -Force
Copy-Item -LiteralPath (Join-Path $PayloadRoot "uninstall.ps1") -Destination (Join-Path $InstallRoot "uninstall.ps1") -Force

Remove-Item -LiteralPath $ExtensionDir -Recurse -Force
New-Item -ItemType Directory -Force -Path $ExtensionDir | Out-Null
Expand-Archive -LiteralPath (Join-Path $PayloadRoot "extension.zip") -DestinationPath $ExtensionDir -Force

$HostExecutable = Join-Path $BinDir "ResumeHelperHost.exe"
$ManifestPath = Join-Path $NativeHostDir "cn.resumehelper.native.json"
$Manifest = [ordered]@{
    name = "cn.resumehelper.native"
    description = "简历快填本地数据桥接程序"
    path = $HostExecutable
    type = "stdio"
    allowed_origins = @("chrome-extension://$ExtensionId/")
}
[System.IO.File]::WriteAllText(
    $ManifestPath,
    ($Manifest | ConvertTo-Json -Depth 4),
    (New-Object System.Text.UTF8Encoding($false))
)

function Set-NativeHostRegistration {
    param([string]$BrowserKey, [Microsoft.Win32.RegistryView]$View)
    $BaseKey = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, $View)
    try {
        $Key = $BaseKey.CreateSubKey("Software\$BrowserKey\NativeMessagingHosts\cn.resumehelper.native", $true)
        try {
            $Key.SetValue("", $ManifestPath, [Microsoft.Win32.RegistryValueKind]::String)
        } finally {
            $Key.Dispose()
        }
    } finally {
        $BaseKey.Dispose()
    }
}

if (-not $SkipRegistry) {
    foreach ($BrowserKey in @("Microsoft\Edge", "Google\Chrome")) {
        Set-NativeHostRegistration -BrowserKey $BrowserKey -View ([Microsoft.Win32.RegistryView]::Registry64)
        Set-NativeHostRegistration -BrowserKey $BrowserKey -View ([Microsoft.Win32.RegistryView]::Registry32)
    }

    $UninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ResumeHelper"
    New-Item -Path $UninstallKey -Force | Out-Null
    Set-ItemProperty -Path $UninstallKey -Name DisplayName -Value "简历快填"
    Set-ItemProperty -Path $UninstallKey -Name DisplayVersion -Value "0.4.5"
    Set-ItemProperty -Path $UninstallKey -Name Publisher -Value "ResumeHelper"
    Set-ItemProperty -Path $UninstallKey -Name InstallLocation -Value $InstallRoot
    Set-ItemProperty -Path $UninstallKey -Name DisplayIcon -Value (Join-Path $BinDir "ResumeHelper.exe")
    $UninstallCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $InstallRoot 'uninstall.ps1')`""
    Set-ItemProperty -Path $UninstallKey -Name UninstallString -Value $UninstallCommand
    Set-ItemProperty -Path $UninstallKey -Name NoModify -Value 1 -Type DWord
    Set-ItemProperty -Path $UninstallKey -Name NoRepair -Value 1 -Type DWord
}

$GuidePath = Join-Path $InstallRoot "Edge插件安装说明.txt"
$Guide = @"
简历快填已安装。

桌面程序：$BinDir\ResumeHelper.exe
Edge 插件目录：$ExtensionDir

首次使用 Edge 插件：
1. 在 Edge 地址栏打开 edge://extensions
2. 打开“开发人员模式”
3. 点击“加载解压缩的扩展”
4. 选择此文件夹：$ExtensionDir
5. 固定“简历快填 - 本地版”并打开侧栏

插件固定 ID：$ExtensionId
用户档案保存在：$InstallRoot\data
卸载程序会保留该数据目录。
"@
[System.IO.File]::WriteAllText($GuidePath, $Guide, (New-Object System.Text.UTF8Encoding($true)))

if (-not $SkipShortcuts) {
    $Shell = New-Object -ComObject WScript.Shell
    $Desktop = [Environment]::GetFolderPath("Desktop")
    $Programs = [Environment]::GetFolderPath("Programs")
    $StartMenuDir = Join-Path $Programs "简历快填"
    New-Item -ItemType Directory -Force -Path $StartMenuDir | Out-Null

    foreach ($ShortcutPath in @((Join-Path $Desktop "简历快填.lnk"), (Join-Path $StartMenuDir "简历快填.lnk"))) {
        $Shortcut = $Shell.CreateShortcut($ShortcutPath)
        $Shortcut.TargetPath = Join-Path $BinDir "ResumeHelper.exe"
        $Shortcut.WorkingDirectory = $BinDir
        $Shortcut.IconLocation = "$(Join-Path $BinDir 'ResumeHelper.exe'),0"
        $Shortcut.Description = "简历快填本地资料管理"
        $Shortcut.Save()
    }

    $ExtensionShortcut = $Shell.CreateShortcut((Join-Path $StartMenuDir "Edge 插件目录.lnk"))
    $ExtensionShortcut.TargetPath = "$env:WINDIR\explorer.exe"
    $ExtensionShortcut.Arguments = "`"$ExtensionDir`""
    $ExtensionShortcut.Save()

    $GuideShortcut = $Shell.CreateShortcut((Join-Path $StartMenuDir "安装说明.lnk"))
    $GuideShortcut.TargetPath = $GuidePath
    $GuideShortcut.Save()
}

if (-not $SkipLaunch) {
    Start-Process -FilePath $GuidePath
    Start-Process -FilePath (Join-Path $BinDir "ResumeHelper.exe")
}

Write-Host "简历快填安装完成：$InstallRoot"
