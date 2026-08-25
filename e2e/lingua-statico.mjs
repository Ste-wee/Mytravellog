/**
 * Rete STRUTTURALE della traduzione: legge i sorgenti e trova ogni scritta
 * destinata all'utente che NON passa da `t()`/`tr()`.
 *
 * ⚠️ **Non chiede «sembra italiano?», chiede «è un letterale?»** — ed è tutta
 * la differenza. La versione precedente indovinava la lingua da desinenze,
 * articoli e accenti: un'euristica, e ogni euristica ha un buco. Quattro volte
 * ha detto zero con l'italiano a schermo. L'ultima resa dei conti: «Mappa del
 * mondo» è passata perché **«del» non era nella mia lista di articoli**, e le
 * stories del recap («Hai percorso», «Sei stato in», «Ripercorriamolo insieme»)
 * perché non contengono nessuna parola-spia.
 *
 * Qui il criterio è sintattico: una stringa scritta a mano dove va una
 * traduzione è un difetto, qualunque lingua sia. Il rumore (numeri, unità,
 * simboli, classi CSS) si toglie con una lista **esplicita e revisionabile** —
 * che è una cosa diversa da una lista di parole da indovinare: se sbaglio qui,
 * sbaglio in modo VISIBILE, aggiungendo un'eccezione che si legge.
 *
 * ⚠️ **Il buco della prima versione: leggeva UNA RIGA ALLA VOLTA.** Cercava
 * `>testo<` dentro la riga, e in questo codice quel testo quasi mai sta su una
 * riga sola:
 *
 *     <p style={{fontSize:12, color:"…",
 *       lineHeight:1.5}}>
 *       Aggiungi il tuo primo viaggio e guarda il globo prendere vita.
 *     </p>
 *
 * Il `>` che apre il testo, il testo e il `<` che lo chiude stanno su TRE righe
 * diverse: riga per riga non si vede niente. Quarantaquattro scritte sono
 * rimaste in italiano per questo, e la rete diceva zero.
 *
 * La correzione NON è una regola in più: è la stessa regola letta sul **file
 * intero** invece che sulla riga (`candidatiDelFile`). Ho provato prima con una
 * macchina a stati riga-per-riga («questa riga apre del testo?») e sbagliava in
 * entrambe le direzioni: prendeva `[trips]` per una scritta (perché `=>`
 * finisce con `>`) e perdeva «Tutti» e «Scegli un altro punto» (perché il tag
 * che li apre è spezzato su quattro righe di attributi, e su quelle righe non
 * c'è nessun `<`). Lezione: **non inseguire il caso, generalizza la regola**.
 *
 *   node e2e/lingua-statico.mjs
 *   node e2e/lingua-statico.mjs --autoprova    # prova che la rete sa fallire
 */
import fs from "node:fs";
import path from "node:path";

const RADICE = "src";

/** Dove le stringhe a mano sono legittime: il dizionario (le chiavi SONO
 *  italiane) e i test (asseriscono l'italiano di proposito). */
const ESCLUSI = (f) => f.includes("i18n") || /\.test\.[tj]sx?$/.test(f);

/**
 * Il rumore: stringhe che finiscono nei posti giusti ma non sono scritte per
 * l'utente. Ogni riga qui è un'eccezione DICHIARATA — se un domani una di
 * queste nasconde un difetto, si vede leggendo questa lista.
 */
