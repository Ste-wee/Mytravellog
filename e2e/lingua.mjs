/**
 * Collaudo della traduzione: apre ogni pagina in INGLESE e cerca l'italiano
 * rimasto. È il cancello per pubblicare il selettore — un'app mezza tradotta
 * è peggio di un'app in una lingua sola.
 *
 * I dati di prova sono volutamente in inglese (London, Paris): così tutto
 * l'italiano che si trova a schermo è testo DELL'APP, non un dato dell'utente
 * (i nomi dei luoghi restano come sono stati censiti — è una scelta, non un
 * difetto: vedi la nota nelle Impostazioni).
 *
 *   node e2e/lingua.mjs                       # dev server
 *   node e2e/lingua.mjs http://localhost:4173/Mytravellog
 */
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import fs from "node:fs";
const PROJ = "C:/Users/Stefano Merlini/Desktop/Steve/Git/Mytravellog-main";
const require = createRequire(pathToFileURL(`${PROJ}/package.json`).href);
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://localhost:8080/Mytravellog";
const argOut = process.argv.indexOf("--out");
const OUT = argOut > -1 ? process.argv[argOut + 1] : "e2e/__shots__/lingua";
fs.mkdirSync(OUT, { recursive: true });

/** Parole funzione italiane: se una di queste compare, la scritta è italiana.
 *  Scelte perché non esistono in inglese e non compaiono nei nomi di città.
 *
 *  ⚠️ Due lezioni pagate: **una spia che esiste anche in inglese** dà falsi
 *  positivi («marker size», «Tue», «come back» — per questo mancano `marker`,
 *  `tue` e `come`); e **una scritta senza nessuna spia dentro passa liscia** —
 *  «Rivivi il 2026 in 3D» è rimasto italiano per due giri perché nessuna delle
 *  parole qui sotto compariva. Da qui l'audit delle chiavi non usate: le due
 *  reti coprono buchi diversi. */
const SPIE = [
  "rivivi", "biglietto", "racconto", "compagni", "motivo", "valutazione",
  "avanti", "salta", "capito", "annulla", "conferma", "elimina", "eliminare",
  "viaggio", "viaggi", "gita", "gite", "città", "paese", "paesi", "giorni", "notti",
  "tappa", "tappe", "aggiungi", "cerca", "chiudi", "rimuovi", "apri", "salva",
  "nessun", "nessuna", "ancora", "adesso", "oppure", "anche", "quando",
  "della", "delle", "degli", "nella", "sulla", "dalla", "questo", "questa",
  "tuoi", "tuo", "tua", "sono", "essere", "perché", "più", "già",
  "programma", "organizzare", "prenotato", "prenotare", "condividi", "scegli",
  "impostazioni", "misura", "globo", "rotazione", "residenza", "viaggiatore",
];

const trip = (id, city, cc, lat, lon, d1, d2, over = {}) => ({
  id, created_at: "2024-01-01T00:00:00.000Z", title: city, country: city, country_code: cc, city,
  trip_date: d1, date_end: d2, rating: 4, notes: "A short note.", transport_mode: "plane",
  latitude: lat, longitude: lon, home_latitude: 51.5, home_longitude: -0.13, home_label: "London, UK",
  waypoints: [], route_geometry: null, temperature_c: 21, altitude_m: 40, max_altitude_m: 40,
  max_altitude_city: city, distance_from_home_km: 500, max_distance_from_home_km: 500,
  max_distance_city: city, hottest_temp_c: 21, hottest_city: city, coldest_temp_c: 5,
  coldest_city: city, region: null, region_details: null, ...over,
});
const TRIPS = [
  trip("t1", "Paris", "FR", 48.85, 2.35, "2026-05-01", "2026-05-06", {
    waypoints: [{ id: "w1", city: "Lyon", country: "France", country_code: "FR", transport_mode: "train", lat: 45.76, lon: 4.83 }],
    purpose: "Holiday", companions: ["Sam"],
    diary: [{ date: "2026-05-02", text: "Breakfast by the river.", highlight: true }],
  }),
  trip("t2", "Berlin", "DE", 52.52, 13.4, "2026-07-10", "2026-07-14"),
  trip("t3", "Oxford", "GB", 51.75, -1.26, "2026-04-29", "2026-04-29"),   // gita
];
const PLANS = [trip("p1", "Madrid", "ES", 40.42, -3.7, "2099-09-01", "2099-09-08", {
  status: "planned", checklist: [{ text: "Book hotel", done: true }],
})];

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-GB" });
const page = await ctx.newPage();
const errori = [];
page.on("pageerror", e => errori.push(String(e).slice(0, 130)));

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(([t, p]) => {
  localStorage.clear();
  localStorage.setItem("atlas.trips.v1", JSON.stringify(t));
  localStorage.setItem("atlas.plans.v1", JSON.stringify(p));
  localStorage.setItem("navta.welcome.dismissed", "1");
  localStorage.setItem("navta.globe_hint_seen", "1");
  localStorage.setItem("navta.temperature.estremo.v1", "x");
  [["home", 2], ["trips", 1], ["plans", 1], ["stats", 2], ["form", 1]]
    .forEach(([k, v]) => localStorage.setItem(`navta.tour.${k}.v${v}`, "1"));
  const d = new Date().toISOString(); const segna = {};
  [...t, ...p].forEach(x => { segna[x.id] = d; });
  localStorage.setItem("navta.dati.tentati.v1", JSON.stringify(segna));
  localStorage.setItem("navta.tracciati.tentati.v2", JSON.stringify(segna));
  // LINGUA INGLESE: è il punto di tutto il collaudo.
  localStorage.setItem("atlas.settings.v1", JSON.stringify({
    autoRotate: "off", lingua: "en", homeCity: { label: "London, UK", lat: 51.5, lon: -0.13 },
  }));
}, [TRIPS, PLANS]);

