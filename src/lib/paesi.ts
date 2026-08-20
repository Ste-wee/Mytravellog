/**
 * Geometria dei paesi: "in quale paese cade questo punto?" e "quali paesi ho
 * visitato?". Fonte UNICA — la regola che sceglie il poligono più piccolo
 * (vedi paeseDelPunto) è nata da un bug vero e non va mai duplicata: una
 * seconda copia significherebbe una seconda occasione di sbagliare.
 *
 * Viveva dentro ContinentsMap, che la usa per la mappa del mondo; ora la usa
 * anche il globo della Home per evidenziare i paesi visitati.
 */
import type { Trip } from "@/lib/storage";
import { loadWorldAtlasCountries, polygonsOf } from "@/lib/worldAtlas";

/** Il minimo che serve per rispondere "il punto è dentro?": niente disegno. */
export type PaeseGeom = {
  id: string;
  name: string;
  /** lista di poligoni; ogni poligono = lista di anelli di [lon,lat] */
  polygons: number[][][][];
  /** [minLon, minLat, maxLon, maxLat] — prefiltro prima del ray casting */
  bbox: [number, number, number, number];
};

/**
 * Bounding box di un paese. Prefiltro economico prima del costoso ray casting
 * su ogni vertice di ogni anello: se il punto è fuori dal box è sicuramente
 * fuori dal paese. Conservativo: per i paesi che attraversano ±180° (Russia,
 * Fiji) il box risulta molto ampio → nessuno speedup ma nemmeno falsi negativi.
 */
export function bboxDiPoligoni(polygons: number[][][][]): [number, number, number, number] {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const poly of polygons) {
    for (const ring of poly) {
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  return [minLon, minLat, maxLon, maxLat];
}

/** Identificatore stabile di un paese del world-atlas (id numerico ISO, o il nome). */
export function deriveCountryId(f: { id?: unknown; properties?: { name?: string } }, index: number): string {
  if (f.id != null) return String(f.id);
  if (f.properties?.name) return f.properties.name;
  return `unknown-${index}`;
}

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      (yi > lat) !== (yj > lat) &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Area del bounding box del poligono PIÙ PICCOLO che contiene il punto,
 * o Infinity se nessuno lo contiene. Serve a scegliere fra più candidati.
 */
export function areaPoligonoCheContiene(lon: number, lat: number, polygons: number[][][][]): number {
  let minima = Infinity;
  for (const poly of polygons) {
    if (!poly.length || !pointInRing(lon, lat, poly[0])) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) if (pointInRing(lon, lat, poly[h])) { inHole = true; break; }
    if (inHole) continue;
    let mnLo = Infinity, mxLo = -Infinity, mnLa = Infinity, mxLa = -Infinity;
    for (const [lo, la] of poly[0]) {
      if (lo < mnLo) mnLo = lo; if (lo > mxLo) mxLo = lo;
      if (la < mnLa) mnLa = la; if (la > mxLa) mxLa = la;
    }
    const area = (mxLo - mnLo) * (mxLa - mnLa);
    if (area < minima) minima = area;
  }
  return minima;
}

/**
 * In quale paese cade il punto? Vince il poligono PIÙ PICCOLO fra quelli che
 * lo contengono, non il primo dell'elenco.
 *
 * Perché: il poligono continentale della Russia va da -180° a +180° (scavalca
 * l'antimeridiano in Chukotka) e il ray casting su una forma che avvolge il
 * mondo dà falsi positivi — Kiruna e Abisko, in Svezia, risultavano dentro la
 * Russia. Fermandosi al primo match vinceva la Russia solo perché nel
 * world-atlas è la 18ª feature e la Svezia la 110ª: la mappa mostrava la
 * Russia visitata per un viaggio in Lapponia (segnalato da Stefano).
 * Il poligono svedese è minuscolo rispetto a quello russo: il più piccolo è
 * sempre il più specifico.
 *
 * Generica sul tipo: la mappa del mondo passa le sue feature disegnabili (con
 * path SVG e centroide), il globo le sue, e nessuna delle due deve adattarsi
 * all'altra.
 */
