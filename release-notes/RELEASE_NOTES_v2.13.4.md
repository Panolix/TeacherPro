# TeacherPro v2.13.4

A Windows packaging fix. The app itself is unchanged from v2.13.3.

## Fixed

- The Windows build now unpacks the pinned llama-server engine with the bsdtar
  included in Windows, instead of Windows PowerShell's `Expand-Archive`.
  On the build runner, `Expand-Archive` failed with a .NET
  `ExtractToDirectory` overload error, leaving `llama-server.exe` missing and
  stopping the installer build.

## Downloads

- **macOS:** universal `.dmg`
- **Windows:** `.msi` or `.exe` installer
- **Linux:** `.deb`, `.rpm` or `.AppImage`