const PAGINE = [
  ["home", "#/"], ["miei-viaggi", "#/miei-viaggi"], ["statistiche", "#/statistiche"],
  ["in-programma", "#/in-programma"], ["nuovo-viaggio", "#/nuovo-viaggio"],
  ["importa-gpx", "#/importa-gpx"], ["impostazioni", "#/impostazioni"],
  ["recap", "#/recap"], ["editor-quadro", "#/editor-quadro"],
];

/**
 * ⚠️ COPERTURA: le rotte vere le dice il router, non questa lista.
 *
 * Un collaudo che dice «0» può voler dire due cose molto diverse: «tutto
 * pulito» oppure «non ho guardato niente». È già capitato — la vista a griglia
 * e il gate della città non venivano mai aperti, e il loro italiano è rimasto lì
 * per giri interi con la rete verde. Qui si legge `src/main.tsx` e si pretende
 * che ogni rotta dichiarata nel router compaia fra quelle visitate: se un domani
 * si aggiunge una pagina e nessuno aggiorna questo file, **il collaudo fallisce
 * invece di ignorarla in silenzio**.
 */
const rotteDelRouter = [...fs.readFileSync("src/main.tsx", "utf8")
  .matchAll(/<Route\s+path="([^"]+)"/g)].map(m => m[1])
  .filter(p => p !== "*" && !p.includes(":"));   // il 404 e le rotte con parametri hanno bisogno di dati, non di una lista
const visitate = PAGINE.map(([, hash]) => hash.replace("#", ""));
const nonVisitate = rotteDelRouter.filter(r => !visitate.includes(r));

const esito = {};

/**
 * Le CHIAVI del dizionario. Sono italiane per costruzione, quindi con l'app in
 * inglese **nessuna di esse deve comparire a schermo**: se c'è, da qualche parte
 * manca un `t()`.
 *
 * ⚠️ Questo controllo è nato da uno screenshot. Le spie qui sopra sono una
 * lista di PAROLE, e la lista non conteneva né «aereo» né «diario»: la pillola
 * del mezzo e il bottone del diario erano in italiano su ogni biglietto, e la
 * rete diceva `miei-viaggi: 0`. Questo invece non indovina niente — vale per
 * tutte le chiavi, comprese quelle che nasceranno domani.
 *
 * Cosa NON copre, dichiarato: le chiavi corte o ambigue (sotto i 5 caratteri, o
 * uguali in inglese) sono escluse per non dare falsi positivi sui nomi di
 * luogo; e il testo disegnato su CANVAS (il poster del recap) non sta in
 * `innerText`, quindi qui non si vede — quello lo guarda solo la rete
 * strutturale.
 */
const CHIAVI_ITALIANE = (() => {
  const righe = fs.readFileSync("src/lib/i18n/en.ts", "utf8").split(/\r?\n/);
  const fuori = [];
  for (let i = 0; i < righe.length; i++) {
    const m = righe[i].match(/^ {2}"((?:[^"\\]|\\.)*)":\s*(.*)$/);
    if (!m) continue;
    const chiave = JSON.parse('"' + m[1] + '"');
    const grezzo = m[2].trim() || (righe[i + 1] || "").trim();
    const v = grezzo.match(/^("(?:[^"\\]|\\.)*")/);
    if (!v) continue;
    const inglese = JSON.parse(v[1]);
    // Fuori le corte, quelle con segnaposto (a schermo arrivano riempite) e
    // quelle IDENTICHE in inglese (Africa, Asia, Bus…): non provano niente.
    if (chiave.length < 5 || chiave.includes("{") || chiave === inglese) continue;
    fuori.push(chiave);
  }
  return fuori;
})();

