import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import fs from "node:fs";
const PROJ = "C:/Users/Stefano Merlini/Desktop/Steve/Git/Mytravellog-main";
const require = createRequire(pathToFileURL(`${PROJ}/package.json`).href);
const { chromium } = require("playwright");
const argOut = process.argv.indexOf("--out");
const OUT = argOut > -1 ? process.argv[argOut + 1] : "e2e/__shots__/collaudo";
fs.mkdirSync(OUT, { recursive: true });

const mk = (o) => ({
  created_at: "2026-01-01T00:00:00.000Z", country: "Italia", country_code: "IT",
  notes: null, transport_mode: "plane", waypoints: [], rating: 4,
  home_latitude: 45.46, home_longitude: 9.19, home_label: "Milano, Italia",
  temperature_c: 24, altitude_m: 120, distance_from_home_km: 600,
  max_distance_from_home_km: 600, max_distance_city: o.city, ...o,
});

const TRIPS = [
  mk({ id: "v1", title: "Roma", city: "Roma", trip_date: "2025-05-10", date_end: "2025-05-14",
    latitude: 41.9, longitude: 12.49, transport_mode: "car", purpose: "Vacanza", companions: ["Giulia"],
    notes: "Un weekend lungo, camminato tantissimo.",
    diary: [{ date: "2025-05-11", text: "Colazione al Pantheon.", highlight: true }],
    budget: [{ label: "Viaggio", amount: 300, paid: 280 }, { label: "Alloggio", amount: 400, paid: 350 }] }),
  mk({ id: "v2", title: "Giro dell'Est", city: "Vienna", country: "Austria", country_code: "AT",
    trip_date: "2026-03-02", date_end: "2026-03-09", latitude: 48.21, longitude: 16.37, transport_mode: "train",
    waypoints: [{ id: "w1", city: "Innsbruck", country: "Austria", country_code: "AT", transport_mode: "car", lat: 47.27, lon: 11.39 }] }),
  // ⚠️ Una GITA in giornata. Senza di lei la scheda «Gite» di "I miei viaggi"
  // non compare mai e il collaudo non può dire niente su metà della pagina —
  // la stessa dimenticanza che aveva tenuto nascosta per giorni la sezione
  // gite messa sopra i filtri: quella schermata non l'aveva vista nessuno.
  mk({ id: "g1", title: "Como", city: "Como", trip_date: "2025-11-14", date_end: "2025-11-14",
    latitude: 45.81, longitude: 9.08, transport_mode: "car" }),
];
const PLANS = [
  mk({ id: "p1", title: "Barcellona", city: "Barcellona", country: "Spagna", country_code: "ES",
    status: "planned", trip_date: "2026-09-01", date_end: "2026-09-08", latitude: 41.39, longitude: 2.15,
    budget: [{ label: "Volo", amount: 400, paid: 240 }], checklist: [{ text: "Hotel", done: true }, { text: "Museo", done: false }] }),
];

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

let errori = [];
page.on("pageerror", e => errori.push("CRASH: " + String(e).slice(0, 140)));
page.on("console", m => { if (m.type() === "error") errori.push(m.text().slice(0, 140)); });
const puliti = () => errori.filter(e => !/createRoot|DevTools|favicon|maptiler|flagcdn|Failed to load resource/i.test(e));

await page.goto("http://localhost:8080", { waitUntil: "domcontentloaded" });
await page.evaluate(([t, p]) => {
  localStorage.setItem("atlas.trips.v1", JSON.stringify(t));
  localStorage.setItem("atlas.plans.v1", JSON.stringify(p));
  localStorage.setItem("navta.welcome.dismissed", "1");
  // Le VERSIONI devono combaciare con SECTIONS in AppTour.tsx: a ogni bump lì
  // va aggiornata la coppia qui (e in verify-home), o la scheda copre i click.
  [["home", 2], ["trips", 1], ["plans", 1], ["stats", 2], ["form", 1]]
    .forEach(([k, v]) => localStorage.setItem(`navta.tour.${k}.v${v}`, "1"));
  localStorage.setItem("navta.globe_hint_seen", "1");
  // La citta' di casa e' obbligatoria: senza, il gate sbarra tutto (ed e'
  // giusto cosi') e il collaudo non arriverebbe da nessuna parte.
  localStorage.setItem("atlas.settings.v1", JSON.stringify({ autoRotate: "off", homeCity: { label: "Milano, Italia", lat: 45.46, lon: 9.19 } }));
}, [TRIPS, PLANS]);
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2000);

