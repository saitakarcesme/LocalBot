# LocalBot

Personal bots that run entirely on your own computer and your own models.

## Use it

**Mac app** — `npm run build`, quit LocalBot, `node scripts/install.mjs`, open `~/Applications/LocalBot.app`.

**Self-hosted (any OS with Node 22.18+)**

```sh
npx localbot --open          # or: node bin/localbot.mjs --open
```

Options: `--port 4317`, `--data ~/.localbot`. Open the printed link; it carries a private access token.

On first run LocalBot finds model servers already running on the computer (LLMRig, Ollama, LM Studio, llama.cpp, vLLM, Jan, KoboldCpp) and connects in one click. Models may also run elsewhere on your private network (LAN, Tailscale). Cloud endpoints are refused.

## Develop

- `npm test` — runtime + HTTP tests with fake model servers.
- `npm run dev` — self-hosted server on port 4317.

```
bin/localbot.mjs      self-host entry
runtime/              HTTP + event stream, SQLite store, agent engine, model client, server detection
ui/                   Preact + htm (vendored, no build step)
  styles/tokens.css   design tokens — every size, radius, color and duration
  src/                components: sidebar, conversation, messages, details, settings, dialogs
native/               macOS host: window, Keychain, notifications, bot browser, Accessibility actions
docs/PRODUCT.md       design rules, feature parity, computer use, distribution plan
```

License: MIT. Bundled: Preact (MIT), htm (Apache-2.0).