/** Cerca l'italiano rimasto: nel testo a schermo E nelle etichette invisibili
 *  (un aria-label italiano è un difetto per chi usa lo screen reader). */
// ⚠️ Un argomento solo: page.evaluate non ne accetta due.
const cerca = ({ spie, chiaviItaliane }) => {
    const testo = document.body.innerText;
    const righe = testo.split("\n").map(r => r.trim()).filter(Boolean);
    const sospette = [];
    for (const r of righe) {
      const basso = " " + r.toLowerCase().replace(/[^\p{L}\s]/gu, " ") + " ";
      if (spie.some(p => basso.includes(" " + p + " "))) sospette.push(r.slice(0, 90));
    }
    // anche le etichette invisibili: un aria-label italiano è un difetto
    const etichette = [...document.querySelectorAll("[aria-label],[title],[placeholder]")]
      .flatMap(e => [e.getAttribute("aria-label"), e.getAttribute("title"), e.getAttribute("placeholder")])
      .filter(Boolean);
    for (const e of etichette) {
      const basso = " " + e.toLowerCase().replace(/[^\p{L}\s]/gu, " ") + " ";
      if (spie.some(p => basso.includes(" " + p + " "))) sospette.push("[etichetta] " + e.slice(0, 80));
    }
    // Le chiavi italiane a schermo: niente euristica, confronto esatto.
    // ⚠️ A PAROLA INTERA. Con un `includes` nudo la chiave «automatica» risultava
    // a schermo perché la traduzione inglese di un'altra riga dice
    // «automatically» — dentro quella parola ci sta tutta. Il primo falso
    // positivo di questo controllo, trovato al primo giro.
    const tutto = testo + "\n" + etichette.join("\n");
    for (const k of chiaviItaliane) {
      const re = new RegExp("(?<![\\p{L}\\p{N}])" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\p{L}\\p{N}])", "u");
      if (re.test(tutto)) sospette.push("[chiave italiana a schermo] " + k.slice(0, 70));
    }
    return [...new Set(sospette)];
};

for (const [nome, hash] of PAGINE) {
  await page.goto(BASE + "/" + hash, { waitUntil: "load" });
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(nome === "home" ? 5000 : 2200);
  esito[nome] = await page.evaluate(cerca, { spie: SPIE, chiaviItaliane: CHIAVI_ITALIANE });
  await page.screenshot({ path: `${OUT}/${nome}.png`, fullPage: nome !== "home" });
}

/**
 * Le schermate che si aprono SOLO con un'interazione: diario, pannello del
 * piano, tutorial, menu del biglietto, ricerca delle tappe, poster 3D, stories.
 * Il collaudo delle pagine non le vedeva, ed è lì che si nasconde l'italiano
 * dimenticato — ogni pannello ha le sue scritte.
 *
 * ⚠️ I bersagli si cercano con le etichette INGLESI (l'app è in inglese in
 * questo collaudo): se una traduzione manca, il passo non trova il bottone e
 * lo dice, invece di passare in silenzio. È un secondo controllo gratuito.
 */
const INTERAZIONI = [
  ["diario", "#/miei-viaggi", async () => {
    await page.getByRole("button", { name: /Open the diary|Open the trip diary/i }).first().click();
  }],
  ["pannello_del_piano", "#/in-programma", async () => {
    await page.getByText("Madrid", { exact: false }).first().click();
  }],
  ["menu_del_biglietto", "#/miei-viaggi", async () => {
    await page.getByRole("button", { name: /Trip actions/i }).first().click();
  }],
  // Le due superfici nate col modello a schede (2026-08-26). La scheda «Gite»
  // ha scritte sue (la riga che spiega cosa sono, lo stato vuoto), e il form in
  // modo gita cambia tre etichette: senza aprirli, la rete direbbe zero su
  // roba che non ha guardato.
  ["scheda_gite", "#/miei-viaggi", async () => {
    await page.getByRole("tab", { name: /Day trips/i }).click();
  }],
  ["nuova_gita", "#/nuovo-viaggio?gita=1", async () => { /* la pagina è già lo stato */ }],
  ["aggiungi_tappa", "#/nuovo-viaggio", async () => {
    await page.getByRole("button", { name: /\+ Add stop/i }).first().click();
  }],
  ["tutorial", "#/", async () => {
    await page.evaluate(() => window.dispatchEvent(new Event("navta:tour-replay")));
  }],
  ["poster_3d", "#/miei-viaggi", async () => {
    await page.getByRole("button", { name: /The map of my life/i }).first().click();
  }],
  ["stories", "#/recap", async () => {
    await page.getByRole("button", { name: /Play as stories/i }).first().click();
  }],
];

