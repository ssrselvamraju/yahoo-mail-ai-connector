import { spawnSync } from "node:child_process";
import { join } from "node:path";

// Windows mode bits cannot express a private DACL, and Node cannot fsync a
// directory handle there. Use the inbox Windows PowerShell/.NET APIs instead.
// Paths and record data travel over stdin, never through executable shell text.
const script = String.raw`
$ErrorActionPreference = 'Stop'
try {
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  function Assert-Private($item) {
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Reparse point' }
    $acl = $item.GetAccessControl()
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) { throw 'Foreign owner' }
    $rules = $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
    $hasAccess = $false
    foreach ($rule in $rules) {
      if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow) {
        if ($rule.IdentityReference.Value -ne $sid.Value) { throw 'Non-private access' }
        if (($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl) { $hasAccess = $true }
      }
    }
    if (-not $hasAccess) { throw 'Missing owner access' }
  }
  $directory = [IO.DirectoryInfo]::new($request.directory)
  if ($request.operation -eq 'initialize') {
    if ($directory.Exists) {
      # Only an empty, user-owned directory may be provisioned. Never silently
      # repair an exposed ledger containing prior attempts.
      try { Assert-Private $directory } catch {
        if (($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
            $directory.GetAccessControl().GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value -or
            $directory.GetFileSystemInfos().Length -ne 0) { throw }
        $acl = [Security.AccessControl.DirectorySecurity]::new()
        $acl.SetOwner($sid)
        $acl.SetAccessRuleProtection($true, $false)
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
        $directory.SetAccessControl($acl)
      }
    } else {
      $acl = [Security.AccessControl.DirectorySecurity]::new()
      $acl.SetOwner($sid)
      $acl.SetAccessRuleProtection($true, $false)
      $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
      # The security descriptor is supplied during creation, not afterwards.
      $directory.Create($acl)
    }
  }
  Assert-Private $directory
  if (-not $directory.GetAccessControl().AreAccessRulesProtected) { throw 'Inherited directory permissions' }
  foreach ($item in $directory.GetFileSystemInfos()) { Assert-Private $item }
  if ($request.operation -eq 'publish') {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LedgerNative {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool MoveFileEx(string source, string destination, uint flags);
}
'@
    # The temporary file was fsynced by Node before this call. Publish on the
    # same volume with WRITE_THROUGH; do not use a plain rename and skip fsync.
    $flags = [uint32]8
    if (-not $request.exclusive) { $flags = $flags -bor 1 }
    if (-not [LedgerNative]::MoveFileEx($request.source, $request.destination, $flags)) {
      throw 'Durable publication failed'
    }
  }
} catch {
  # Never forward PowerShell errors containing paths or serialized records.
  [Console]::Error.WriteLine('Windows send state privacy or durable write verification failed.')
  exit 1
}
`;

export function windowsStorage(operation: "initialize" | "validate" | "publish", directory: string,
  publication?: { source: string; destination: string; exclusive: boolean }): void {
  const executable = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const result = spawnSync(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand",
    Buffer.from(script, "utf16le").toString("base64")], {
    input: JSON.stringify({ operation, directory, ...publication }), encoding: "utf8",
    windowsHide: true, timeout: 30_000, maxBuffer: 64 * 1024,
  });
  if (result.error || result.status !== 0) throw Error("Windows send state privacy or durable write verification failed.");
}
