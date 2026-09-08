const WAITING_TIME_STORAGE_KEY = "queueless-product-waiting-times";
export const DEFAULT_WAITING_TIME = 10;

function readWaitingTimes(): Record<string, number> {
  try {
    const stored = localStorage.getItem(WAITING_TIME_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function getWaitingTime(productId: string): number {
  const value = readWaitingTimes()[productId];
  return typeof value === "number" && value > 0 ? value : DEFAULT_WAITING_TIME;
}

export function saveWaitingTime(productId: string, minutes: number): void {
  const waitingTimes = readWaitingTimes();
  waitingTimes[productId] = minutes > 0 ? minutes : DEFAULT_WAITING_TIME;
  localStorage.setItem(WAITING_TIME_STORAGE_KEY, JSON.stringify(waitingTimes));
}
