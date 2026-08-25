/**
 * Rete STATICA della traduzione: legge i sorgenti e cerca le scritte italiane
 * che NON passano da `t()`/`tr()`.
 *
 * ⚠️ Perché esiste, invece di fidarsi di `npm run lingua`. Il collaudo dal vivo
 * cerca parole-spia italiane nelle pagine aperte, e ha **due buchi per
 * costruzione**:
 * 1. vede solo gli stati che visita (la vista a griglia non la apriva → «Apri
 *    il biglietto di X» è rimasto italiano per due giri);
 * 2. una scritta senza nessuna parola-spia dentro passa liscia («Rivivi il 2026
 *    in 3D», «Itinerario»: tre giri di collaudo verde con quelle a schermo).
 *
 * Questa rete guarda il CODICE, quindi non dipende da cosa si apre né da quali
 * parole ho pensato di mettere in lista. Ha il buco opposto — trova cose che
 * non sono scritte per l'utente — quindi il suo esito si legge, non si obbedisce.
 *
 *   node e2e/lingua-statico.mjs
 */
import fs from "node:fs";
import path from "node:path";

const RADICE = "src";

/** File dove le stringhe italiane sono legittime: il dizionario (le chiavi SONO
 *  italiane) e i test (asseriscono l'italiano di proposito). */
const ESCLUSI = (f) => f.includes("i18n") || /\.test\.[tj]sx?$/.test(f);

/** Ortografia italiana: desinenze e paroline che l'inglese non ha. Più robusta
 *  di una lista di parole, perché non devo indovinare il vocabolario. */
const SEGNI = [
  /\b(il|lo|la|gli|le|dei|degli|delle|della|dello|nel|nella|sul|sulla|dal|dalla|col|un|una)\b/i,
  /\b\w+(zione|mento|aggio|ità|tà|ire|are|ere)\b/i,
  /[àèéìòù]/,
  /\b(che|non|più|già|anche|come|quando|dove|perché|questo|questa|quello|tuo|tua|tuoi)\b/i,
];
/**
 * Le etichette di UNA parola sola.
 *
 * ⚠️ Prima venivano scartate in blocco, per non inciampare nei nomi propri e
 * nelle sigle ("Menu", "NAV·TA", "GPX"). Costo di quella scorciatoia: **sei
 * scritte italiane rimaste a schermo** — «Itinerario» (l'intestazione del form!),
 * «Riprova», «Mezzo», «Partenza», «Tela» — con la rete che diceva zero.
 * Ora si guardano, ma solo contro un elenco chiuso di parole che nell'interfaccia
 * di quest'app significano qualcosa: nessun falso positivo sui nomi di città.
 */
const SINGOLE = /^(annulla|elimina|salva|chiudi|avanti|indietro|tela|tele|partenza|arrivo|titolo|periodo|itinerario|valutazione|motivo|conferma|riprova|aggiungi|rimuovi|apri|modifica|cancella|fatto|oggi|domani|ieri|note|diario|viaggio|viaggi|paese|paesi|città|giorni|notti|tappa|tappe|mezzo|mezzi|casa|globo|misure|lingua|sistema|prenotato|prenotare|gita|gite)$/i;

const sembraItaliano = (s) => {
  const parole = s.trim().split(/\s+/);
  if (parole.length === 1) return SINGOLE.test(parole[0]);
  return SEGNI.some(r => r.test(s));
};

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
  const testo = fs.readFileSync(f, "utf8");
  const righe = testo.split(/\r?\n/);
  righe.forEach((riga, i) => {
    // I commenti no: sono per chi legge il codice, non per l'utente.
    const senzaCommento = riga.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
    if (/^\s*[*/]/.test(riga)) return;

    /**
     * ⚠️ Le chiamate a `t()`/`tr()` si TOLGONO dalla riga prima di cercare, non
     * si usa la loro presenza per saltare la riga intera: così una riga con una
     * stringa tradotta E una dimenticata (`aria-label={t("X")} title="Titolo"`)
     * non passa più liscia. Provato: oggi non ce n'è nessuna, ma la vecchia
     * versione non l'avrebbe saputo.
     */
    const ripulita = senzaCommento
      .replace(/\b(?:t|tr)\(\s*"[^"]*"[^)]*\)/g, "T()")
      .replace(/\b(?:t|tr)\(\s*'[^']*'[^)]*\)/g, "T()");

    const candidati = [];
    // 1. attributi che finiscono a schermo
    for (const m of ripulita.matchAll(/(?:aria-label|title|placeholder|alt)="([^"]{3,})"/g)) candidati.push(m[1]);
    // 2. testo JSX fra tag, sulla stessa riga
    for (const m of ripulita.matchAll(/>([^<>{}\n]{3,})</g)) candidati.push(m[1]);
    // 3. stringhe passate a toast/confirm/alert
    for (const m of ripulita.matchAll(/(?:toast\.\w+|window\.confirm|alert)\(\s*["`]([^"`]{3,})/g)) candidati.push(m[1]);

    for (const c of candidati) {
      if (!sembraItaliano(c)) continue;
      sospette.push({ file: f.replace(/\\/g, "/"), riga: i + 1, testo: c.trim().slice(0, 78) });
    }
  });
}

for (const s of sospette) console.log(`${s.file}:${s.riga}  ${s.testo}`);
console.log(`\nscritte italiane fuori da t(): ${sospette.length}`);
process.exit(sospette.length === 0 ? 0 : 1);
