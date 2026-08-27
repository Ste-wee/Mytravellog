import { loadWorldAtlasCountries, polygonsOf, WorldAtlasResolution } from "./worldAtlas";
import { LOGO_DATA_URI } from "./brandLogo";

/**
 * Generatore del MASTER DI STAMPA in SVG per la vista "Costellazione":
 * vettoriale, a livelli separati (confini / tracciato / stelle / etichette /
 * titolo), fondo nero + tutto bianco. Pensato per stampa in resina + LED:
 * - il livello `stelle` (le tappe) marca i PUNTI-LED (attributo data-led),
 * - i livelli sono separati così il fornitore incide/illumina ciò che vuole.
 *
 * Le funzioni di costruzione sono PURE (coordinate → stringa) per essere
 * testabili; il fetch dei confini (world-atlas) è a parte e asincrono.
 */

/**
 * I confini degli stati: **una sola fonte per lo schermo e per la stampa.**
 *
 * ⚠️ Prima questi due numeri erano scritti a mano in due file — la costellazione
 * su MapLibre (`TripFlyover`) e il master SVG qui — con l'idea che restassero
 * uguali. Quel tipo di accoppiamento per buona volontà va alla deriva al primo
 * ritocco: si cambia lo schermo, si dimentica la stampa, e il poster smette di
 * somigliare a quello che hai guardato. Ora c'è un posto solo.
 *
 * Portati da 0.32 a **0.45** su richiesta di Stefano (2026-08-26): a 0.32 le
 * coste si leggevano ma i confini INTERNI (Austria, Ungheria, Slovacchia) quasi
 * svanivano, e su una mappa che serve a riconoscere dove sei stato quella è
 * l'informazione che manca. Provato anche 0.60: funziona, ma i confini
 * cominciano a competere con le rotte e la mappa somiglia a un atlante invece
 * che a una costellazione.
 */
export const CONFINI = {
  colore: "#ffffff",
  opacita: 0.45,
  /** Spessore nel master di stampa (sullo schermo cresce con lo zoom). */
  spessore: 1.1,
} as const;

export interface Stop { lon: number; lat: number; label: string }

export interface PosterSvgInput {
  /** Percorso completo [lon,lat] (tracciato stradale reale dove disponibile). */
  routeCoords?: [number, number][];
  /** Più percorsi separati (uno per viaggio) per la "Mappa della vita": ognuno
   *  diventa un `<path>` a sé, senza linee di collegamento tra loro. Se presente
   *  ha la precedenza su `routeCoords`. */
  routeSegments?: [number, number][][];
  /** Tappe (nodi-stella) con etichetta. */
  stops: Stop[];
  /** Anelli dei confini [lon,lat][] già selezionati per il riquadro (opzionale). */
  borders?: [number, number][][];
  title: string;
  dateLabel?: string | null;
  /** Es. "1315 km · 6 tappe". */
  stats?: string | null;
  /** Nasconde i nomi delle tappe (Mappa della vita: costellazione pulita). */
  hideLabels?: boolean;
  width?: number;
  height?: number;
}

import { unwrapNear, unwrapPath, unwrapSegments } from "./lonWrap";
// Ri-esportati: gli helper vivono in lonWrap.ts (senza dipendenze) ma il resto
// dell'app li ha sempre presi da qui insieme al resto della geometria poster.
export { unwrapNear, unwrapPath, unwrapSegments };

const RAD = Math.PI / 180;
const mercX = (lon: number) => lon;
// Lat clampata al limite del Web Mercator: l'anello dell'Antartide (world-atlas)
// arriva a -90, e mercY(-90) = -Infinity avrebbe reso invalido l'INTERO path
// dei confini (un solo "-Infinity" nel d = layer confini sparito).
const MAX_MERC_LAT = 85.051129;
export const mercY = (lat: number) => {
  const c = Math.max(-MAX_MERC_LAT, Math.min(MAX_MERC_LAT, lat));
  return Math.log(Math.tan(Math.PI / 4 + (c * RAD) / 2)) / RAD;
};

