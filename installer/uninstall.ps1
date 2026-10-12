param(
    [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "ResumeHelper")
)

$ErrorActionPreference = "Stop"
$HostName = "cn.resumehelper.native"

function Remove-NativeHostRegistration {
    param([string]$BrowserKey, [Microsoft.Win32.RegistryView]$View)
    $BaseKey = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, $View)
    try {
        $Parent = $BaseKey.OpenSubKey("Software\$BrowserKey\NativeMessagingHosts", $true)
        if ($Parent) {
            try { $Parent.DeleteSubKeyTree($HostName, $false) } finally { $Parent.Dispose() }
        }
    } finally {
        $BaseKey.Dispose()
    }
}

foreach ($BrowserKey in @("Microsoft\Edge", "Google\Chrome")) {
    Remove-NativeHostRegistration -BrowserKey $BrowserKey -View ([Microsoft.Win32.RegistryView]::Registry64)
    Remove-NativeHostRegistration -BrowserKey $BrowserKey -View ([Microsoft.Win32.RegistryView]::Registry32)
}

Remove-Item -LiteralPath "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ResumeHelper" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath("Desktop")) "简历快填.lnk") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath("Programs")) "简历快填") -Recurse -Force -ErrorAction SilentlyContinue
foreach ($Directory in @("bin", "extension", "native-host")) {
    Remove-Item -LiteralPath (Join-Path $InstallRoot $Directory) -Recurse -Force -ErrorAction SilentlyContinue
}
Remove-Item -LiteralPath (Join-Path $InstallRoot "Edge插件安装说明.txt") -Force -ErrorAction SilentlyContinue

Write-Host "简历快填已卸载。用户数据仍保留在：$(Join-Path $InstallRoot 'data')"
