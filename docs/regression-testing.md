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
| 4b | Traduzione | `npm run lingua` (serve un server) | **scritte rimaste in italiano con l'app in inglese**: 9 pagine + 7 interazioni + 6 **stati che il seed nasconde** (vuoto, benvenuto, gate della città, 404), etichette invisibili incluse, **+ nessuna CHIAVE del dizionario a schermo** | il testo disegnato su canvas (il poster del recap non sta in `innerText`) |
| 5 | Verifica sul deployato | script di sonda su `ste-wee.github.io/Mytravellog` | build minificato, service worker, cache, deploy riuscito | — |

| 4c | Traduzione, rete STRUTTURALE | `npm run lingua:statico` | ogni scritta a mano fuori da `t()`, **senza indovinare la lingua**: legge il file INTERO (testo su più righe, dopo una graffa chiusa, interrotto da `{espressioni}`) **e sette posizioni fuori dal JSX** | le posizioni non elencate (es. una stringa dentro un array di tuple) |

⚠️ **Perché DUE reti per la stessa cosa.** La 4b guarda cosa *rende* a schermo,
la 4c guarda il *codice*: hanno buchi opposti e servono insieme. La 4b non vede
gli stati che non apre; la 4c non vede i letterali fuori dai posti che conosce.
**Storia da non ripetere: ho creduto di aver finito SEI volte** con una rete
verde e l'italiano a schermo — «Rivivi il 2026 in 3D» (nessuna parola-spia),
«Itinerario» (una parola sola), «Mappa del mondo» (l'articolo «del» non era
nella mia lista), i toast (nessun collaudo li fa scattare), poi **76 scritte in
un colpo** e infine «Accedi con Google» sul cancello di benvenuto. Ogni volta il
buco era nel **disegno della rete**, non nel codice.

⚠️ **Le ultime tre, che sono la stessa lezione tre volte.** La 4c leggeva **una
riga alla volta** e cercava `>testo<`. In questo codice i tag sono spezzati su
più righe di attributi, quindi il `>`, il testo e il `<` stanno su righe
diverse: **60 scritte invisibili**. Poi il testo che comincia dopo una **graffa
chiusa** (`{busy ? … : <GoogleG/>}` e a capo la scritta) e il testo
**interrotto** da un'espressione («Mostro i primi {MAX_DAYS} giorni — il viaggio
ne ha {totalDays}.»): **altre 16**, e la prima di queste l'ho vista in uno
**screenshot**, non in una rete. La cura non è stata aggiungere tre regole ma **generalizzare
quella che c'era**: leggere il file intero, e svuotare le graffe invece di
trattarle da muro.

Il complemento nella 4b: il seed riempie l'archivio e congeda il cancello di
benvenuto, e con questo **rende irraggiungibili** la schermata vuota, il gate
della città e il 404 — dove stavano un bel po' di quelle scritte. Un seed è una
scelta, e **ogni scelta nasconde il suo opposto**: da qui il terzo passaggio con
6 stati, ognuno dei quali pretende una scritta inglese a schermo (senza quella,
una pagina che non carica darebbe «0 italiano»).

⚠️ E il controllo delle chiavi orfane cercava la chiave come **sottostringa
nuda**: «Programma» risultava usata perché quelle lettere stanno dentro
l'identificatore `InProgramma`. Ora la cerca **fra apici**. È stato tirando
quel filo che sono venute fuori tutte le altre.

Da qui tre regole, valide oltre le lingue:
1. **Chiedere una proprietà sintattica, non un'euristica.** «È un letterale
   fuori da `t()`?» non ha buchi; «sembra italiano?» ne ha sempre. Il rumore si
   toglie con eccezioni **dichiarate** (`RUMORE` in `lingua-statico.mjs`): se
   sbaglio lì, sbaglio in modo leggibile.
2. **Ogni rete dichiara cosa NON ha guardato.** `npm run lingua` stampa quante
   superfici ha aperto e **legge le rotte da `src/main.tsx`**: se il router ha
   una pagina che il collaudo non visita, fallisce invece di ignorarla. Uno
   «0» ottenuto guardando zero è il guasto silenzioso classico.
3. **Ogni rete ha la sua autoprova.** `npm run lingua:statico -- --autoprova`
   inietta 13 casi che deve trovare e 19 che deve ignorare, **multi-riga
   compresi**. Ha già ripagato due volte: mentre la rendevo più silenziosa l'ho
   resa cieca su `toast.error("…!")`, e mentre le insegnavo il testo su più
   righe mi ha bocciato `else if (km > 100) return 3` come falso positivo.
4. **Una rete che dice «0» va guardata con gli occhi almeno una volta.** Il
   sesto difetto l'ha trovato uno screenshot, non un numero verde («Aereo» e
   «Diario» in italiano su ogni biglietto, con la rete viva a zero, perché le
   sue spie sono una lista di PAROLE e quella lista non li conteneva). Se una
   rete dice a posto, la domanda giusta è: **cos'altro direbbe la stessa cosa se
   fosse rotta?**
5. **Prova che la rete sa fallire, con file finti.** Aggiungendo le posizioni
   fuori dal JSX ho messo il loro rumore nel filtro comune, e due regole hanno
   accecato la ricerca del testo: «tutte parole minuscole» è la forma di una
   classe Tailwind **ed è la forma di «non hai viaggiato»**; «comincia con un
   numero» è `1.5px solid #60a5fa` **ed è «12 tappe in tre paesi»**. Cinque
   file finti, zero trovati. Da allora le regole guardano **ogni token** invece
   del prefisso, e quei cinque casi vivono nell'autoprova.
6. **Una prova che usa il dato vero smette di provare la regola.** Le fixture
   dell'autoprova usavano le scritte reali; appena tradotte sono diventate
   chiavi del dizionario e la rete ha (correttamente) smesso di segnalarle —
   facendo fallire l'autoprova. Ora quelle frasi sono **inventate**.

### Le tre reti in una riga

- **strutturale** (4c): «questo letterale passa da `t()`?» — vede il codice,
  compreso il canvas; non vede le posizioni che non ho elencato.
- **viva, spie** (4b): «c'è una parola italiana a schermo?» — vede quello che
  rende; non vede le parole fuori lista.
- **viva, chiavi** (4b): «c'è una CHIAVE del dizionario a schermo?» — non
  indovina niente e copre tutte le chiavi presenti e future; non vede il canvas
  né le scritte che non hanno ancora una chiave. **È la rete che chiude il buco
  delle altre due**: una chiave che esiste e un `t()` che manca al punto di
  visualizzazione — il difetto più silenzioso, perché il dizionario dice sì e lo
  schermo dice no.

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
