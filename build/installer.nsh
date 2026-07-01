!macro customInstall
  ${ifNot} ${isUpdated}
    DetailPrint "Preparing the VB-CABLE virtual audio driver..."
    CreateDirectory "$PLUGINSDIR\vb-cable"
    nsisunz::UnzipToLog \
      "$INSTDIR\resources\vendor\VBCABLE_Driver_Pack45.zip" \
      "$PLUGINSDIR\vb-cable"
    Pop $0

    ${If} ${FileExists} "$PLUGINSDIR\vb-cable\VBCABLE_Setup_x64.exe"
      DetailPrint "Installing VB-CABLE. Windows may ask you to approve the audio driver."
      ExecWait '"$PLUGINSDIR\vb-cable\VBCABLE_Setup_x64.exe" -i -h' $1
      ${If} $1 == 0
        SetRebootFlag true
      ${Else}
        MessageBox MB_ICONEXCLAMATION|MB_OK \
          "SoundGrid was installed, but VB-CABLE could not be installed automatically.$\r$\n$\r$\nYou can retry from SoundGrid Settings."
      ${EndIf}
    ${Else}
      MessageBox MB_ICONEXCLAMATION|MB_OK \
        "SoundGrid was installed, but its VB-CABLE driver package could not be extracted.$\r$\n$\r$\nYou can retry from SoundGrid Settings."
    ${EndIf}
  ${endIf}
!macroend
