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
  ["home", "trips", "plans", "stats"].forEach(k => localStorage.setItem(`navta.tour.${k}.v1`, "1"));
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

const visita = async (nome, hash, attese) => {
  errori = [];
  await page.goto("http://localhost:8080/" + hash, { waitUntil: "load" });
  await page.waitForTimeout(nome === "home" ? 6000 : 2600);
  const testo = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: `${OUT}/${nome}.png`, fullPage: nome !== "home" });
  esito[nome] = {
    mostra: Object.fromEntries(attese.map(a => [a, testo.toLowerCase().includes(a.toLowerCase())])),
    errori: puliti(),
  };
};

await visita("home", "#/", ["NAV·TA"]);
await visita("miei-viaggi", "#/miei-viaggi", ["IN PROGRAMMA", "Barcellona", "Roma", "Diario", "Vacanza", "Da prenotare"]);
await visita("statistiche", "#/statistiche", ["Highlights di viaggio", "Distanze", "Anni e mesi"]);
await visita("in-programma", "#/in-programma", ["Barcellona", "DA ORGANIZZARE", "Da prenotare"]);
await visita("nuovo-viaggio", "#/nuovo-viaggio", ["Itinerario", "Periodo", "Valutazione", "Compagni"]);
await visita("importa-gpx", "#/importa-gpx", ["Importa da GPX"]);
await visita("impostazioni", "#/impostazioni", ["Unità di misura", "Account"]);
// Il recap disegna tutto su canvas: dal DOM si vedono solo i suoi pulsanti.
await visita("recap", "#/recap", ["Condividi il recap", "Riproduci"]);
await visita("editor-quadro", "#/editor-quadro", ["Disponi", "Inquadra"]);

// ── Interazioni chiave ──────────────────────────────────────────────────────
errori = [];
await page.goto("http://localhost:8080/#/miei-viaggi", { waitUntil: "load" });
await page.waitForTimeout(2600);

const prova = async (nome, apri, verifica) => {
  await apri();
  await page.waitForTimeout(1100);
  esito[nome] = { ...(await verifica()), errori: puliti() };
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
};

// La spunta "prenotato" ha preso il posto delle spese: un tocco cambia stato
// e SALVA subito nel piano, senza aprire nessun pannello.
await prova("spunta_prenotato",
  () => page.getByRole("button", { name: /Da prenotare/i }).first().click(),
  async () => ({
    diventaPrenotato: await page.evaluate(() => /Prenotato/.test(document.body.innerText)),
    salvato: await page.evaluate(() => (localStorage.getItem("atlas.plans.v1") || "").includes('"booked":true')),
  }));

await prova("apre_diario",
  () => page.getByRole("button", { name: /Apri il diario/i }).first().click(),
  async () => ({ pannello: await page.evaluate(() => /diario di bordo|Colazione/.test(document.body.innerText)) }));

await prova("apre_piano",
  () => page.getByRole("button", { name: /Barcellona/i }).first().click(),
  async () => ({ pannello: await page.evaluate(() => /organizzare/i.test(document.body.innerText)) }));

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
const problemi = Object.entries(esito).filter(([, v]) =>
  (v.errori?.length ?? 0) > 0 ||
  Object.entries(v).some(([k, x]) => k !== "errori" && x === false) ||
  Object.values(v.mostra ?? {}).some(x => x === false));
console.log(JSON.stringify(esito, null, 2));
console.log(problemi.length ? "\n⚠️  DA GUARDARE: " + problemi.map(p => p[0]).join(", ") : "\n✅ tutto a posto");
