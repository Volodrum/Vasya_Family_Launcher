; Included by electron-builder's NSIS installer.
; After install/update, tell Windows to refresh its icon cache so desktop and pinned taskbar
; shortcuts show the current logo instead of the old cached icon.
!macro customInstall
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
