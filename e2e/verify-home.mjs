/**
 * Verifica dal vivo della Home (globo + stelle), con un browser vero.
 *
 * Perché esiste: il browser integrato e l'estensione Chrome smettono di
 * disegnare quando la finestra è minimizzata o in secondo piano (il sistema
 * sospende i frame), e MapLibre non arriva mai a caricare il globo. Playwright
 * invece renderizza sempre, quindi la verifica si può fare in autonomia e
 * soprattutto RIPETERE identica dopo ogni modifica.
 *
 *   npm run verify:home                      (il dev server deve essere già avviato)
 *   npm run verify:home -- --headed          apre una finestra vera: si vede il giro in diretta
 *   npm run verify:home -- --headed --slow 400   rallenta ogni gesto (ms), per seguirlo a occhio
 *   npm run verify:home -- --video           registra un filmato della sessione
 *   npm run verify:home -- --out ./tmp-shot
 *
 * Misura i re-render di React installando un finto hook dei DevTools prima del
 * caricamento della pagina: è il modo per distinguere "l'app ridisegna" da
 * "l'app ricalcola tutto l'albero".
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const arg = name => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const OUT = arg("--out") ?? "e2e/__shots__";
const HEADED = process.argv.includes("--headed");
const VIDEO = process.argv.includes("--video");
const SLOW = Number(arg("--slow") ?? (HEADED ? 250 : 0));
const BASE = process.env.BASE_URL ?? "http://localhost:8080";
fs.mkdirSync(OUT, { recursive: true });

const trip = (id, title, city, date, dateEnd, lat, lon, extra = {}) => ({
  id, created_at: "2026-01-01T00:00:00.000Z", title, city, country: "Italia",
  country_code: "IT", trip_date: date, date_end: dateEnd, latitude: lat, longitude: lon,
  notes: null, transport_mode: "car", waypoints: [], rating: 4,
  home_latitude: 45.46, home_longitude: 9.19, home_label: "Milano, Italia", ...extra,
});

// La destinazione del viaggio "secco" è in aperta campagna di proposito: su una
// città del dataset il tap colpirebbe ANCHE il marker città (bersaglio ambiguo).
const DEST = { lat: 44.1, lon: 10.4 };
const TRIPS = [
  trip("e2e-secco", "Casale", "Casale", "2025-05-10", "2025-05-14", DEST.lat, DEST.lon),
  trip("e2e-multi", "Giro Est", "Vienna", "2026-03-02", "2026-03-09", 48.21, 16.37, {
    transport_mode: "train",
    waypoints: [
      { id: "w1", city: "Innsbruck", country: "Austria", country_code: "AT", transport_mode: "car", lat: 47.27, lon: 11.39 },
      { id: "w2", city: "Salisburgo", country: "Austria", country_code: "AT", transport_mode: "train", lat: 47.81, lon: 13.05 },
    ],
  }),
  trip("e2e-terzo", "Napoli", "Napoli", "2026-06-01", null, 40.85, 14.27),
];

const COUNT_RENDERS = `
window.__commits = 0;
window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
  supportsFiber: true, renderers: new Map(), _id: 0,
  inject(r) { this._id++; this.renderers.set(this._id, r); return this._id; },
  onCommitFiberRoot() { window.__commits++; },
  onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, checkDCE() {},
};`;

/** Espone window.__map risalendo il fiber di WorldMap (mapRef è interno). */
const GRAB_MAP = () => {
  const el = document.querySelector(".maplibregl-map");
  if (!el) return false;
  let node = el, fk = null, i = 0;
  while (node && !fk && i < 6) {
    fk = Object.keys(node).find(k => k.startsWith("__reactFiber$"));
    if (!fk) { node = node.parentElement; i++; }
  }
  if (!fk) return false;
  let f = node[fk];
  while (f && !(typeof f.type === "function" && f.type.name === "WorldMap")) f = f.return;
  if (!f) return false;
  let h = f.memoizedState, map = null, j = 0;
  while (h && j < 200) {
    const s = h.memoizedState;
    if (s && typeof s === "object" && s.current && typeof s.current.getLayer === "function") { map = s.current; break; }
    h = h.next; j++;
  }
  if (!map || !map.getSource("trips-labels")) return false;
  window.__map = map;
  return true;
};

