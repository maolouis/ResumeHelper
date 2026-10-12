$ErrorActionPreference = "Stop"
$ManifestPath = Join-Path $env:LOCALAPPDATA "ResumeHelper\native-host\cn.resumehelper.native.json"
$BinDir = Join-Path $env:LOCALAPPDATA "ResumeHelper\bin"
$ShortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "简历快填.lnk"

function Remove-NativeHostRegistration {
    param([string]$BrowserKey, [Microsoft.Win32.RegistryView]$View)
    $BaseKey = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, $View)
    try {
        $Parent = $BaseKey.OpenSubKey("Software\$BrowserKey\NativeMessagingHosts", $true)
        if ($Parent) {
            try { $Parent.DeleteSubKeyTree("cn.resumehelper.native", $false) } finally { $Parent.Dispose() }
        }
    } finally {
        $BaseKey.Dispose()
    }
}

foreach ($BrowserKey in @("Microsoft\Edge", "Google\Chrome")) {
    Remove-NativeHostRegistration -BrowserKey $BrowserKey -View ([Microsoft.Win32.RegistryView]::Registry64)
    Remove-NativeHostRegistration -BrowserKey $BrowserKey -View ([Microsoft.Win32.RegistryView]::Registry32)
}
if (Test-Path -LiteralPath $ManifestPath) {
    Remove-Item -LiteralPath $ManifestPath -Force
}
if (Test-Path -LiteralPath $BinDir) {
    Remove-Item -LiteralPath $BinDir -Recurse -Force
}
if (Test-Path -LiteralPath $ShortcutPath) {
    Remove-Item -LiteralPath $ShortcutPath -Force
}

Write-Host "Native Messaging 注册信息已移除。本地简历数据未删除。" -ForegroundColor Green

