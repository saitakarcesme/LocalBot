import { AsyncLocalStorage } from "node:async_hooks";
export const taskUsage = new AsyncLocalStorage<string>();
/** Provider-reported totals only; cumulative updates are deduplicated by request/thread. */
export type UsageIdentity = {
  providerId: string;
  model: string;
  taskId?: string;
};
export let tokenUsageSink: (
  thread: string,
  total: number,
  identity?: UsageIdentity,
) => void = () => {};
export function setTokenUsageSink(sink: typeof tokenUsageSink) {
  tokenUsageSink = sink;
}
export function recordTokenUsage(params: any, identity?: UsageIdentity) {
  const total = params?.tokenUsage?.total?.totalTokens;
  if (
    typeof params?.threadId === "string" &&
    Number.isSafeInteger(total) &&
    total >= 0
  )
    tokenUsageSink(params.threadId, total, identity);
}
export function recordModelUsage(
  request: string,
  input: unknown,
  output: unknown,
  identity: UsageIdentity,
) {
  if (
    Number.isSafeInteger(input) &&
    Number.isSafeInteger(output) &&
    (input as number) >= 0 &&
    (output as number) >= 0
  ) {
    const total = (input as number) + (output as number);
    if (Number.isSafeInteger(total))
      tokenUsageSink(request, total, {
        ...identity,
        taskId: taskUsage.getStore(),
      });
  }
}
