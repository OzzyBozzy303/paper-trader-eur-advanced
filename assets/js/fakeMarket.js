// assets/js/fakeMarket.js
(function(){
  const { clamp } = window.PT_UTILS;

  function randn(){
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  class FakeMarket{
    constructor(opts){
      opts = opts || {};
      this.seedPrice = opts.seedPrice ?? 1000;
      this.speed = opts.speed ?? "medium";
      this.candleSeconds = opts.candleSeconds ?? 60;

      this._timer = null;
      this._t = Math.floor(Date.now()/1000);
      this._price = this.seedPrice;
      this._trend = 0;
      this._vol = 0.012;
      this._regime = "neutral";
      this._regimeTtl = 0;
      this._current = null;
      this._candles = [];
    }

    getPrice(){ return this._price; }
    getCandles(){ return [...this._candles]; }

    stop(){ if (this._timer) clearInterval(this._timer); this._timer = null; }

    start(onUpdate){
      const tickMs = this.speed === "fast" ? 250 : (this.speed === "slow" ? 2000 : 1000);

      this._candles = [];
      this._current = null;
      for (let i = 0; i < 140; i++) this._step();
      onUpdate && onUpdate({ type: "init", candles: this.getCandles(), price: this._price, regime: this._regime });

      this._timer = setInterval(() => {
        const out = this._step();
        onUpdate && onUpdate(out);
      }, tickMs);
    }

    _maybeSwitchRegime(){
      if (this._regimeTtl > 0){ this._regimeTtl--; return; }
      const r = Math.random();
      if (r < 0.25){ this._regime = "trend_up"; this._regimeTtl = 40 + Math.floor(Math.random()*90); }
      else if (r < 0.50){ this._regime = "trend_down"; this._regimeTtl = 40 + Math.floor(Math.random()*90); }
      else if (r < 0.70){ this._regime = "high_vol"; this._regimeTtl = 30 + Math.floor(Math.random()*70); }
      else { this._regime = "neutral"; this._regimeTtl = 30 + Math.floor(Math.random()*80); }
    }

    _step(){
      this._t += 1;
      this._maybeSwitchRegime();

      this._trend = clamp(this._trend + 0.00035*randn(), -0.003, 0.003);
      this._vol   = clamp(this._vol   + 0.00015*randn(), 0.004, 0.03);

      let drift = this._trend;
      let vol = this._vol;

      if (this._regime === "trend_up") drift += 0.0012;
      if (this._regime === "trend_down") drift -= 0.0012;
      if (this._regime === "high_vol") vol *= 1.8;

      const pull = (this.seedPrice - this._price) / this.seedPrice;
      drift += 0.00035 * pull;

      const ret = drift + vol*randn();
      this._price = clamp(this._price * Math.exp(ret), 0.01, Number.MAX_SAFE_INTEGER);

      if (!this._current){
        this._current = { time: this._t, open: this._price, high: this._price, low: this._price, close: this._price };
        this._candles.push(this._current);
        return { type: "candle", candle: { ...this._current }, price: this._price, regime: this._regime };
      }

      this._current.high = Math.max(this._current.high, this._price);
      this._current.low  = Math.min(this._current.low, this._price);
      this._current.close = this._price;

      const age = this._t - this._current.time;
      if (age >= this.candleSeconds){
        this._current = { time: this._t, open: this._price, high: this._price, low: this._price, close: this._price };
        this._candles.push(this._current);
        if (this._candles.length > 400) this._candles = this._candles.slice(-400);
        return { type: "new_candle", candle: { ...this._current }, price: this._price, regime: this._regime };
      }

      return { type: "update", candle: { ...this._current }, price: this._price, regime: this._regime };
    }
  }

  window.PT_FAKE = { FakeMarket };
})();