const RUMORE = [
  /^[\s\d.,:;%°×·—–\-+*/()[\]{}|&!?"'`~^<>=@#$_]*$/,       // solo simboli/numeri
  /^(px|rem|em|vh|vw|km|mi|ft|°C|°F|GPX|3D|2D|ID|URL|JSON|CSS|SVG|PNG|JPEG|WebGL|NAV·TA|By|OK)$/i,
  // Minuscole senza spazi e CORTE: `lon`, `px`, `idx`. ⚠️ Era `[a-z0-9-]*`
  // senza limite di lunghezza, e si mangiava tre scritte vere — `punti` di
  // «{n} punti», `fatte` e `destinazione`. Una parola sola in minuscolo può
  // benissimo essere una scritta; un identificatore di quattro lettere o più
  // che finisce fra due tag è raro. Misurato: da 3 falsi negativi a 0, senza
  // nessun falso positivo in più.
  /^[a-z][a-z0-9-]{0,2}$/,
  /^[A-Z][A-Z0-9_]{1,}$/,                                   // COSTANTI
  /[=<>]=|&&|\|\||\?\.|\.\.\./,                             // frammenti di codice pescati per sbaglio
  /^\d+([.,]\d+)?\s*[a-zA-Z°%]*$/,                          // "12 km", "45%"
  // ⚠️ Il `>` dei generics e delle firme TypeScript finisce nella ricerca del
  // testo JSX: `): Promise<void>`, `Map<string, X>`, `(b.temp!`. Sono codice,
  // non scritte — si riconoscono dai caratteri che il testo per l'utente non ha.
  /(Promise|Map|Set|Record|Array|Partial|Omit|Pick|ReturnType)\b/,
  // ⚠️ I segni del CODICE, non la punteggiatura: la prima versione di questa
  // riga escludeva tutto ciò che contenesse `!` o `(`, e ha reso la rete cieca
  // su `toast.success("Viaggio salvato!")`. L'autoprova l'ha beccata subito —
  // che è precisamente il motivo per cui esiste.
  /=>|\.\w+\(|\)\s*[:{;]|^\(|^\w+\(/,
  // Le emoji da sole non si traducono.
  /^[\p{Extended_Pictographic}️‍\s]+$/u,
  /^&\w+;/,                                                  // entità HTML (&nbsp;)
  // La schermata di crash dell'ErrorBoundary: accanto a uno stack trace, in
  // monospace. È già inglese e tradurla non aiuterebbe nessuno — chi la vede
  // sta copiando un errore, non leggendo l'app. Eccezione DICHIARATA, non un
  // buco: sta qui, si legge, e se un domani non va più bene si toglie.
  /^Runtime Error:?$/,
];
const eRumore = (s) => RUMORE.some(r => r.test(s.trim()));

/**
 * Toglie dal sorgente quello che non è codice attivo, **senza spostare le
 * righe**: ogni carattere cancellato diventa uno spazio, gli a-capo restano.
 * Serve perché i numeri di riga che stampo devono essere quelli veri.
 *
 * Cosa sparisce: i commenti (`//`, `/* *|/`, e quindi anche `{/* … *|/` di JSX,
 * di cui restano le graffe — che è giusto: chiudono il testo) e le chiamate
 * `t()`/`tr()` già tradotte. Queste ultime si togliedono PRIMA di cercare, così
 * una riga con una stringa tradotta E una dimenticata non passa liscia per
 * associazione.
 */
function ripulisci(contenuto) {
  const svuota = (m) => m.replace(/[^\r\n]/g, " ");
  return contenuto
    // i blocchi /* … */ (compresi quelli dentro {/* … */})
    .replace(/\/\*[\s\S]*?\*\//g, svuota)
    // i commenti // — ma non le barre di "https://"
    .replace(/(^|[^:"'`\\])\/\/[^\r\n]*/g, (m, pre) => pre + svuota(m.slice(pre.length)))
    .replace(/\b(?:t|tr)\(\s*"[^"]*"[^)]*\)/g, svuota)
    .replace(/\b(?:t|tr)\(\s*'[^']*'[^)]*\)/g, svuota);
}

/**
 * Segni che il pezzo pescato è codice, non una scritta. Serve solo per il testo
 * fra tag: ora attraverso gli a-capo, e quindi posso attraversare anche righe
 * di codice che stanno **in mezzo a due tag**.
 *
 * ⚠️ Il caso che me l'ha insegnato è il ternario:
 *
 *     ? <span …>🏠</span>
 *     : stop.countryCode
 *       ? <img …/>
 *
 * Fra il `>` di `</span>` e il `<` di `<img` non c'è nessun punto e virgola e
 * nessun uguale: sembrava testo. Lo tradisce **da dove comincia la riga** — una
 * frase per l'utente non comincia con `:` o `?` — e il punto senza spazio di
 * `stop.countryCode`.
 */
function rigaEDiCodice(riga) {
  const r = riga.trim();
  if (!r) return true;
  // Una graffa SPAIATA è rimasta dopo lo svuotamento: significa che qui
  // un'espressione si apre o si chiude, e questa riga ne è il bordo — `{busy ?`,
  // `{!adding ? (`. Nessuna scritta per l'utente contiene graffe.
  if (/[{}]/.test(r)) return true;
  // Parentesi spaiate: `lat)`, `1) return 3`, `100) return`. Una frase vera le
  // chiude — «(dentro le date del viaggio)» passa, `lat)` no.
  const apre = (r.match(/\(/g) || []).length, chiude = (r.match(/\)/g) || []).length;
  if (chiude > apre) return true;
  // Meno di due lettere: `T,` di un generico, non una parola.
  if ((r.match(/\p{L}/gu) || []).length < 2) return true;
  return /^[:?.,)\]\[}&|+*/]/.test(r)   // continuazione di un'espressione
    || /\w\.\w/.test(r)                 // accesso a una proprietà: stop.countryCode
    // ⚠️ Le parole del linguaggio. Servono da quando il testo può cominciare in
    // mezzo al codice: fra un `}` di fine funzione e il primo `<` di un
    // generico ci sta del codice normale, e senza questa riga arrivavano
    // `return (`, `export function …`, `else if (km`.
    || /^(return|export|function|class|const|let|var|import|interface|type|enum|else|if|switch|case|for|while|try|catch|throw|await|async|new|default|extends)\b/.test(r);
}

/**
 * Svuota le espressioni `{…}` lasciando spazi (e gli a-capo dove sono).
 *
 * ⚠️ Serve perché **una scritta può essere interrotta da un'espressione**:
 *
 *     Mostro i primi {MAX_DAYS} giorni — il viaggio ne ha {totalDays}.
 *
 * Trattare la graffa come un muro (com'era) significa non vedere niente di
 * questa frase: il pezzo prima della graffa non arriva a un `<`, quello dopo
 * non parte da un `>`. Svuotarla invece lascia la frase intera e leggibile —
 * e il numero di riga resta giusto perché la lunghezza non cambia.
 */
function svuotaGraffe(pezzo) {
  let out = pezzo, prima;
  do {
    prima = out;
    out = out.replace(/\{[^{}]*\}/g, m => m.replace(/[^\r\n]/g, " "));
  } while (out !== prima);
  return out;
}

/**
 * Tutte le scritte di un file, con il numero di riga.
 *
 * Tre famiglie, le stesse di sempre — attributi, testo fra tag, toast — solo
 * lette sul file intero. La seconda è quella che conta: il testo fra un `>` e
 * il `<` successivo, **anche se in mezzo ci sono a-capo**. Le graffe restano
 * proibite: `{qualcosa}` è un'espressione, non una scritta, e la sua presenza
 * è precisamente ciò che distingue `>{t("Ciao")}<` da `>Ciao<`.
 */
function candidatiDelFile(contenuto) {
  const testo = ripulisci(contenuto);
  // riga di un indice, senza ricontare il file ogni volta
  const aCapo = [];
  for (let i = 0; i < testo.length; i++) if (testo[i] === "\n") aCapo.push(i);
  const rigaDi = (idx) => {
    let lo = 0, hi = aCapo.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (aCapo[m] < idx) lo = m + 1; else hi = m; }
    return lo + 1;
  };

  const fuori = [];
  const aggiungi = (s, idx) => {
    const v = s.trim();
    if (v.length >= 2 && !eRumore(v)) fuori.push({ riga: rigaDi(idx), testo: v });
  };

  for (const m of testo.matchAll(/(?:aria-label|title|placeholder|alt)="([^"]+)"/g)) aggiungi(m[1], m.index);
  for (const m of testo.matchAll(/(?:toast\.\w+|window\.confirm|alert)\(\s*["`]([^"`]+)/g)) aggiungi(m[1], m.index);

  // Il testo fra tag: tutto quello che sta fra un `>` e il `<` successivo, a
  // cavallo degli a-capo e **con le espressioni svuotate**. Ogni riga del pezzo
  // è una scritta a sé (una frase che va a capo va tradotta tutta, non a metà);
  // le righe che sono codice si scartano una per una, non tutto il pezzo —
  // altrimenti il `}` che precede «Accedi con Google» butterebbe la scritta.
  //
  // ⚠️ Le due cose che questa riga sola ha imparato a vedere, e che nelle
  // versioni precedenti erano invisibili:
  //   1. il testo dopo una graffa chiusa   {busy ? … : <GoogleG/>}
  //                                        Accedi con Google
  //   2. il testo INTERROTTO da un'espressione
  //      «Mostro i primi {MAX_DAYS} giorni — il viaggio ne ha {totalDays}.»
  // La seconda l'ho trovata a occhio in uno screenshot, non con una rete: il
  // sesto «ho finito» sbagliato di questo lavoro.
  for (const m of testo.matchAll(/>([^<>]*)</g)) {
    const pezzo = svuotaGraffe(m[1]);
    // punto e virgola, uguale o backtick nel pezzo = quel `>` non apriva un
    // tag, era codice (`const x = { a: 1 };` fra due tag)
    if (!pezzo.trim() || /[;="`]/.test(pezzo)) continue;
    let dentro = m.index + 1;
    for (const riga of pezzo.split("\n")) {
      if (!rigaEDiCodice(riga)) aggiungi(riga, dentro);
      dentro += riga.length + 1;
    }
  }
  return fuori.sort((a, b) => a.riga - b.riga);
}

// ── Autoprova: la rete deve saper fallire ──────────────────────────────────
// Le reti sono codice, e meritano la stessa disciplina del codice che
// controllano: qui si prova che vedono quello che devono vedere e ignorano il
// resto. Senza questo, una regex che smette di matchare rende la rete cieca in
// silenzio — e il suo "0" sembrerebbe una buona notizia.
if (process.argv.includes("--autoprova")) {
  const daTrovare = [
    [`<div>Mappa del mondo</div>`],
    [`<span>Hai percorso</span>`],                        // nessuna parola-spia: l'euristica la perdeva
    [`<h2>Itinerario</h2>`],                              // una parola sola: l'euristica la perdeva
    [`<button aria-label="Chiudi mappa del paese">`],
    [`toast.success("Viaggio salvato!")`],
    [`<div title="Zoom avanti">`],
    [`<p>This is English text</p>`],                      // anche l'inglese a mano è un difetto
    [`<span aria-label={t("Tradotta")} title="Dimenticata">`],  // la riga mista
    [`<List style={{width:12,height:12}}/> Lista`, `</button>`], // testo a fine riga, dopo un tag
    // Il caso che ha fatto nascere questa versione: testo su riga propria.
    [`<p style={{fontSize:12}}>`, `  Aggiungi il tuo primo viaggio.`, `</p>`],
    // Il tag SPEZZATO su più righe di attributi: sulla riga del `>` non c'è
    // nessun `<`, ed è quello che faceva perdere «Tutti» e «Partenza».
    [`<button type="button"`, `  style={{ flex: 1, padding: 11,`, `    cursor: "pointer" }}>`, `  Scegli un altro punto`, `</button>`],
    // frase che va a capo: vanno trovate TUTTE E DUE le righe
    [`<p>`, `  Non è stato possibile caricare la mappa. Riprova più`, `  tardi.`, `</p>`],
    // testo che comincia dopo una GRAFFA chiusa: il caso «Accedi con Google»
    [`{busy ? <Loader2 /> : <GoogleG size={16} />}`, `Accedi con Google`, `</button>`],
  ];
  const daIgnorare = [
    [`<div className="flex items-center">`],
    [`<span>{t("Gite in giornata")}</span>`],
    [`<div style={{ width: 12 }}>·</div>`],
    [`<span>45%</span>`],
    [`<div>{viaggi.length}</div>`],
    [`if (lat >= 36 && lon <= 25) return "europa";`],
    [`<span>km</span>`],
    // il `>` del confronto e quello della freccia non aprono nessuna scritta
    [`if (a > b) return c`, `const d = e < f`],
    [`  .sort((a, b) =>`, `    (b.km ?? 0) - (a.km ?? 0)`, `  )[0],`, `[trips]`],
    // il ternario fra due tag: `: stop.countryCode` è codice
    [`? <span style={{ fontSize: 12 }}>🏠</span>`, `: stop.countryCode`, `  ? <img alt="" />`],
    // un commento JSX su più righe: prosa italiana che NON è una scritta
    [`{/* GITE IN GIORNATA — striscia in alto.`, `    Prima stava in fondo, dopo tutti gli anni.`, `    Ora sta dove si guarda. */}`],
    // un blocco di commento normale, e uno di riga
    [`/**`, ` * Quante gite cadono in ciascun mese.`, ` */`],
    [`// Le gite non contano come viaggi: parti e torni lo stesso giorno.`],
    // testo già tradotto, su riga propria
    [`<p>`, `  {t("Aggiungi il tuo primo viaggio.")}`, `</p>`],
    // un indirizzo: le due barre non sono un commento
    [`const u = "https://flagcdn.com/w80/it.png";`],
    // fra un `}` di fine funzione e il primo `<` di un generico c'è codice
    [`}`, ``, `export function paeseDelPunto(lat: number): Map<string, number> {`],
    [`  }`, `  return (`, `    <div>{t("Ciao")}</div>`],
    [`}`, `else if (km > 100) return 3`, `const x: Array<number> = []`],
    [`}`, `class ErrorBoundary extends Component<Props> {`],
  ];

  let ko = 0;
  for (const righe of daTrovare) {
    const trovate = candidatiDelFile(righe.join("\n"));
    // ogni riga di solo testo va trovata, non solo la prima
    const attese = Math.max(1, righe.filter(r => r.trim() && !/[<>{}]/.test(r)).length);
    if (trovate.length < attese) {
      console.log(`❌ NON trovata (${trovate.length}/${attese}):`, JSON.stringify(righe.join(" ⏎ ").slice(0, 90))); ko++;
    }
  }
  for (const righe of daIgnorare) {
    const trovate = candidatiDelFile(righe.join("\n"));
    if (trovate.length) {
      console.log("❌ falso positivo:", JSON.stringify(righe.join(" ⏎ ").slice(0, 90)), "→", JSON.stringify(trovate.map(t => t.testo))); ko++;
    }
  }
  console.log(ko === 0
    ? `✅ autoprova: ${daTrovare.length} da trovare, ${daIgnorare.length} da ignorare, tutte giuste`
    : `\n⚠️  autoprova FALLITA: ${ko} casi sbagliati — la rete è cieca, sistemala prima di fidarti del suo esito`);
  process.exit(ko === 0 ? 0 : 1);
}

// ── Il giro vero ───────────────────────────────────────────────────────────
const file = [];
(function cammina(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) cammina(p);
    else if (/\.tsx?$/.test(e.name) && !ESCLUSI(p)) file.push(p);
  }
})(RADICE);

const sospette = [];
for (const f of file) {
  for (const c of candidatiDelFile(fs.readFileSync(f, "utf8"))) {
    sospette.push({ file: f.replace(/\\/g, "/"), riga: c.riga, testo: c.testo.slice(0, 78) });
  }
}

for (const s of sospette) console.log(`${s.file}:${s.riga}  ${s.testo}`);
// ⚠️ Si stampa QUANTI file e QUANTE righe sono stati guardati: una rete che
// trova zero perché ha esaminato zero è il guasto silenzioso classico, e senza
// questi numeri sarebbe indistinguibile da "tutto a posto".
console.log(`\nfile letti: ${file.length}`);
console.log(`scritte da tradurre: ${sospette.length}`);
process.exit(sospette.length === 0 ? 0 : 1);
