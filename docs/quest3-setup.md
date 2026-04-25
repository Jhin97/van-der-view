# Quest 3 dev pipeline (F-001)

End-to-end loop: laptop edits → Quest browser reload → laptop sees a 60fps mirror.

## One-time setup

1. Install Node.js 20+ and run `npm install` in the repo root.
2. Install **Android Platform Tools** (provides `adb`) and put it on PATH.
   - Windows: `winget install Google.PlatformTools`
   - macOS: `brew install android-platform-tools`
3. Install **scrcpy** for headset mirroring.
   - Windows: `winget install Genymobile.scrcpy`
   - macOS: `brew install scrcpy`
4. On the Quest 3:
   - Create a Meta developer account and link via the Meta Quest mobile app.
   - In the mobile app: *Devices → Headset settings → Developer Mode → ON*.
   - Connect Quest 3 to laptop via USB-C; accept the *Allow USB debugging* prompt inside the headset.

## Daily loop

```bash
# Terminal 1 — dev server (HTTPS via mkcert, required for WebXR)
npm run dev

# Terminal 2 — reverse tunnel so Quest can reach laptop's localhost
npm run tunnel

# Terminal 3 — 60fps headset mirror on the laptop
npm run mirror
```

In the Quest browser: navigate to `https://localhost:5173`, accept the self-signed cert, then tap **ENTER VR**.

## Controls inside VR

| Input | Action |
| --- | --- |
| Trigger | Grab raycast-targeted object; release to drop. Hold both triggers 2s to force-skip tutorial step. |
| Grip (squeeze) | Hold to aim teleport arc; release to teleport to landing point |
| Left thumbstick | Smooth locomotion (forward/strafe) |
| Right thumbstick | Snap-turn (click left/right to rotate 45 degrees) |
| A/X button | Dismiss narrative panel |
| B/Y button | Redock ligand to spawn position |
| Hand tracking | Pinch to grab (auto-detected when controllers idle) |

## Troubleshooting

- **`adb devices` shows nothing** → unplug, replug, accept the headset prompt again.
- **Cert warning blocks ENTER VR** → load `https://localhost:5173` *outside* VR first to accept the cert.
- **Black screen in Quest browser** → confirm WebXR is enabled (`chrome://flags`-style flags are not needed in current Quest browser builds).
