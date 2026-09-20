!include LogicLib.nsh

!define GridyEditionConflict "Another edition of Gridy or OpenScience is installed. Uninstall it from Windows Settings, then run this installer again. Your existing data will be retained; this edition uses a separate profile."
!define GridyEditionConflictZh "已安装其他版本的 Gridy 或 OpenScience。请先在 Windows 设置中卸载，再运行此安装程序。原有数据会保留，此版本使用独立的用户数据目录。"

; electron-builder NSIS UUIDv5(appId, 50e065bc-3134-11e6-9bab-38c9862bdaf3).
; Check registrations rather than profiles: uninstallation deliberately keeps data.
!macro GridyCheckRegistration KEY
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${KEY}" "UninstallString"
  ReadRegStr $R1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${KEY}" "UninstallString"
  ${If} $R0 != ""
  ${OrIf} $R1 != ""
    ${IfNot} ${Silent}
      ${If} $LANGUAGE == 2052
      ${OrIf} $LANGUAGE == 1028
        MessageBox MB_ICONSTOP|MB_OK "${GridyEditionConflictZh}"
      ${Else}
        MessageBox MB_ICONSTOP|MB_OK "${GridyEditionConflict}"
      ${EndIf}
    ${EndIf}
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

!macro GridyCheckOtherEditions
  ; Both registry views matter for older x86 installers on x64 Windows.
  !ifdef GRIDY_COMMUNITY
    !insertmacro GridyCheckRegistration "fc2c21a1-2da8-52fd-a81a-1983b680881e"
    !insertmacro GridyCheckRegistration "29568686-4ed6-520b-a386-e756f691e5a7"
  !else
    !insertmacro GridyCheckRegistration "efe0796b-3da1-57de-8635-8d6b55c8bbfe"
  !endif
  !insertmacro GridyCheckRegistration "8a1b34b9-b626-586f-b428-b3bb725219e8"
!macroend

!macro customInit
  Push $R0
  Push $R1
  SetRegView 32
  !insertmacro GridyCheckOtherEditions
  SetRegView 64
  !insertmacro GridyCheckOtherEditions
  SetRegView lastused
  Pop $R1
  Pop $R0
!macroend
