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
  /^[a-z][a-z0-9-]*$/,                                      // minuscole senza spazi: classi, chiavi, id
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

/** Le tre famiglie di posti dove una scritta arriva all'utente. */
function candidatiDellaRiga(riga) {
  if (/^\s*[*/]/.test(riga)) return [];
  const senzaCommento = riga.replace(/\/\/.*$/, "");
  // Le chiamate t()/tr() si TOLGONO prima di cercare: così una riga con una
  // stringa tradotta E una dimenticata non passa liscia per associazione.
  const ripulita = senzaCommento
    .replace(/\b(?:t|tr)\(\s*"[^"]*"[^)]*\)/g, "T()")
    .replace(/\b(?:t|tr)\(\s*'[^']*'[^)]*\)/g, "T()");

  const fuori = [];
  for (const m of ripulita.matchAll(/(?:aria-label|title|placeholder|alt)="([^"]+)"/g)) fuori.push(m[1]);
  for (const m of ripulita.matchAll(/>([^<>{}\n]+)</g)) fuori.push(m[1]);
  for (const m of ripulita.matchAll(/(?:toast\.\w+|window\.confirm|alert)\(\s*["`]([^"`]+)/g)) fuori.push(m[1]);
  return fuori.map(s => s.trim()).filter(s => s.length >= 2 && !eRumore(s));
}

// ── Autoprova: la rete deve saper fallire ──────────────────────────────────
// Le reti sono codice, e meritano la stessa disciplina del codice che
// controllano: qui si prova che vedono quello che devono vedere e ignorano il
// resto. Senza questo, una regex che smette di matchare rende la rete cieca in
// silenzio — e il suo "0" sembrerebbe una buona notizia.
if (process.argv.includes("--autoprova")) {
  const devonoEssereTrovate = [
    `<div>Mappa del mondo</div>`,
    `<span>Hai percorso</span>`,                          // nessuna parola-spia: l'euristica la perdeva
    `<h2>Itinerario</h2>`,                                // una parola sola: l'euristica la perdeva
    `<button aria-label="Chiudi mappa del paese">`,
    `toast.success("Viaggio salvato!")`,
    `<div title="Zoom avanti">`,
    `<p>This is English text</p>`,                        // anche l'inglese a mano è un difetto
    `<span aria-label={t("Tradotta")} title="Dimenticata">`,   // la riga mista
  ];
  const devonoEssereIgnorate = [
    `<div className="flex items-center">`,
    `<span>{t("Gite in giornata")}</span>`,
    `<div style={{ width: 12 }}>·</div>`,
    `<span>45%</span>`,
    `<div>{viaggi.length}</div>`,
    `if (lat >= 36 && lon <= 25) return "europa";`,
    `<span>km</span>`,
  ];
  let ko = 0;
  for (const r of devonoEssereTrovate) {
    if (candidatiDellaRiga(r).length === 0) { console.log("❌ NON trovata:", r); ko++; }
  }
  for (const r of devonoEssereIgnorate) {
    const t = candidatiDellaRiga(r);
    if (t.length > 0) { console.log("❌ falso positivo:", r, "→", JSON.stringify(t)); ko++; }
  }
  console.log(ko === 0
    ? `✅ autoprova: ${devonoEssereTrovate.length} da trovare, ${devonoEssereIgnorate.length} da ignorare, tutte giuste`
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

let esaminate = 0;
const sospette = [];
for (const f of file) {
  fs.readFileSync(f, "utf8").split(/\r?\n/).forEach((riga, i) => {
    for (const s of candidatiDellaRiga(riga)) {
      esaminate++;
      sospette.push({ file: f.replace(/\\/g, "/"), riga: i + 1, testo: s.slice(0, 78) });
    }
  });
}

for (const s of sospette) console.log(`${s.file}:${s.riga}  ${s.testo}`);
// ⚠️ Si stampa QUANTI file e QUANTE righe sono stati guardati: una rete che
// trova zero perché ha esaminato zero è il guasto silenzioso classico, e senza
// questi numeri sarebbe indistinguibile da "tutto a posto".
console.log(`\nfile letti: ${file.length}`);
console.log(`scritte da tradurre: ${sospette.length}`);
process.exit(sospette.length === 0 ? 0 : 1);
