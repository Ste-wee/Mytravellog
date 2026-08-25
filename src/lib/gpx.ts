import { distanceKm } from "@/lib/geo";
import { tr } from "@/lib/settings";
import { haversineKm } from "@/lib/haversine";

/**
 * Import GPX (Modello A "crea viaggio da GPX"): parsing della traccia,
 * reverse-geocoding di partenza/arrivo e anteprima SVG del percorso.
 * Le funzioni di trasformazione sono PURE (testabili); il reverse-geocoding
 * (rete) è a parte. Un GPX = un viaggio A→B: partenza = primo punto, arrivo =
 * ultimo, route_geometry = traccia reale.
 */

export interface GpxData {
  coords: [number, number][]; // [lon,lat]
  times: string[];            // ISO (o "" se assente), allineati a coords
  eles: number[];             // metri (o NaN se assente), allineati a coords
}

/** Estrae i punti da un GPX (trkpt → rtept → wpt come fallback). */
export function parseGpx(xml: string): GpxData {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) throw new Error(tr("File GPX non valido"));
  let nodes = Array.from(doc.getElementsByTagName("trkpt"));
  if (nodes.length === 0) nodes = Array.from(doc.getElementsByTagName("rtept"));
  if (nodes.length === 0) nodes = Array.from(doc.getElementsByTagName("wpt"));
  const coords: [number, number][] = [];
  const times: string[] = [];
  const eles: number[] = [];
  for (const p of nodes) {
    const lat = parseFloat(p.getAttribute("lat") || "");
    const lon = parseFloat(p.getAttribute("lon") || "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    coords.push([lon, lat]);
    times.push(p.getElementsByTagName("time")[0]?.textContent?.trim() || "");
    const ele = parseFloat(p.getElementsByTagName("ele")[0]?.textContent?.trim() || "");
    eles.push(Number.isFinite(ele) ? ele : NaN);
  }
  return { coords, times, eles };
}

/** Riduce i punti a ~max mantenendo forma (primo/ultimo sempre). Un GPX ha
 *  spesso migliaia di punti: troppi appesantirebbero il localStorage. */
export function downsample(coords: [number, number][], max = 800): [number, number][] {
  if (coords.length <= max) return coords;
  const step = (coords.length - 1) / (max - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < max; i++) out.push(coords[Math.round(i * step)]);
  out[out.length - 1] = coords[coords.length - 1];
  return out;
}

/** Lunghezza del percorso (km), sommando i segmenti reali con la haversine NON
 *  arrotondata: i punti GPX distano spesso pochi metri e l'arrotondamento a km
 *  intero di `distanceKm` azzererebbe ogni segmento (traccia da 50 km → 0). */
export function trackLengthKm(coords: [number, number][]): number {
  let tot = 0;
  for (let i = 1; i < coords.length; i++) tot += haversineKm(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
  return tot;
}

/** Riepilogo pronto per il form: estremi, lunghezza, date, quota max. */
export function summarizeGpx(data: GpxData) {
  const { coords, times, eles } = data;
  const start = coords[0];
  const end = coords[coords.length - 1];
  const validEles = eles.filter(e => Number.isFinite(e));
  const dates = times.filter(Boolean);
  const toLocalDate = (iso: string): string => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  return {
    start, end,
    lengthKm: trackLengthKm(coords),
    straightKm: start && end ? distanceKm(start[1], start[0], end[1], end[0]) : 0,
    dateStart: dates.length ? toLocalDate(dates[0]) : "",
    dateEnd: dates.length ? toLocalDate(dates[dates.length - 1]) : "",
    maxEle: validEles.length ? Math.round(Math.max(...validEles)) : null,
    endEle: Number.isFinite(eles[eles.length - 1]) ? Math.round(eles[eles.length - 1]) : null,
  };
}

export interface ReverseResult { city: string; country: string; country_code: string }

/** Reverse-geocoding Nominatim (città + paese + codice). zoom 10 ≈ città. */
export async function reverseGeocode(lat: number, lon: number): Promise<ReverseResult> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10&addressdetails=1`;
  const r = await fetch(url, { headers: { "Accept-Language": "it" } });
  if (!r.ok) throw new Error("reverse geocode fallito");
  const d = await r.json();
  const a = d.address ?? {};
  const city = a.city || a.town || a.village || a.hamlet || a.municipality || a.county || d.name || "";
  return { city, country: a.country || "", country_code: (a.country_code || "").toUpperCase() };
}

const RAD = Math.PI / 180;
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2)) / RAD;

/** Anteprima SVG del tracciato: linea bianca su fondo scuro, pallino verde
 *  (partenza) e ambra (arrivo). Pura → testabile e verificabile dal vivo
 *  (niente WebGL). */
export function buildTrackPreviewSvg(coords: [number, number][], width = 560, height = 300): string {
  if (coords.length < 2) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#0a1628"/></svg>`;
  const pad = 24;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [lon, lat] of coords) {
    const x = lon, y = mercY(lat);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const spanX = Math.max(1e-6, maxX - minX), spanY = Math.max(1e-6, maxY - minY);
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const offX = (width - spanX * scale) / 2, offY = (height - spanY * scale) / 2;
  const n = (v: number) => (Math.round(v * 10) / 10).toString();
  const project = (lon: number, lat: number): [number, number] => [
    (lon - minX) * scale + offX,
    height - ((mercY(lat) - minY) * scale + offY),
  ];
  const d = "M" + coords.map(([lon, lat]) => { const [x, y] = project(lon, lat); return `${n(x)},${n(y)}`; }).join("L");
  const [sx, sy] = project(coords[0][0], coords[0][1]);
  const [ex, ey] = project(coords[coords.length - 1][0], coords[coords.length - 1][1]);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<rect width="${width}" height="${height}" fill="#0a1628"/>`,
    `<path d="${d}" fill="none" stroke="#fbbf24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<circle cx="${n(sx)}" cy="${n(sy)}" r="6" fill="#34d399" stroke="#fff" stroke-width="1.5"/>`,
    `<circle cx="${n(ex)}" cy="${n(ey)}" r="6" fill="#f472b6" stroke="#fff" stroke-width="1.5"/>`,
    `</svg>`,
  ].join("");
}
