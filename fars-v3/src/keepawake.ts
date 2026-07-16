import { spawn, ChildProcess } from 'child_process';

// ─── Windows uyquni bloklash ───────────────────────────────────────────────────
// Encode/upload paytida kompyuter uxlab qolsa ffmpeg muzlaydi va pipeline buziladi.
// SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED) chaqiruvchi kichik
// PowerShell jarayoni ushlab turiladi — displey o'chishi mumkin, lekin tizim uxlamaydi.
// Parent (node) o'lsa, PS loop buni sezib o'zi chiqadi (yetim qolmaydi).

let proc: ChildProcess | null = null;

export function preventSleep(): void {
  if (process.platform !== 'win32' || proc) return;
  const ps = `
Add-Type -Name PW -Namespace Win32 -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
$parent = ${process.pid}
while ($true) {
  [Win32.PW]::SetThreadExecutionState(0x80000001) | Out-Null  # ES_CONTINUOUS | ES_SYSTEM_REQUIRED
  if (-not (Get-Process -Id $parent -ErrorAction SilentlyContinue)) { exit }
  Start-Sleep -Seconds 30
}`;
  try {
    proc = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      stdio: 'ignore',
      windowsHide: true,
    });
    proc.on('error', () => { proc = null; });
    console.log('  ☕ Uyqu bloklandi (pipeline tugaguncha kompyuter uxlamaydi)');
  } catch { proc = null; }
}

export function allowSleep(): void {
  if (proc) {
    try { proc.kill(); } catch { /* ignore */ }
    proc = null;
  }
}

// Har qanday chiqishda (xato, Ctrl+C) blokni bo'shatish
process.on('exit', allowSleep);
process.on('SIGINT', () => { allowSleep(); process.exit(130); });
