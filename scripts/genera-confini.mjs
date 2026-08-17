/**
 * Genera i confini regionali da ospitare NOI, in `public/confini/<ISO2>.json`.
 *
 * Perché esiste: a runtime l'app li scaricava da tre servizi di terzi in fila
 * (API geoBoundaries → raw.githubusercontent → API GitHub per i file in Git
 * LFS). Due hanno limiti severi: aprendo una decina di mappe arriva un 429 e
 * la mappa non si disegna più. Serviti dal nostro dominio: nessun limite,
 * nessun CORS, e il service worker li tiene offline.
 *
 * Uso:
 *   npm run confini            → i paesi di default (quelli con ADM2 speciale
 *                                + i più probabili)
 *   npm run confini -- IT AT SI
 *   npm run confini -- --tutti  → tutti i paesi noti (lungo: ~200 richieste)
 *
 * Il file generato tiene SOLO ciò che il pannello usa: shapeName, shapeISO e la
 * geometria, con le coordinate arrotondate a 3 decimali (~100 m: la mappa è
 * larga 540 px, la differenza non si vede) e semplificate. Stampa il peso di
 * ogni paese e il totale, così la decisione "quali generare" si prende sui
 * numeri veri.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const QUI = path.dirname(fileURLToPath(import.meta.url));
const DEST = path.join(QUI, "..", "public", "confini");

// Gli stessi override del pannello: per Italia e Grecia l'ADM1 di geoBoundaries
// sono macro-aree, le regioni vere stanno in ADM2.
const ADM_PER_PAESE = { IT: "ADM2", GR: "ADM2" };

// ISO2 → ISO3, letto dalla fonte unica dell'app (niente seconda tabella).
async function mappaIso() {
  const src = fs.readFileSync(path.join(QUI, "..", "src", "lib", "iso3166.ts"), "utf8");
  const dentro = src.slice(src.indexOf("ISO2_TO_ISO3"));
  const coppie = [...dentro.matchAll(/"?([A-Z]{2})"?\s*:\s*"([A-Z]{3})"/g)];
  return Object.fromEntries(coppie.map(m => [m[1], m[2]]));
}

const DEFAULT = ["IT", "AT", "SI", "FR", "ES", "DE", "CH", "GR", "PT", "HR", "NL", "BE", "GB", "IE", "US"];

const kb = n => (n / 1024).toFixed(0) + " KB";
const dorme = ms => new Promise(r => setTimeout(r, ms));
const isLfs = t => t.trimStart().startsWith("version https://git-lfs");

/** GET con ritentativi sul 429: il limite si supera aspettando, non insistendo. */
async function prendi(url, tentativi = 4) {
  for (let i = 0; i < tentativi; i++) {
    const r = await fetch(url);
    if (r.status !== 429) return r;
    const attesa = 20000 * (i + 1);
    console.log(`    429, aspetto ${attesa / 1000}s…`);
    await dorme(attesa);
  }
  return fetch(url);
}

function arrotonda(geom, dec = 3) {
  const f = c => (Array.isArray(c[0]) ? c.map(f) : [Number(c[0].toFixed(dec)), Number(c[1].toFixed(dec))]);
  return { ...geom, coordinates: f(geom.coordinates) };
}

