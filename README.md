# Paper Trader (EUR) – Fixed

Wenn bei dir vorher „alles tot“ war, war das fast sicher: **JS ist nicht gelaufen**.

Diese Version:
- nutzt **keine ES-Modules** (kein `type="module"`)
- zeigt **JS/Promise Fehler als Toast + Status**
- Fake Market läuft immer
- Live API läuft normal auf GitHub Pages; bei `file://` kann Live blockiert sein

## Repo-Check (wichtig)
Im GitHub Repo **Root** muss liegen:
- `index.html`
- `assets/`

Wenn du stattdessen `paper-trader-.../index.html` im Repo hast, hast du den Ordner falsch hochgeladen.

## Lokales Testen
- Doppelklick auf `index.html`: Fake läuft; Live kann blockiert sein.
- VS Code „Live Server“: Live + Fake laufen.
