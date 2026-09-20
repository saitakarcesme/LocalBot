/** Retry transient startup failures without overriding a later user action. */
export async function reconnectSavedHost(
  connect: () => Promise<void>,
  isCurrent: () => boolean,
  wait: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 10000)),
): Promise<void> {
  for (let attempt = 0; attempt < 3 && isCurrent(); attempt++) {
    try { await connect(); return; }
    catch (error) {
      if (attempt === 2 || !isCurrent()) throw error;
      await wait();
    }
  }
}
