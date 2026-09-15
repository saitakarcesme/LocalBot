# Using the 2× RTX 3090 PC

The Mac runs only the client and agent runtime. All contacts can share one inference endpoint on the PC; agent identity never creates a separate model instance.

## Connect without changing code

1. Run a model server on the PC that exposes Ollama or an OpenAI-compatible API. Use the exact model identifier reported by its model list. “Qwen 3.8 27B Uncensored” is the user's target; this repository does not assume a particular distribution or download identifier.
2. Keep the inference listener on the PC's loopback interface. Establish an SSH tunnel from the Mac, replacing the user/hostname with your existing SSH configuration:

   ```sh
   ssh -N -L 18000:127.0.0.1:8000 your-pc
   ```

3. In LocalBot Settings, add an **OpenAI compatible** connection with endpoint `http://127.0.0.1:18000/v1`. For an Ollama tunnel, use its forwarded port and the Ollama protocol without `/v1`.
4. Save & Test, select the model, then assign this provider to each contact. Keep their prompts, tools and memory separate. Start with concurrency 1, then increase only after measuring inference memory and latency.
5. If directly connecting over LAN instead, use an HTTPS endpoint with authentication. LocalBot rejects remote plaintext or unauthenticated endpoints. Store the key through Settings in Keychain.

When the PC's address changes, edit the connection or the SSH host configuration. No Swift or TypeScript changes are needed.

## Hardware considerations

Two 24 GB cards do not automatically behave as one contiguous 48 GB allocation. The inference server must support the model's quantization and multi-GPU placement. vLLM exposes tensor parallelism, including a two-device configuration; compatibility and effective context capacity must be measured on the actual model and server build. See [vLLM distributed serving](https://docs.vllm.ai/en/v0.10.1/serving/parallelism_scaling.html).

Ollama's bind address is controlled by `OLLAMA_HOST`; its default local binding is suitable for SSH forwarding. See [Ollama network configuration](https://docs.ollama.com/faq).

This Mac run does not establish 27B throughput, VRAM fit, GPU interconnect performance or final context size. Those are hardware acceptance tests for the PC, not claims made by the client.
