// assets/js/storage.js
// Persistenz via localStorage (GitHub Pages kompatibel, kein Backend)

const KEY = "papertrader:v1";

export function loadState(){
  try{
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  }catch(_){
    return null;
  }
}

export function saveState(state){
  try{
    localStorage.setItem(KEY, JSON.stringify(state));
  }catch(_){
    // Falls Storage voll/gesperrt: App läuft trotzdem weiter (nur ohne Persistenz).
  }
}

export function clearState(){
  try{ localStorage.removeItem(KEY); }catch(_){}
}
