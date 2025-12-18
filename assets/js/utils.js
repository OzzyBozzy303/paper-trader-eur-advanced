// assets/js/utils.js
(function(){
  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
  function uid(prefix){
    prefix = prefix || "id";
    return prefix + "_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
  }
  function fmtNumber(n, max){
    max = max ?? 8;
    if (!Number.isFinite(n)) return "–";
    const abs = Math.abs(n);
    const digits = abs >= 1 ? 2 : Math.min(max, 8);
    return n.toLocaleString(undefined, { maximumFractionDigits: digits });
  }
  function fmtCurrency(n, currency){
    currency = currency || "EUR";
    if (!Number.isFinite(n)) return "–";
    return n.toLocaleString(undefined, { style: "currency", currency, maximumFractionDigits: 2 });
  }
  function fmtPct(n){
    if (!Number.isFinite(n)) return "–";
    return (n*100).toFixed(2) + "%";
  }
  function isoTime(tsMs){ return new Date(tsMs).toLocaleString(); }
  function isLiveSymbol(sym){ return sym === "BTC" || sym === "ETH" || sym === "SOL"; }
  window.PT_UTILS = { clamp, uid, fmtNumber, fmtCurrency, fmtPct, isoTime, isLiveSymbol };
})();
