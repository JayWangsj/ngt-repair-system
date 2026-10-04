#ifndef AppVersion
  #error AppVersion is required
#endif
#ifndef ArchivePath
  #error ArchivePath is required
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
UninstallDisplayIcon={app}\assets\ngt-studio.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#ArchivePath}"; DestDir: "{app}"; DestName: "ngt-studio-package.zip"; Flags: ignoreversion nocompression
Source: "{#BootstrapPath}"; DestDir: "{app}\scripts"; Flags: ignoreversion

[Icons]
Name: "{autodesktop}\NGT 工作室管理系统"; Filename: "{sys}\explorer.exe"; Parameters: "http://127.0.0.1:3000"; WorkingDir: "{app}"; IconFilename: "{app}\assets\ngt-studio.ico"
Name: "{autoprograms}\NGT 工作室管理系统"; Filename: "{sys}\explorer.exe"; Parameters: "http://127.0.0.1:3000"; WorkingDir: "{app}"; IconFilename: "{app}\assets\ngt-studio.ico"

[Run]
Filename: "{sys}\explorer.exe"; Parameters: "http://127.0.0.1:3000"; Description: "打开 NGT 工作室管理系统"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\uninstall-windows-studio.ps1"""; Flags: runhidden waituntilterminated; RunOnceId: "StopNgtStudio"

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  PowerShellPath: String;
  Parameters: String;
begin
  if CurStep <> ssPostInstall then
    exit;

  WizardForm.StatusLabel.Caption := '正在初始化数据库并启动系统…';
  PowerShellPath := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
  Parameters := '-NoProfile -ExecutionPolicy Bypass -File "' +
    ExpandConstant('{app}\scripts\install-windows-studio-bootstrap.ps1') +
    '" -PackagePath "' + ExpandConstant('{app}\ngt-studio-package.zip') +
    '" -DataRoot "' + ExpandConstant('{localappdata}\NGT\data-store') +
    '" -InstallRoot "' + ExpandConstant('{localappdata}\NGT') + '"';

  if (not Exec(PowerShellPath, Parameters, ExpandConstant('{app}'),
    SW_HIDE, ewWaitUntilTerminated, ResultCode)) or (ResultCode <> 0) then
  begin
    MsgBox('安装文件已复制，但系统初始化失败。请保留安装目录并联系管理员。',
      mbError, MB_OK);
    RaiseException('系统初始化失败，退出代码：' + IntToStr(ResultCode));
  end;
end;
