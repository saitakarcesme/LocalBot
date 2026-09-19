/** Provider-reported totals only. Repeated cumulative notifications contribute no extra tokens. */
export let tokenUsageSink: (thread: string, total: number) => void = () => {};
export function setTokenUsageSink(sink: typeof tokenUsageSink) { tokenUsageSink = sink; }
export function recordTokenUsage(params: any) {
  const total = params?.tokenUsage?.total?.totalTokens;
  if (typeof params?.threadId === 'string' && Number.isSafeInteger(total) && total >= 0) tokenUsageSink(params.threadId, total);
}
