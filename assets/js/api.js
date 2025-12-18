// assets/js/api.js
(function(){
  const CG_BASE = "https://api.coingecko.com/api/v3";
  const LIVE_ASSETS = [
    { symbol: "BTC", name: "Bitcoin",  coinId: "bitcoin"  },
    { symbol: "ETH", name: "Ethereum", coinId: "ethereum" },
    { symbol: "SOL", name: "Solana",   coinId: "solana"   },
  ];
  const CHART_DAYS = [
    { value: 1, label: "1D (5m candles)" },
    { value: 7, label: "7D" },
    { value: 14, label: "14D" },
    { value: 30, label: "30D" },
    { value: 90, label: "90D" },
  ];
  function qs(params){
    const u = new URLSearchParams();
    Object.entries(params).forEach(([k,v]) => { if (v !== undefined && v !== null) u.set(k, String(v)); });
    return u.toString();
  }
  async function getJson(url, timeoutMs){
    timeoutMs = timeoutMs ?? 10000;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try{
      const res = await fetch(url, { signal: ctrl.signal, headers: { "accept": "application/json" }});
      if (!res.ok){
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} – ${text.slice(0,200)}`);
      }
      return await res.json();
    } finally { clearTimeout(t); }
  }
  async function fetchSimplePrices(vsCurrency){
    vsCurrency = vsCurrency || "eur";
    const ids = LIVE_ASSETS.map(a => a.coinId).join(",");
    const url = `${CG_BASE}/simple/price?${qs({ ids, vs_currencies: vsCurrency, include_last_updated_at: "true" })}`;
    return getJson(url);
  }
  async function fetchOHLC(coinId, vsCurrency, days){
    vsCurrency = vsCurrency || "eur";
    days = days || 7;
    const url = `${CG_BASE}/coins/${encodeURIComponent(coinId)}/ohlc?${qs({ vs_currency: vsCurrency, days })}`;
    const raw = await getJson(url);
    return raw.map(row => ({ time: Math.floor(row[0]/1000), open: row[1], high: row[2], low: row[3], close: row[4] }));
  }
  window.PT_API = { LIVE_ASSETS, CHART_DAYS, fetchSimplePrices, fetchOHLC };
})();