/** Riquadro geografico (lon/lat) del percorso, con un margine in gradi. */
export function routeBounds(pts: [number, number][], marginDeg = 1.5) {
  let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
  for (const [lon, lat] of pts) {
    lonMin = Math.min(lonMin, lon); lonMax = Math.max(lonMax, lon);
    latMin = Math.min(latMin, lat); latMax = Math.max(latMax, lat);
  }
  return { lonMin: lonMin - marginDeg, lonMax: lonMax + marginDeg, latMin: latMin - marginDeg, latMax: latMax + marginDeg };
}

function bboxIntersects(ring: [number, number][], b: { lonMin: number; lonMax: number; latMin: number; latMax: number }): boolean {
  let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
  for (const [lon, lat] of ring) {
    lonMin = Math.min(lonMin, lon); lonMax = Math.max(lonMax, lon);
    latMin = Math.min(latMin, lat); latMax = Math.max(latMax, lat);
  }
  if (latMax < b.latMin || latMin > b.latMax) return false;
  // Il riquadro può essere "srotolato" oltre ±180 (percorsi che scavalcano
  // l'antimeridiano, vedi unwrapPath): gli anelli del world-atlas stanno però
  // sempre in [-180,180], quindi si prova anche traslati di un giro — senza,
  // per un Tokyo→Los Angeles i confini degli USA non venivano caricati.
  for (const off of [0, 360, -360]) {
    if (!(lonMax + off < b.lonMin || lonMin + off > b.lonMax)) return true;
  }
  return false;
}

/**
 * Estrae dai confini world-atlas (fetch e cache in worldAtlas.ts) gli anelli
 * [lon,lat][] che intersecano il riquadro. `resolution`: 110m (leggero,
 * default) o 50m (più dettagliato: lo usa l'export SVG della mappa, dove serve che gli
 * stati si vedano bene).
 */
export async function loadCountryRings(
  bounds: { lonMin: number; lonMax: number; latMin: number; latMax: number },
  resolution: WorldAtlasResolution = "110m",
): Promise<[number, number][][]> {
  const geo = await loadWorldAtlasCountries(resolution);
  const rings: [number, number][][] = [];
  for (const f of geo.features) {
    for (const poly of polygonsOf(f.geometry)) {
      for (const ring of poly) {
        if (bboxIntersects(ring as [number, number][], bounds)) rings.push(ring as [number, number][]);
      }
    }
  }
  return rings;
}

const escapeXml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c] as string));

/** Firma "By 🐻" in basso a destra, condivisa da TUTTI gli export SVG (poster
 *  del viaggio, mappa della vita, quadro). Il logo è incorporato come data-URI
 *  con `xlink:href` (compatibile con browser, Illustrator e stampanti); i root
 *  SVG che la usano dichiarano perciò anche xmlns:xlink. `bottomY` = Y del
 *  bordo inferiore della firma (per stare sopra la didascalia dove c'è). */
/** Luminanza relativa di un colore #RRGGBB (0 scuro … 1 chiaro). */
function isLightColor(hex: string): boolean {
  const h = hex.replace("#", "");
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6;
}

/**
 * Firma "By 🐻". `opts.ink` = colore del testo (default bianco); `opts.invertLogo`
 * inverte il logo (bianco → scuro) via filtro SVG, per i fondi CHIARI dove la
 * versione bianca sparirebbe. Senza opts, resta la firma bianca originale.
 */
function brandSignatureSvg(W: number, bottomY: number, opts?: { ink?: string; invertLogo?: boolean }): string {
  const size = 42, pad = 26, gap = 10;
  const top = bottomY - size;
  const logoX = W - pad - size;
  const r = (v: number) => (Math.round(v * 10) / 10).toString();
  const ink = opts?.ink ?? "#ffffff";
  const invert = opts?.invertLogo ?? false;
  const filterDef = invert
    ? `<defs><filter id="brandInk"><feColorMatrix type="matrix" values="-1 0 0 0 1 0 -1 0 0 1 0 0 -1 0 1 0 0 0 1 0"/></filter></defs>`
    : "";
  const imgFilter = invert ? ` filter="url(#brandInk)"` : "";
  return `<g id="firma" opacity="0.72">`
    + filterDef
    + `<text x="${r(logoX - gap)}" y="${r(top + size * 0.7)}" text-anchor="end" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="24" fill="${ink}">By</text>`
    + `<image x="${r(logoX)}" y="${r(top)}" width="${size}" height="${size}"${imgFilter} xlink:href="${LOGO_DATA_URI}"/>`
    + `</g>`;
}

