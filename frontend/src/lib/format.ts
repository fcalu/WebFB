export const pct = (x: number) => `${x.toFixed(2)}%`;
export const decOdds = (probPct: number, margin = 0.0) => {
  const p = Math.min(Math.max(probPct / 100, 1e-6), 0.999999);
  const fair = 1 / p;
  return (fair * (1 + margin)).toFixed(2);
};
export const clamp = (n: number, min = 0, max = 100) => Math.min(Math.max(n, min), max);
export const ts = () => new Date().toISOString();
