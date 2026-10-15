$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class NgtCredentialStoreProbe {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct Credential {
    public UInt32 Flags;
    public UInt32 Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize;
    public IntPtr CredentialBlob;
    public UInt32 Persist;
    public UInt32 AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }

  [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool Write(ref Credential credential, UInt32 flags);

  [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool Delete(string target, UInt32 type, UInt32 flags);
}
'@

$target = "NGT-Studio-CredentialStore-Probe-" + [guid]::NewGuid().ToString("N")
$credential = New-Object NgtCredentialStoreProbe+Credential
$credential.Type = 1
$credential.TargetName = $target
$credential.UserName = "probe"
$credential.Persist = 1
if (-not [NgtCredentialStoreProbe]::Write([ref]$credential, 0)) {
  $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  throw "Windows Credential Manager is unavailable (error $code). GitHub authorization was not started."
}
try {
  Write-Output "Windows Credential Manager is available."
} finally {
  if (-not [NgtCredentialStoreProbe]::Delete($target, 1, 0)) {
    $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    throw "Windows Credential Manager could not remove its temporary probe (error $code). GitHub authorization was not started."
  }
}
