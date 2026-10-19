; 安装目录跨卸载记忆：NSIS 卸载器会删除 Uninstall 注册表键（electron-builder 默认从该键
; 读取上次安装目录），卸载后重装即丢失目录选择。改用卸载器不会清除的独立键持久化：
; 安装时写入，下次安装（含卸载后重装）在初始化阶段恢复到目录页。
; 注意必须先读到临时寄存器再回写 $INSTDIR：首次安装时键不存在，ReadRegStr 失败会将
; 目标变量清空而非保持默认值，直接读 $INSTDIR 会导致安装目录为空（文件落到盘根）。
!macro customInit
  ReadRegStr $R0 HKCU "Software\com.company.desktop" "LastInstallDir"
  ${ifNot} ${Errors}
    StrCpy $INSTDIR $R0
  ${endif}
!macroend

!macro customInstall
  WriteRegStr HKCU "Software\com.company.desktop" "LastInstallDir" "$INSTDIR"
!macroend