const browser = await chromium.launch({
  headless: !HEADED,
  slowMo: SLOW,
  // WebGL via rasterizzazione software: senza questi flag il globo non parte.
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

const report = {};

async function run(viewport, tag) {
  const ctx = await browser.newContext({
    viewport, deviceScaleFactor: 1,
    ...(VIDEO ? { recordVideo: { dir: path.join(OUT, "video"), size: viewport } } : {}),
  });
  await ctx.addInitScript(COUNT_RENDERS);
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  page.on("pageerror", e => errors.push("PAGEERROR: " + String(e).slice(0, 160)));

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(t => {
    localStorage.setItem("atlas.trips.v1", JSON.stringify(t));
    localStorage.setItem("navta.welcome.dismissed", "1");
    // Versioni allineate a SECTIONS in AppTour.tsx (come in collaudo.mjs).
    [["home", 2], ["trips", 1], ["plans", 1], ["stats", 2], ["form", 1]]
      .forEach(([k, v]) => localStorage.setItem(`navta.tour.${k}.v${v}`, "1"));
    localStorage.setItem("navta.globe_hint_seen", "1");
    // Rotazione ferma: altrimenti il bersaglio si sposta tra il calcolo e il tap.
    // Anche la città di casa: è obbligatoria, e senza il gate coprirebbe la
    // Home — i tap non arriverebbero mai al globo e la misura sarebbe falsa.
    localStorage.setItem("atlas.settings.v1", JSON.stringify({
      autoRotate: "off", homeCity: { label: "Milano, Italia", lat: 45.46, lon: 9.19 },
    }));
  }, TRIPS);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(GRAB_MAP, null, { timeout: 60000 });
  await page.waitForTimeout(2500);

  report[`${tag}.layer`] = await page.evaluate(() =>
    Object.keys(window.__map.style._layers).filter(id => /^(trips-|route-)/.test(id)));
  await page.screenshot({ path: path.join(OUT, `${tag}-1-home.png`) });

  // Movimento del puntatore e trascinamento: quanti re-render costano?
  const box = await page.locator(".maplibregl-canvas").boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const before = await page.evaluate(() => window.__commits);
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 60; i++) await page.mouse.move(cx + i * 2, cy + Math.sin(i / 5) * 40);
  await page.waitForTimeout(400);
  report[`${tag}.renderPer60Movimenti`] = (await page.evaluate(() => window.__commits)) - before;

  const beforeDrag = await page.evaluate(() => window.__commits);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 40; i++) await page.mouse.move(cx + i * 3, cy + i);
  await page.mouse.up();
  await page.waitForTimeout(600);
  report[`${tag}.renderPer40Trascinamenti`] = (await page.evaluate(() => window.__commits)) - beforeDrag;

  // Tap sul pallino: deve solo ritoccare, non ricostruire i layer.
  await page.evaluate(d => window.__map.jumpTo({ center: [d.lon, d.lat], zoom: 4 }), DEST);
  await page.waitForTimeout(2500);
  const pt = await page.evaluate(d => {
    const m = window.__map;
    const p = m.project([d.lon, d.lat]);
    const r = document.querySelector(".maplibregl-canvas").getBoundingClientRect();
    window.__touched = [];
    const add = m.addSource.bind(m), rem = m.removeSource.bind(m);
    m.addSource = (id, s) => { window.__touched.push("add:" + id); return add(id, s); };
    m.removeSource = id => { window.__touched.push("remove:" + id); return rem(id); };
    return { x: r.left + p.x, y: r.top + p.y };
  }, DEST);
  await page.mouse.click(pt.x, pt.y);
  // Il tap innesca un flyTo: leggere prima che la mappa si fermi darebbe
  // etichette "non ancora disegnate" e un esito ballerino.
  await page.waitForFunction(() => window.__map && !window.__map.isMoving(), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);

  report[`${tag}.dopoIlTap`] = await page.evaluate(() => {
    const m = window.__map;
    return {
      sorgentiToccate: window.__touched,
      rottaDelViaggio: !!m.getLayer("route-e2e-secco"),
      rottaMultiTappaIntatta: !!m.getLayer("route-e2e-multi"),
      etichetteASchermo: m.queryRenderedFeatures({ layers: ["trips-labels"] }).map(f => f.properties.name),
      miniCard: document.body.innerText.includes("Rivivi in 3D"),
      popupCittaIndesiderato: document.body.innerText.includes("Aggiungi come viaggio"),
    };
  });
  await page.screenshot({ path: path.join(OUT, `${tag}-2-selezionato.png`) });

  // "createRoot" è rumore noto dell'hot-reload di Vite, non un difetto.
  report[`${tag}.erroriConsole`] = errors.filter(e => !/createRoot|React DevTools/.test(e)).slice(0, 5);
  const video = VIDEO ? page.video() : null;
  await ctx.close(); // il filmato viene salvato solo alla chiusura del contesto
  if (video) report[`${tag}.filmato`] = await video.path();
}

await run({ width: 1280, height: 800 }, "desktop");
await run({ width: 390, height: 844 }, "mobile");
await browser.close();

fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`\nSchermate in ${OUT}`);
