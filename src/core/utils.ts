export const epochNow = (): number => Math.floor(Date.now() / 1000);

export const unixToRelative = (timestamp?: number): string => {
  if (!timestamp) {
    return "unknown";
  }
  const diff = Math.max(1, epochNow() - timestamp);
  if (diff < 60) return `${diff}s ago`;
  const minutes = Math.floor(diff / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export const stripHtml = (value: string): string =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const trimLine = (value: string, max = 130): string => {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
};
