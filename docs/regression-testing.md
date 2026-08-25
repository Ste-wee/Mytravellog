# Strategia di Regression Testing — NAV·TA

La difesa è a **cinque strati**, dal più economico al più fedele. Ogni strato
esiste perché quello sotto ha un punto cieco documentato (ognuno ha già
catturato regressioni vere che gli altri non vedevano).

## Gli strati

| # | Strato | Comando | Cosa cattura | Punto cieco |
|---|--------|---------|--------------|-------------|
| 1 | Tipi (app + service worker) | `npm run typecheck` | contratti rotti, campi rinominati, rami impossibili | tutto ciò che è runtime |
| 2 | Lint | `npx eslint src scripts e2e` | import morti, hook malformati, `any` | la logica |
| 3 | Unit/integrazione (739 test, jsdom) | `npx vitest run` | logica, riduttori, formatter, macchine a stati, rami d'errore | **jsdom non disegna**: WebGL, layout, CSS (ellipsis/overflow), scroll |
| 4 | Collaudo end-to-end (Playwright, browser vero) | `npm run collaudo` (serve il dev server) | pagine che si aprono, azioni chiave, globo che carica, offline | il sito *deployato* (bundle, SW, CDN) |
| 4b | Traduzione | `npm run lingua` (serve un server) | **scritte rimaste in italiano con l'app in inglese**, pagina per pagina, etichette invisibili incluse | le schermate che si aprono solo con un'interazione (diario, pannello del piano, tutorial) |
| 5 | Verifica sul deployato | script di sonda su `ste-wee.github.io/Mytravellog` | build minificato, service worker, cache, deploy riuscito | — |

**Lo strato 4b (`e2e/lingua.mjs`) è il cancello della traduzione**: apre ogni
pagina con la lingua inglese e cerca parole funzione italiane (nel testo E negli
`aria-label`/`title`/`placeholder`), poi esce con codice ≠ 0 se ne trova. I dati
di prova sono in inglese di proposito — così tutto l'italiano che trova è testo
dell'app, non un dato dell'utente (i nomi dei luoghi restano come li hai
censiti: è una scelta dichiarata nelle Impostazioni, non un difetto).
⚠️ Aggiungendo una scritta all'app va aggiunta anche in `src/lib/i18n/en.ts`, o
**il typecheck non compila**: la chiave È l'italiano, e il dizionario inglese
definisce le chiavi ammesse. Le due false positive già pagate: «marker» e
«come», che sono parole inglesi — se aggiungi una spia, controlla che non
esista in inglese.

Il comando unico degli strati 1–4:

```bash
npm run regressione
```

## Quando eseguire cosa

- **Ogni giro di modifiche, prima del commit**: `npm run regressione` per intero.
  Nessun commit con uno strato rosso. (Storia: i rossi intermittenti di
  AppHeader/NuovoViaggio erano TIMEOUT da carico parallelo, non fragilità —
  risolti alzando `testTimeout` a 15s. Se ne ricompare uno, prima di
  incolpare il codice: è un timeout? il file è verde in isolamento?)
- **Dopo ogni push**: il deploy è automatico (GitHub Pages). Attendere il cambio
  d'hash del bundle (`curl` dell'index con `?nocache=…`) e fare la verifica
  live mirata su ciò che è cambiato. Se il deploy fallisce, PRIMA di incolpare
  il commit guardare `githubstatus.com/api/v2/summary.json`.
- **Coverage** (misura, non feticcio): `npm run coverage` sul cuore logico.
  Soglia di guardia su `src/lib`: **≥95% statements** (oggi 96,6%). Il totale
  app (~65%) è dominato dai componenti WebGL che jsdom non può eseguire: la
  loro rete di sicurezza sono gli strati 4–5, non i numeri di coverage.

## Le regole che rendono i test affidabili (imparate a caro prezzo)

1. **Un test nuovo non esiste finché non l'hai visto fallire**: mutation test —
   rompi la correzione, DEVE cadere esattamente lui. Lo script di mutazione
   verifica `includes` prima di dichiarare "rotto" (i file sono CRLF: un `\n`
   nel pattern fa fallire il replace in silenzio e il test sembra inutile).
2. **Mock di `fetch` per INDIRIZZO, mai per ordine** (`mockResolvedValueOnce`
   in fila si rompe appena la catena guadagna un passo: 36 test caduti in una
   volta). E i finti fetch devono dichiarare `ok: true`.
3. **jsdom mente su alcune cose**: non disegna (niente scrollWidth/ellipsis —
   si asserisce lo *stile*, non l'effetto), scarta i `background:
   linear-gradient`, il suo `localStorage` non si spia (si SOSTITUISCE
   l'oggetto intero con `Object.defineProperty(window, "localStorage", …)`),
   `URL.createObjectURL` non esiste (si definisce), e `openDB` si fa rigettare
   solo con `vi.mock("idb")`.
4. **Se aggiungi un export a un componente, aggiorna i suoi `vi.mock` nei
   test** (sintomo criptico: N test cadono "senza motivo" in un file lontano).
5. **Se il difetto è "non succede quando clicco", il test DEVE cliccare
   davvero** (coordinate proiettate in Playwright), non chiamare la callback.
6. **Se aggiungi un obbligo/blocco all'app, aggiorna gli scenari del
   collaudo**, o il collaudo dirà che l'app è rotta.
7. **Le ipotesi sui servizi esterni si provano sull'API vera** prima di
   scrivere codice o test ("l'archivio meteo ritarda" era falso).
8. **Mai `Date.now()` implicito nei test dei conteggi**: le date si iniettano
   (`todayISO` parametrico in `planCountdown`, fixture con date fisse).

## Come si aggiunge una feature senza regressioni

1. Mockup sulla UI vera prima del codice (override DOM via Playwright).
2. Codice + test che la inchiodano (con mutation).
3. `npm run regressione`.
4. Se tocca una pagina del collaudo → aggiorna `e2e/collaudo.mjs`.
5. Commit → push → verifica sul deployato → aggiornamento della memoria.

## Cosa NON copriamo di proposito

- **WebGL in unit test**: WorldMap/TripFlyover/QuadroEditor si collaudano solo
  in un browser vero (strati 4–5). Inutile inseguire coverage lì.
- **Il service worker in dev**: attivo solo in produzione; i suoi effetti
  (cache dei confini, offline) si verificano sul deployato.
- **Lo scenario "pacchetto confini locale" sul sito vero**: il SW serve
  `/confini/` senza passare da `page.route` — si prova solo sul dev server.
