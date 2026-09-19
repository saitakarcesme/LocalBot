# LocalBot Center for Windows

1. Install Ollama on your model PC and download a model, for example `ollama pull qwen3:8b`. Choose a model that fits that PC's memory.
2. Extract **LocalBot-Center-Windows.zip** into a normal local folder.
3. Double-click **Start LocalBot Center.cmd**. Keep its window open. If the browser opens before Center is ready, refresh it.
4. Select your detected model server and click **Connect this PC**.
5. Copy the pairing code. On the Mac, open LocalBot → Settings → **Connect another PC**, paste it, and connect.
6. Leave **Use this connection for all bots** enabled to switch the team at once. Choose a default in Profile & usage, or select a model for one conversation using its composer model button.

Center probes Ollama first. LM Studio and other OpenAI-compatible local servers are also supported. A custom server must run on the same PC as Center. You do not need to expose Ollama to your network, forward router ports, or share a Wi-Fi network with the Mac.

## Connection preview

The included Cloudflare Quick Tunnel is an account-free **preview** connection. Keep Center and the model server running. Center renews its tunnel address through the relay after a restart; already paired Macs keep their credentials. The included LocalBot Connect relay maintains a stable host identity across tunnel restarts. A separately configured HTTPS tunnel can use `LOCALBOT_PUBLIC_URL` with `LOCALBOT_RELAY_URL` set to an empty string, pointing only at the gateway (not port 8818 or Ollama). Quick Tunnels are not a production availability guarantee.

Pairing codes expire after ten minutes and can be used once. Treat them as secrets. Paired devices can be revoked in Center. Requests and responses use authenticated encryption; the tunnel service cannot decrypt model prompts or outputs. Device credentials stay in the Windows user profile and macOS Keychain. The Windows user account and disk should be protected.

Center uses encrypted, polled model jobs and preserves the model server’s streaming format. The Mac’s provider timeout applies. Two model jobs can run at once; output is limited to 8 MB per job.

## Compatibility and validation

This package contains Node 22.22.2 and Cloudflare cloudflared 2026.9.1 for Windows x64 with their licenses. Downloads are checksum verified by the packaging script. A physical dual RTX 3090 Windows PC passed Qwen3.8 27B Q8 generation and Mac-side tool execution through the encrypted relay. Wider reliability testing remains ongoing.
