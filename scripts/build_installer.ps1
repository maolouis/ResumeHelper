param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ReleaseDir = Join-Path $ProjectRoot "release"
$StageDir = Join-Path $env:TEMP "ResumeHelperInstallerBuild"
$SedPath = Join-Path $StageDir "ResumeHelperSetup.sed"
$TargetPath = Join-Path $ReleaseDir "ResumeHelperSetup.exe"
$IExpressTargetPath = Join-Path $StageDir "ResumeHelperSetup.exe"

if (-not $SkipBuild) {
    & (Join-Path $PSScriptRoot "build.ps1") -SkipInstall
    if ($LASTEXITCODE -ne 0) { throw "应用构建失败。" }
}

$IExpress = Join-Path $env:WINDIR "System32\iexpress.exe"
if (-not (Test-Path -LiteralPath $IExpress)) {
    throw "当前 Windows 没有 IExpress，无法构建单文件安装程序。"
}

Remove-Item -LiteralPath $StageDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $StageDir, $ReleaseDir | Out-Null
Copy-Item -LiteralPath (Join-Path $ProjectRoot "dist\ResumeHelper.exe") -Destination $StageDir
Copy-Item -LiteralPath (Join-Path $ProjectRoot "dist\ResumeHelperHost.exe") -Destination $StageDir
Copy-Item -LiteralPath (Join-Path $ProjectRoot "installer\install.cmd") -Destination $StageDir
$Utf8Bom = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText(
    (Join-Path $StageDir "install.ps1"),
    (Get-Content -Raw -LiteralPath (Join-Path $ProjectRoot "installer\install.ps1")),
    $Utf8Bom
)
[System.IO.File]::WriteAllText(
    (Join-Path $StageDir "uninstall.ps1"),
    (Get-Content -Raw -LiteralPath (Join-Path $ProjectRoot "installer\uninstall.ps1")),
    $Utf8Bom
)
Compress-Archive -Path (Join-Path $ProjectRoot "extension\*") -DestinationPath (Join-Path $StageDir "extension.zip") -CompressionLevel Optimal

$Sed = @"
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=
DisplayLicense=
FinishMessage=ResumeHelper installation completed.
TargetName=$IExpressTargetPath
FriendlyName=ResumeHelper Setup
AppLaunched=install.cmd
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
SourceFiles=SourceFiles
[SourceFiles]
SourceFiles0=$StageDir\
[SourceFiles0]
%FILE0%=
%FILE1%=
%FILE2%=
%FILE3%=
%FILE4%=
%FILE5%=
[Strings]
FILE0="ResumeHelper.exe"
FILE1="ResumeHelperHost.exe"
FILE2="extension.zip"
FILE3="install.ps1"
FILE4="uninstall.ps1"
FILE5="install.cmd"
"@
[System.IO.File]::WriteAllText($SedPath, $Sed, [System.Text.Encoding]::Default)

Remove-Item -LiteralPath $IExpressTargetPath -Force -ErrorAction SilentlyContinue
$IExpressProcess = Start-Process -FilePath $IExpress -ArgumentList @("/N", $SedPath) -PassThru -Wait
if ($IExpressProcess.ExitCode -ne 0) {
    throw "IExpress 构建安装程序失败。"
}
$Deadline = [DateTime]::UtcNow.AddMinutes(3)
while (-not (Test-Path -LiteralPath $IExpressTargetPath)) {
    if ([DateTime]::UtcNow -ge $Deadline) {
        throw "IExpress 构建超时，未生成安装程序。"
    }
    Start-Sleep -Milliseconds 500
}
$LastLength = -1
$StableChecks = 0
while ($StableChecks -lt 3) {
    $CurrentLength = (Get-Item -LiteralPath $IExpressTargetPath).Length
    if ($CurrentLength -eq $LastLength) { $StableChecks++ } else { $StableChecks = 0 }
    $LastLength = $CurrentLength
    if ([DateTime]::UtcNow -ge $Deadline) { throw "IExpress 安装程序写入超时。" }
    Start-Sleep -Milliseconds 500
}
if ($LastLength -lt 10MB) {
    throw "IExpress 生成的安装程序体积异常：$LastLength 字节。"
}
Copy-Item -LiteralPath $IExpressTargetPath -Destination $TargetPath -Force

Get-Item -LiteralPath $TargetPath | Select-Object FullName, Length, LastWriteTime
Get-FileHash -Algorithm SHA256 -LiteralPath $TargetPath