const esito = {};
// I budget nel seed sono VOLUTI: l'app li cancella all'avvio (dropBudgetData),
// quindi qui si verifica che nessun importo sopravviva a schermo.

/**
 * Aspetta che una condizione diventi vera, non che passi del tempo.
 *
 * ⚠️ Perché esiste: prima ogni pagina aspettava 2600 ms fissi e POI leggeva il
 * testo. Su una macchina occupata quel tempo a volte non bastava e lo script
 * diceva `DA GUARDARE: miei-viaggi, statistiche` su un'app perfettamente sana
 * (visto il 2026-08-24; rilanciato sullo stesso codice: tutto verde). Un
 * collaudo che grida al lupo insegna a ignorarlo, che è il modo in cui un
 * allarme vero passa inosservato.
 *
 * Ritorna l'ultimo valore letto: se scade, quello è il valore da registrare —
 * cioè il difetto vero, non un timeout mascherato.
 */
const attendi = async (leggi, ok, msMax = 12000, passo = 200) => {
  const scadenza = Date.now() + msMax;
  let ultimo = await leggi();
  while (!ok(ultimo) && Date.now() < scadenza) {
    await page.waitForTimeout(passo);
    ultimo = await leggi();
  }
  return ultimo;
};

const tutteVere = (o) => Object.values(o).every(Boolean);

const visita = async (nome, hash, attese) => {
  errori = [];
  await page.goto("http://localhost:8080/" + hash, { waitUntil: "load" });
  // Il pavimento resta: la Home deve caricare il globo, e gli errori di console
  // arrivano DOPO che il testo è a schermo (una fetch che parte al mount).
  // Senza questa attesa minima il collaudo diventa più veloce e più cieco.
  await page.waitForTimeout(nome === "home" ? 6000 : 900);
  const mostra = await attendi(
    async () => {
      const testo = await page.evaluate(() => document.body.innerText.toLowerCase());
      return Object.fromEntries(attese.map(a => [a, testo.includes(a.toLowerCase())]));
    },
    tutteVere,
  );
  await page.waitForTimeout(500);   // grazia per gli errori che arrivano in coda
  await page.screenshot({ path: `${OUT}/${nome}.png`, fullPage: nome !== "home" });
  esito[nome] = { mostra, errori: puliti() };
};

await visita("home", "#/", ["NAV·TA"]);
// Le due schede: la pagina si apre sui VIAGGI, con la gita non a schermo.
await visita("miei-viaggi", "#/miei-viaggi", ["1 in programma", "Viaggi", "Gite", "Roma", "Diario", "Vacanza"]);
// Il form in modo gita: una data sola, e lo dice.
await visita("nuova-gita", "#/nuovo-viaggio?gita=1", ["Giorno", "Nome della gita", "Salva gita"]);
await visita("statistiche", "#/statistiche", ["Highlights di viaggio", "Distanze", "Quando viaggi", "Come viaggi"]);
await visita("in-programma", "#/in-programma", ["Barcellona", "DA ORGANIZZARE", "Da prenotare"]);
await visita("nuovo-viaggio", "#/nuovo-viaggio", ["Itinerario", "Periodo", "Valutazione", "Compagni"]);
await visita("importa-gpx", "#/importa-gpx", ["Importa da GPX"]);
await visita("impostazioni", "#/impostazioni", ["Unità di misura", "Account"]);
// Il recap disegna tutto su canvas: dal DOM si vedono solo i suoi pulsanti.
await visita("recap", "#/recap", ["Condividi il recap", "Riproduci"]);
await visita("editor-quadro", "#/editor-quadro", ["Disponi", "Inquadra"]);

// ── Interazioni chiave ──────────────────────────────────────────────────────
const prova = async (nome, apri, verifica) => {
  await apri();
  // Come sopra: si aspetta che il pannello ci sia, non 1100 ms sperando.
  const esitoProva = await attendi(verifica, tutteVere, 8000);
  esito[nome] = { ...esitoProva, errori: puliti() };
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
};

// ── I piani: si toccano in "In programma", non più in "I miei viaggi" ──────
await page.goto("http://localhost:8080/#/in-programma", { waitUntil: "load" });
await page.waitForTimeout(1600);
errori = [];

// La spunta "prenotato" ha preso il posto delle spese: un tocco cambia stato
// e SALVA subito nel piano, senza aprire nessun pannello.
await prova("spunta_prenotato",
  () => page.getByRole("button", { name: /Da prenotare/i }).first().click(),
  async () => ({
    diventaPrenotato: await page.evaluate(() => /Prenotato/.test(document.body.innerText)),
    salvato: await page.evaluate(() => (localStorage.getItem("atlas.plans.v1") || "").includes('"booked":true')),
  }));