for (const [nome, hash, azione] of INTERAZIONI) {
  await page.goto(BASE + "/" + hash, { waitUntil: "load" });
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2500);
  try {
    await azione();
  } catch (e) {
    // Bersaglio non raggiunto: quasi sempre vuol dire che l'etichetta inglese
    // NON esiste (traduzione mancante) o che il flusso è cambiato. Va detto,
    // non ingoiato: un passo saltato in silenzio è un collaudo che mente.
    esito[nome] = [`⚠️ passo non eseguito: ${String(e).slice(0, 110)}`];
    continue;
  }
  await page.waitForTimeout(2200);
  esito[nome] = await page.evaluate(cerca, { spie: SPIE, chiaviItaliane: CHIAVI_ITALIANE });
  await page.screenshot({ path: `${OUT}/int-${nome}.png` });
}

/**
 * TERZO PASSAGGIO: **gli stati che il seed nasconde.**
 *
 * ⚠️ Questa è la lezione più grossa di tutto il lavoro sulla lingua. Il seed
 * qui sopra riempie l'archivio, congeda il cancello di benvenuto, mette la
 * città di casa e segna il tutorial come visto — cioè fa esattamente quello che
 * serve per vedere l'app "normale", e così **rende irraggiungibili** la
 * schermata vuota, il cancello, il gate della città e il 404. Sedici superfici
 * verdi, e in quegli stati stavano scritte mai tradotte.
 *
 * Il seed non è sbagliato: è che **un seed è una scelta, e ogni scelta nasconde
 * il suo opposto**. La risposta non è un seed più furbo, sono due passaggi.
 *
 * Ogni stato dichiara anche una scritta inglese che DEVE esserci: senza quella,
 * una pagina che non si carica affatto darebbe "0 italiano" — il modo più
 * classico di essere verdi senza aver guardato niente.
 */
const STATI_NASCOSTI = [
  ["vuoto_home", "#/", { vuoto: true }, "Add your first trip"],
  ["vuoto_miei-viaggi", "#/miei-viaggi", { vuoto: true }, "No trips yet"],
  ["vuoto_editor-quadro", "#/editor-quadro", { vuoto: true }, "New trip"],
  // ⚠️ `vuoto` serve: il cancello compare solo su un dispositivo vergine, e
  // `shouldShowWelcome` guarda `loadTrips().length === 0`. Con i viaggi in casa
  // lo stato non si raggiunge — e senza la scritta pretesa qui sotto avrei
  // avuto un bel «0 italiano» su una schermata che non era quella.
  ["benvenuto", "#/", { vuoto: true, benvenuto: true }, "Continue as guest"],
  ["gate_citta", "#/", { senzaCasa: true }, "Where do you set off from?"],
  ["pagina_inesistente", "#/una-rotta-che-non-esiste", {}, "Page not found"],
];

for (const [nome, hash, stato, atteso] of STATI_NASCOSTI) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(([t, p, s]) => {
    localStorage.clear();
    if (!s.vuoto) {
      localStorage.setItem("atlas.trips.v1", JSON.stringify(t));
      localStorage.setItem("atlas.plans.v1", JSON.stringify(p));
    }
    if (!s.benvenuto) localStorage.setItem("navta.welcome.dismissed", "1");
    localStorage.setItem("navta.globe_hint_seen", "1");
    [["home", 2], ["trips", 1], ["plans", 1], ["stats", 2], ["form", 1]]
      .forEach(([k, v]) => localStorage.setItem(`navta.tour.${k}.v${v}`, "1"));
    localStorage.setItem("atlas.settings.v1", JSON.stringify({
      autoRotate: "off", lingua: "en",
      ...(s.senzaCasa ? {} : { homeCity: { label: "London, UK", lat: 51.5, lon: -0.13 } }),
    }));
  }, [TRIPS, PLANS, stato]);

  await page.goto(BASE + "/" + hash, { waitUntil: "load" });
  // ⚠️ Il reload NON è di troppo: cambiare solo la parte dopo il `#` non
  // ricarica il documento, quindi l'app resterebbe quella montata PRIMA di
  // seminare — e gli stati che dipendono dallo storage al mount (il cancello di
  // benvenuto, il gate della città) non si presentano. In locale passava per
  // caso; sul sito deployato no, ed è così che l'ho scoperto. Le altre due
  // scansioni di questo file il reload lo fanno già.
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(hash === "#/" ? 4200 : 2200);
  const trovate = await page.evaluate(cerca, { spie: SPIE, chiaviItaliane: CHIAVI_ITALIANE });
  const ceProva = await page.evaluate(a => document.body.innerText.includes(a), atteso);
  esito[nome] = ceProva ? trovate : [`⚠️ stato non raggiunto: manca «${atteso}» a schermo`, ...trovate];
  await page.screenshot({ path: `${OUT}/stato-${nome}.png`, fullPage: hash !== "#/" });
}

