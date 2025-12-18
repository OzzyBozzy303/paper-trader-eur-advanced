// assets/js/utils.js
// Kleine, wiederverwendbare Helfer (Formatierung, IDs, etc.)

export function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

export function uid(prefix = "id"){
  // Nicht kryptografisch, reicht für UI/History IDs.
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export function fmtNumber(n, max = 8){
  if (!Number.isFinite(n)) return "–";
  const abs = Math.abs(n);
  const digits = abs >= 1 ? 2 : Math.min(max, 8);
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function fmtCurrency(n, currency = "USD"){
  if (!Number.isFinite(n)) return "–";
  return n.toLocaleString(undefined, { style: "currency", currency, maximumFractionDigits: 2 });
}

export function fmtPct(n){
  if (!Number.isFinite(n)) return "–";
  return `${(n*100).toFixed(2)}%`;
}

export function isoTime(tsMs){
  const d = new Date(tsMs);
  return d.toLocaleString();
}

export function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

export function isLiveSymbol(sym){
  return sym === "BTC" || sym === "ETH" || sym === "SOL";
}