await prova("apre_piano",
  () => page.getByRole("button", { name: /Barcellona/i }).first().click(),
  async () => ({ pannello: await page.evaluate(() => /organizzare/i.test(document.body.innerText)) }));

// ── Di nuovo sul diario, per il resto delle interazioni ────────────────────
// ⚠️ 2600 e non 1600: è il valore su cui questa pagina era stata TARATA quando
// il collaudo era intermittente. Abbassarlo non fa guadagnare niente di utile.
await page.goto("http://localhost:8080/#/miei-viaggi", { waitUntil: "load" });
await page.waitForTimeout(2600);
errori = [];

await prova("apre_diario",
  () => page.getByRole("button", { name: /Apri il diario/i }).first().click(),
  async () => ({ pannello: await page.evaluate(() => /diario di bordo|Colazione/.test(document.body.innerText)) }));

// La scheda delle gite: Como c'è, Roma no. La separazione È il punto della
// scelta di Stefano («non credo vadano trattate come veri e propri viaggi»): se
// un domani l'elenco ripartisse da `trips` grezzo invece che da `separaGite`,
// cade qui.
// ⚠️ DOPO il diario, non prima: `prova` chiude con Esc, che non riporta sulla
// scheda dei viaggi — e lì il bottone «Diario» sarebbe quello di Como, che non
// ha nessuna pagina scritta. Messo prima, il passo del diario falliva additando
// l'app, che era sana.
await prova("scheda_gite",
  () => page.getByRole("tab", { name: /Gite/ }).click(),
  async () => ({
    mostra_como: await page.evaluate(() => /Como/.test(document.body.innerText)),
    nasconde_roma: await page.evaluate(() => !/Roma/.test(document.body.innerText)),
  }));

await prova("mappa_della_vita",
  () => page.getByRole("button", { name: /mappa della mia vita/i }).click(),
  async () => ({ aperta: await page.evaluate(() => !!document.querySelector("canvas.maplibregl-canvas")) }));

// I budget del seed devono essere stati cancellati da dropBudgetData:
// nessun importo a schermo e nessuna traccia nello storage.
// NB polarità: qui OGNI chiave vale "true = va bene", come nel resto del file.
// La prima versione aveva `restaNelloStorage` (true = ROTTO) e una regex senza
// backslash (/€s?d/), che non poteva fallire mai: due verifiche finte.
esito.budgetCancellati = {
  nessunImporto: await page.evaluate(() => !/€\s?\d/.test(document.body.innerText)),
  nessunResiduoNelloStorage: await page.evaluate(() =>
    !((localStorage.getItem("atlas.trips.v1") || "") + (localStorage.getItem("atlas.plans.v1") || "")).includes("budget")),
};

await browser.close();
fs.writeFileSync(`${OUT}/collaudo.json`, JSON.stringify(esito, null, 2));
// Regola del filtro: QUALUNQUE booleano falso è un problema. Prima erano
// elencate a mano solo `mostra`/`pannello`/`aperta`, quindi ogni verifica
// nuova (la spunta, i budget cancellati) veniva raccolta e poi ignorata: lo
// script diceva "tutto a posto" anche con la spunta rotta.
// ...e la riga finale dice COSA è falso, non solo dove. Prima nominava solo la
// pagina, quindi per sapere quale controllo fosse caduto bisognava rilanciare —
// e il rilancio SOVRASCRIVE questo JSON, cioè si finiva a esaminare un giro
// diverso da quello che aveva segnalato (mi è costato una diagnosi buttata).
const guasti = (v) => [
  ...Object.entries(v).filter(([k, x]) => k !== "errori" && x === false).map(([k]) => k),
  ...Object.entries(v.mostra ?? {}).filter(([, x]) => x === false).map(([k]) => `manca "${k}"`),
  ...(v.errori ?? []).map(e => `errore: ${e.slice(0, 60)}`),
];
const problemi = Object.entries(esito)
  .map(([nome, v]) => [nome, guasti(v)])
  .filter(([, g]) => g.length > 0);
console.log(JSON.stringify(esito, null, 2));
console.log(problemi.length
  ? "\n⚠️  DA GUARDARE:\n" + problemi.map(([n, g]) => `   ${n}: ${g.join(" · ")}`).join("\n")
  : "\n✅ tutto a posto");
