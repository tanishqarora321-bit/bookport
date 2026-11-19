// Runs fn over items a few at a time instead of one after another (owner,
// 2026-11: bulk delete / move were slow). Order of completion doesn't
// matter to the callers - each one records its own success / failure.
export async function eachLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}