export function paeseDelPunto<T extends PaeseGeom>(lon: number, lat: number, countries: T[]): T | null {
  let vincitore: T | null = null;
  let areaMin = Infinity;
  for (const c of countries) {
    if (lon < c.bbox[0] || lon > c.bbox[2] || lat < c.bbox[1] || lat > c.bbox[3]) continue;
    const area = areaPoligonoCheContiene(lon, lat, c.polygons);
    if (area < areaMin) { areaMin = area; vincitore = c; }
  }
  return vincitore;
}

/** I paesi del mondo pronti per le domande geometriche, con la loro geometria
 *  originale (serve a disegnarli sul globo). Cache condivisa: il world-atlas
 *  si scarica una volta sola per sessione (ci pensa loadWorldAtlasCountries). */
export type PaeseMondo = PaeseGeom & { geometry: GeoJSON.Geometry };

let cachePaesi: Promise<PaeseMondo[]> | null = null;

/** Test-only: azzera la cache dei paesi fra un test e l'altro. */
export function __clearPaesiCache() { cachePaesi = null; }

export function caricaPaesi(): Promise<PaeseMondo[]> {
  if (!cachePaesi) {
    cachePaesi = loadWorldAtlasCountries("110m").then(geo =>
      geo.features.map((f, i) => {
        const polygons = polygonsOf(f.geometry);
        return {
          id: deriveCountryId(f, i),
          name: (f.properties?.name as string) ?? "",
          polygons,
          bbox: bboxDiPoligoni(polygons),
          geometry: f.geometry,
        };
      }));
    // niente cache avvelenata: un errore di rete non deve condannare la sessione
    cachePaesi.catch(() => { cachePaesi = null; });
  }
  return cachePaesi;
}

/**
 * I paesi toccati dai viaggi, con il codice bandiera di ciascuno.
 *
 * Il match è GEOMETRICO e non per `country_code`: i confini del world-atlas non
 * condividono un identificatore con i nostri viaggi. Il codice per la bandiera
 * arriva invece dal PUNTO che è caduto dentro quel paese — così un viaggio in
 * Austria non si porta dietro la bandiera della destinazione italiana.
 *
 * Conta anche le TAPPE, non solo le destinazioni: il dato per-viaggio descrive
 * l'arrivo, e chi attraversa l'Austria per andare a Vienna l'Austria l'ha vista.
 */
export function paesiVisitati(trips: Trip[], paesi: PaeseMondo[]) {
  const visitati = new Map<string, { paese: PaeseMondo; code: string | null }>();
  if (!paesi.length) return visitati;
  for (const t of trips) {
    const punti = [
      { lat: t.latitude, lon: t.longitude, code: t.country_code },
      ...(t.waypoints ?? [])
        .filter(w => w.lat != null && w.lon != null)
        .map(w => ({ lat: w.lat as number, lon: w.lon as number, code: w.country_code })),
    ];
    for (const p of punti) {
      const c = paeseDelPunto(p.lon, p.lat, paesi);
      if (!c) continue;
      const gia = visitati.get(c.id);
      // il primo codice utile vince: i successivi non devono sovrascriverlo con null
      if (!gia) visitati.set(c.id, { paese: c, code: p.code ?? null });
      else if (!gia.code && p.code) gia.code = p.code;
    }
  }
  return visitati;
}

/** Centro visivo di un paese: baricentro dell'anello esterno del poligono PIÙ
 *  GRANDE. Non la media di tutti i poligoni, che per la Francia (con la Guyana
 *  e le isole) cadrebbe in mezzo all'Atlantico. */
export function centroPaese(p: PaeseGeom): [number, number] | null {
  let esterno: number[][] | null = null;
  let max = -1;
  for (const poly of p.polygons) {
    if (!poly.length) continue;
    if (poly[0].length > max) { max = poly[0].length; esterno = poly[0]; }
  }
  if (!esterno || !esterno.length) return null;
  let lon = 0, lat = 0;
  for (const [x, y] of esterno) { lon += x; lat += y; }
  return [lon / esterno.length, lat / esterno.length];
}
