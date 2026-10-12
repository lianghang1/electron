; 安装目录跨卸载记忆：NSIS 卸载器会删除 Uninstall 注册表键（electron-builder 默认从该键
; 读取上次安装目录），卸载后重装即丢失目录选择。改用卸载器不会清除的独立键持久化：
; 安装时写入，下次安装（含卸载后重装）在初始化阶段恢复到目录页。
!macro customInit
  ReadRegStr $INSTDIR HKCU "Software\com.company.desktop" "LastInstallDir"
!macroend

!macro customInstall
  WriteRegStr HKCU "Software\com.company.desktop" "LastInstallDir" "$INSTDIR"
!macroend
