import { CodexRPC } from "./codex-rpc.js";
import type { ProviderConfig } from "./types.js";

function window(value: any) {
  if (value == null) return null;
  if (typeof value !== "object" || !Number.isFinite(value.usedPercent) || value.usedPercent < 0)
    throw new Error("Invalid subscription usage window");
  for (const key of ["windowDurationMins", "resetsAt"])
    if (value[key] != null && (!Number.isSafeInteger(value[key]) || value[key] < 0))
      throw new Error("Invalid subscription usage window");
  return { usedPercent: value.usedPercent, remainingPercent: Math.max(0, 100 - value.usedPercent),
    windowDurationMins: value.windowDurationMins ?? null, resetsAt: value.resetsAt ?? null };
}
function snapshot(value: any) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid subscription usage snapshot");
  return { primary: window(value.primary), secondary: window(value.secondary) };
}
export function normalizeUsage(value: any) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid subscription usage response");
  const buckets = value.rateLimitsByLimitId;
  if (buckets != null && (typeof buckets !== "object" || Array.isArray(buckets) || Object.keys(buckets).length > 50))
    throw new Error("Invalid subscription usage buckets");
  const rateLimitsByLimitId = buckets == null ? null : Object.fromEntries(Object.entries(buckets).map(([id, limits]) => {
    if (!id || id.length > 200) throw new Error("Invalid subscription usage bucket ID");
    return [id, snapshot(limits)];
  }));
  return { rateLimits: snapshot(value.rateLimits), rateLimitsByLimitId,
    notice: "Account-wide Codex subscription limits, not task usage. Prefer per-limit buckets when present. Null means unavailable; reset times are Unix seconds. No credits were consumed or purchased." };
}

/** Official account API only; no model turn and no direct credential access. */
export async function codexUsage(config: ProviderConfig, signal: AbortSignal, makeRPC = () => new CodexRPC()) {
  signal.throwIfAborted();
  const rpc = makeRPC();
  const seconds = Number.isFinite(config.timeout) && config.timeout > 0 ? Math.min(config.timeout,30) : 30;
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(Math.ceil(seconds * 1000))]);
  try {
    await rpc.initialize(deadline);
    const account = await rpc.request("account/read", { refreshToken: false }, deadline);
    if (account.account?.type !== "chatgpt") throw new Error("Subscription usage requires Codex CLI ChatGPT sign-in");
    const response = await rpc.request("account/rateLimits/read", {}, deadline);
    deadline.throwIfAborted();
    return normalizeUsage(response);
  } catch (error) {
    if (deadline.aborted) throw deadline.reason;
    // CLI/server error bodies can contain account details; do not persist them in Activity.
    if (error instanceof Error && /^(Invalid subscription usage|Subscription usage requires)/.test(error.message)) throw error;
    throw new Error("Could not read Codex subscription limits. Check CLI installation, ChatGPT sign-in and connectivity.");
  } finally { rpc.close(); }
}
