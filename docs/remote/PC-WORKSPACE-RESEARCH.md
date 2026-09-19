# PC workspace and research

## Use the model PC while the Mac is off

1. Keep LocalBot Center and Ollama running on the Windows PC.
2. In Center, enable **Workspace host** and choose **Pair iPhone**.
3. In LocalBot Remote, scan the PC pairing QR or paste its pairing code.
4. On the Mac, choose the same PC under **Settings → Remote → Workspace**.

The PC owns this workspace's conversations, usage and research state. The Mac reconnects to that state when it returns. Pairing uses the encrypted relay and does not require a shared Wi-Fi network or exposing Ollama publicly. Pairing codes expire and are single-use. Revoke devices from the host's Remote settings.

**Existing Mac conversations remain in This Mac.** They are not automatically copied to the PC. Files and tool execution belong to the selected host. The Windows preview does not provide the Mac's native browser automation, sandbox terminal, Git/test runner or PDF OCR. Unsupported tools are excluded from the model's available tools.

## Research

Open **Profile → Research** on either native app, select a conversation, set the topic and enable research. Use an Athena/Socrates conversation for evidence gathering followed by critical review.

Research uses the selected local provider. It yields to foreground work, limits daily passes and reserves the last round of each stage for a written synthesis. It pauses after failures or partial failures so errors are not repeated indefinitely. Review Activity before resuming.

The configured Qwen topic covers synthetic-data generation, provenance, independent validation, held-out evaluation, contamination checks and reversible LoRA proposals. Research does not automatically train weights or replace the active model.

### Token targets

The daily total is provider-reported input plus output tokens, grouped by UTC day. It is a target, not a throughput guarantee. One billion tokens per day requires about 11,574 tokens per second sustained. The observed dual-3090 short sample was approximately 27 generated tokens per second; input and output rates are not interchangeable. No duplicate prompts or token padding are used to inflate the total.

## Progress and limits

A task acknowledgement is saved before routing and generation. Activity shows inference phases and tool work. An empty provider response is retried once; repeated empty responses produce an explicit error. At the step boundary, a tool-free round saves observed findings and unresolved work. A budget-bound ordinary task is marked partial rather than silently claimed complete.

## Validation scope

Runtime tests cover workspace reconnection, route restrictions, acknowledgement before routing, bounded empty-response recovery, task budgets and research scheduling. A live encrypted PC snapshot remained accessible with the Mac runtime stopped. Physical iPhone pairing with the PC still requires the one-time QR scan; installing the app alone does not change its existing host.
