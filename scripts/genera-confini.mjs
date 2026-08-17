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
async function prendi(url, tentativi = 3) {
  for (let i = 0; i < tentativi; i++) {
    const r = await fetch(url);
    if (r.status !== 429) return r;
    const attesa = 15000 * (i + 1);
    console.log(`    limite di richieste raggiunto: aspetto ${attesa / 1000}s (tentativo ${i + 1}/${tentativi})…`);
    await dorme(attesa);
  }
  return fetch(url);
}

function arrotonda(geom, dec = 3) {
  const f = c => (Array.isArray(c[0]) ? c.map(f) : [Number(c[0].toFixed(dec)), Number(c[1].toFixed(dec))]);
  return { ...geom, coordinates: f(geom.coordinates) };
}

/**
 * Douglas-Peucker: butta i vertici che non cambiano la forma a questa scala.
 * ITERATIVO con pila esplicita: la versione ricorsiva, su anelli da decine di
 * migliaia di vertici quasi allineati (Italia ADM2 è il caso peggiore),
 * può arrivare a profondità O(n) e far esplodere lo stack — proprio sul paese
 * che ci serve più di tutti.
 */
function dp(punti, eps) {
  const n = punti.length;
  if (n < 3) return punti;
  const tieni = new Uint8Array(n);
  tieni[0] = tieni[n - 1] = 1;
  const pila = [[0, n - 1]];
  while (pila.length) {
    const [a, b] = pila.pop();
    if (b - a < 2) continue;
    const [ax, ay] = punti[a], [bx, by] = punti[b];
    const den = Math.hypot(by - ay, bx - ax) || 1e-12;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = punti[i];
      const d = Math.abs((by - ay) * x - (bx - ax) * y + bx * ay - by * ax) / den;
      if (d > max) { max = d; idx = i; }
    }
    if (idx !== -1 && max > eps) {
      tieni[idx] = 1;
      pila.push([a, idx], [idx, b]);
    }
  }
  return punti.filter((_, i) => tieni[i]);
}
function semplifica(geom, eps = 0.004) {
  // Un anello sotto i 5 punti è già minimo. E se la semplificazione lo riduce
  // sotto i 4 punti si tiene l'ORIGINALE: un "poligono" di 2-3 punti non è
  // un'area — verrebbe disegnato come una linea e pointInPolygon non lo
  // riconoscerebbe mai come visitato (succede a regioni minute e isole).
  const anello = r => {
    if (r.length <= 4) return r;
    const s = dp(r, eps);
    return s.length >= 4 ? s : r;
  };
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

// Il manifest: l'app lo legge una volta e tenta il file locale SOLO per i
// paesi che ci sono, invece di sparare un 404 per ogni paese non incluso.
// Si ricostruisce dai file presenti nella cartella, non dalla lista di questo
// giro: così generare un paese alla volta non cancella gli altri.
const presenti = fs.readdirSync(DEST)
  .filter(f => /^[A-Z]{2}\.json$/.test(f))
  .map(f => f.slice(0, 2))
  .sort();
fs.writeFileSync(path.join(DEST, "index.json"), JSON.stringify({ paesi: presenti }));
console.log(`\nManifest: ${presenti.length} paesi in public/confini/index.json`);

console.log(`Totale: ${kb(totale)} sul disco, ${kb(totaleGz)} come li serve GitHub Pages`);
if (falliti.length) console.log(`Non generati (${falliti.length}):\n  ` + falliti.join("\n  "));
