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
 *  Scelte perché non esistono in inglese e non compaiono nei nomi di città. */
const SPIE = [
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

const esito = {};

/** Cerca l'italiano rimasto: nel testo a schermo E nelle etichette invisibili
 *  (un aria-label italiano è un difetto per chi usa lo screen reader). */
const cerca = (spie) => {
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
    return [...new Set(sospette)];
};

for (const [nome, hash] of PAGINE) {
  await page.goto(BASE + "/" + hash, { waitUntil: "load" });
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(nome === "home" ? 5000 : 2200);
  esito[nome] = await page.evaluate(cerca, SPIE);
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
  esito[nome] = await page.evaluate(cerca, SPIE);
  await page.screenshot({ path: `${OUT}/int-${nome}.png` });
}

await browser.close();
fs.writeFileSync(`${OUT}/lingua.json`, JSON.stringify(esito, null, 2));
const rimaste = Object.values(esito).reduce((n, v) => n + v.length, 0);
for (const [nome, v] of Object.entries(esito)) {
  console.log(`${v.length === 0 ? "✅" : "⚠️ "} ${nome}: ${v.length}`);
  v.slice(0, 6).forEach(r => console.log(`      ${r}`));
  if (v.length > 6) console.log(`      …e altre ${v.length - 6}`);
}
console.log(`\nscritte italiane rimaste in inglese: ${rimaste}`);
console.log(errori.length ? `errori JS: ${JSON.stringify(errori)}` : "nessun errore JS");
process.exit(rimaste === 0 ? 0 : 1);
