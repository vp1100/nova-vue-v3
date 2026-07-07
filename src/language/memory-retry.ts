export function isOutOfMemoryError(message: string): boolean {
  return /out of memory|heap out of memory|allocation failed|heap limit|oom=yes/i.test(message);
}

export function suggestedMemoryLimit(currentLimit: number): number {
  return Math.min(Math.max(currentLimit * 2, currentLimit + 1024), 8192);
}

export function memoryLimitMessage(currentLimit: number, suggestedLimit: number): string {
  return (
    `Vue language server ran out of memory. Current Node Memory Limit is ${currentLimit} MB. ` +
    `Increase Runtime & Paths > Node Memory Limit${suggestedLimit > currentLimit ? ` to ${suggestedLimit} MB or higher` : ""}.`
  );
}