await browser.close();

/**
 * SECONDA RETE: le chiavi del dizionario che nessun `t()` usa.
 *
 * Serve perché la ricerca delle parole-spia ha un buco per costruzione: una
 * scritta italiana che non contiene nessuna spia passa liscia. È così che
 * «Rivivi il {anno} in 3D» e «Apri il biglietto di {viaggio}» sono rimasti
 * italiani per due giri — la chiave c'era, il `t()` no. Una chiave inutilizzata
 * è quasi sempre questo: una traduzione scritta e mai collegata.
 */
const dizionario = fs.readFileSync("src/lib/i18n/en.ts", "utf8");
const eolDiz = dizionario.includes("\r\n") ? "\r\n" : "\n";
const chiavi = [];
for (const r of dizionario.split(eolDiz)) {
  const m = r.match(/^ {2}"((?:[^"\\]|\\.)*)":/);
  if (m) chiavi.push(m[1]);
}
const sorgenti = fs.readdirSync("src", { recursive: true })
  .filter(f => /\.(ts|tsx)$/.test(String(f)) && !String(f).endsWith("en.ts"))
  .map(f => fs.readFileSync(`src/${f}`, "utf8")).join("\n");
/**
 * ⚠️ La chiave va cercata **delimitata da apici**, non come sottostringa nuda.
 * Prima bastava che le parole comparissero da qualche parte nei sorgenti, e la
 * chiave «Programma» risultava usata perché quelle nove lettere stanno dentro
 * l'identificatore `InProgramma`. Era orfana, la rete diceva di no, e tirando
 * quel filo sono venute fuori 60 scritte mai tradotte.
 *
 * Tre forme perché il codice ne usa tre: `t("…")`, `t('…')` e i template.
 */
const usata = (k) => {
  const scappata = JSON.stringify(k).slice(1, -1);
  return [k, scappata].some(v =>
    sorgenti.includes(`"${v}"`) || sorgenti.includes(`'${v}'`) || sorgenti.includes("`" + v + "`"));
};
const orfane = chiavi.filter(k => !usata(k));
if (orfane.length) esito["chiavi_senza_uso"] = orfane.map(k => `[chiave orfana] ${k.slice(0, 70)}`);

fs.writeFileSync(`${OUT}/lingua.json`, JSON.stringify(esito, null, 2));
const rimaste = Object.values(esito).reduce((n, v) => n + v.length, 0);
for (const [nome, v] of Object.entries(esito)) {
  console.log(`${v.length === 0 ? "✅" : "⚠️ "} ${nome}: ${v.length}`);
  v.slice(0, 6).forEach(r => console.log(`      ${r}`));
  if (v.length > 6) console.log(`      …e altre ${v.length - 6}`);
}
// COSA HO GUARDATO: si stampa sempre, così uno "0" non si può confondere con
// "non ho aperto niente". I numeri sono la differenza fra una rete verde e una
// rete cieca.
console.log(`\nsuperfici guardate: ${Object.keys(esito).length}`
  + ` (${PAGINE.length} pagine + ${INTERAZIONI.length} interazioni + ${STATI_NASCOSTI.length} stati nascosti)`);
console.log(`rotte nel router: ${rotteDelRouter.length}, tutte visitate: ${nonVisitate.length === 0 ? "sì" : "NO"}`);
console.log(`scritte italiane rimaste in inglese: ${rimaste}`);
console.log(errori.length ? `errori JS: ${JSON.stringify(errori)}` : "nessun errore JS");

if (nonVisitate.length) {
  console.log(`\n⚠️  ROTTE MAI APERTE: ${nonVisitate.join(", ")}`);
  console.log("   Il collaudo NON può dire niente su queste pagine: aggiungile a PAGINE.");
}
process.exit(rimaste === 0 && nonVisitate.length === 0 ? 0 : 1);
