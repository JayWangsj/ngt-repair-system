#ifndef AppVersion
  #error AppVersion is required
#endif
#ifndef PackageDirectory
  #error PackageDirectory is required
#endif
#ifndef BootstrapPath
  #error BootstrapPath is required
#endif
#ifndef IconPath
  #error IconPath is required
#endif
#ifndef OutputDir
  #error OutputDir is required
#endif

#define AppName "NGT 工作室管理系统"
#define AppId "{{D7F74E80-B49C-4C3D-B6FC-18C04DAA9D31}"

[Setup]
AppId={#AppId}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=NGT
DefaultDirName={localappdata}\NGT\releases\v{#AppVersion}
UninstallFilesDir={localappdata}\NGT\uninstall
UsePreviousAppDir=no
DisableDirPage=yes
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename=ngt-studio-windows-setup-v{#AppVersion}
SetupIconFile={#IconPath}
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma2/normal
SolidCompression=yes
WizardStyle=modern
CloseApplications=no
RestartApplications=no
UninstallDisplayName={#AppName}
UninstallDisplayIcon={localappdata}\NGT\assets\ngt-studio.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#PackageDirectory}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#BootstrapPath}"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "{#PackageDirectory}\assets\ngt-studio.ico"; DestDir: "{localappdata}\NGT\assets"; Flags: ignoreversion uninsneveruninstall
Source: "{#PackageDirectory}\scripts\windows-service.ps1"; DestDir: "{localappdata}\NGT\service"; Flags: ignoreversion uninsneveruninstall
Source: "{#PackageDirectory}\scripts\windows-studio-common.ps1"; DestDir: "{localappdata}\NGT\service"; Flags: ignoreversion uninsneveruninstall
Source: "{#PackageDirectory}\scripts\windows-studio-launcher.vbs"; DestDir: "{localappdata}\NGT\service"; Flags: ignoreversion uninsneveruninstall
Source: "{#PackageDirectory}\scripts\uninstall-windows-studio.ps1"; DestDir: "{localappdata}\NGT\service"; Flags: ignoreversion uninsneveruninstall
Source: "{#PackageDirectory}\scripts\uninstall-windows-startup.ps1"; DestDir: "{localappdata}\NGT\service"; Flags: ignoreversion uninsneveruninstall

[Icons]
Name: "{autodesktop}\NGT 工作室管理系统"; Filename: "http://127.0.0.1:3000"; WorkingDir: "{app}"; IconFilename: "{localappdata}\NGT\assets\ngt-studio.ico"
Name: "{autoprograms}\NGT 工作室管理系统"; Filename: "http://127.0.0.1:3000"; WorkingDir: "{app}"; IconFilename: "{localappdata}\NGT\assets\ngt-studio.ico"

[Run]
Filename: "http://127.0.0.1:3000"; Description: "打开 NGT 工作室管理系统"; Flags: shellexec postinstall nowait skipifsilent

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{localappdata}\NGT\service\uninstall-windows-studio.ps1"""; Flags: runhidden waituntilterminated; RunOnceId: "StopNgtStudio"

[Code]
var
  InstallFilesStartedAt: TDateTime;

procedure WriteInstallStage(const Stage, Detail: String);
var
  LogPath: String;
  Line: String;
begin
  LogPath := ExpandConstant('{localappdata}\NGT\install-stages.log');
  Line := FormatDateTime('yyyy-mm-dd"T"hh:nn:ss', Now) + ' ' + Detail + ' ' + Stage + #13#10;
  SaveStringToFile(LogPath, Line, True);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  PowerShellPath: String;
  Parameters: String;
begin
  if CurStep = ssInstall then
  begin
    InstallFilesStartedAt := Now;
    WriteInstallStage('install-files', 'START');
    exit;
  end;

  if CurStep <> ssPostInstall then
    exit;

  WriteInstallStage('install-files', 'COMPLETE durationSeconds=' +
    FloatToStr((Now - InstallFilesStartedAt) * 86400));
  WizardForm.StatusLabel.Caption := '正在准备运行环境、数据库并启动系统…';
  PowerShellPath := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
  Parameters := '-NoProfile -ExecutionPolicy Bypass -File "' +
    ExpandConstant('{app}\scripts\install-windows-studio-bootstrap.ps1') +
    '" -DataRoot "' + ExpandConstant('{localappdata}\NGT\data-store') +
    '" -InstallRoot "' + ExpandConstant('{localappdata}\NGT') +
    '" -LogPath "' + ExpandConstant('{localappdata}\NGT\install.log') + '"';

  if (not Exec(PowerShellPath, Parameters, ExpandConstant('{app}'),
    SW_HIDE, ewWaitUntilTerminated, ResultCode)) or (ResultCode <> 0) then
  begin
    MsgBox('系统初始化失败。详细原因已保存到：' + #13#10 +
      ExpandConstant('{localappdata}\NGT\install.log'),
      mbError, MB_OK);
    RaiseException('系统初始化失败，退出代码：' + IntToStr(ResultCode));
  end;
end;
