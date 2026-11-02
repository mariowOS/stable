# mariowOS builder note: Windows-style system keys for mariowOS, started by launcher.js.
# Windows handles the Windows key (Start, Win+D, Win+E...) before any app sees it, so a
# low-level keyboard hook takes those keys while the mariowOS window is in the
# foreground and prints them, one per line, for the launcher to forward to the desktop:
#
#   win            the Windows key pressed and released alone (opens the mariowOS Start)
#   win+<key>      a combination, e.g. win+d, win+e, win+tab, win+l, win+shift+s, win+ctrl+left
#   alt+f4         closes the mariowOS app in front instead of the whole system
#
# Any other window keeps the normal Windows behaviour. Ctrl+Alt+Del is never touched (no
# app can). The launcher writes "enable" or "disable" to stdin (Settings > General >
# Windows keys); the script exits by itself when the launcher's process is gone.
param(
  [Parameter(Mandatory = $true)][string]$Window,
  [Parameter(Mandatory = $true)][int]$ParentPid
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

public static class MariowOSSystemKeys {
  [StructLayout(LayoutKind.Sequential)]
  struct KeyInfo { public uint vkCode; public uint scanCode; public uint flags; public uint time; public IntPtr extraInfo; }
  [StructLayout(LayoutKind.Sequential)]
  struct Msg { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; }
  delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);

  [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int id, HookProc proc, IntPtr module, uint thread);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern int GetMessage(out Msg msg, IntPtr hwnd, uint min, uint max);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);

  const int WH_KEYBOARD_LL = 13;
  const int WM_KEYDOWN = 0x100, WM_SYSKEYDOWN = 0x104;
  const uint LLKHF_ALTDOWN = 0x20;
  const uint VK_LWIN = 0x5B, VK_RWIN = 0x5C, VK_F4 = 0x73;

  static IntPtr target;
  static HookProc proc;
  static IntPtr hook;
  static volatile bool enabled = true;
  static bool winHeld, comboUsed, ctrlDown, shiftDown;

  public static void Run(long window, int parentPid) {
    target = new IntPtr(window);
    proc = OnKey;
    hook = SetWindowsHookEx(WH_KEYBOARD_LL, proc, GetModuleHandle(null), 0);
    if (hook == IntPtr.Zero) throw new Exception("SetWindowsHookEx failed: " + Marshal.GetLastWin32Error());

    // "enable" / "disable" from the launcher; end of input means the launcher is gone.
    new Thread(() => {
      string line;
      while ((line = Console.In.ReadLine()) != null) {
        if (line.Trim() == "enable") enabled = true;
        else if (line.Trim() == "disable") { enabled = false; winHeld = false; }
        else if (line.Trim() == "reset") winHeld = false;
      }
      Environment.Exit(0);
    }) { IsBackground = true }.Start();
    new Timer(_ => {
      try { if (Process.GetProcessById(parentPid).HasExited) Environment.Exit(0); }
      catch (ArgumentException) { Environment.Exit(0); }
    }, null, 2000, 2000);

    Console.Out.WriteLine("ready");
    Console.Out.Flush();
    Msg msg;
    while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0) { }
  }

  static void Emit(string name) {
    Console.Out.WriteLine(name);
    Console.Out.Flush();
  }

  static string KeyName(uint vk) {
    if (vk >= 0x41 && vk <= 0x5A) return ((char)(vk + 32)).ToString(); // a-z
    if (vk >= 0x30 && vk <= 0x39) return ((char)vk).ToString();        // 0-9
    switch (vk) {
      case 0x09: return "tab";
      case 0x20: return "space";
      case 0x25: return "left";
      case 0x26: return "up";
      case 0x27: return "right";
      case 0x28: return "down";
      case 0xBE: return "period";
      case 0x73: return "f4";
    }
    return null;
  }

  static IntPtr OnKey(int code, IntPtr wParam, IntPtr lParam) {
    if (code >= 0) {
      KeyInfo key = (KeyInfo)Marshal.PtrToStructure(lParam, typeof(KeyInfo));
      bool down = wParam.ToInt32() == WM_KEYDOWN || wParam.ToInt32() == WM_SYSKEYDOWN;
      bool isWin = key.vkCode == VK_LWIN || key.vkCode == VK_RWIN;
      // Ctrl and Shift are followed here: when they come after the taken Win key, Windows
      // never had them as pressed, so its own key state (GetAsyncKeyState) cannot tell.
      bool isCtrl = key.vkCode == 0x11 || key.vkCode == 0xA2 || key.vkCode == 0xA3;
      bool isShift = key.vkCode == 0x10 || key.vkCode == 0xA0 || key.vkCode == 0xA1;
      if (isCtrl) ctrlDown = down;
      if (isShift) shiftDown = down;
      // The Win release can go missing (Windows locked with Win+L takes it, or another
      // window came to the front): never keep taking keys outside mariowOS because of it.
      if (winHeld && (!enabled || GetForegroundWindow() != target)) winHeld = false;

      if (isWin) {
        if (down) {
          // Taken only when it starts while mariowOS is in front, so a Win held from
          // another app keeps working there.
          if (!winHeld && enabled && GetForegroundWindow() == target) { winHeld = true; comboUsed = false; }
          if (winHeld) return new IntPtr(1);
        } else if (winHeld) {
          winHeld = false;
          if (!comboUsed) Emit("win");
          return new IntPtr(1);
        }
      } else if (winHeld && (isCtrl || isShift)) {
        // Modifiers pass through untouched and do not count as a combination on their own.
      } else if (winHeld) {
        // Every other key pressed with the taken Win key belongs to mariowOS, known or not.
        if (down) {
          comboUsed = true;
          string name = KeyName(key.vkCode);
          string modifiers = (ctrlDown ? "ctrl+" : "") + (shiftDown ? "shift+" : "");
          if (name != null) Emit("win+" + modifiers + name);
          // Windows may lock too and keep the Win release for itself: stop holding now.
          if (name == "l") winHeld = false;
        }
        return new IntPtr(1);
      } else if (down && key.vkCode == VK_F4 && (key.flags & LLKHF_ALTDOWN) != 0 && enabled && GetForegroundWindow() == target) {
        Emit("alt+f4");
        return new IntPtr(1);
      }
    }
    return CallNextHookEx(hook, code, wParam, lParam);
  }
}
'@

[MariowOSSystemKeys]::Run([long]$Window, $ParentPid)