/** Costruisce la stringa SVG completa del poster (puro). */
export function buildPosterSvg(input: PosterSvgInput): string {
  const W = input.width ?? 1600;
  const H = input.height ?? 1000;
  const pad = 120;
  const { routeCoords = [], routeSegments, stops, borders = [], title, dateLabel, stats, hideLabels = false } = input;
  // Uno o più tracciati: la Mappa della vita passa un percorso per viaggio; gli
  // altri poster un singolo percorso. Normalizzati qui in una lista di segmenti.
  // Antimeridiano: i segmenti vengono srotolati in un'UNICA catena (il primo
  // punto di ogni segmento vicino all'ultimo del precedente), non ciascuno per
  // conto proprio — altrimenti nella Mappa della vita due viaggi ai lati
  // opposti del Pacifico finivano a 360° di distanza.
  const segments: [number, number][][] = unwrapSegments(routeSegments && routeSegments.length
    ? routeSegments
    : (routeCoords.length ? [routeCoords] : []));
  const routePts = segments.flat();

  // Le tappe vanno srotolate IN CATENA (ognuna vicino alla precedente), come
  // la rotta: un'ancora unica riportava tutto entro ±180° dal primo punto, e
  // oltre i 180° cumulativi (Roma→Tokyo→LA) stella e linea divergevano di un
  // giro intero. La sequenza delle tappe È quella del percorso, quindi la
  // catena produce la stessa finestra.
  const uLons = unwrapPath(stops.map(s => [s.lon, s.lat] as [number, number]));
  const uStops = stops.map((s, i) => ({ ...s, lon: uLons[i][0] }));
  // Stelle/etichette deduplicate per coordinata FISICA (lon mod 360): nella
  // Mappa della vita buildFlightPath reinserisce la casa per OGNI viaggio
  // (dedup solo sui consecutivi) → l'hub accumulava N aloni sovrapposti (glow
  // sparato) e il master LED per il fornitore aveva N marcatori identici.
  const seenStar = new Set<string>();
  const drawStops = uStops.filter(s => {
    const key = `${(((s.lon % 360) + 360) % 360).toFixed(4)},${s.lat.toFixed(4)}`;
    if (seenStar.has(key)) return false;
    seenStar.add(key);
    return true;
  });

  // Fascia inferiore RISERVATA alla didascalia (titolo/date/stats): la mappa
  // disegna solo SOPRA, così le scritte non si sovrappongono mai al tracciato
  // (com'era col titolo in un angolo). Layout classico da poster/stampa.
  const hasCaption = !!(title || dateLabel || stats);
  const bandH = hasCaption ? (30 + 46 + (dateLabel ? 30 : 0) + (stats ? 34 : 0) + 28) : 0;
  const mapH = H - bandH;

  // Riquadro (in mercatore) sul solo percorso+tappe: il tracciato riempie
  // sempre l'area-mappa allo stesso modo; i confini che sforano vengono
  // ritagliati dal viewBox.
  const framePts: [number, number][] = [...routePts, ...uStops.map(s => [s.lon, s.lat] as [number, number])];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [lon, lat] of framePts) {
    const x = mercX(lon), y = mercY(lat);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);

  /** Anello di confine traslato di un giro intero se serve (mai spezzato: lo
   *  scostamento è unico per tutto l'anello, dal primo vertice). Ancorato al
   *  CENTRO del riquadro, non al primo punto della rotta: con un frame più
   *  largo di 180° (Roma→Tokyo→LA) l'ancora d'inizio lasciava gli anelli
   *  americani un giro a ovest, fuori tela, pur avendoli caricati. */
  const frameCenterLon = (minX + maxX) / 2; // mercX è l'identità: minX/maxX SONO longitudini
  const shiftRing = (ring: [number, number][]): [number, number][] => {
    if (!ring.length) return ring;
    const off = unwrapNear(ring[0][0], frameCenterLon) - ring[0][0];
    return off === 0 ? ring : ring.map(([lon, lat]) => [lon + off, lat] as [number, number]);
  };

  const scale = Math.min((W - 2 * pad) / spanX, (mapH - 2 * pad) / spanY);
  const offX = (W - spanX * scale) / 2;
  const offY = (mapH - spanY * scale) / 2;
  const project = (lon: number, lat: number): [number, number] => {
    const x = (mercX(lon) - minX) * scale + offX;
    const y = mapH - ((mercY(lat) - minY) * scale + offY); // flip Y (nord in alto), dentro l'area-mappa
    return [x, y];
  };
  const n = (v: number) => (Math.round(v * 10) / 10).toString();

  const ringToPath = (ring: [number, number][]): string =>
    "M" + ring.map(([lon, lat]) => { const [x, y] = project(lon, lat); return `${n(x)},${n(y)}`; }).join("L") + "Z";

  const bordersPaths = borders
    .map(r => `<path d="${ringToPath(shiftRing(r))}"/>`)
    .join("");

  const routePaths = segments
    .filter(seg => seg.length > 1)
    .map(seg => "M" + seg.map(([lon, lat]) => { const [x, y] = project(lon, lat); return `${n(x)},${n(y)}`; }).join("L"));

  const starEls = drawStops.map(s => {
    const [x, y] = project(s.lon, s.lat);
    return `<circle cx="${n(x)}" cy="${n(y)}" r="16" fill="url(#starGlow)"/><circle data-led="1" cx="${n(x)}" cy="${n(y)}" r="5" fill="#ffffff"/>`;
  }).join("");

  const labelEls = hideLabels ? "" : drawStops.map(s => {
    const [x, y] = project(s.lon, s.lat);
    return `<text x="${n(x)}" y="${n(y - 14)}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="20" fill="#ffffff">${escapeXml(s.label)}</text>`;
  }).join("");

  // Didascalia centrata nella fascia inferiore riservata.
  const titleEls: string[] = [];
  const cx = W / 2;
  let ty = mapH + 30 + 36;
  if (title) titleEls.push(`<text x="${cx}" y="${n(ty)}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="bold" font-size="40" fill="#ffffff">${escapeXml(title)}</text>`);
  if (dateLabel) { ty += 30; titleEls.push(`<text x="${cx}" y="${n(ty)}" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="20" fill="#ffffff" opacity="0.7">${escapeXml(dateLabel)}</text>`); }
  if (stats) { ty += 34; titleEls.push(`<text x="${cx}" y="${n(ty)}" text-anchor="middle" font-family="Georgia, serif" font-size="24" fill="#ffffff" opacity="0.9">${escapeXml(stats)}</text>`); }
  // Sottile linea divisoria mappa / didascalia.
  const dividerEl = hasCaption ? `<line x1="${pad}" y1="${n(mapH)}" x2="${W - pad}" y2="${n(mapH)}" stroke="#ffffff" stroke-opacity="0.2" stroke-width="1"/>` : "";

  const starGlowDef = `<radialGradient id="starGlow"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="35%" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`;
  const confiniG = `<g id="confini" fill="none" stroke="${CONFINI.colore}" stroke-opacity="${CONFINI.opacita}" stroke-width="${CONFINI.spessore}" stroke-linejoin="round">${bordersPaths}</g>`;
  const tracciatoG = routePaths.length ? `<g id="tracciato" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">${routePaths.map(d => `<path d="${d}"/>`).join("")}</g>` : "";
  const stelleG = `<g id="stelle">${starEls}</g>`;
  const etichetteG = `<g id="etichette">${labelEls}</g>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
    `<defs>${starGlowDef}</defs>`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#000000"/>`,
    confiniG,
    tracciatoG,
    stelleG,
    etichetteG,
    dividerEl,
    `<g id="titolo">${titleEls.join("")}</g>`,
    // Firma nell'angolo in basso a destra dell'AREA MAPPA (sopra la didascalia).
    brandSignatureSvg(W, mapH - 10),
    `</svg>`,
  ].join("");
}
