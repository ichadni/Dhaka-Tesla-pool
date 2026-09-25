export function formatPaisa(paisa) {
  if (paisa === null || paisa === undefined) return '—';
  return `৳${(paisa / 100).toFixed(2)}`;
}
