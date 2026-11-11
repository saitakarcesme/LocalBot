# LocalBot on iPhone

The phone app is a standalone web app using the Mac's existing runtime. Messages, bots, tasks and settings are shared. Inference stays on the configured local/private model server. No Xcode, simulator or second model runtime is needed.

## Pair

1. Connect the Mac and iPhone to the same Tailscale account/network.
2. Run `node scripts/mobile-enable.mjs` on the Mac, then restart LocalBot.
3. Open the private link in `~/Library/Application Support/LocalBot/mobile-link.txt` in iPhone Safari.
4. Choose Share → Add to Home Screen, enable Open as Web App, then Add.

Keep LocalBot and Tailscale running on the Mac. The phone can use Wi-Fi or cellular when Tailscale is connected. USB alone does not provide this connection. The home screen icon opens the app without Safari chrome. This version has no native push or guaranteed background execution on iOS.

The phone UI includes conversation navigation, bot creation and colors, message/file search, profile settings, permissions, themes and existing task/routine views. Connect apps shows only real configured connections; no demo plugins or coming-soon cards.

## Access and updates

Tailscale Serve terminates HTTPS and forwards only inside the private tailnet to `127.0.0.1:18471`. It does not enable Funnel. The runtime requires a separate random 256-bit mobile credential for API calls, validates request origins, and refuses phone access to native host polling/result endpoints. Mac API credentials are never sent to the phone. Files retain their separate unguessable media keys.

`mobile.json` and `mobile-link.txt` are user-only files outside the version-reset data directory. Pairing therefore survives app updates; chats follow the app's existing fresh-install-on-update preference. The phone caches its pairing credential in local storage. Its private installation manifest also contains a launch capability, so a new iOS Home Screen storage container can pair without copying Safari data. Icons created before this installation manifest was introduced must be re-added from the original pairing link. Treat the link/QR as an access credential.

To revoke phone access: run `tailscale serve --https=443 off`, remove `mobile.json` and `mobile-link.txt`, and restart LocalBot. Running the enable script again generates a new credential after those files are removed.

## Validation

Automated phone-width tests cover creating a bot, saving its color, conversation/back navigation, search, settings, empty connections, light theme, and horizontal overflow. API tests cover credential/origin validation and native bridge isolation. Real iPhone installation/keyboard behavior still requires checking on the user's phone; desktop viewport emulation is not a physical-device test.

### Recover an existing iPhone icon

If the Home Screen opens without Safari's credential, LocalBot shows **Connect this iPhone**. On the Mac, run `node scripts/mobile-code.mjs`, then enter the eight-digit code in the installed phone app. It saves the credential in that app's own storage; the icon need not be reinstalled. Codes expire at the next ten-minute boundary. Five incorrect attempts block this pairing endpoint for ten minutes. Pairing is still private-tailnet-only and does not make the normal API public.
