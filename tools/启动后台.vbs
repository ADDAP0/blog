' ===================================================
'  Blog Admin launcher
'
'  Starts the admin server with NO console window,
'  then opens it in an app-style browser window.
'
'  Double-click this file, or use the desktop shortcut.
' ===================================================
Option Explicit

Dim sh, fso, here, base, nodeExe, i, cands

Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' here = ...\tools ,  base = project root
here = fso.GetParentFolderName(WScript.ScriptFullName)
base = fso.GetParentFolderName(here)

sh.CurrentDirectory = base

' --- locate node.exe ---
nodeExe = ""
cands = Array( _
  sh.ExpandEnvironmentStrings("%ProgramFiles%\nodejs\node.exe"), _
  sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%\nodejs\node.exe"), _
  sh.ExpandEnvironmentStrings("%LOCALAPPDATA%\Programs\nodejs\node.exe"), _
  sh.ExpandEnvironmentStrings("%APPDATA%\npm\node.exe") )

For i = 0 To UBound(cands)
  If fso.FileExists(cands(i)) Then
    nodeExe = cands(i)
    Exit For
  End If
Next

' fall back to PATH
If nodeExe = "" Then nodeExe = "node"

' --- run launcher hidden (0 = no window, False = do not wait) ---
sh.Run """" & nodeExe & """ """ & here & "\launch.js""", 0, False