/** Douglas-Peucker: butta i vertici che non cambiano la forma a questa scala. */
function dp(punti, eps) {
  if (punti.length < 3) return punti;
  const [ax, ay] = punti[0], [bx, by] = punti[punti.length - 1];
  let max = 0, idx = 0;
  for (let i = 1; i < punti.length - 1; i++) {
    const [x, y] = punti[i];
    const den = Math.hypot(by - ay, bx - ax) || 1e-12;
    const d = Math.abs((by - ay) * x - (bx - ax) * y + bx * ay - by * ax) / den;
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [punti[0], punti[punti.length - 1]];
  return [...dp(punti.slice(0, idx + 1), eps).slice(0, -1), ...dp(punti.slice(idx), eps)];
}
function semplifica(geom, eps = 0.004) {
  // Un anello sotto i 5 punti è già minimo: toccarlo lo farebbe degenerare.
  const anello = r => (r.length > 4 ? dp(r, eps) : r);
  const poly = p => p.map(anello);
  return { ...geom, coordinates: geom.type === "Polygon" ? poly(geom.coordinates) : geom.coordinates.map(poly) };
}

async function scarica(iso3, adm) {
  const meta = await prendi(`https://www.geoboundaries.org/api/current/gbOpen/${iso3}/${adm}/`);
  if (!meta.ok) throw new Error(`metadati ${meta.status}`);
  const m = await meta.json();
  const url = m.simplifiedGeometryGeoJSON || m.gjDownloadURL;
  if (!url) throw new Error("nessun url nei metadati");
  const g = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/([^/]+)\/(.+)$/);
  const diretto = g ? `https://raw.githubusercontent.com/${g[1]}/${g[2]}/${g[3]}/${g[4]}` : url;
  const r = await prendi(diretto);
  if (!r.ok) throw new Error(`geojson ${r.status}`);
  let testo = await r.text();
  if (isLfs(testo)) {
    if (!g) throw new Error("puntatore LFS senza URL analizzabile");
    const sha = await prendi(`https://api.github.com/repos/${g[1]}/${g[2]}/commits/${g[3]}`);
    if (!sha.ok) throw new Error(`api github ${sha.status}`);
    const full = (await sha.json())?.sha;
    const media = await prendi(`https://media.githubusercontent.com/media/${g[1]}/${g[2]}/${full}/${g[4]}`);
    if (!media.ok) throw new Error(`media ${media.status}`);
    testo = await media.text();
  }
  return JSON.parse(testo);
}

const argomenti = process.argv.slice(2);
const iso = await mappaIso();
const paesi = argomenti.includes("--tutti")
  ? Object.keys(iso)
  : (argomenti.filter(a => /^[A-Za-z]{2}$/.test(a)).map(a => a.toUpperCase()) || []);
const lista = paesi.length ? paesi : DEFAULT;

fs.mkdirSync(DEST, { recursive: true });
console.log(`Genero i confini di ${lista.length} paesi in public/confini/\n`);

let totale = 0, totaleGz = 0, falliti = [];
for (const iso2 of lista) {
  const iso3 = iso[iso2];
  if (!iso3) { console.log(`${iso2}  — codice ISO3 sconosciuto, salto`); continue; }
  const adm = ADM_PER_PAESE[iso2] ?? "ADM1";
  process.stdout.write(`${iso2} (${adm}) … `);
  try {
    const grezzo = await scarica(iso3, adm);
    const feature = (grezzo.features ?? []).map(f => ({
      type: "Feature",
      properties: { shapeName: f.properties?.shapeName ?? "", shapeISO: f.properties?.shapeISO ?? null },
      geometry: semplifica(arrotonda(f.geometry)),
    }));
    if (!feature.length) throw new Error("nessuna suddivisione");
    const json = JSON.stringify({ type: "FeatureCollection", features: feature });
    fs.writeFileSync(path.join(DEST, `${iso2}.json`), json);
    const gz = zlib.gzipSync(Buffer.from(json)).length;
    totale += json.length; totaleGz += gz;
    console.log(`${feature.length} regioni, ${kb(json.length)} (gzip ${kb(gz)})`);
  } catch (e) {
    falliti.push(`${iso2}: ${e.message}`);
    console.log(`FALLITO — ${e.message}`);
  }
  await dorme(1500); // gentili col servizio: è gratuito e senza chiave
}

console.log(`\nTotale: ${kb(totale)} sul disco, ${kb(totaleGz)} come li serve GitHub Pages`);
if (falliti.length) console.log(`Non generati (${falliti.length}):\n  ` + falliti.join("\n  "));
