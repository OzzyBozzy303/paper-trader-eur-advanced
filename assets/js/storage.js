// assets/js/storage.js
(function(){
  const KEY = "papertrader:v3";
  function loadState(){ try{ const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; }catch(_){ return null; } }
  function saveState(state){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(_){ } }
  function clearState(){ try{ localStorage.removeItem(KEY); }catch(_){ } }
  window.PT_STORE = { loadState, saveState, clearState };
})();
