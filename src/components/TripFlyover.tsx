import { useEffect, useMemo, useRef, useState, createElement } from "react";
import { useT, fmtNumber } from "@/lib/settings";
import type { ElementType } from "react";
// SOLO i tipi: `import type` sparisce alla compilazione — maplibre-gl resta
// caricato dinamicamente (loadMapLibre) e fuori dal bundle iniziale.
import type { Map as MapLibreMap, Marker as MapLibreMarker, GeoJSONSource, StyleSpecification } from "maplibre-gl";
import { loadMapLibre, type StyleExpr } from "@/lib/maplibre";
import { createPortal } from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { Trip, formatTripDate } from "@/lib/storage";
import { buildFlightPath, buildFlightLegs, tripTotalKm, buildPerTripRouteCoords, easeInOutCubic, pointAlongPath, tracciatoProgressivo, FlightLeg } from "@/lib/flyover";
import { unwrapNear } from "@/lib/lonWrap";
import { codecCostruzione, formatoRegistrabile, kmContatiPerTratta, misureVideo, nomeFileVideo } from "@/lib/voloVideo";
import { riquadriDelVolo } from "@/lib/riquadriVolo";
import { copioneVolo, type Camera, type TempiCopione } from "@/lib/copioneVolo";
import { disponiEtichette, type Disposizione, type Riquadro } from "@/lib/etichetteMappa";
import fixWebmDuration from "fix-webm-duration";
import { compagniDeiViaggi, viaggiCon } from "@/lib/compagni";
import { fetchMapStyle } from "@/components/WorldMap";
import { saveReliefImage } from "@/lib/photoStorage";
import { buildPosterSvg, loadCountryRings, routeBounds, unwrapSegments, CONFINI } from "@/lib/posterSvg";
import { loadCoste } from "@/lib/worldAtlas";
import { X, Share2, Loader2, Download, Pause, Play, SkipForward, RotateCcw, Film, Home, Printer } from "lucide-react";
import { canShareFile, downloadBlob, shareOrDownload } from "@/lib/share";
import { geometriaTitoloVita, leggiTitoloVita, salvaTitoloVita, TITOLO_VITA, type BordiTitolo, type GeometriaTitolo } from "@/lib/titoloVita";
import { TRANSPORT } from "@/lib/transport";

// Icona + colore del mezzo dalla fonte unica (@/lib/transport): il medaglione
// sulla tappa finale usa la stessa simbologia di biglietto e globo.
const TRANSPORT_MAP: Record<string, { color: string; Icon: ElementType }> = TRANSPORT;

/** Rasterizza un'icona (lucide o Motorcycle) in un'immagine, via SVG data URI. */
function loadModeIcon(Icon: ElementType, color: string): Promise<HTMLImageElement> {
  const svg = renderToStaticMarkup(createElement(Icon, { color, stroke: color, width: 48, height: 48, strokeWidth: 2.4 }));
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("icon load error"));
    img.src = url;
    setTimeout(() => (img.complete && img.naturalWidth > 0 ? resolve(img) : reject(new Error("icon load timeout"))), 2000);
  });
}

const MAPTILER_KEY = "J3c87wVeji5QqN7DSqJX";

type MapStyleMode = "satellite" | "constellation";

/** Stile satellite (attuale): imagery MapTiler su globo inclinato. */
async function buildSatelliteStyle(): Promise<StyleSpecification> {
  const style = await fetchMapStyle();
  style.projection = { type: "globe" };
  style.glyphs = `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${MAPTILER_KEY}`;
  return style;
}

/**
 * Satellite per la Mappa della vita (scelta di Stefano, 2026-10-15): PIATTO
 * (Mercatore, come la Costellazione — i riquadri ingrandiscono la mappa in
 * modo lineare, cosa che il globo non permette) e SENZA i nomi di MapTiler,
 * che si doppierebbero con i nostri (lib/etichetteMappa).
 */
async function buildSatelliteStylePiatto(): Promise<StyleSpecification> {
  const style = await buildSatelliteStyle();
  style.projection = { type: "mercator" };
  style.layers = style.layers.filter(l => l.type !== "symbol");
  // più viva (scelta B di Stefano, 2026-10-19, provata sulle Alpi e
  // sull'Adriatico): neve e coste risaltano, sullo schermo e in stampa
  for (const l of style.layers) {
    if (l.type === "raster") l.paint = { ...l.paint, "raster-saturation": SATELLITE_VIVO.saturazione, "raster-contrast": SATELLITE_VIVO.contrasto };
  }
  return style;
}

/** La foto satellitare della Mappa della vita, un po' più viva. */
const SATELLITE_VIVO = { saturazione: 0.3, contrasto: 0.2 };

/** Le coste nel Satellite della Mappa della vita (scelta E1 di Stefano,
 *  2026-10-19, fra «tenue» e «forte» viste sulla mappa): un alone azzurro
 *  largo e sfumato — l'acqua bassa vicino a riva, che a questa distanza la foto
 *  non mostra — e una schiuma bianca sottile sul bordo. Coste vere
 *  (world-atlas 50m, lib/worldAtlas): ⚠️ da vicino le isole croate escono
 *  semplificate, detto e accettato. */
const COSTE_E1 = {
  acqua: { colore: "#5fc4cc", largo: 10, sfumato: 10, opacita: 0.35 },
  schiuma: { colore: "#e8fbfb", largo: 1.2, sfumato: 1, opacita: 0.5 },
};

/**
 * «Per la stampa» (2026-10-19, per il puzzle-calendario puzzleYOU 64×48 cm):
 * un foglio 4:3 di 1200×900 px CSS disegnato a 6,4× = 7680×5760 (≈300 dpi a
 * 64 cm). I nomi restano grandi come a schermo (11 px su 1200 ≈ 6 mm), i
 * margini sono da stampa (36 px ≈ 2 cm: titolo e firma lontani dal taglio).
 * In Satellite le foto si chiedono 3 livelli più dettagliate (riquadri da 64
 * invece di 512): a 6,4× quelle dello schermo uscirebbero sgranate.
 */
const STAMPA = { w: 1200, h: 900, k: 6.4, margine: 36, tileSize: 64, scalaIcone: 3, attesaMs: 90000 };

// Confini "a costellazione": tenui e sottili, per fare da
// sfondo stellato senza rubare contrasto al tracciato/alle stelle. Pensata come
// master di stampa (resina + LED): piatta dall'alto, alto contrasto b/n.
const CONST_WIDTH: StyleExpr = ["interpolate", ["linear"], ["zoom"], 1, 0.35, 4, 0.7, 8, 1.1];
// Confini e coste della costellazione: stessa fonte del master di stampa
// (vedi CONFINI in lib/posterSvg), così schermo e poster non divergono.
const CONST_COLOR = `rgba(255,255,255,${CONFINI.opacita})`;
const CONST_BORDER_FILTER: StyleExpr = ["all", ["<=", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]];

export function buildConstellationStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${MAPTILER_KEY}`,
    sources: {
      omt: { type: "vector", url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${MAPTILER_KEY}` },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#000000" } },
      {
        id: "coastline", type: "line", source: "omt", "source-layer": "water",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": CONST_COLOR, "line-width": CONST_WIDTH },
      },
      {
        id: "country-borders", type: "line", source: "omt", "source-layer": "boundary",
        filter: CONST_BORDER_FILTER,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": CONST_COLOR, "line-width": CONST_WIDTH },
      },
    ],
  };
}

/** Nodo "stella": nucleo bianco pieno + alone morbido (radial gradient). Usato
 *  come icon-image delle tappe nella vista Costellazione — i punti-LED naturali. */
/**
 * La stella della costellazione, in tre forme:
 *
 * - «larga»: l'alone originale (raggio s/2) — è la stella del POSTER per
 *   anno/viaggio singolo, dove le stelle sono poche e il bagliore è il look
 *   scelto per il master resina+LED. ⚠️ Non farsi tentare dall'unificare: la
 *   prima versione del banco qui sotto cambiava anche questa, e l'interruttore
 *   della Mappa della vita modificava un poster dove non è nemmeno visibile.
 * - «soffusa» / «secca»: il BANCO DI PROVA della Mappa della vita (2026-08-27,
 *   da smontare quando Stefano sceglie): lì le tappe si ammassano e l'alone
 *   largo le impastava (il suo screenshot dell'arco alpino). Soffusa = alone
 *   stretto e tenue; secca = solo il nucleo.
 */
function createStarImageData(forma: "larga" | "soffusa" | "secca", scala = 1): ImageData {
  const s = 48;
  const c = document.createElement("canvas");
  c.width = s * scala; c.height = s * scala;
  const ctx = c.getContext("2d")!;
  ctx.scale(scala, scala);
  const cx = s / 2, cy = s / 2;
  if (forma === "larga") {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.16, "rgba(255,255,255,0.95)");
    g.addColorStop(0.4, "rgba(255,255,255,0.28)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  } else if (forma === "soffusa") {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.28);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, "rgba(255,255,255,0.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(cx, cy, s * 0.11, 0, Math.PI * 2); ctx.fill();
  return ctx.getImageData(0, 0, s * scala, s * scala);
}

/** La tappa della Mappa della vita in Satellite: un punto ambra (il colore dei
 *  km e del tracciato satellite) con il bordo bianco, che si legge sulle foto
 *  dall'alto dove una stella bianca sparirebbe sulla neve e sulle città. */
function createDotImageData(scala = 1): ImageData {
  const s = 32;
  const c = document.createElement("canvas");
  c.width = s * scala; c.height = s * scala;
  const ctx = c.getContext("2d")!;
  ctx.scale(scala, scala);
  const cx = s / 2, cy = s / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s / 2);
  g.addColorStop(0.35, "rgba(251,191,36,0.35)");
  g.addColorStop(1, "rgba(251,191,36,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  ctx.beginPath(); ctx.arc(cx, cy, s * 0.17, 0, Math.PI * 2);
  ctx.fillStyle = "#fbbf24"; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = "#ffffff"; ctx.stroke();
  return ctx.getImageData(0, 0, s * scala, s * scala);
}

/**
 * I nomi, i fili e i riquadri della Mappa della vita sull'immagine condivisa:
 * la STESSA disposizione dello schermo (pixel CSS), moltiplicata per `k`.
 * Un riquadro la cui foto non è ancora arrivata ha comunque le sue stelle, del
 * `coloreStelle` della vista: prima usciva un rettangolo nero coi soli nomi.
 */
function disegnaNomiSuCanvas(ctx: CanvasRenderingContext2D,
  n: { d: Disposizione; foto: Record<number, HTMLCanvasElement> }, k: number, coloreStelle: string) {
  const { d, foto } = n;
  ctx.save();
  ctx.scale(k, k);
  const linea = (f: { x1: number; y1: number; x2: number; y2: number }, colore: string, spessore: number) => {
    ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2);
    ctx.strokeStyle = colore; ctx.lineWidth = spessore; ctx.setLineDash([]); ctx.stroke();
  };
  /** Il filo di un nome: tratteggiato + puntino all'attacco (FILO_NOME). */
  const filoNome = (f: { x1: number; y1: number; x2: number; y2: number }) => {
    ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2);
    ctx.strokeStyle = FILO_NOME.colore; ctx.lineWidth = FILO_NOME.spessore; ctx.lineCap = "round";
    ctx.setLineDash(FILO_NOME.tratteggio); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(f.x2, f.y2, FILO_NOME.puntino, 0, Math.PI * 2); ctx.fillStyle = "#ffffff"; ctx.fill();
  };
  const testo = (s: string, x: number, y: number, allinea: "middle" | "start" | "end", font: string) => {
    ctx.font = font;
    ctx.textAlign = allinea === "middle" ? "center" : allinea === "start" ? "left" : "right";
    ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round"; ctx.lineWidth = 2.6; ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(s, x, y);
    ctx.fillStyle = "#ffffff"; ctx.fillText(s, x, y);
  };
  const fontNome = `italic ${FONT_NOMI.px}px ${FONT_NOMI.famiglia}`;
  const bollino = (numero: number, cx: number, cy: number, raggio: number) => {
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(cx, cy, raggio, 0, Math.PI * 2);
    ctx.fillStyle = BOLLINO.fondo; ctx.fill();
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = `${BOLLINO.font}px Georgia, serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff"; ctx.fillText(String(numero), cx, cy + 0.5);
  };
  // le zone tratteggiate e i loro fili
  for (const r of d.riquadri) {
    ctx.setLineDash([3, 3]); ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 1;
    roundRectPath(ctx, r.zona.x, r.zona.y, r.zona.w, r.zona.h, 3); ctx.stroke();
    linea(r.filo, "rgba(255,255,255,0.5)", 0.9);
    bollino(r.numero, r.numeroZona.x + r.numeroZona.w / 2, r.numeroZona.y + r.numeroZona.h / 2, r.numeroZona.w / 2);
  }
  for (const e of d.conFilo) filoNome(e.filo);
  // i riquadri: la foto della zona ingrandita, il bordo, il numero, i nomi
  for (const r of d.riquadri) {
    ctx.save();
    roundRectPath(ctx, r.posto.x, r.posto.y, r.posto.w, r.posto.h, 6); ctx.clip();
    ctx.fillStyle = "#000"; ctx.fillRect(r.posto.x, r.posto.y, r.posto.w, r.posto.h);
    const f = foto[r.numero];
    if (f) ctx.drawImage(f, r.posto.x, r.posto.y, r.posto.w, r.posto.h);
    else {
      for (const s of r.stelle) {
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 7);
        g.addColorStop(0, coloreStelle); g.addColorStop(0.35, coloreStelle); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.fillRect(s.x - 7, s.y - 7, 14, 14);
      }
      ctx.globalAlpha = ATTENUATE.opacita; ctx.fillStyle = coloreStelle;
      for (const s of r.altre) { ctx.beginPath(); ctx.arc(s.x, s.y, 3 * ATTENUATE.misura, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.setLineDash([]); ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1;
    roundRectPath(ctx, r.posto.x, r.posto.y, r.posto.w, r.posto.h, 6); ctx.stroke();
    bollino(r.numero, r.posto.x + BOLLINO.angolo, r.posto.y + BOLLINO.angolo, BOLLINO.raggio);
    for (const e of r.conFilo) filoNome(e.filo);
    for (const e of [...r.nomi, ...r.conFilo]) testo(e.nome, e.testo.x, e.testo.y, e.testo.allinea, fontNome);
  }
  for (const e of [...d.accanto, ...d.conFilo]) testo(e.nome, e.testo.x, e.testo.y, e.testo.allinea, fontNome);
  ctx.restore();
}

/** Il titolo della Mappa della vita sull'immagine condivisa: la STESSA
 *  geometria dello schermo (lib/titoloVita), in pixel CSS moltiplicati per `k`. */
function disegnaTitoloVitaSuCanvas(ctx: CanvasRenderingContext2D, titolo: string, g: GeometriaTitolo, k: number) {
  ctx.save();
  ctx.scale(k, k);
  ctx.translate(g.perno.x, g.perno.y);
  ctx.rotate(TITOLO_VITA.inclinazione * Math.PI / 180);
  ctx.translate(-g.perno.x, -g.perno.y);
  ctx.font = g.font; ctx.textAlign = "right"; ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,0,0,0.9)"; ctx.shadowBlur = 5 * k; ctx.shadowOffsetY = 1 * k;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(titolo.trim(), g.x, g.y);
  ctx.restore();
}

/** Rettangolo con angoli arrotondati (per comporre il poster su canvas). */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Emula object-fit:cover disegnando l'immagine sul canvas del poster. */
function drawImageCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale, sh = h / scale;
  const sx = (img.naturalWidth - sw) / 2, sy = (img.naturalHeight - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/** Firma "By 🐻" in basso a destra dello snapshot raster (Salva/Condividi),
 *  equivalente a quella degli export SVG. Ombra morbida così gli orsi bianchi
 *  restano visibili anche su porzioni chiare della mappa. */
function drawBrandSignatureCanvas(ctx: CanvasRenderingContext2D, W: number, H: number, dpr: number, logo: HTMLImageElement, margine = 18) {
  const u = dpr;
  const size = 34 * u, pad = margine * u, gap = 7 * u;
  const top = H - pad - size, logoX = W - pad - size;
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.shadowColor = "rgba(0,0,0,0.85)"; ctx.shadowBlur = 4 * u; ctx.shadowOffsetY = 1 * u;
  ctx.drawImage(logo, logoX, top, size, size);
  ctx.font = `italic ${16 * u}px Georgia, 'Times New Roman', serif`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  ctx.fillText("By", logoX - gap, top + size / 2);
  ctx.restore();
}

/**
 * Immagine di una "puntina da mappa" (testa tonda ambra + punta), disegnata su
 * canvas e usata come icon-image di un symbol layer per le tappe. Essendo un
 * layer WebGL della mappa finisce automaticamente anche nello snapshot del
 * poster. icon-anchor "bottom" mette la punta sulla coordinata; pitch-alignment
 * viewport la tiene "in piedi" sulla mappa inclinata, come uno spillo.
 */
function createPinImageData(): ImageData {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = s; c.height = s;
  const ctx = c.getContext("2d")!;
  const cx = s / 2, headCy = s * 0.32, headR = s * 0.24, tipY = s * 0.92;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.7, headCy + headR * 0.6);
  ctx.lineTo(cx, tipY);
  ctx.lineTo(cx + headR * 0.7, headCy + headR * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, headCy, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#fff";
  ctx.beginPath(); ctx.arc(cx, headCy, headR, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(cx, headCy, headR * 0.42, 0, Math.PI * 2); ctx.fill();
  return ctx.getImageData(0, 0, s, s);
}

/**
 * Come createPinImageData, ma con un "medaglione" del mezzo agganciato in basso
 * a destra della testa: cerchio del colore del mezzo (identico alle card) +
 * icona bianca. Usato SOLO per la tappa finale. Essendo un icon-image di symbol
 * layer, finisce automaticamente anche nello snapshot del poster.
 */
function createFinalPinImageData(iconImg: HTMLImageElement, color: string): ImageData {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = s; c.height = s;
  const ctx = c.getContext("2d")!;
  const cx = s / 2, headCy = s * 0.32, headR = s * 0.24, tipY = s * 0.92;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.7, headCy + headR * 0.6);
  ctx.lineTo(cx, tipY);
  ctx.lineTo(cx + headR * 0.7, headCy + headR * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); ctx.arc(cx, headCy, headR, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.lineWidth = 2.5; ctx.strokeStyle = "#fff";
  ctx.beginPath(); ctx.arc(cx, headCy, headR, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(cx, headCy, headR * 0.42, 0, Math.PI * 2); ctx.fill();
  // Medaglione mezzo, basso-destra della testa.
  const bx = cx + headR * 0.9, by = headCy + headR * 0.95, br = s * 0.185;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.lineWidth = 2; ctx.strokeStyle = "#0a1628";
  ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.stroke();
  const isz = br * 1.5;
  ctx.drawImage(iconImg, bx - isz / 2, by - isz / 2, isz, isz);
  return ctx.getImageData(0, 0, s, s);
}

/** Coordinate [lon,lat] dell'intera rotta, tratto stradale reale quando disponibile. */
function buildFlyoverRouteCoords(stops: { lat: number; lon: number }[], legs: FlightLeg[]): [number, number][] {
  const coords: [number, number][] = [[stops[0].lon, stops[0].lat]];
  for (const leg of legs) coords.push(...leg.pathCoords.slice(1));
  return coords;
}

/** Formatta un numero di km con separatore delle migliaia in stile italiano.
 *  Passa da fmtNumber (grouping "always"): toLocaleString("it-IT") da solo non
 *  raggruppa i numeri a 4 cifre, e i totali stanno quasi sempre lì. */
function formatKm(km: number): string {
  return fmtNumber(Math.round(km));
}

// Margini (px) attorno al tracciato nel poster. Con fitBounds questi margini
// fissi fanno sì che il percorso riempia SEMPRE il frame allo stesso modo,
// qualunque sia la lunghezza (lo zoom si adatta). Sono margini attorno ai
// PUNTI (vedi `inquadraturaVera`, che li rispetta davvero): in alto c'è spazio
// per la puntina e il suo nome, che stanno SOPRA il punto, sotto la fila di
// comandi (X, Satellite/Costellazione); in basso per i bottoni.
const FINALE_PADDING = { top: 100, right: 60, bottom: 110, left: 60 };
// In vista piatta (Costellazione, Mappa della vita) i punti sono stelle,
// centrate sul punto: lo spazio in alto per le puntine non serve, e la Mappa
// della vita resta inquadrata com'era.
const FINALE_PADDING_STELLE = { ...FINALE_PADDING, top: 50 };
/** La scheda col titolo del poster satellite (in alto a destra, vedi il JSX
 *  «vetro navy»), in px CSS della mappa: compare solo all'arrivo, quindi
 *  l'inquadratura ne usa la forma nota. `spazioPuntina`: la puntina e il nome
 *  stanno SOPRA il punto. */
const SCHEDA_POSTER = { destra: 16, largaMax: 240, fondo: 145, spazioPuntina: 35 };

// ── Il volo (tornato il 2026-10-06, vedi lib/voloVideo) ─────────────────────
/** Il marker del mezzo corre un filo più della camera: arriva sulla puntina
 *  appena prima della fine della tratta (valore del tag flyover-animato-v1). */
const VELOCITA_MARKER = 1.12;
/** Il decollo: dalla vista larga d'apertura alla partenza, prima della 1ª tratta. */
const DECOLLO_MS = 1800;
/** Quanto resta il poster finale nel video, dopo l'atterraggio. */
const FINALE_VIDEO_MS = 2500;
/** Il titolo d'apertura: resta a schermo (e nel video) per il decollo, poi sfuma. */
const TITOLO_MS = 2800;
/** Durante il volo il tracciato ancora da fare NON si vede: compare solo man
 *  mano che l'icona lo percorre (layer `flyover-traccia`), come Relive. Scelta di
 *  Stefano fra «ombra al 30%» e «niente» rese nel video vero (2026-10-06): le
 *  puntine delle tappe restano, quindi si vede dove si va, non come. */
const OPACITA_DA_FARE = 0;
/** Il taglio della linea del volo: piena prima di `p`, trasparente dopo. */
const TAGLIO = {
  "flyover-traccia": (p: number): StyleExpr => ["step", ["line-progress"], "#fbbf24", Math.max(0, p), "rgba(251,191,36,0)"],
  "flyover-traccia-casing": (p: number): StyleExpr => ["step", ["line-progress"], "rgba(6,14,30,0.65)", Math.max(0, p), "rgba(6,14,30,0)"],
};
/** Quanto si aspetta, al massimo, che arrivino i riquadri della tratta che
 *  comincia (lib/riquadriVolo): prima del decollo, e a ogni tappa. */
const ATTESA_DECOLLO_MS = 3000;
const ATTESA_TAPPA_MS = 1500;
/** Durante l'attesa d'apertura la camera si avvicina piano (livelli di zoom
 *  in tutta l'attesa): un globo fermo per tre secondi sembrava un video bloccato. */
const AVVICINAMENTO_ZOOM = 0.3;
/** Il carattere dei nomi della Mappa della vita (lo stesso a schermo e
 *  nell'immagine condivisa: Noto Serif corsivo, già caricato per le didascalie). */
const FONT_NOMI = { px: 11, famiglia: '"Noto Serif", Georgia, serif' };
/** L'alone nero dietro ai nomi, perché si leggano su confini, linee e foto. */
const ALONE_NOMI = { paintOrder: "stroke", stroke: "rgba(0,0,0,0.85)", strokeWidth: 2.6, strokeLinejoin: "round" } as const;
/** Le stelle dentro un riquadro che non sono del riquadro: più piccole e
 *  spente (le stesse misure nel master SVG, vedi posterSvg). */
const ATTENUATE = { misura: 0.55, opacita: 0.3 };
/** Il filo che lega un nome lontano alla sua stella (scelta D, 2026-10-16):
 *  tratteggiato, così non si scambia per una tratta, con un puntino
 *  all'attacco del nome. Lo stesso a schermo e nell'immagine condivisa; nel
 *  master SVG le stesse forme alla scala della stampa (posterSvg). */
const FILO_NOME = { colore: "rgba(255,255,255,0.9)", spessore: 1, tratteggio: [3, 2.5], puntino: 2 };
/** Il numero di zone e riquadri in un bollino (scelta D, 2026-10-15): cerchio
 *  scuro col bordo bianco, uguale sul tratteggio e nell'angolo del riquadro.
 *  Il raggio sulla zona lo dà la sua casella (lib/etichetteMappa). */
const BOLLINO = { raggio: 8.5, font: 10, angolo: 12, fondo: "#05070d" };
/** Il video costruito («Crea video»): 30 fotogrammi al secondo, e per ognuno
 *  si aspettano i riquadri al massimo questo tempo. */
const FPS_VIDEO = 30;
const ATTESA_FOTOGRAMMA_MS = 3000;
/** Il ritmo del video costruito: le STESSE fasi e curve del volo dal vivo
 *  (vedi lib/copioneVolo), con l'apertura fissa — lì non c'è rete da aspettare. */
const TEMPI_VIDEO: TempiCopione = {
  aperturaMs: 2500, avvicinamentoZoom: AVVICINAMENTO_ZOOM, decolloMs: DECOLLO_MS,
  arrivoMs: 1500, arrivoZoom: 0.15, finaleMs: FINALE_VIDEO_MS,
  titoloMs: TITOLO_MS, sfumaturaMs: 500, velocitaIcona: VELOCITA_MARKER,
};
const attesa = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

// ── Quello che il video disegna sopra la mappa ───────────────────────────────
// Le stesse forme per il video registrato dal vivo e per quello costruito
// fotogramma per fotogramma. `k` = px del video per px CSS della mappa.

/** L'icona del mezzo: cerchio col colore del mezzo, bordo bianco, simbolo. */
function disegnaIcona(ctx: CanvasRenderingContext2D, x: number, y: number, k: number,
  veste: { color: string; img: HTMLImageElement | null }) {
  ctx.beginPath(); ctx.arc(x, y, 15 * k, 0, Math.PI * 2);
  ctx.fillStyle = veste.color; ctx.fill();
  ctx.lineWidth = 2 * k; ctx.strokeStyle = "#ffffff"; ctx.stroke();
  if (veste.img) ctx.drawImage(veste.img, x - 8 * k, y - 8 * k, 16 * k, 16 * k);
}

/** Il contatore dei km, in alto al centro (la stessa pillola che c'è a schermo). */
function disegnaContatore(ctx: CanvasRenderingContext2D, testo: string, w: number, k: number) {
  ctx.font = `600 ${13 * k}px ui-monospace, Menlo, monospace`;
  const tw = ctx.measureText(testo).width + 28 * k;
  ctx.fillStyle = "rgba(10,22,40,0.85)";
  roundRectPath(ctx, w / 2 - tw / 2, 16 * k, tw, 28 * k, 14 * k); ctx.fill();
  ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(testo, w / 2, 30 * k + k);
}

/** Il titolo d'apertura (nome + date), in basso, con l'opacità data. */
function disegnaTitolo(ctx: CanvasRenderingContext2D, alpha: number, titolo: string,
  date: string | null | undefined, w: number, h: number, k: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const maxW = w - 32 * k;
  let fs = 20;
  ctx.font = `700 ${fs * k}px "Space Grotesk", sans-serif`;
  while (fs > 12 && ctx.measureText(titolo).width > maxW - 32 * k) {
    fs -= 1; ctx.font = `700 ${fs * k}px "Space Grotesk", sans-serif`;
  }
  const tw2 = ctx.measureText(titolo).width;
  ctx.font = `400 ${12 * k}px sans-serif`;
  const dw = date ? ctx.measureText(date).width : 0;
  const bw = Math.min(maxW, Math.max(tw2, dw) + 32 * k);
  const bh = (date ? 56 : 40) * k;
  const by = h - 76 * k - bh;
  ctx.fillStyle = "rgba(10,22,40,0.88)";
  roundRectPath(ctx, w / 2 - bw / 2, by, bw, bh, 14 * k); ctx.fill();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#f0f4ff";
  ctx.font = `700 ${fs * k}px "Space Grotesk", sans-serif`;
  ctx.fillText(titolo, w / 2, by + (date ? 21 : 20) * k);
  if (date) {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `400 ${12 * k}px sans-serif`;
    ctx.fillText(date, w / 2, by + 41 * k);
  }
  ctx.restore();
}
/** I bottoni del volo (Pausa, Salta, Scarica video, Rivivi): stessa forma di «Condividi». */
const stileBottoneVolo = {
  display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
  padding: "8px 16px", borderRadius: 999, fontFamily: "inherit",
  background: "rgba(10,22,40,0.85)", border: "0.5px solid #1a2d4a", color: "rgba(255,255,255,0.85)",
} as const;

interface Props {
  trips: Trip[];
  onClose: () => void;
  /**
   * "Mappa della vita": mostra TUTTI i viaggi come costellazione unica, con una
   * polilinea SEPARATA per viaggio (nessuna tratta di collegamento tra viaggi) e
   * titolo/statistiche dedicati (viaggi · paesi · km invece di km · tappe).
   */
  lifeMap?: boolean;
}

/**
 * Poster statico del viaggio in 3D: mappa satellitare inclinata con il tracciato
 * (giallo) e le tappe a puntine con i nomi città, inquadrata sull'intero
 * percorso. Sopra: dati del viaggio (con bandiere dei paesi a ventaglio) e le
 * foto a ventaglio. L'utente può zoomare/spostare, poi "Salva" (lo snapshot
 * diventa il foglio sul biglietto in "I miei viaggi") o "Condividi" (immagine).
 *
 * IL VOLO (tornato il 2026-10-06, richiesto da Stefano): sul viaggio singolo
 * e sull'anno, all'apertura la camera VOLA tratta per tratta — icona del mezzo
 * lungo il tracciato, contatore dei km — e atterra su questo poster. Il volo si
 * registra in un video (.webm, o .mp4 su Safari) da scaricare a fine corsa.
 * La Mappa della vita resta statica. Il volo era stato tolto il 2026-07-23
 * (tag `flyover-animato-v1`): qui è ripreso dentro il poster di oggi, non
 * ripristinato al posto suo.
 */
export function TripFlyover({ trips, onClose, lifeMap = false }: Props) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mountedRef = useRef(true);
  const allCoordsRef = useRef<[number, number][]>([]);
  // Segmenti del tracciato: uno per viaggio in modalità Mappa della vita (linee
  // separate), un unico segmento concatenato negli altri casi.
  const routeSegsRef = useRef<[number, number][][]>([]);
  const totalKmRef = useRef(0);
  const legsRef = useRef<FlightLeg[]>([]);
  const stopsRef = useRef<{ lat: number; lon: number; label: string }[]>([]);
  const finalPinDataRef = useRef<ImageData | null>(null);
  const switchingRef = useRef(false);

  const [phase, setPhase] = useState<"loading" | "ready" | "error" | "empty">("loading");
  const [poster, setPoster] = useState(false); // overlay del poster pronti (dopo l'inquadratura)
  const [savingRelief, setSavingRelief] = useState(false);
  const [exportingSvg, setExportingSvg] = useState(false);
  // La Mappa della vita parte in Costellazione; dal 2026-10-15 si può passare
  // al Satellite (piatto, vedi buildSatelliteStylePiatto), scelta di Stefano.
  const [styleMode, setStyleMode] = useState<MapStyleMode>(lifeMap ? "constellation" : "satellite");
  /** Lo stile che la mappa ha addosso adesso (lo copia la mappa dei riquadri). */
  const stileRef = useRef<StyleSpecification | null>(null);
  const styleModeRef = useRef<MapStyleMode>(styleMode);
  styleModeRef.current = styleMode;
  /** Mappa della vita: nomi, fili e riquadri della vista di adesso (vedi
   *  calcolaNomi), con le foto dei riquadri. Li ricopia l'immagine condivisa. */
  type NomiMappa = { d: Disposizione; foto: Record<number, HTMLCanvasElement>; url: Record<number, string>; w: number; h: number };
  const [nomi, setNomi] = useState<NomiMappa | null>(null);
  const nomiRef = useRef<NomiMappa | null>(null);
  /** False mentre la mappa si muove: i nomi spariscono e tornano a mappa ferma. */
  const [nomiFermi, setNomiFermi] = useState(true);
  const calcoloNomiRef = useRef(0);
  const mappaRiqRef = useRef<{ map: MapLibreMap; div: HTMLDivElement; stile: StyleSpecification; stella: number } | null>(null);
  const mappaRiqInVoloRef = useRef<{ stile: StyleSpecification; p: Promise<MapLibreMap | null> } | null>(null);
  /** Le foto dei riquadri della vista di adesso, finché arrivano (le aspetta,
   *  poco, l'immagine condivisa). */
  const fotoInCorsoRef = useRef<Promise<void> | null>(null);
  const misuraRef = useRef<CanvasRenderingContext2D | null>(null);
  /** Le coste della Mappa della vita (caricate una volta, vedi COSTE_E1). */
  const costeRef = useRef<GeoJSON.Feature<GeoJSON.MultiLineString> | null>(null);
  /** Il titolo della Mappa della vita (scelta di Stefano, 2026-10-16: «solo il
   *  titolo», in alto a destra), salvato su questo dispositivo. */
  const [titoloVita, setTitoloVita] = useState(() => (lifeMap ? leggiTitoloVita() : ""));
  const titoloVitaRef = useRef(titoloVita);
  titoloVitaRef.current = titoloVita;
  const [scriviTitolo, setScriviTitolo] = useState(false);
  /** «Per la stampa» in corso: la percentuale, o null. */
  const [stampa, setStampa] = useState<number | null>(null);
  const stampaRef = useRef(false);
  /** La stampa non è riuscita: lo dice il bottone per qualche secondo. */
  const [stampaFallita, setStampaFallita] = useState(false);
  /** Esc mentre si scrive: si esce senza salvare. */
  const annullaTitoloRef = useRef(false);
  /** Il compagno selezionato, o null per tutti. Filtra la costellazione. */
  /**
   * ⚠️ BANCO DI PROVA (2026-08-27, da smontare quando Stefano sceglie): le due
   * varianti di stella sopravvissute al confronto a cinque — «soffusa» (alone
   * stretto) e «secca» (solo il nucleo). Si ricorda fra un'apertura e l'altra
   * per poterle confrontare con calma, come il vecchio banco del tratto.
   */
  const [stellaSecca, setStellaSecca] = useState(() => {
    try { return localStorage.getItem("navta.prova.stelle.secche") === "1"; } catch { return false; }
  });
  const cambiaStella = (v: boolean) => {
    setStellaSecca(v);
    try { localStorage.setItem("navta.prova.stelle.secche", v ? "1" : "0"); } catch { /* quota piena: pazienza */ }
  };
  /**
   * Mappa della vita: i comandi SI TOLGONO QUANDO GUARDI (idea di Stefano,
   * 2026-08-27, per fare lo screenshot pulito della mappa). Dopo 3s senza
   * tocchi né mouse sfumano tutti — X, interruttore, nomi, azioni — e
   * qualunque tocco o movimento li riporta. Da nascosti non sono cliccabili:
   * il primo tocco SVEGLIA, non preme un bottone invisibile.
   */
  const [comandiVisibili, setComandiVisibili] = useState(true);
  useEffect(() => {
    if (!lifeMap) return;
    let timer: number | undefined;
    const sveglia = () => {
      setComandiVisibili(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setComandiVisibili(false), 3000);
    };
    sveglia();
    const eventi = ["pointerdown", "pointermove", "wheel", "keydown", "touchstart"] as const;
    eventi.forEach(e => window.addEventListener(e, sveglia, { passive: true }));
    return () => { window.clearTimeout(timer); eventi.forEach(e => window.removeEventListener(e, sveglia)); };
  }, [lifeMap]);
  /** Lo stile del riposo, spalmato su ogni blocco di comandi (vuoto fuori dalla
   *  Mappa della vita: gli altri poster tengono i comandi sempre accesi). */
  // ⚠️ durante «Per la stampa» (fino a un minuto e più) restano ACCESI: a
  // riposo sfumava anche la percentuale e sembrava ferma (visto dal vivo)
  const comandiAccesi = comandiVisibili || stampa !== null;
  const velo = lifeMap ? {
    opacity: comandiAccesi ? 1 : 0,
    pointerEvents: (comandiAccesi ? "auto" : "none") as "auto" | "none",
    transition: "opacity 400ms ease",
  } : {};
  const [soloCon, setSoloCon] = useState<string | null>(null);
  /**
   * Le persone con cui hai viaggiato, in ordine di quante volte.
   *
   * ⚠️ Il confronto è senza maiuscole ma l'etichetta mostra la PRIMA forma
   * incontrata: «giulia» e «Giulia» sono la stessa persona e un chip solo, non
   * due. È lo stesso criterio del filtro che già esisteva sul biglietto.
   */
  const compagni = useMemo(() => compagniDeiViaggi(trips), [trips]);

  /**
   * L'insieme che la mappa disegna DAVVERO: filtrato per compagno.
   *
   * ⚠️ Da qui in giù nel componente si usa `viaggi`, non `trips`: se il filtro
   * valesse solo per le linee, titolo, km e conteggi resterebbero quelli di
   * tutti — la stessa mezza-verità che sulle gite aveva fatto dire a Stefano
   * «qualcosa non torna».
   */
  const viaggi = useMemo(() => viaggiCon(trips, soloCon), [trips, soloCon]);
  const [switching, setSwitching] = useState(false);

  // ── Lo stato del VOLO (solo fuori dalla Mappa della vita) ──────────────────
  const animato = !lifeMap;
  type StatoVolo = "spento" | "inVolo" | "pausa" | "finito";
  const [volo, setVolo] = useState<StatoVolo>("spento");
  const inVolo = volo === "inVolo" || volo === "pausa";
  /** Ogni volo ha il suo numero: cambiarlo ferma i loop del volo precedente. */
  const voloIdRef = useRef(0);
  const inPausaRef = useRef(false);
  const rafVoloRef = useRef<number | null>(null);
  const libRef = useRef<Awaited<ReturnType<typeof loadMapLibre>> | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const markerVesteRef = useRef<{ color: string; img: HTMLImageElement | null }>({ color: "#60a5fa", img: null });
  const iconeModiRef = useRef<Record<string, HTMLImageElement>>({});
  const kmFattiRef = useRef(0);
  const contatoreRef = useRef<HTMLSpanElement>(null);
  /** Il formato del video, deciso una volta: null = questo browser non registra. */
  const formato = useMemo(() => (animato ? formatoRegistrabile() : null), [animato]);
  const registratoreRef = useRef<MediaRecorder | null>(null);
  const pezziRef = useRef<Blob[]>([]);
  const rafVideoRef = useRef<number | null>(null);
  const staccaRenderRef = useRef<(() => void) | null>(null);
  const finaleVideoRef = useRef<HTMLCanvasElement | null>(null);
  const finaleT0Ref = useRef(0);
  /** Il cronometro della registrazione, AL NETTO delle pause (che il
   *  registratore non registra): serve a scrivere la durata nel .webm. */
  const regInizioRef = useRef(0);
  const regPausaDaRef = useRef<number | null>(null);
  const regPausaTotRef = useRef(0);
  /** Fino a quando (performance.now) il titolo d'apertura sta a schermo e nel video. */
  const titoloFinoRef = useRef(0);
  const [titoloVisibile, setTitoloVisibile] = useState(false);
  /**
   * All'atterraggio il VIDEO si ferma sull'ultimo fotogramma del volo, mentre a
   * schermo la mappa si allarga dal vivo: nell'allargamento i riquadri a bassa
   * quota non sono ancora caricati e mezzo fotogramma era blu vuoto (prima,
   * scie). Quando la mappa è pronta il poster entra in dissolvenza: un taglio
   * pulito dall'arrivo al poster intero.
   */
  const congelaVideoRef = useRef(false);
  /** Lo scaricamento in anticipo dei riquadri del volo (si interrompe a fine volo). */
  const precaricoRef = useRef<AbortController | null>(null);
  /** «Crea video»: avanzamento (0-100, null = fermo), annulla, anteprima. */
  const [creazione, setCreazione] = useState<number | null>(null);
  const creazioneRef = useRef(false);
  const annullaVideoRef = useRef(false);
  const anteprimaRef = useRef<HTMLCanvasElement | null>(null);
  /** Questo browser sa fare un video? (costruito, o almeno registrato dal vivo) */
  const [sa, setSa] = useState<"costruito" | "dal-vivo" | null>(null);
  /** L'icona nel fotogramma congelato: pixel fissi, non riproiettati sulla mappa che si muove. */
  const markerFissoRef = useRef<{ x: number; y: number; t0: number; color: string; img: HTMLImageElement | null } | null>(null);
  const videoUrlRef = useRef<string | null>(null);
  const [video, setVideo] = useState<{ url: string; blob: Blob } | null>(null);

  const tripsCount = viaggi.length;
  const legs = legsRef.current;
  // date_end può essere null (viaggio di un giorno): senza il check esplicito
  // il confronto era falso e si finiva in formatTripDate(null) → la didascalia
  // diceva "12 lug 2026 → Invalid Date" su card, JPEG e SVG.
  const dateRangeLabel = tripsCount === 1
    ? (viaggi[0].date_end == null || viaggi[0].trip_date === viaggi[0].date_end
      ? formatTripDate(viaggi[0].trip_date)
      : `${formatTripDate(viaggi[0].trip_date)} → ${formatTripDate(viaggi[0].date_end)}`)
    : null;

  // Codici bandiera dei paesi TOCCATI (destinazione + tappe), in ordine di
  // percorso, deduplicati per nome (IT/Italia non si ripete) tenendo il codice.
  const flagCodes = useMemo(() => {
    const seen = new Set<string>();
    const codes: string[] = [];
    const add = (name?: string, code?: string) => {
      const key = (name || code || "").trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      if (code) codes.push(code.toLowerCase());
    };
    for (const t of viaggi) {
      for (const w of t.waypoints ?? []) add(w.country, w.country_code);
      add(t.country, t.country_code);
    }
    return codes.slice(0, 5);
  }, [viaggi]);

  // Titolo del poster: dedicato per la Mappa della vita, altrimenti nome del
  // viaggio (singolo) o conteggio (recap multi-viaggio).
  const posterTitle = lifeMap
    ? "La mappa della mia vita"
    : (tripsCount > 1 ? `${tripsCount} viaggi rivissuti` : viaggi[0].title);

  // Metriche mostrate su card/pillole: gli altri poster km · tappe come prima.
  // La Mappa della vita NON mostra statistiche (la mappa parla da sé): niente
  // pillole né riga stats, resta solo titolo + bandiere. Letta al momento della
  // resa/cattura (i ref sono già popolati quando il poster è visibile).
  const statMetrics = (): { v: string; l: string }[] => lifeMap
    ? []
    : [
        { v: formatKm(totalKmRef.current), l: "km" },
        // Tradotta e al singolare quando serve: era «tappe» fisso, quindi
        // «1 TAPPE» in italiano e «TAPPE» in inglese (trovato dalla rete della
        // lingua appena ha cominciato a guardare il poster di un viaggio).
        { v: String(legsRef.current.length), l: t(legsRef.current.length === 1 ? "tappa" : "tappe") },
      ];
  const statLine = (): string => statMetrics().map(m => `${m.v} ${m.l}`).join("  ·  ");

  // Esc chiude il poster (oltre a click fuori / X) — ma non mentre si scrive:
  // dentro la casella del titolo Esc annulla la scrittura (prima chiudeva
  // TUTTA la Mappa della vita, trovato dalla prova dal vivo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const dove = e.target as HTMLElement | null;
      if (dove && (dove.tagName === "INPUT" || dove.tagName === "TEXTAREA")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /**
   * Dove mettere la camera perché il tracciato stia DAVVERO dentro i margini.
   * fitBounds calcola sulla mappa piatta e poi inclina: con pitch 45 sul globo
   * le tappe non restano dove le aveva messe (misurato su desktop: Milano a
   * 22 px dal bordo sinistro e 102 a destra, coi margini a 60). Qui si prova la
   * camera, si guarda dove cadono le tappe e si correggono centro e zoom, poi
   * si torna indietro: tutto nello stesso fotogramma, quindi non si vede.
   */
  const inquadraturaVera = (
    map: MapLibreMap, coords: [number, number][], bounds: [[number, number], [number, number]], pitch: number,
    margineAlto: number,
  ): { center: [number, number]; zoom: number; sottoLaScheda: boolean } | null => {
    const P = { ...FINALE_PADDING, top: margineAlto };
    const base = map.cameraForBounds(bounds, { padding: P, pitch, bearing: 0, maxZoom: 12 });
    if (!base) return null;
    const el = map.getContainer();
    const W = el.clientWidth, H = el.clientHeight;
    const largo = W - P.left - P.right, alto = H - P.top - P.bottom;
    if (largo <= 0 || alto <= 0) return null;
    const prima = { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
    const c0 = base.center;
    let center: [number, number] = Array.isArray(c0) ? [c0[0], c0[1]]
      : "lng" in c0 ? [c0.lng, c0.lat] : [c0.lon, c0.lat];
    let zoom = base.zoom;
    /** Dove cadono le tappe con la camera in (center, zoom). */
    const ingombro = () => {
      map.jumpTo({ center, zoom, pitch, bearing: 0 });
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const c of coords) {
        const p = map.project(c);
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      }
      return { x0, x1, y0, y1 };
    };
    let ok = false;
    let sottoLaScheda = false;
    try {
      for (let giro = 0; giro < 8; giro++) {
        const { x0, x1, y0, y1 } = ingombro();
        // il centro dei punti va sul centro della zona fra i margini
        const dx = (x0 + x1) / 2 - (P.left + largo / 2);
        const dy = (y0 + y1) / 2 - (P.top + alto / 2);
        const nuovo = map.unproject([W / 2 + dx, H / 2 + dy]);
        center = [nuovo.lng, nuovo.lat];
        // e la loro estensione la riempie (un punto solo: lo zoom resta)
        const s = Math.max((x1 - x0) / largo, (y1 - y0) / alto);
        const dz = s > 1e-3 ? -Math.log2(s) : 0;
        zoom = Math.min(12, zoom + dz);
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(dz) < 0.01) break;
      }
      // ⚠️ La prova del nove: sul globo, con un tracciato grande mezzo mondo
      // (Milano → Tokyo → Honolulu), spostare il centro fa ruotare il globo e
      // la correzione può non convergere — misurato: Honolulu FUORI dal
      // riquadro. Si usa la camera calcolata solo se tiene davvero tutte le
      // tappe dentro i margini; sennò resta l'inquadratura di fitBounds.
      if (Number.isFinite(zoom) && center.every(Number.isFinite)) {
        const { x0, x1, y0, y1 } = ingombro();
        const tolleranza = 4;
        ok = x0 >= P.left - tolleranza && x1 <= W - P.right + tolleranza
          && y0 >= P.top - tolleranza && y1 <= H - P.bottom + tolleranza
          // ⚠️ e VISIBILI: `project` dà un pixel anche a una tappa DIETRO il
          // globo, che così passerebbe i margini. Andata e ritorno: dal pixel
          // si torna alla faccia davanti, cioè a un altro punto.
          && coords.every(c => {
            const q = map.unproject(map.project(c));
            return Math.abs(q.lat - c[1]) < 0.5 && Math.abs(((q.lng - c[0]) % 360 + 540) % 360 - 180) < 0.5;
          });
        // La scheda col titolo (in alto a destra) compare DOPO l'arrivo, quindi
        // non si può misurare: si usa la sua forma nota (SCHEDA_POSTER). Una
        // tappa — o un pezzo di linea — sotto di lei non si vedrebbe.
        const sx = W - SCHEDA_POSTER.destra - Math.min(SCHEDA_POSTER.largaMax, W * 0.7);
        sottoLaScheda = coords.some(c => {
          const p = map.project(c);
          return p.x >= sx - 12 && p.y <= SCHEDA_POSTER.fondo + SCHEDA_POSTER.spazioPuntina;
        });
      }
    } catch {
      ok = false;
    } finally {
      map.jumpTo(prima);
    }
    return ok ? { center, zoom, sottoLaScheda } : null;
  };

  /** Inquadra l'intero tracciato: il percorso riempie sempre il frame allo
   *  stesso modo (margini fissi), qualunque sia la lunghezza. */
  /** L'inquadratura del poster, senza muovere niente: la camera misurata
   *  (`inquadraturaVera`) quando riesce, e in ogni caso i confini del tracciato
   *  per il ripiego su fitBounds. */
  const inquadraturaPoster = (map: MapLibreMap, pitch: number) => {
    const coords = allCoordsRef.current;
    if (!coords.length) return null;
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const [lon, lat] of coords) {
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    }
    const bounds: [[number, number], [number, number]] = [[minLon, minLat], [maxLon, maxLat]];
    // Inclinata (il poster satellite, con le puntine): si misura dove cadono
    // davvero le tappe. Piatta (Costellazione, Mappa della vita): fitBounds
    // è già esatto e resta com'era.
    const prova = (alto: number) => inquadraturaVera(map, coords, bounds, pitch, alto);
    let cam = pitch > 0 ? prova(FINALE_PADDING.top) : null;
    // Se una tappa finisce sotto la scheda col titolo, si rifà con tutto il
    // tracciato SOTTO la scheda (misurato: nel poster dell'anno Budapest ci
    // spariva sotto). Gli altri viaggi restano inquadrati come sono.
    if (cam?.sottoLaScheda) cam = prova(SCHEDA_POSTER.fondo + SCHEDA_POSTER.spazioPuntina) ?? cam;
    return { cam, bounds, padding: pitch > 0 ? FINALE_PADDING : FINALE_PADDING_STELLE };
  };

  /** La camera del poster come numeri (per il video, che la deve raggiungere a
   *  scatti e non in volo). Null se non c'è niente da inquadrare. */
  const cameraPoster = (map: MapLibreMap, pitch = 45): Camera | null => {
    const q = inquadraturaPoster(map, pitch);
    if (!q) return null;
    if (q.cam) return { lon: q.cam.center[0], lat: q.cam.center[1], zoom: q.cam.zoom, pitch, bearing: 0 };
    const c = map.cameraForBounds(q.bounds, { padding: q.padding, pitch, bearing: 0, maxZoom: 12 });
    if (!c) return null;
    const cc = c.center;
    const [lon, lat] = Array.isArray(cc) ? [cc[0], cc[1]] : "lng" in cc ? [cc.lng, cc.lat] : [cc.lon, cc.lat];
    return { lon, lat, zoom: c.zoom ?? map.getZoom(), pitch, bearing: 0 };
  };

  const flyToOverview = (map: MapLibreMap, pitch = 45): Promise<void> => new Promise(resolve => {
    let done = false;
    const finish = () => { if (done) return; done = true; resolve(); };
    try {
      const q = inquadraturaPoster(map, pitch);
      if (!q) { finish(); return; }
      map.once("moveend", finish);
      if (q.cam) map.flyTo({ center: q.cam.center, zoom: q.cam.zoom, pitch, bearing: 0, duration: 1400 });
      else map.fitBounds(q.bounds, { pitch, bearing: 0, padding: q.padding, duration: 1400, maxZoom: 12 });
    } catch { finish(); return; }
    setTimeout(finish, 2200); // salvagente se moveend non scatta
  });

  /**
   * (Ri)aggiunge tracciato + puntine SOPRA lo stile corrente. Idempotente e
   * necessaria dopo ogni `setStyle` (che azzera sorgenti/layer/immagini
   * personalizzati): le guardie `getSource`/`getLayer`/`hasImage` evitano i
   * doppioni al primo caricamento e ricreano tutto dopo un cambio stile.
   */
  /** Le coste (COSTE_E1) sotto tracciati e tappe: solo Mappa della vita, solo
   *  Satellite, e solo quando sono arrivate (se arrivano dopo, le aggiunge
   *  l'effetto che le carica). */
  const aggiungiCoste = (map: MapLibreMap, mode: MapStyleMode) => {
    const coste = costeRef.current;
    if (!lifeMap || mode !== "satellite" || !coste || map.getSource("vita-coste")) return;
    const sotto = map.getLayer("flyover-route-casing") ? "flyover-route-casing" : undefined;
    map.addSource("vita-coste", { type: "geojson", data: coste });
    for (const [id, c] of [["vita-coste-acqua", COSTE_E1.acqua], ["vita-coste-schiuma", COSTE_E1.schiuma]] as const) {
      map.addLayer({
        id, type: "line", source: "vita-coste", layout: { "line-join": "round" },
        paint: { "line-color": c.colore, "line-width": c.largo, "line-blur": c.sfumato, "line-opacity": c.opacita },
      }, sotto);
    }
  };
  // si scaricano al PRIMO passaggio al Satellite: in Costellazione non servono
  // (prima partivano a ogni apertura, anche sul telefono)
  const costeInArrivoRef = useRef(false);
  useEffect(() => {
    if (!lifeMap || styleMode !== "satellite" || costeRef.current || costeInArrivoRef.current) return;
    costeInArrivoRef.current = true;
    loadCoste("50m").then(c => {
      costeRef.current = c;
      if (!mountedRef.current || styleModeRef.current !== "satellite") return;
      const m = mapRef.current;
      if (m) { try { aggiungiCoste(m, "satellite"); } catch { /* stile in cambio: le aggiunge addOverlayLayers */ } }
      // anche alla mappa nascosta dei riquadri, e le foto si rifanno: senza,
      // i riquadri restavano senza coste finché non si spostava la mappa
      const riq = mappaRiqRef.current?.map;
      if (riq) { try { aggiungiCoste(riq, "satellite"); } catch { /* non ancora pronta */ } }
      if (m) void calcolaNomi(m);
    }).catch(() => { /* senza rete: il Satellite resta senza coste */ })
      .finally(() => { costeInArrivoRef.current = false; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifeMap, styleMode]);

  const addOverlayLayers = (map: MapLibreMap, mode: MapStyleMode) => {
    const stops = stopsRef.current;
    if (!stops.length) return;
    const constellation = mode === "constellation";
    aggiungiCoste(map, mode);   // per prime: sotto tracciati e tappe
    if (!map.getSource("flyover-route")) {
      // MultiLineString: un segmento per viaggio nella Mappa della vita (linee
      // separate, senza collegamenti), un solo segmento negli altri poster.
      map.addSource("flyover-route", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: routeSegsRef.current } },
      });
    }
    if (!map.getLayer("flyover-route-casing")) {
      // Casing: alone bianco morbido (costellazione) o contorno scuro (satellite/linee).
      map.addLayer({
        id: "flyover-route-casing", type: "line", source: "flyover-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: constellation
          // Alone dimezzato (era 9/blur 4). Con venticinque viaggi che partono
          // tutti da casa gli aloni si fondevano in una macchia bianca sul
          // perno: metà del "caos" segnalato da Stefano era questo, non la
          // topologia. Scelto da lui provandolo (2026-08-26).
          ? { "line-color": "rgba(255,255,255,0.10)", "line-width": 5, "line-blur": 2 }
          : { "line-color": "rgba(6,14,30,0.65)", "line-width": 8.5 },
      });
    }
    if (!map.getLayer("flyover-route")) {
      // Tracciato: bianco luminoso (costellazione) o ambra (satellite/linee).
      map.addLayer({
        id: "flyover-route", type: "line", source: "flyover-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: constellation
          // 1.1 invece di 2.5: le rotte si distinguono una per una invece di
          // impastarsi. ⚠️ Se un domani si vuole tornare più spesso, ricordarsi
          // che i confini sono tarati CONTRO questo spessore (CONFINI in
          // lib/posterSvg, portati a 0.45 proprio dopo questo cambio).
          ? { "line-color": "#ffffff", "line-width": 1.1, "line-opacity": 0.85 }
          : { "line-color": "#fbbf24", "line-width": 4.5, "line-opacity": 1 },
      });
    }
    if (!map.getSource("flyover-stops")) {
      map.addSource("flyover-stops", {
        type: "geojson",
        data: { type: "FeatureCollection", features: stops.map((s, i) => ({ type: "Feature", geometry: { type: "Point", coordinates: [s.lon, s.lat] }, properties: { name: s.label, final: i === stops.length - 1, i } })) },
      });
    }
    if (!map.hasImage("flyover-pin")) map.addImage("flyover-pin", createPinImageData(), { pixelRatio: 2 });
    if (constellation && !map.hasImage("flyover-star")) {
      map.addImage("flyover-star",
        createStarImageData(lifeMap ? (stellaSecca ? "secca" : "soffusa") : "larga"),
        { pixelRatio: 2 });
    }
    // Mappa della vita in Satellite: punti ambra invece delle puntine
    const puntiVita = lifeMap && !constellation;
    if (puntiVita && !map.hasImage("flyover-dot")) map.addImage("flyover-dot", createDotImageData(), { pixelRatio: 2 });
    // Pin della tappa finale col medaglione del mezzo (solo viste con puntine).
    const hasFinalPin = !constellation && !!finalPinDataRef.current;
    if (hasFinalPin && !map.hasImage("flyover-pin-final")) {
      map.addImage("flyover-pin-final", finalPinDataRef.current as ImageData, { pixelRatio: 2 });
    }
    if (!map.getLayer("flyover-stops")) {
      map.addLayer({
        id: "flyover-stops", type: "symbol", source: "flyover-stops",
        layout: {
          "icon-image": constellation
            ? "flyover-star"
            : puntiVita ? "flyover-dot"
            : (hasFinalPin ? ["case", ["get", "final"], "flyover-pin-final", "flyover-pin"] : "flyover-pin"),
          "icon-size": constellation ? 0.8 : puntiVita ? 1 : 0.9,   // ⚠️ la rilegge mappaPerRiquadri (stelle attenuate nei riquadri)
          "icon-anchor": constellation || puntiVita ? "center" : "bottom",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-pitch-alignment": "viewport",
          // Mappa della vita: nessun nome città sulle stelle (scelta utente:
          // con molte mete i nomi si accavallano → costellazione "pulita").
          "text-field": lifeMap ? "" : ["get", "name"],
          // Costellazione: serif corsivo elegante (fallback a un sans se MapTiler
          // non serve Noto Serif Italic). Altre viste: bold sans come prima.
          "text-font": constellation ? ["Noto Serif Italic", "Open Sans Regular"] : ["Open Sans Bold"],
          "text-size": 13,
          "text-anchor": constellation ? "bottom" : "bottom",
          "text-offset": constellation ? [0, -1.1] : [0, -2.6],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "text-optional": true,
          "text-pitch-alignment": "viewport",
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": constellation ? "rgba(0,0,0,0.85)" : "rgba(6,14,30,0.9)",
          "text-halo-width": constellation ? 1.2 : 1.6,
          "text-halo-blur": 0.5,
        },
      });
    }
  };

  /** Cambia vista (satellite / linee / costellazione): sostituisce lo stile,
   *  ri-aggiunge gli overlay col look giusto e rianima l'inquadratura. Satellite
   *  e Linee inclinate (pitch 45); Costellazione piatta dall'alto (master di
   *  stampa, niente prospettiva). */
  const applyStyle = async (mode: MapStyleMode) => {
    const map = mapRef.current;
    if (!map || switchingRef.current) return;
    switchingRef.current = true;
    setSwitching(true);
    try {
      const style = mode === "satellite"
        ? await (lifeMap ? buildSatelliteStylePiatto() : buildSatelliteStyle())
        : buildConstellationStyle();
      if (!mapRef.current) return;
      stileRef.current = style;
      map.setStyle(style, { diff: false });
      await new Promise<void>(res => {
        let done = false;
        const fin = () => { if (done) return; done = true; res(); };
        map.once("style.load", fin);
        setTimeout(fin, 2500); // salvagente se l'evento non scatta
      });
      if (!mapRef.current || !mountedRef.current) return;
      addOverlayLayers(map, mode);
      // la Mappa della vita resta piatta anche in Satellite (vedi buildSatelliteStylePiatto)
      await flyToOverview(map, mode === "constellation" || lifeMap ? 0 : 45);
    } catch { /* se il cambio stile fallisce, resta la vista precedente */ }
    finally {
      switchingRef.current = false;
      if (mountedRef.current) setSwitching(false);
    }
  };

  const selectStyle = (mode: MapStyleMode) => {
    // a metà stampa si mescolerebbero due stili (foto satellitari con le stelle)
    if (stampaRef.current) return;
    if (switchingRef.current || mode === styleMode) return;
    setStyleMode(mode);
    applyStyle(mode);
  };

  /**
   * Compone il POSTER su un canvas: mappa (tracciato + puntine — la copia del
   * canvas WebGL fatta da captureSnapshotBlob dentro l'evento "render") +
   * pillola dati in alto a destra. Restituisce il canvas pronto per toBlob.
   */
  // `dpr` va passato dal canvas VIVO della mappa: la copia fuori-DOM fatta da
  // captureSnapshotBlob non ha layout (clientWidth 0) e il ripiego darebbe 1,
  // rimpicciolendo firma e didascalia sui telefoni con devicePixelRatio 2-3.
  const composePoster = (mapCanvas: HTMLCanvasElement, flagImgs: HTMLImageElement[], logoImg: HTMLImageElement | null, dpr = mapCanvas.width / (mapCanvas.clientWidth || mapCanvas.width)): HTMLCanvasElement => {
    const c = document.createElement("canvas");
    c.width = mapCanvas.width; c.height = mapCanvas.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(mapCanvas, 0, 0);
    // Firma "By 🐻" in basso a destra, prima di ogni uscita (tutte le viste).
    const stamp = () => { if (logoImg) drawBrandSignatureCanvas(ctx, c.width, c.height, dpr, logoImg); };

    // Mappa della vita: nessuna caption nemmeno nell'immagine salvata/condivisa
    // (coerente con la vista a schermo, mappa "nuda") — ma i NOMI, i fili e i
    // riquadri della vista sì, gli stessi dello schermo (vedi calcolaNomi).
    if (lifeMap) {
      if (nomiRef.current) disegnaNomiSuCanvas(ctx, nomiRef.current, dpr, styleModeRef.current === "satellite" ? "#fbbf24" : "#ffffff");
      const gT = geometriaTitoloVita(titoloVitaRef.current, c.width / dpr, misuraTesto);
      if (gT) disegnaTitoloVitaSuCanvas(ctx, titoloVitaRef.current, gT, dpr);
      stamp();
      return c;
    }

    // Costellazione: DIDASCALIA senza riquadro (serif elegante, monocromatica),
    // allineata a destra, come la caption di una stampa celeste. Disegnata qui
    // così lo snapshot è fedele alla vista a schermo, poi si esce.
    if (styleMode === "constellation") {
      const u = dpr;
      const pad = 20 * u;
      const rightX = c.width - pad;
      const title = posterTitle;
      const flags = flagImgs.filter(im => im.complete && im.naturalWidth > 0);
      const flagW = 22 * u, flagH = 15 * u, flagStep = 16 * u, fgap = 9 * u;
      const flagsW = flags.length > 0 ? (flagW + (flags.length - 1) * flagStep + fgap) : 0;
      const titleCy = pad + 13 * u;
      const stats = statLine();
      // Inclina la didascalia di -3° come a schermo (keyframe flyoverCardIn): a
      // schermo la card resta ruotata di -3°, e l'utente vuole lo stesso taglio
      // nel poster salvato. Perno al centro del blocco per non spostarlo dal frame.
      ctx.font = `600 ${24 * u}px "Cormorant Garamond", serif`;
      const titleW = ctx.measureText(title).width;
      ctx.font = `italic ${12 * u}px "Noto Serif", serif`;
      const datesW = dateRangeLabel ? ctx.measureText(dateRangeLabel).width : 0;
      ctx.font = `600 ${16 * u}px "Cormorant Garamond", serif`;
      const statsW = ctx.measureText(stats).width;
      const blockW = Math.max(titleW + flagsW, datesW, statsW);
      const pivotX = rightX - blockW / 2, pivotY = pad + 26 * u;
      ctx.save();
      ctx.translate(pivotX, pivotY);
      ctx.rotate(-3 * Math.PI / 180);
      ctx.translate(-pivotX, -pivotY);
      ctx.shadowColor = "rgba(0,0,0,0.9)"; ctx.shadowBlur = 5 * u; ctx.shadowOffsetY = 1 * u;
      // bandiere flat, allineate al bordo destro
      for (let i = 0; i < flags.length; i++) {
        const fx = rightX - flagW - (flags.length - 1 - i) * flagStep;
        ctx.fillStyle = "#fff";
        roundRectPath(ctx, fx - 1.2 * u, titleCy - flagH / 2 - 1.2 * u, flagW + 2.4 * u, flagH + 2.4 * u, 2 * u);
        ctx.fill();
        ctx.save();
        roundRectPath(ctx, fx, titleCy - flagH / 2, flagW, flagH, 1.5 * u);
        ctx.clip();
        drawImageCover(ctx, flags[i], fx, titleCy - flagH / 2, flagW, flagH);
        ctx.restore();
      }
      // titolo serif, ancorato a destra (subito a sinistra delle bandiere)
      ctx.font = `600 ${24 * u}px "Cormorant Garamond", serif`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillText(title, rightX - flagsW, titleCy);
      // date corsive
      let y = pad + 30 * u;
      if (dateRangeLabel) {
        ctx.font = `italic ${12 * u}px "Noto Serif", serif`;
        ctx.fillStyle = "rgba(255,255,255,0.68)";
        ctx.textBaseline = "top";
        ctx.fillText(dateRangeLabel, rightX, y);
        y += 20 * u;
      }
      // km · tappe (serif)
      ctx.font = `600 ${16 * u}px "Cormorant Garamond", serif`;
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.textBaseline = "top";
      ctx.fillText(stats, rightX, y);
      ctx.restore();
      ctx.textAlign = "left";
      stamp();
      return c;
    }

    // Card dati (vista Satellite) — vetro navy, FEDELE a quella a schermo
    // (bandiere a ventaglio + titolo + date + pill km/tappe).
    const u = dpr;
    const cardBg = "rgba(10,22,40,0.92)";
    const cardBorder = "#1a2d4a";
    const titleFont = `700 ${15 * u}px "Space Grotesk", sans-serif`;
    const dateFont = `400 ${11 * u}px sans-serif`;
    const pillBg = "rgba(255,255,255,0.06)";
    const pillBorder = "#1a2d4a";
    const pillNumColor = "#fff";
    const pillNumFont = `700 ${15 * u}px "JetBrains Mono", monospace`;
    const innerPad = 14 * u;
    const flagW = 24 * u, flagH = 17 * u, flagStep = 15 * u; // ~9px di sovrapposizione
    const title = posterTitle;
    const flags = flagImgs.filter(im => im.complete && im.naturalWidth > 0);

    ctx.font = titleFont;
    const titleW = ctx.measureText(title).width;
    const flagsW = flags.length > 0 ? (flagW + (flags.length - 1) * flagStep + 8 * u) : 0;
    const headerW = flagsW + titleW;

    ctx.font = dateFont;
    const datesW = dateRangeLabel ? ctx.measureText(dateRangeLabel).width : 0;

    const pills = statMetrics().map(m => ({ v: m.v, l: m.l.toUpperCase() }));
    const pillWs = pills.map(p => {
      ctx.font = pillNumFont;
      const nw = ctx.measureText(p.v).width;
      ctx.font = `700 ${9 * u}px sans-serif`;
      const lw = ctx.measureText(p.l).width;
      return Math.max(nw, lw) + 24 * u;
    });
    const pillsW = pills.length ? pillWs.reduce((a, b) => a + b, 0) + 8 * u * (pills.length - 1) : 0;

    const contentW = Math.max(headerW, datesW, pillsW);
    const cardW = contentW + innerPad * 2;
    // Senza pillole (Mappa della vita) la card è solo header (+ eventuali date):
    // niente spazio/altezza per le pillole.
    const headerH = 22 * u, dateH = dateRangeLabel ? 16 * u : 0, gap = pills.length ? 8 * u : 0, pillH = pills.length ? 42 * u : 0;
    const cardH = innerPad * 2 + headerH + dateH + gap + pillH;
    const cardX = c.width - cardW - 16 * u;
    const cardY = 16 * u;

    ctx.fillStyle = cardBg;
    roundRectPath(ctx, cardX, cardY, cardW, cardH, 14 * u);
    ctx.fill();
    ctx.lineWidth = Math.max(1, 0.5 * u); ctx.strokeStyle = cardBorder; ctx.stroke();

    // header: bandiere a ventaglio + titolo, centrati verticalmente
    const headerCy = cardY + innerPad + headerH / 2;
    const hx = cardX + innerPad;
    for (let i = 0; i < flags.length; i++) {
      ctx.save();
      ctx.translate(hx + flagW / 2 + i * flagStep, headerCy);
      ctx.rotate(((i - (flags.length - 1) / 2) * 7 * Math.PI) / 180);
      ctx.fillStyle = "#fff";
      roundRectPath(ctx, -flagW / 2 - 1.5 * u, -flagH / 2 - 1.5 * u, flagW + 3 * u, flagH + 3 * u, 3 * u);
      ctx.fill();
      ctx.save();
      roundRectPath(ctx, -flagW / 2, -flagH / 2, flagW, flagH, 2.5 * u);
      ctx.clip();
      drawImageCover(ctx, flags[i], -flagW / 2, -flagH / 2, flagW, flagH);
      ctx.restore();
      ctx.restore();
    }
    ctx.font = titleFont;
    ctx.fillStyle = "#f0f4ff";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(title, hx + flagsW, headerCy);

    // date
    let cursorY = cardY + innerPad + headerH;
    if (dateRangeLabel) {
      ctx.font = dateFont;
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.textBaseline = "top";
      ctx.fillText(dateRangeLabel, hx, cursorY);
      cursorY += dateH;
    }

    // pill km / tappe
    const pillY = cursorY + gap;
    let px = hx;
    for (let i = 0; i < pills.length; i++) {
      const pw = pillWs[i];
      ctx.fillStyle = pillBg;
      roundRectPath(ctx, px, pillY, pw, pillH, 10 * u);
      ctx.fill();
      ctx.lineWidth = Math.max(1, 0.5 * u); ctx.strokeStyle = pillBorder; ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillStyle = pillNumColor;
      ctx.font = pillNumFont;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(pills[i].v, px + pw / 2, pillY + 20 * u);
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = `700 ${9 * u}px sans-serif`;
      ctx.fillText(pills[i].l, px + pw / 2, pillY + 33 * u);
      px += pw + 8 * u;
    }
    ctx.textAlign = "left";

    stamp();
    return c;
  };

  /** Logo di marca per la firma sullo snapshot. Stessa origine (public/) →
   *  non "sporca" il canvas, toBlob resta possibile. Caricato una volta sola. */
  const brandLogoRef = useRef<HTMLImageElement | null>(null);
  const loadBrandLogo = (): Promise<HTMLImageElement | null> => new Promise(res => {
    const cached = brandLogoRef.current;
    if (cached && cached.complete && cached.naturalWidth > 0) { res(cached); return; }
    const img = new Image();
    img.onload = () => { brandLogoRef.current = img; res(img); };
    img.onerror = () => res(null);
    setTimeout(() => res(img.complete && img.naturalWidth > 0 ? img : null), 2500);
    img.src = `${import.meta.env.BASE_URL}logo-orsi.png`;
  });

  /** Carica le bandiere dei paesi con crossOrigin (per non "sporcare" il canvas
   *  e permettere toBlob): se una non arriva CORS-clean viene semplicemente
   *  saltata, così il salvataggio non fallisce mai. */
  const loadFlagImages = (): Promise<HTMLImageElement[]> => Promise.all(
    flagCodes.map(code => new Promise<HTMLImageElement | null>(res => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      let done = false;
      const finish = (ok: boolean) => { if (done) return; done = true; res(ok ? img : null); };
      img.onload = () => finish(true);
      img.onerror = () => finish(false);
      setTimeout(() => finish(img.complete && img.naturalWidth > 0), 2500);
      img.src = `https://flagcdn.com/w80/${code}.png`;
    }))
  ).then(arr => arr.filter((x): x is HTMLImageElement => !!x));

  /** Una copia del canvas della mappa, presa DENTRO l'evento "render" (il buffer
   *  WebGL non è preservato: fuori da quel frame drawImage leggerebbe nero).
   *  La usano lo snapshot del poster e il finale del video. */
  const catturaCanvasMappa = (): Promise<HTMLCanvasElement | null> => {
    const map = mapRef.current;
    const mapCanvas = containerRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
    if (!mapCanvas) return Promise.resolve(null);
    return new Promise<HTMLCanvasElement>(res => {
      const grab = () => {
        const c = document.createElement("canvas");
        c.width = mapCanvas.width; c.height = mapCanvas.height;
        c.getContext("2d")!.drawImage(mapCanvas, 0, 0);
        return c;
      };
      if (!map) { res(grab()); return; }
      let done = false;
      const fin = (c: HTMLCanvasElement) => { if (done) return; done = true; res(c); };
      map.once("render", () => fin(grab()));
      map.triggerRepaint();
      setTimeout(() => fin(grab()), 400); // salvagente: copia best-effort
    });
  };

  /** Cattura il poster come JPEG. Forza un render fresco e copia il canvas
   *  in modo SINCRONO dentro l'evento "render": il buffer WebGL non è
   *  preservato (vedi nota alle MapOptions), quindi fuori da quel frame
   *  drawImage leggerebbe nero. */
  const captureSnapshotBlob = async (): Promise<Blob | null> => {
    try {
      const mapCanvas = containerRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
      if (!mapCanvas) return null;
      const [flagImgs, logoImg] = await Promise.all([loadFlagImages(), loadBrandLogo()]);
      // Assicura i font della card (typewriter) prima di disegnarli su canvas:
      // senza, il primo snapshot userebbe un fallback monospazio.
      try {
        if (document.fonts?.load) {
          await Promise.all([
            document.fonts.load('600 24px "Cormorant Garamond"'),
            document.fonts.load('italic 12px "Noto Serif"'),
          ]);
        }
      } catch { /* font non disponibili: si usa il fallback */ }
      // Mappa della vita: le foto dei riquadri ancora in arrivo si aspettano un
      // poco, non di più — ⚠️ oltre ~5 s dal tocco il telefono rifiuta in
      // silenzio la condivisione. Quelle che mancano escono con le sole stelle.
      const fotoInCorso = fotoInCorsoRef.current;
      if (lifeMap && fotoInCorso) await Promise.race([fotoInCorso, new Promise(r => setTimeout(r, 2000))]);
      // Copia il canvas DENTRO il gestore dell'evento "render", in modo
      // sincrono: il backbuffer WebGL (non preservato) è garantito pieno solo
      // lì. Prima la copia avveniva dopo l'await — sul percorso felice reggeva
      // (un solo salto di microtask, prima del compositing), ma il salvagente
      // a tempo scattava in un macrotask a buffer ormai svuotato → poster nero
      // salvato in silenzio (es. app mandata in background subito dopo "Salva").
      const snapshot = await catturaCanvasMappa();
      if (!snapshot) return null;
      const posterCanvas = composePoster(snapshot, flagImgs, logoImg,
        mapCanvas.width / (mapCanvas.clientWidth || mapCanvas.width));
      return await new Promise(res => posterCanvas.toBlob(res, "image/jpeg", 0.9));
    } catch {
      return null;
    }
  };

  // "Salva": cattura la vista corrente (dopo eventuali zoom/spostamenti) come
  // rilievo del viaggio → foglio sul biglietto in "I miei viaggi". Poi chiude.
  const handleSaveRelief = async () => {
    if (savingRelief) return;
    setSavingRelief(true);
    const blob = await captureSnapshotBlob();
    if (blob && viaggi.length === 1) {
      try { await saveReliefImage(viaggi[0].id, blob); } catch { /* IndexedDB non disponibile: non bloccare la chiusura */ }
    }
    onClose();
  };

  // "Condividi": condivide l'immagine del poster (o la scarica se il browser non supporta la condivisione file).
  const handleSharePoster = async () => {
    const blob = await captureSnapshotBlob();
    if (!blob) return;
    const name = lifeMap ? "mappa-della-vita" : (tripsCount === 1 ? viaggi[0].title : "viaggio").replace(/[^\w.-]+/g, "_").slice(0, 40) || "viaggio";
    const file = new File([blob], `${name}-3d.jpg`, { type: "image/jpeg" });
    await shareOrDownload(file, lifeMap ? (titoloVita.trim() || posterTitle) : (tripsCount > 1 ? "Il mio viaggio in 3D" : viaggi[0].title));
  };

  // "Esporta SVG" (solo Costellazione): master VETTORIALE a livelli per la stampa
  // (resina + LED). Confini dal world-atlas ritagliati sul riquadro; tracciato e
  // stelle da dati nostri (precisi); nodi-stella marcati come punti-LED.
  /**
   * «Per la stampa»: la Mappa della vita com'è a schermo (stile, inquadratura,
   * nomi, riquadri, titolo, firma) in un JPEG 4:3 grande, disegnato da una
   * mappa NASCOSTA ad alta densità di pixel. Pensata per il computer: su
   * iPhone una tela così grande non si può fare (Safari si ferma a 16,7 Mpx).
   */
  const handleStampa = async () => {
    const lib = libRef.current, map = mapRef.current, stile = stileRef.current;
    if (!lib || !map || !stile || stampaRef.current) return;
    stampaRef.current = true;
    setStampa(0);
    const nascoste: { m: MapLibreMap; div: HTMLDivElement }[] = [];
    // non riuscita: lo dice il bottone per 5 secondi (prima: niente file e nessun avviso)
    const fallita = () => {
      if (!mountedRef.current) return;
      setStampaFallita(true);
      window.setTimeout(() => { if (mountedRef.current) setStampaFallita(false); }, 5000);
    };
    const modo = styleModeRef.current;   // fermo: anche se cambiasse, la stampa resta di questo stile
    const satellite = modo === "satellite";
    // lo stesso stile, con le foto satellitari più dettagliate
    const st = JSON.parse(JSON.stringify(stile)) as StyleSpecification;
    for (const src of Object.values(st.sources)) if (src.type === "raster") src.tileSize = STAMPA.tileSize;
    const nuovaMappa = async (w: number, h: number) => {
      const div = document.createElement("div");
      div.style.cssText = `position:fixed;left:-20000px;top:0;width:${w}px;height:${h}px;pointer-events:none;`;
      document.body.appendChild(div);
      const m = new lib.Map({
        container: div, style: JSON.parse(JSON.stringify(st)), interactive: false, attributionControl: false,
        fadeDuration: 0, pixelRatio: STAMPA.k, maxCanvasSize: [8192, 8192],
      });
      nascoste.push({ m, div });
      await new Promise<void>(r => { m.once("load", () => r()); setTimeout(r, 20000); });
      // stelle e punti disegnati GRANDI: a 6,4× quelli dello schermo sarebbero sfocati
      if (satellite) m.addImage("flyover-dot", createDotImageData(STAMPA.scalaIcone), { pixelRatio: 2 * STAMPA.scalaIcone });
      else m.addImage("flyover-star", createStarImageData(stellaSecca ? "secca" : "soffusa", STAMPA.scalaIcone), { pixelRatio: 2 * STAMPA.scalaIcone });
      addOverlayLayers(m, modo);
      return { m, div };
    };
    try {
      await Promise.all([
        document.fonts?.load(`italic ${FONT_NOMI.px}px "Noto Serif"`),
        document.fonts?.load(`${TITOLO_VITA.peso} ${TITOLO_VITA.px}px "Cormorant Garamond"`),
      ]).catch(() => undefined);
      if (satellite && !costeRef.current) costeRef.current = await loadCoste("50m").catch(() => null);
      const { m } = await nuovaMappa(STAMPA.w, STAMPA.h);
      // l'inquadratura dello schermo, dentro il foglio 4:3 (che ne mostra un po' di più)
      const cam = m.cameraForBounds(map.getBounds(), { padding: STAMPA.margine });
      if (cam) m.jumpTo(cam);
      setStampa(5);
      await mappaFerma(m, STAMPA.attesaMs);
      if (!mountedRef.current) return;
      const sfondo = await copiaMappa(m);
      setStampa(25);
      const { d, gTitolo } = disponiVita(m, STAMPA.w, STAMPA.h, {
        margine: STAMPA.margine, firma: STAMPA.margine,
        titolo: { destra: STAMPA.margine, alto: STAMPA.margine, selettore: false },
      });
      const foto: Record<number, HTMLCanvasElement> = {};
      if (d.riquadri.length) {
        const riq = await nuovaMappa(200, 150);
        const misura = riq.m.getLayer("flyover-stops") ? riq.m.getLayoutProperty("flyover-stops", "icon-size") : 1;
        const stella = typeof misura === "number" ? misura : 1;
        for (const [i, r] of d.riquadri.entries()) {
          if (!mountedRef.current) return;
          const c = await fotografaRiquadro(m, riq.m, r, { div: riq.div, stella }, STAMPA.attesaMs);
          if (c) foto[r.numero] = c;
          setStampa(25 + Math.round((65 * (i + 1)) / d.riquadri.length));
        }
      }
      // il foglio: mappa, nomi e riquadri, titolo, firma — come «Condividi»
      const c = document.createElement("canvas");
      c.width = sfondo.width; c.height = sfondo.height;
      const ctx = c.getContext("2d")!;
      const k = c.width / STAMPA.w;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(sfondo, 0, 0);
      disegnaNomiSuCanvas(ctx, { d, foto }, k, satellite ? "#fbbf24" : "#ffffff");
      if (gTitolo) disegnaTitoloVitaSuCanvas(ctx, titoloVitaRef.current, gTitolo, k);
      const logo = await loadBrandLogo();
      if (logo) drawBrandSignatureCanvas(ctx, c.width, c.height, k, logo, STAMPA.margine);
      setStampa(95);
      const blob = await new Promise<Blob | null>(res => c.toBlob(res, "image/jpeg", 0.92));
      if (!blob) { fallita(); return; }   // tela troppo grande per questo browser
      downloadBlob(blob, `mappa-della-vita-stampa-${c.width}x${c.height}.jpg`);
    } catch (e) {
      console.error("Per la stampa:", e);
      fallita();
    } finally {
      for (const { m, div } of nascoste) { try { m.remove(); } catch { /* già via */ } div.remove(); }
      stampaRef.current = false;
      if (mountedRef.current) setStampa(null);
    }
  };

  const handleExportSvg = async () => {
    if (exportingSvg) return;
    setExportingSvg(true);
    try {
      const route = allCoordsRef.current;
      const stops = stopsRef.current;
      let rings: [number, number][][] = [];
      try {
        rings = await loadCountryRings(routeBounds(route.length ? route : stops.map(s => [s.lon, s.lat] as [number, number])), "50m");
      } catch { /* confini non disponibili: esporta comunque rotta+stelle */ }
      // Mappa della vita: SVG "nudo" (nessuna caption) → niente titolo/date/stat.
      const title = lifeMap ? "" : (tripsCount > 1 ? `${tripsCount} viaggi` : viaggi[0].title);
      const stats = statLine();
      const svg = buildPosterSvg({ routeSegments: routeSegsRef.current, stops, borders: rings, title, dateLabel: lifeMap ? null : dateRangeLabel, stats, hideLabels: false, nomiOvunque: lifeMap, titoloAngolo: lifeMap ? titoloVita : undefined, misuraTesto });
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const base = lifeMap ? "mappa-della-vita" : (tripsCount === 1 ? viaggi[0].title : "viaggio").replace(/[^\w.-]+/g, "_").slice(0, 40) || "viaggio";
      downloadBlob(blob, `${base}-costellazione.svg`);
    } catch { /* export fallito: non bloccare */ }
    finally {
      if (mountedRef.current) setExportingSvg(false);
    }
  };

  // ══ IL VOLO ════════════════════════════════════════════════════════════
  // Ripreso dal tag `flyover-animato-v1` dentro il poster di oggi. Le regole
  // pure stanno in lib/voloVideo (provate); qui la regia.

  /** Ferma l'animazione del volo in corso (camera + marker + contatore). */
  const fermaAnimazione = () => {
    if (rafVoloRef.current != null) { cancelAnimationFrame(rafVoloRef.current); rafVoloRef.current = null; }
    markerRef.current?.remove();
    markerRef.current = null;
    precaricoRef.current?.abort();
    precaricoRef.current = null;
  };

  /**
   * Scarica in anticipo i riquadri satellite che la camera vedrà, sezione per
   * sezione (0 = decollo, poi una per tratta), così quando ci arriva la mappa
   * è già nitida. Li consegna la cache del browser (o del service worker) alla
   * richiesta di MapLibre. `pronta(i)` si risolve quando le sezioni 0..i sono
   * scaricate; chi la usa mette sempre un tetto all'attesa.
   */
  const avviaPrecarico = (map: MapLibreMap, tratte: FlightLeg[]) => {
    const src = map.getSource("satellite") as { tiles?: string[] } | undefined;
    const modello = src?.tiles?.[0];
    if (!modello) return null;
    const c = map.getCenter();
    const sezioni = [
      { da: { lon: c.lng, lat: c.lat, zoom: map.getZoom() },
        a: { lon: tratte[0].from.lon, lat: tratte[0].from.lat, zoom: tratte[0].camera.zoom } },
      ...tratte.map((tr, i) => ({
        da: { lon: tr.from.lon, lat: tr.from.lat, zoom: (i === 0 ? tr : tratte[i - 1]).camera.zoom },
        a: { lon: tr.to.lon, lat: tr.to.lat, zoom: tr.camera.zoom },
      })),
    ];
    const el = map.getContainer();
    const liste = riquadriDelVolo(sezioni, { w: el.clientWidth, h: el.clientHeight });
    const ctrl = new AbortController();
    precaricoRef.current = ctrl;
    const coda = liste.flatMap((l, s) => l.map(k => ({ k, s })));
    const mancanti = liste.map(l => l.length);
    const attese: (() => void)[][] = liste.map(() => []);
    const pronte = (i: number) => mancanti.slice(0, i + 1).every(n => n === 0);
    const avvisa = () => attese.forEach((a, i) => { if (pronte(i)) { a.forEach(f => f()); a.length = 0; } });
    let prossimo = 0;
    const lavora = async () => {
      while (prossimo < coda.length && !ctrl.signal.aborted) {
        const { k, s } = coda[prossimo++];
        const [z, x, y] = k.split("/");
        try {
          const r = await fetch(modello.replace("{z}", z).replace("{x}", x).replace("{y}", y), { signal: ctrl.signal });
          await r.blob();
        } catch { /* un riquadro perso: lo chiederà MapLibre */ }
        mancanti[s]--;
        avvisa();
      }
    };
    for (let i = 0; i < 6; i++) void lavora();
    return {
      pronta: (i: number) => new Promise<void>(res => {
        if (pronte(Math.min(i, liste.length - 1))) res(); else attese[Math.min(i, liste.length - 1)].push(res);
      }),
    };
  };

  /**
   * Il TRACCIATO CHE SI DISEGNA (2026-10-06): durante il volo il percorso
   * intero si spegne (OPACITA_DA_FARE) e cresce una seconda linea, piena, che
   * finisce esattamente sotto l'icona. È ciò che fa di un volo un racconto:
   * prima la linea era già tutta tracciata e l'icona sembrava un cursore su un
   * percorso noto. Dal 2026-10-12 la linea intera si passa alla mappa UNA volta
   * e si scopre con un taglio (vedi tracciatoProgressivo in lib/flyover): prima
   * si ricalcolava a ogni fotogramma e sul telefono restava indietro all'icona.
   */
  const lineaFatta = (coords: [number, number][]) => ({
    type: "Feature" as const, properties: {},
    geometry: { type: "LineString" as const, coordinates: coords.length > 1 ? coords : [] },
  });
  const preparaTracciatoFatto = (map: MapLibreMap) => {
    const sopra = map.getLayer("flyover-stops") ? "flyover-stops" : undefined;   // le puntine restano sopra
    // `lineMetrics` serve a `line-progress`, su cui si fa il taglio.
    if (!map.getSource("flyover-traccia")) map.addSource("flyover-traccia", { type: "geojson", data: lineaFatta([]), lineMetrics: true });
    for (const [id, largo] of [["flyover-traccia-casing", 8.5], ["flyover-traccia", 4.5]] as const) {
      if (!map.getLayer(id)) {
        map.addLayer({ id, type: "line", source: "flyover-traccia",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-width": largo, "line-gradient": TAGLIO[id](0) } }, sopra);
      }
    }
    tagliaTraccia(map, 0);
    for (const id of ["flyover-route", "flyover-route-casing"]) {
      if (map.getLayer(id)) map.setPaintProperty(id, "line-opacity", OPACITA_DA_FARE);
    }
  };
  /** La linea del volo piena fino a `p` (frazione della linea intera), poi niente. */
  const tagliaTraccia = (map: MapLibreMap, p: number) => {
    for (const id of ["flyover-traccia-casing", "flyover-traccia"] as const) {
      if (map.getLayer(id)) map.setPaintProperty(id, "line-gradient", TAGLIO[id](p));
    }
  };
  /** Aspetta che la mappa abbia caricato i riquadri della vista (evento "idle"),
   *  con un tetto: su una rete lenta il finale non può aspettare per sempre. */
  const attendiMappaPronta = (map: MapLibreMap, maxMs: number) => new Promise<void>(res => {
    let fatto = false;
    const fine = () => { if (!fatto) { fatto = true; res(); } };
    try {
      if (map.areTilesLoaded()) { fine(); return; }
      map.once("idle", fine);
    } catch { fine(); return; }
    setTimeout(fine, maxMs);
  });

  /** A fine volo (o saltando) il percorso torna intero e la linea del volo sparisce. */
  const chiudiTracciatoFatto = (map: MapLibreMap) => {
    for (const id of ["flyover-route", "flyover-route-casing"]) {
      if (map.getLayer(id)) map.setPaintProperty(id, "line-opacity", 1);
    }
    tagliaTraccia(map, 0);
    (map.getSource("flyover-traccia") as GeoJSONSource | undefined)?.setData(lineaFatta([]));
  };

  /** Durante il volo la camera la guida l'animazione: un trascinamento la
   *  strattonerebbe a ogni frame. I gesti tornano all'atterraggio. */
  const gesti = (map: MapLibreMap, attivi: boolean) => {
    for (const h of [map.dragPan, map.scrollZoom, map.boxZoom, map.dragRotate, map.keyboard,
      map.doubleClickZoom, map.touchZoomRotate, map.touchPitch]) {
      try { if (attivi) h.enable(); else h.disable(); } catch { /* handler assente: pazienza */ }
    }
  };

  const testoContatore = () => `${formatKm(kmFattiRef.current)} / ${formatKm(totalKmRef.current)} km`;
  const aggiornaContatore = () => { if (contatoreRef.current) contatoreRef.current.textContent = testoContatore(); };

  /** La chiave del mezzo di una tratta: la casa (rientro fra due viaggi) ha la sua. */
  const modoDi = (leg: FlightLeg) => (leg.to.casa || !leg.to.transportMode ? "casa" : leg.to.transportMode);

  /** Colore e icona del marker per la tratta che comincia. Stessa simbologia di
   *  biglietto e medaglione finale (@/lib/transport); il rientro a casa è grigio. */
  const vestiMarker = (el: HTMLDivElement, modo: string) => {
    const color = modo === "casa" ? "#64748b" : (TRANSPORT_MAP[modo]?.color ?? "#60a5fa");
    const icona = iconeModiRef.current[modo] ?? null;
    el.style.backgroundColor = color;
    const img = el.firstElementChild as HTMLImageElement | null;
    if (img) {
      if (icona) { img.src = icona.src; img.style.display = ""; } else img.style.display = "none";
    }
    markerVesteRef.current = { color, img: icona };
  };

  /**
   * Muove la camera verso un punto pilotandola A MANO, frame per frame (jumpTo):
   * il flyTo nativo non avanza in modo geograficamente lineare e il marker
   * resterebbe indietro (misurato a suo tempo: camera al 97% del tragitto,
   * marker al 50% — vedi tag). Camera e marker leggono lo STESSO `t`.
   *
   * ⚠️ La PAUSA ferma il tempo invece di interrompere: il loop resta vivo senza
   * avanzare e alla ripresa riparte da dov'era. Nel tag la tratta ricominciava
   * da capo e l'icona saltava indietro.
   */
  const animaCamera = (
    map: MapLibreMap, id: number,
    verso: { lon: number; lat: number; zoom: number; pitch: number; bearing: number },
    durataMs: number, suFrame?: (t: number, rawT: number) => void,
  ): Promise<boolean> => new Promise(resolve => {
    const c0 = map.getCenter(), z0 = map.getZoom(), p0 = map.getPitch(), b0 = map.getBearing();
    // la strada CORTA anche oltre l'antimeridiano (Tokyo → Los Angeles sul Pacifico)
    const lon1 = unwrapNear(verso.lon, c0.lng);
    let inizio = performance.now();
    let pausaDa: number | null = null;
    const tick = () => {
      if (!mountedRef.current || voloIdRef.current !== id) { resolve(false); return; }
      const ora = performance.now();
      if (inPausaRef.current) {
        if (pausaDa == null) pausaDa = ora;
        rafVoloRef.current = requestAnimationFrame(tick);
        return;
      }
      if (pausaDa != null) { inizio += ora - pausaDa; pausaDa = null; }
      const rawT = Math.min(1, (ora - inizio) / Math.max(1, durataMs));
      const t = easeInOutCubic(rawT);
      map.jumpTo({
        center: [c0.lng + (lon1 - c0.lng) * t, c0.lat + (verso.lat - c0.lat) * t],
        zoom: z0 + (verso.zoom - z0) * t,
        pitch: p0 + (verso.pitch - p0) * t,
        bearing: b0 + (verso.bearing - b0) * t,
      });
      suFrame?.(t, rawT);
      if (rawT < 1) rafVoloRef.current = requestAnimationFrame(tick);
      else { rafVoloRef.current = null; resolve(true); }
    };
    rafVoloRef.current = requestAnimationFrame(tick);
  });

  /**
   * La registrazione. Il canvas WebGL non conserva il buffer, quindi una copia
   * si prende DENTRO ogni evento "render" (come lo snapshot del poster); un loop
   * a parte la ricompone sul canvas del video insieme a marker e contatore, che
   * sono elementi HTML e non finirebbero mai nel canvas della mappa.
   */
  const avviaRegistrazione = (map: MapLibreMap) => {
    if (!formato) return;
    try {
      const mapCanvas = map.getCanvas();
      const { w, h } = misureVideo(mapCanvas.width, mapCanvas.height);
      const video = document.createElement("canvas");
      video.width = w; video.height = h;
      const ultimo = document.createElement("canvas");
      ultimo.width = w; ultimo.height = h;
      const ctxUltimo = ultimo.getContext("2d")!;
      // ⚠️ SFONDO PIENO prima di ogni copia. Il canvas della mappa ha zone
      // TRASPARENTI — riquadri satellite ancora in caricamento quando la camera
      // si allarga, scritte in dissolvenza, lo spazio attorno al globo — e
      // copiato sopra il fotogramma prima lasciava SCIE: puntine impilate in
      // fila, «Slovenia Slovenia», linee doppie (viste nel file video, mai a
      // schermo, dove sotto c'è lo sfondo del riquadro). È la stessa famiglia
      // del difetto che rendeva il video di LUGLIO una mappa congelata piena di
      // icone ripetute (rifatto girare dal tag per confrontarlo).
      const SFONDO = "#060e1e";
      congelaVideoRef.current = false;
      markerFissoRef.current = null;
      const copia = () => {
        // All'atterraggio il video resta sull'ultimo fotogramma del volo mentre la
        // mappa si allarga e carica (vedi `congelaVideoRef`).
        if (congelaVideoRef.current) return;
        try {
          ctxUltimo.fillStyle = SFONDO;
          ctxUltimo.fillRect(0, 0, w, h);
          ctxUltimo.drawImage(mapCanvas, 0, 0, w, h);
        } catch { /* frame perso */ }
      };
      map.on("render", copia);
      staccaRenderRef.current = () => map.off("render", copia);
      finaleVideoRef.current = null;
      const ctx = video.getContext("2d")!;
      const k = w / (mapCanvas.clientWidth || w);     // px del video per px CSS
      const titoloVideo = posterTitle;
      const dateVideo = dateRangeLabel;
      const disegna = () => {
        rafVideoRef.current = requestAnimationFrame(disegna);
        // anche qui: il poster del finale ha lo spazio attorno al globo trasparente
        ctx.fillStyle = SFONDO;
        ctx.fillRect(0, 0, w, h);
        const finale = finaleVideoRef.current;
        if (finale) {
          // ⚠️ Il finale NON dev'essere un fermo-immagine. Con una scena immobile
          // il codificatore di Chrome smette di aggiornare alcuni blocchi e si
          // trascina pezzi del fotogramma prima (visto: un «863» del contatore
          // incollato accanto alla scheda per tutto il finale, in riproduzione
          // normale — la composizione del finale era pulita). Quindi: dissolvenza
          // dall'ultimo fotogramma del volo, poi un avvicinamento lentissimo
          // (3% in tutto il finale) che fa cambiare ogni fotogramma.
          const dt = performance.now() - finaleT0Ref.current;
          const s = 1 + 0.03 * Math.min(1, dt / FINALE_VIDEO_MS);
          ctx.drawImage(finale, -(s - 1) * w / 2, -(s - 1) * h / 2, w * s, h * s);
          if (dt < 700) {
            ctx.globalAlpha = 1 - dt / 700;
            ctx.drawImage(ultimo, 0, 0);
            ctx.globalAlpha = 1;
          }
          return;
        }
        const fisso = congelaVideoRef.current ? markerFissoRef.current : null;
        if (fisso) {
          // L'ARRIVO: il fotogramma fermo si avvicina piano verso la meta, così
          // è un momento voluto e non un video che si è bloccato.
          const s = 1 + 0.05 * Math.min(1, (performance.now() - fisso.t0) / 3000);
          ctx.save();
          ctx.translate(fisso.x * k, fisso.y * k);
          ctx.scale(s, s);
          ctx.translate(-fisso.x * k, -fisso.y * k);
          ctx.drawImage(ultimo, 0, 0);
          ctx.restore();
        } else {
          ctx.drawImage(ultimo, 0, 0);
        }
        const m = markerRef.current;
        if (fisso || m) {
          const p = fisso ?? map.project(m!.getLngLat());
          disegnaIcona(ctx, p.x * k, p.y * k, k, fisso ?? markerVesteRef.current);
        }
        disegnaContatore(ctx, testoContatore(), w, k);
        // Il titolo d'apertura (lo stesso riquadro che c'è a schermo), che sfuma.
        const restoTitolo = titoloFinoRef.current - performance.now();
        if (restoTitolo > 0) disegnaTitolo(ctx, Math.min(1, restoTitolo / 500), titoloVideo, dateVideo, w, h, k);
      };
      disegna();
      const rec = new MediaRecorder(video.captureStream(30), { mimeType: formato.mime, videoBitsPerSecond: 4_000_000 });
      pezziRef.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) pezziRef.current.push(e.data); };
      rec.start(1000);
      registratoreRef.current = rec;
      regInizioRef.current = performance.now();
      regPausaDaRef.current = null;
      regPausaTotRef.current = 0;
    } catch {
      // niente registrazione su questo dispositivo: il volo si vede lo stesso
      fermaRegistrazione(false);
    }
  };

  /** Chiude la registrazione: `tieni` decide se ne nasce un video (Salta lo butta). */
  const fermaRegistrazione = (tieni: boolean) => {
    if (rafVideoRef.current != null) { cancelAnimationFrame(rafVideoRef.current); rafVideoRef.current = null; }
    staccaRenderRef.current?.();
    staccaRenderRef.current = null;
    const rec = registratoreRef.current;
    registratoreRef.current = null;
    if (!rec) return;
    const ora = performance.now();
    const inPausa = regPausaDaRef.current != null ? ora - regPausaDaRef.current : 0;
    const durataMs = ora - regInizioRef.current - regPausaTotRef.current - inPausa;
    rec.onstop = async () => {
      if (!tieni || !mountedRef.current || !formato) return;
      let blob = new Blob(pezziRef.current, { type: formato.mime.split(";")[0] });
      if (blob.size === 0) return;
      // ⚠️ I .webm di Chrome escono SENZA durata nell'intestazione: lettori e
      // gallerie li mostrano a 0:00 e non lasciano scorrere avanti e indietro
      // (misurato sul primo video: `duration` = Infinity). Si riscrive la
      // durata dopo la registrazione. L'mp4 di Safari non ne ha bisogno.
      if (formato.estensione === "webm") {
        try { blob = await fixWebmDuration(blob, durataMs, { logger: false }); } catch { /* resta senza durata */ }
      }
      if (!mountedRef.current) return;
      const url = URL.createObjectURL(blob);
      videoUrlRef.current = url;
      setVideo({ url, blob });
    };
    try { if (rec.state !== "inactive") rec.stop(); } catch { /* già fermo */ }
  };

  /** Butta il video del volo precedente (prima di un nuovo volo, o chiudendo). */
  const buttaVideo = () => {
    if (videoUrlRef.current) { URL.revokeObjectURL(videoUrlRef.current); videoUrlRef.current = null; }
    setVideo(null);
  };

  /** Il volo intero: decollo → tratte → atterraggio sul poster → finale del video. */
  /** Il volo, con la rete sotto: se qualcosa va in errore a metà (un'icona,
   *  il marker, la mappa) si atterra comunque sul poster come con «Salta» —
   *  senza, il volo restava appeso: niente poster e comandi che non servono. */
  /** `registra`: il volo si registra MENTRE si vola. Solo come ripiego di «Crea
   *  video» dove il browser non sa costruire il video (vedi costruisciVideo):
   *  la registrazione dal vivo dimezzava la fluidità del volo sui telefoni. */
  const avviaVolo = (map: MapLibreMap, registra = false) => {
    voloVero(map, registra).catch(() => { if (mountedRef.current) salta(); });
  };

  const voloVero = async (map: MapLibreMap, registra: boolean) => {
    const lib = libRef.current;
    const tratte = legsRef.current;
    if (!lib || !tratte.length) return;
    const id = ++voloIdRef.current;
    const vivo = () => mountedRef.current && voloIdRef.current === id;
    fermaAnimazione();
    fermaRegistrazione(false);
    // il video già fatto resta (è dello stesso viaggio): si butta solo per rifarlo
    if (registra) buttaVideo();
    setPoster(false);
    inPausaRef.current = false;
    kmFattiRef.current = 0;
    setVolo("inVolo");
    gesti(map, false);

    // Le icone dei mezzi, rasterizzate una volta (servono al DOM e al video).
    const modi = new Set(tratte.map(modoDi));
    await Promise.all([...modi].filter(m => !iconeModiRef.current[m]).map(async m => {
      const Icon = m === "casa" ? Home : TRANSPORT_MAP[m]?.Icon;
      if (!Icon) return;
      try { iconeModiRef.current[m] = await loadModeIcon(Icon, "#ffffff"); } catch { /* senza icona: solo il colore */ }
    }));
    if (!vivo()) return;

    const el = document.createElement("div");
    el.style.cssText = "width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;"
      + "border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.55);";
    const img = document.createElement("img");
    img.alt = ""; img.style.cssText = "width:16px;height:16px;";
    el.appendChild(img);
    vestiMarker(el, modoDi(tratte[0]));
    const marker = new lib.Marker({ element: el }).setLngLat([tratte[0].from.lon, tratte[0].from.lat]).addTo(map);
    markerRef.current = marker;
    aggiornaContatore();
    preparaTracciatoFatto(map);
    // La linea intera parte SUBITO, così la mappa la prepara durante l'apertura:
    // in volo cambia solo il taglio.
    const traccia = tracciatoProgressivo(tratte.map(tr => tr.pathCoords));
    (map.getSource("flyover-traccia") as GeoJSONSource | undefined)?.setData(lineaFatta(traccia.percorso));
    const precarico = avviaPrecarico(map, tratte);
    // Il titolo d'apertura: a schermo e nel video sulla vista d'apertura e
    // dentro il decollo, poi sfuma.
    titoloFinoRef.current = Infinity;
    setTitoloVisibile(true);
    if (registra) avviaRegistrazione(map);

    // 0. Sulla vista d'apertura, col titolo, finché arrivano i riquadri del
    //    decollo e della prima tratta (con un tetto).
    if (precarico) {
      const z0 = map.getZoom();
      let t0 = performance.now();
      let prima = t0;
      const avvicina = () => {
        if (!vivo()) return;
        const ora = performance.now();
        if (inPausaRef.current) t0 += ora - prima;    // in pausa si ferma anche questo
        prima = ora;
        // ease-out: parte e rallenta; il decollo riparte da fermo (easeInOutCubic)
        const k = Math.min(1, (ora - t0) / ATTESA_DECOLLO_MS);
        map.jumpTo({ zoom: z0 + AVVICINAMENTO_ZOOM * Math.sin(k * Math.PI / 2) });
        rafVoloRef.current = requestAnimationFrame(avvicina);
      };
      rafVoloRef.current = requestAnimationFrame(avvicina);
      await Promise.race([precarico.pronta(1), attesa(ATTESA_DECOLLO_MS)]);
      // ⚠️ PRIMA vivo(), poi il raf: con Salta + Rivivi durante l'attesa il raf
      // è già del volo NUOVO, e cancellarlo lo lasciava appeso a metà.
      if (!vivo()) return;
      if (rafVoloRef.current != null) { cancelAnimationFrame(rafVoloRef.current); rafVoloRef.current = null; }
    }
    titoloFinoRef.current = performance.now() + TITOLO_MS;
    setTimeout(() => { if (vivo()) setTitoloVisibile(false); }, TITOLO_MS - 500);

    // 1. Decollo: dalla vista larga d'apertura alla partenza, con la camera
    //    già alla quota della prima tratta (sennò zoom e traslazione insieme).
    const c = tratte[0].camera;
    if (!await animaCamera(map, id, { lon: tratte[0].from.lon, lat: tratte[0].from.lat, zoom: c.zoom, pitch: c.pitch, bearing: c.bearing }, DECOLLO_MS)) return;

    // 2. Le tratte. Il contatore aggiunge solo i km contati (lib/voloVideo).
    const kmTratte = kmContatiPerTratta(tratte);
    let primaKm = 0;
    for (let i = 0; i < tratte.length; i++) {
      const tr = tratte[i];
      // Sulla tappa, un attimo, se i riquadri della prossima tratta non sono arrivati.
      if (i > 0 && precarico) {
        await Promise.race([precarico.pronta(i + 1), attesa(ATTESA_TAPPA_MS)]);
        if (!vivo()) return;
      }
      vestiMarker(el, modoDi(tr));
      const ok = await animaCamera(map, id,
        { lon: tr.to.lon, lat: tr.to.lat, zoom: tr.camera.zoom, pitch: tr.camera.pitch, bearing: tr.camera.bearing },
        tr.camera.durationMs,
        (t, rawT) => {
          const tm = easeInOutCubic(Math.min(1, rawT * VELOCITA_MARKER));
          marker.setLngLat(pointAlongPath(tr.pathCoords, tm));
          // la linea finisce sotto l'icona: stesso `tm` del marker (solo stile:
          // niente ricalcolo nel processo della mappa, vedi tracciatoProgressivo)
          tagliaTraccia(map, traccia.progresso(i, tm));
          kmFattiRef.current = primaKm + kmTratte[i] * t;
          aggiornaContatore();
        });
      if (!ok) return;
      primaKm += kmTratte[i];
    }

    // 3. Atterraggio. Il VIDEO si ferma qui, sull'ultimo fotogramma del volo con
    //    l'icona sulla meta (posizione fissata in pixel: la mappa sotto si sta
    //    per muovere). A schermo invece: via il marker, il contatore sul numero
    //    del poster, il percorso torna intero, la camera si allarga.
    const pFisso = map.project(marker.getLngLat());
    markerFissoRef.current = { x: pFisso.x, y: pFisso.y, t0: performance.now(), ...markerVesteRef.current };
    kmFattiRef.current = totalKmRef.current;
    congelaVideoRef.current = true;
    fermaAnimazione();
    chiudiTracciatoFatto(map);
    aggiornaContatore();
    await flyToOverview(map, 45);
    if (!vivo()) return;
    gesti(map, true);
    setPoster(true);
    setVolo("finito");

    // 4. Il finale del video: quando la mappa ha finito di caricare, la STESSA
    //    composizione dell'immagine condivisa (scheda + firma) entra in
    //    dissolvenza sull'ultimo fotogramma del volo; poi si chiude il file.
    if (registratoreRef.current) {
      await attendiMappaPronta(map, 1500);
      if (!vivo()) return;
      try {
        const [flagImgs, logoImg] = await Promise.all([loadFlagImages(), loadBrandLogo()]);
        const snap = await catturaCanvasMappa();
        const mc = map.getCanvas();
        if (snap && vivo()) {
          finaleVideoRef.current = composePoster(snap, flagImgs, logoImg, mc.width / (mc.clientWidth || mc.width));
          finaleT0Ref.current = performance.now();
        }
      } catch { /* finale senza scheda: resta l'ultimo frame */ }
      await attesa(FINALE_VIDEO_MS);
      if (!vivo()) return;
      fermaRegistrazione(true);
    }
  };

  const pausa = () => {
    inPausaRef.current = true;
    setVolo("pausa");
    try {
      if (registratoreRef.current?.state === "recording") {
        registratoreRef.current.pause();
        regPausaDaRef.current = performance.now();
      }
    } catch { /* niente pausa: pazienza */ }
  };
  const riprendi = () => {
    inPausaRef.current = false;
    setVolo("inVolo");
    try {
      if (registratoreRef.current?.state === "paused") {
        registratoreRef.current.resume();
        if (regPausaDaRef.current != null) regPausaTotRef.current += performance.now() - regPausaDaRef.current;
        regPausaDaRef.current = null;
      }
    } catch { /* idem */ }
  };

  /** Salta: dritti al poster. Un video a metà non serve: si butta. */
  const salta = async () => {
    const map = mapRef.current;
    if (!map) return;
    voloIdRef.current++;              // ferma il volo in corso (i suoi loop lo vedono)
    inPausaRef.current = false;
    fermaAnimazione();
    fermaRegistrazione(false);
    try { chiudiTracciatoFatto(map); } catch { /* stile cambiato: niente da ripristinare */ }
    setTitoloVisibile(false);
    titoloFinoRef.current = 0;        // in attesa sulla vista d'apertura era «per sempre»
    gesti(map, true);
    setVolo("finito");
    await flyToOverview(map, 45);
    if (mountedRef.current) setPoster(true);
  };

  const scaricaVideo = async () => {
    if (!video) return;
    const tipo = video.blob.type || "video/mp4";
    const nome = nomeFileVideo(posterTitle, { mime: tipo, estensione: tipo.includes("mp4") ? "mp4" : "webm" });
    const file = new File([video.blob], nome, { type: tipo });
    await shareOrDownload(file, tripsCount > 1 ? "Il mio viaggio in 3D" : posterTitle);
  };

  /** Il colore e il simbolo dell'icona per un mezzo (come vestiMarker, senza DOM). */
  const vesteDi = (modo: string) => ({
    color: modo === "casa" ? "#64748b" : (TRANSPORT_MAP[modo]?.color ?? "#60a5fa"),
    img: iconeModiRef.current[modo] ?? null,
  });

  /** Aspetta che la pagina sia in primo piano. Con l'app in background la mappa
   *  non disegna, e la copia di salvataggio di `catturaCanvasMappa` (dopo
   *  400 ms) metterebbe nel video un fotogramma nero. */
  const visibile = () => new Promise<void>(res => {
    if (document.visibilityState !== "hidden") { res(); return; }
    const su = () => {
      if (document.visibilityState === "hidden") return;
      document.removeEventListener("visibilitychange", su);
      // un giro di disegno prima di copiare: al ritorno il canvas può essere vuoto
      requestAnimationFrame(() => res());
    };
    document.addEventListener("visibilitychange", su);
  });

  /** Aspetta che la mappa abbia i riquadri della vista, con un tetto. Dopo un
   *  jumpTo i riquadri si chiedono solo al render successivo: si fa girare. */
  const mappaNitida = (map: MapLibreMap, maxMs: number) => new Promise<void>(res => {
    const t0 = performance.now();
    let giri = 0;
    const prova = () => {
      giri++;
      let pronta = true;
      try { pronta = map.areTilesLoaded(); } catch { /* mappa sparita: si va avanti */ }
      if ((pronta && giri > 1) || performance.now() - t0 > maxMs || !mountedRef.current) { res(); return; }
      requestAnimationFrame(prova);
    };
    map.triggerRepaint();
    requestAnimationFrame(prova);
  });

  /**
   * «Crea video»: il volo ricostruito FOTOGRAMMA PER FOTOGRAMMA (lib/copioneVolo)
   * e codificato in mp4 (WebCodecs + mp4-muxer). Per ogni fotogramma: la mappa
   * va dove dice il copione, si aspetta che sia nitida, la si copia, sopra si
   * disegnano icona, contatore e titolo, e si codifica con il SUO istante
   * (n/30 s) — così il video è sempre a 30 fps pieni, anche se ogni fotogramma
   * ha richiesto un secondo. Dove il browser non sa farlo, si ripiega sul volo
   * registrato dal vivo.
   */
  const costruisciVideo = async () => {
    const map = mapRef.current;
    const tratte = legsRef.current;
    if (!map || !tratte.length || creazioneRef.current) return;
    // ⚠️ il segnale si accende PRIMA dell'attesa sul codice: con due tocchi
    // rapidi partivano due creazioni sulla stessa mappa
    creazioneRef.current = true;
    const mc = map.getCanvas();
    const { w, h } = misureVideo(mc.width, mc.height);
    const codec = await codecCostruzione(w, h);
    if (!codec) {
      creazioneRef.current = false;
      if (formato && mountedRef.current) avviaVolo(map, true);   // il ripiego: registrazione dal vivo
      return;
    }
    annullaVideoRef.current = false;
    buttaVideo();
    setCreazione(0);
    gesti(map, false);
    const camPoster = cameraPoster(map, 45);
    let encoder: VideoEncoder | null = null;
    try {
      const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
      // le icone dei mezzi, come nel volo dal vivo
      const modi = new Set(tratte.map(modoDi));
      await Promise.all([...modi].filter(m => !iconeModiRef.current[m]).map(async m => {
        const Icon = m === "casa" ? Home : TRANSPORT_MAP[m]?.Icon;
        if (!Icon) return;
        try { iconeModiRef.current[m] = await loadModeIcon(Icon, "#ffffff"); } catch { /* solo il colore */ }
      }));
      if (!camPoster) return;               // niente da inquadrare: il finally rimette a posto

      const tela = document.createElement("canvas");
      tela.width = w; tela.height = h;
      const ctx = tela.getContext("2d")!;
      const ultimoVolo = document.createElement("canvas");
      ultimoVolo.width = w; ultimoVolo.height = h;
      const ctxUltimo = ultimoVolo.getContext("2d")!;
      const k = w / (mc.clientWidth || w);
      const SFONDO = "#060e1e";

      // Il poster del finale: la stessa composizione dell'immagine condivisa.
      // (il percorso intero si riaccende con una dissolvenza in tempo vero:
      // senza l'attesa il poster del video poteva uscire con la linea a metà)
      chiudiTracciatoFatto(map);
      map.jumpTo({ center: [camPoster.lon, camPoster.lat], zoom: camPoster.zoom, pitch: camPoster.pitch, bearing: camPoster.bearing });
      await Promise.all([mappaNitida(map, 4000), attesa(450)]);
      await visibile();
      const [flagImgs, logoImg] = await Promise.all([loadFlagImages(), loadBrandLogo()]);
      const snap = await catturaCanvasMappa();
      const finale = snap ? composePoster(snap, flagImgs, logoImg, mc.width / (mc.clientWidth || mc.width)) : null;

      // La linea che si scopre, come nel volo dal vivo.
      preparaTracciatoFatto(map);
      const traccia = tracciatoProgressivo(tratte.map(tr => tr.pathCoords));
      (map.getSource("flyover-traccia") as GeoJSONSource | undefined)?.setData(lineaFatta(traccia.percorso));
      // ⚠️ la mappa spegne il percorso intero con una dissolvenza di 300 ms in
      // tempo VERO: il primo fotogramma del video, che arriva prima, lo
      // mostrava ancora tutto (visto nel video dell'anno). Si aspetta che sparisca.
      await attesa(450);

      const copione = copioneVolo(tratte, camPoster, kmContatiPerTratta(tratte), TEMPI_VIDEO);
      const passo = 1000 / FPS_VIDEO;
      const n = Math.ceil(copione.durataMs / passo);

      const target = new ArrayBufferTarget();
      const muxer = new Muxer({ target, video: { codec: "avc", width: w, height: h, frameRate: FPS_VIDEO }, fastStart: "in-memory" });
      let errore: unknown = null;
      encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { errore = e; } });
      // 4 Mbit/s: a 6 un volo di 22 s pesava 16,7 MB (un anno sarebbe passato i 40)
      encoder.configure({ codec, width: w, height: h, bitrate: 4_000_000, framerate: FPS_VIDEO });

      for (let i = 0; i <= n; i++) {
        if (annullaVideoRef.current || !mountedRef.current) break;
        if (errore) throw errore;
        const s = copione.statoAl(i * passo);
        ctx.fillStyle = SFONDO;
        ctx.fillRect(0, 0, w, h);
        if (s.fase !== "finale") {
          map.jumpTo({ center: [s.camera.lon, s.camera.lat], zoom: s.camera.zoom, pitch: s.camera.pitch, bearing: s.camera.bearing });
          tagliaTraccia(map, s.tratta >= 0 ? traccia.progresso(s.tratta, s.tm) : 0);
          await mappaNitida(map, ATTESA_FOTOGRAMMA_MS);
          await visibile();
          const img = await catturaCanvasMappa();
          if (img) ctx.drawImage(img, 0, 0, w, h);
          if (s.icona) {
            const p = map.project(s.icona);
            // solo se il punto si vede: `project` dà un pixel anche a un punto
            // DIETRO il globo (Milano, all'inizio di Milano → Tokyo → Honolulu)
            const q = map.unproject(p);
            const visto = Math.abs(q.lat - s.icona[1]) < 0.5 && Math.abs(((q.lng - s.icona[0]) % 360 + 540) % 360 - 180) < 0.5;
            if (visto) disegnaIcona(ctx, p.x * k, p.y * k, k, vesteDi(modoDi(tratte[Math.max(0, s.tratta)])));
          }
          disegnaContatore(ctx, `${formatKm(s.km)} / ${formatKm(totalKmRef.current)} km`, w, k);
          if (s.titolo > 0) disegnaTitolo(ctx, s.titolo, posterTitle, dateRangeLabel, w, h, k);
          ctxUltimo.drawImage(tela, 0, 0);
        } else {
          // il poster entra in dissolvenza sull'ultimo fotogramma del volo e si
          // avvicina piano (un fermo-immagine fa impigrire il codificatore)
          if (finale) {
            const z = 1 + 0.03 * s.k;
            ctx.drawImage(finale, -(z - 1) * w / 2, -(z - 1) * h / 2, w * z, h * z);
          }
          if (s.inFase < 700) {
            ctx.globalAlpha = 1 - s.inFase / 700;
            ctx.drawImage(ultimoVolo, 0, 0);
            ctx.globalAlpha = 1;
          }
        }
        const fotogramma = new VideoFrame(tela, { timestamp: Math.round(i * 1e6 / FPS_VIDEO), duration: Math.round(1e6 / FPS_VIDEO) });
        encoder.encode(fotogramma, { keyFrame: i % (FPS_VIDEO * 2) === 0 });
        fotogramma.close();
        while (encoder.encodeQueueSize > 4) await attesa(4);
        if (i % 6 === 0) {
          setCreazione(Math.round((i / n) * 100));
          const a = anteprimaRef.current;
          if (a) {
            // le proporzioni del video vero (verticale sul telefono, larga su desktop)
            const ah = Math.round(180 * h / w);
            if (a.height !== ah) { a.width = 180; a.height = ah; a.style.aspectRatio = `${w} / ${h}`; }
            a.getContext("2d")?.drawImage(tela, 0, 0, a.width, a.height);
          }
        }
      }
      if (annullaVideoRef.current || !mountedRef.current) return;
      await encoder.flush();
      if (errore) throw errore;
      muxer.finalize();
      const blob = new Blob([target.buffer], { type: "video/mp4" });
      if (!mountedRef.current) return;
      const url = URL.createObjectURL(blob);
      videoUrlRef.current = url;
      setVideo({ url, blob });
    } catch {
      // il video non è venuto: il poster resta com'era, si può riprovare
    } finally {
      try { if (encoder && encoder.state !== "closed") encoder.close(); } catch { /* già chiuso */ }
      creazioneRef.current = false;
      if (mountedRef.current) {
        try {
          chiudiTracciatoFatto(map);
          if (camPoster) map.jumpTo({ center: [camPoster.lon, camPoster.lat], zoom: camPoster.zoom, pitch: camPoster.pitch, bearing: camPoster.bearing });
          gesti(map, true);
        } catch { /* mappa sparita */ }
        setCreazione(null);
      }
    }
  };

  // ══ I NOMI DELLA MAPPA DELLA VITA ═════════════════════════════════════
  // Scelta di Stefano (2026-10-15, fra due mockup sulla mappa vera): nomi
  // OVUNQUE e, dove le stelle quasi si toccano, RIQUADRI di ingrandimento
  // quanti ne servono; un nome isolato che non entra va col filo. Il dove lo
  // decide lib/etichetteMappa (puro); qui lo si disegna sopra la mappa, e la
  // stessa disposizione finisce nell'immagine condivisa.

  /** Copia del canvas di una mappa, presa dentro il suo evento "render". */
  const copiaMappa = (m: MapLibreMap) => new Promise<HTMLCanvasElement>(res => {
    const src = m.getCanvas();
    const grab = () => {
      const c = document.createElement("canvas");
      c.width = src.width; c.height = src.height;
      c.getContext("2d")!.drawImage(src, 0, 0);
      return c;
    };
    let fatto = false;
    const fin = (c: HTMLCanvasElement) => { if (!fatto) { fatto = true; res(c); } };
    m.once("render", () => fin(grab()));
    m.triggerRepaint();
    setTimeout(() => fin(grab()), 600);
  });

  /** La mappa NASCOSTA che fotografa i riquadri: una sola, riusata per tutti
   *  (un contesto WebGL in più, non uno per riquadro), rifatta se cambia stile. */
  const mappaPerRiquadri = (stile: StyleSpecification): Promise<MapLibreMap | null> => {
    const lib = libRef.current;
    if (!lib) return Promise.resolve(null);
    const c = mappaRiqRef.current;
    if (c && c.stile === stile) return Promise.resolve(c.map);
    // ⚠️ una già in costruzione per questo stile: si aspetta QUELLA. Prima un
    // secondo calcolo (mappa spostata durante il caricamento) ne faceva
    // un'altra, e la prima restava viva per sempre, col suo contesto WebGL
    const inVolo = mappaRiqInVoloRef.current;
    if (inVolo && inVolo.stile === stile) return inVolo.p;
    if (c) { try { c.map.remove(); } catch { /* già via */ } c.div.remove(); mappaRiqRef.current = null; }
    const p = (async () => {
      const div = document.createElement("div");
      div.style.cssText = "position:fixed;left:-10000px;top:0;width:200px;height:150px;pointer-events:none;";
      document.body.appendChild(div);
      const m = new lib.Map({ container: div, style: JSON.parse(JSON.stringify(stile)), interactive: false, attributionControl: false, fadeDuration: 0 });
      await new Promise<void>(r => { m.once("load", () => r()); setTimeout(r, 6000); });
      // nel frattempo la Mappa della vita può essersi chiusa (la pulizia non
      // l'ha vista: non era ancora in mappaRiqRef) o aver cambiato stile
      if (!mountedRef.current || stileRef.current !== stile || mappaRiqInVoloRef.current !== voce) {
        try { m.remove(); } catch { /* già via */ }
        div.remove();
        return null;
      }
      addOverlayLayers(m, styleModeRef.current);
      const misura = m.getLayer("flyover-stops") ? m.getLayoutProperty("flyover-stops", "icon-size") : 1;
      mappaRiqRef.current = { map: m, div, stile, stella: typeof misura === "number" ? misura : 1 };
      return m;
    })();
    const voce = { stile, p };
    mappaRiqInVoloRef.current = voce;
    void p.finally(() => { if (mappaRiqInVoloRef.current === voce) mappaRiqInVoloRef.current = null; });
    return p;
  };

  /** Aspetta che la mappa dei riquadri abbia finito di caricare la vista
   *  («idle»: tutti i suoi riquadri arrivati, niente in corso). ⚠️ Con
   *  `mappaNitida` e 3 s di tetto le foto in Satellite uscivano sgranate e
   *  restavano così finché non si spostava la mappa (visto: Genova–Pisa). */
  const mappaFerma = (m: MapLibreMap, maxMs: number) => new Promise<void>(res => {
    let fatto = false;
    const fin = () => { if (!fatto) { fatto = true; res(); } };
    m.once("idle", fin);
    m.triggerRepaint();
    setTimeout(fin, maxMs);
  });

  /** Un riquadro fotografato: la stessa mappa, centrata sulla zona e ingrandita
   *  della sua scala (in Mercatore ingrandire è proprio moltiplicare i pixel).
   *  Le stelle che NON sono del riquadro escono piccole e spente: senza nome
   *  lì (il loro è sulla mappa grande) sembravano tappe dimenticate (scelta B,
   *  «Attenuate», 2026-10-15). */
  const fotografaRiquadro = async (map: MapLibreMap, m: MapLibreMap, r: Riquadro,
    riq: { div: HTMLDivElement; stella: number } | null = mappaRiqRef.current, maxMs = 12000): Promise<HTMLCanvasElement | null> => {
    try {
      if (!riq) return null;
      const { div, stella } = riq;
      div.style.width = `${Math.round(r.posto.w)}px`;
      div.style.height = `${Math.round(r.posto.h)}px`;
      m.resize();
      if (m.getLayer("flyover-stops")) {
        const delRiquadro = ["in", ["get", "i"], ["literal", r.ids.map(Number)]];
        m.setLayoutProperty("flyover-stops", "icon-size", ["case", delRiquadro, stella, stella * ATTENUATE.misura]);
        m.setPaintProperty("flyover-stops", "icon-opacity", ["case", delRiquadro, 1, ATTENUATE.opacita]);
      }
      const centro = map.unproject([r.centroZona.x, r.centroZona.y]);
      m.jumpTo({ center: [centro.lng, centro.lat], zoom: map.getZoom() + Math.log2(r.scala), pitch: 0, bearing: 0 });
      await mappaFerma(m, maxMs);
      await visibile();
      return await copiaMappa(m);
    } catch {
      return null;
    }
  };

  /** Larghezza di un testo in un font (canvas fuori schermo, riusato). */
  const misuraTesto = (testo: string, font: string) => {
    if (!misuraRef.current) misuraRef.current = document.createElement("canvas").getContext("2d");
    const c = misuraRef.current;
    if (!c) return testo.length * 12;
    c.font = font;
    return c.measureText(testo).width;
  };

  const misuraNome = (s: string) => {
    if (!misuraRef.current) misuraRef.current = document.createElement("canvas").getContext("2d");
    const c = misuraRef.current;
    if (!c) return s.length * FONT_NOMI.px * 0.55;
    c.font = `italic ${FONT_NOMI.px}px ${FONT_NOMI.famiglia}`;
    return c.measureText(s).width;
  };

  /** Ricalcola nomi, fili e riquadri per la vista di adesso. */
  /** Nomi, fili e riquadri della Mappa della vita su un foglio W×H della mappa
   *  `map`: lo schermo e la stampa usano la STESSA disposizione, cambiano solo
   *  i margini (e la stampa non ha il selettore degli stili da scavalcare). */
  const disponiVita = (map: MapLibreMap, W: number, H: number, bordo: { margine: number; firma: number; titolo?: BordiTitolo }) => {
    // le longitudini vicino al centro della vista (antimeridiano: vedi lonWrap)
    const cLng = map.getCenter().lng;
    const punti = stopsRef.current
      .map((s, i) => { const p = map.project([unwrapNear(s.lon, cLng), s.lat]); return { id: String(i), nome: s.label, x: p.x, y: p.y }; })
      .filter(p => p.nome && p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H);
    const linee = routeSegsRef.current.filter(s => s.length > 1).map(seg => {
      const off = unwrapNear(seg[0][0], cLng) - seg[0][0];
      return seg.map(([lon, lat]) => { const p = map.project([lon + off, lat]); return { x: p.x, y: p.y }; });
    });
    // il titolo in alto a destra: nomi e riquadri gli girano intorno
    const gTitolo = geometriaTitoloVita(titoloVitaRef.current, W, misuraTesto, bordo.titolo);
    const d = disponiEtichette(punti, {
      w: W, h: H, misura: misuraNome, altezza: FONT_NOMI.px + 2, raggioStella: 4, scostamento: 6,
      distanzaGrappolo: 15, margine: bordo.margine, linee,
      // la firma «By 🐻» in basso a destra (drawBrandSignatureCanvas): copriva «La Spezia»
      vietate: [
        { x: W - bordo.firma - 66, y: H - bordo.firma - 38, w: bordo.firma + 66, h: bordo.firma + 38 },
        ...(gTitolo ? [gTitolo.ingombro] : []),
      ],
    });
    return { d, gTitolo };
  };

  const calcolaNomi = async (map: MapLibreMap) => {
    const id = ++calcoloNomiRef.current;
    const el = map.getContainer();
    const W = el.clientWidth, H = el.clientHeight;
    if (!W || !H) return;
    try {
      await Promise.all([
        document.fonts?.load(`italic ${FONT_NOMI.px}px "Noto Serif"`),
        document.fonts?.load(`${TITOLO_VITA.peso} ${TITOLO_VITA.px}px "Cormorant Garamond"`),
      ]);
    } catch { /* si misura col ripiego */ }
    if (calcoloNomiRef.current !== id) return;
    const { d } = disponiVita(map, W, H, { margine: 8, firma: 18 });
    const foto: Record<number, HTMLCanvasElement> = {};
    const url: Record<number, string> = {};
    // i nomi tornano SUBITO; le foto dei riquadri arrivano una alla volta
    // (ciascuna aspetta i suoi riquadri della mappa, anche qualche secondo)
    const mostra = () => {
      nomiRef.current = { d, foto: { ...foto }, url: { ...url }, w: W, h: H };
      setNomi(nomiRef.current);
    };
    mostra();
    setNomiFermi(true);
    const stile = stileRef.current;
    if (!d.riquadri.length || !stile) { fotoInCorsoRef.current = null; return; }
    const fotografa = async () => {
      const m = await mappaPerRiquadri(stile);
      for (const r of d.riquadri) {
        if (calcoloNomiRef.current !== id || !mountedRef.current || !m) return;
        const c = await fotografaRiquadro(map, m, r);
        if (calcoloNomiRef.current !== id || !mountedRef.current) return;
        if (c) { foto[r.numero] = c; url[r.numero] = c.toDataURL("image/png"); mostra(); }
      }
    };
    const p = fotografa();
    fotoInCorsoRef.current = p;
    await p;
    if (fotoInCorsoRef.current === p) fotoInCorsoRef.current = null;
  };

  // Il titolo cambia: nomi e riquadri gli rigirano intorno (al primo giro no,
  // ci pensa l'inquadratura iniziale col suo moveend).
  const primoTitoloRef = useRef(true);
  useEffect(() => {
    if (primoTitoloRef.current) { primoTitoloRef.current = false; return; }
    const m = mapRef.current;
    if (lifeMap && m && mountedRef.current) void calcolaNomi(m);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titoloVita]);

  // Che video sa fare questo browser: costruito (WebCodecs + H.264), o almeno
  // registrato dal vivo (MediaRecorder). Si chiede una volta, all'apertura.
  useEffect(() => {
    if (!animato) return;
    let vivo = true;
    void codecCostruzione(720, 1280).then(c => {
      if (vivo) setSa(c ? "costruito" : formato ? "dal-vivo" : null);
    });
    return () => { vivo = false; };
  }, [animato, formato]);

  // Chiudendo: si ferma tutto e si libera il video (la mappa la toglie l'altro effetto).
  useEffect(() => () => {
    voloIdRef.current++;
    if (rafVoloRef.current != null) cancelAnimationFrame(rafVoloRef.current);
    if (rafVideoRef.current != null) cancelAnimationFrame(rafVideoRef.current);
    try { registratoreRef.current?.stop(); } catch { /* già fermo */ }
    registratoreRef.current = null;
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // `cancelled` locale (non un ref condiviso): in StrictMode ogni effetto è
    // montato/smontato/rimontato una volta; con un ref condiviso l'init async
    // del primo montaggio creerebbe comunque una seconda mappa orfana. Vedi
    // storia in git (fix leak WebGL).
    let cancelled = false;

    const stops = buildFlightPath(viaggi);
    const legsLocal = buildFlightLegs(stops);
    legsRef.current = legsLocal;
    // Mappa della vita: la CASA non è una stella. Ogni viaggio la spingeva nel
    // path una volta, e la costellazione aveva un faro di N stelle sovrapposte
    // su Milano — più luminoso di qualunque posto visitato. Senza le tratte da
    // casa (buildPerTripRouteCoords) sarebbe rimasto lì, acceso e scollegato.
    stopsRef.current = stops.filter(s => !(lifeMap && s.casa))
      .map(s => ({ lat: s.lat, lon: s.lon, label: s.label }));
    // Mappa della vita: stelle DEDUPLICATE per coordinata. Una base coi
    // rientri finisce nel path 3-4 volte (base, gita, base, gita, base) e le
    // stelle sovrapposte si sommavano in una macchia; stessa dedup che già
    // fa l'editor del quadro per gli stessi motivi (aloni e punti-LED doppi).
    if (lifeMap) {
      const visti = new Set<string>();
      stopsRef.current = stopsRef.current.filter(s => {
        const k = `${s.lon.toFixed(5)},${s.lat.toFixed(5)}`;
        if (visti.has(k)) return false;
        visti.add(k); return true;
      });
    }
    // Km percorsi: stessa fonte UNICA di Home/Statistiche/card (tripTotalKm =
    // stradali reali dove c'è route_geometry, linea d'aria altrimenti).
    totalKmRef.current = viaggi.reduce((sum, t) => sum + tripTotalKm(t), 0);
    // Mappa della vita: un segmento per viaggio (linee separate). Altri poster:
    // un unico segmento concatenato. allCoordsRef resta l'unione di tutti i punti
    // (per fitBounds e per il riquadro dell'export SVG).
    // `unwrapSegments`: tratte srotolate in un'UNICA catena — ogni segmento
    // riparte vicino alla fine del precedente, così anche nella Mappa della
    // vita due viaggi ai lati opposti dell'antimeridiano restano nella stessa
    // finestra di 360° (prima: fitBounds inquadrava il mondo intero). Le
    // longitudini possono uscire da ±180 — MapLibre le avvolge da sé.
    const perTrip = lifeMap ? buildPerTripRouteCoords(viaggi) : [buildFlyoverRouteCoords(stops, legsLocal)];
    // ⚠️ L'inquadratura non può guardare solo le linee: senza le tratte da
    // casa un viaggio a meta singola è SOLO una stella, e fitBounds l'avrebbe
    // tagliata fuori. Le stelle entrano come punti-segmento nella STESSA
    // catena di srotolamento delle linee: srotolarle a parte le metterebbe in
    // un'altra finestra di 360° e riaprirebbe il bug dell'antimeridiano.
    const stelle: [number, number][][] = lifeMap
      ? stopsRef.current.map(s => [[s.lon, s.lat] as [number, number]])
      : [];
    const unwrapped = unwrapSegments([...perTrip, ...stelle]);
    const segs = unwrapped.slice(0, perTrip.length);
    routeSegsRef.current = segs;
    allCoordsRef.current = unwrapped.flat();

    if (legsLocal.length === 0) {
      setPhase("empty");
      return;
    }

    let map: MapLibreMap | undefined;

    const init = async () => {
      try {
        const maplibregl = await loadMapLibre();
        if (cancelled) return;
        libRef.current = maplibregl;

        // Medaglione del mezzo sulla tappa finale: rasterizza l'icona del mezzo
        // dell'ultima tratta (stessa simbologia delle card) nel pin finale.
        // Se manca il mezzo o l'icona non carica, la tappa finale usa il pin normale.
        const finalMode = legsLocal[legsLocal.length - 1]?.to.transportMode;
        const tstyle = finalMode ? TRANSPORT_MAP[finalMode] : null;
        if (tstyle && !finalPinDataRef.current) {
          try {
            const iconImg = await loadModeIcon(tstyle.Icon, "#ffffff");
            if (cancelled) return;
            finalPinDataRef.current = createFinalPinImageData(iconImg, tstyle.color);
          } catch { /* nessun medaglione: pin normale */ }
        }

        // CSS di MapLibre: bundlato globalmente (import in main.tsx) — la vecchia
        // iniezione del link dal CDN jsdelivr è stata rimossa (ridondante, e
        // offline riagganciava un CDN irraggiungibile).

        // Font serif per la didascalia della vista Costellazione (titolo/numeri
        // Cormorant Garamond + date Noto Serif corsivo). Caricati anche per lo
        // snapshot: la didascalia è ridisegnata su canvas in composePoster.
        if (!document.getElementById("flyover-fonts")) {
          const f = document.createElement("link");
          f.id = "flyover-fonts"; f.rel = "stylesheet";
          f.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;1,500&family=Noto+Serif:ital@0;1&display=swap";
          document.head.appendChild(f);
        }

        // Mappa della vita: parte direttamente in Costellazione (nessun Satellite).
        const style = lifeMap ? buildConstellationStyle() : await buildSatelliteStyle();
        if (cancelled) return;
        stileRef.current = style;

        if (!containerRef.current || cancelled) return;
        map = new maplibregl.Map({
          container: containerRef.current,
          style,
          center: [stops[0].lon, stops[0].lat],
          zoom: 2,
          attributionControl: false,
          // NB: qui c'era `preserveDrawingBuffer: true` "per lo snapshot", ma in
          // MapLibre 5 l'opzione top-level NON esiste più (andrebbe dentro
          // canvasContextAttributes) ed era IGNORATA: il buffer non è mai stato
          // preservato. Lo snapshot funziona comunque perché captureSnapshotBlob
          // cattura il canvas nello stesso frame dell'evento "render".
        });
        if (cancelled) { map.remove(); return; }
        mapRef.current = map;

        map.on("load", async () => {
          if (cancelled || !mountedRef.current) return;

          addOverlayLayers(map, lifeMap ? "constellation" : "satellite");

          setPhase("ready");
          // guardato da `cancelled`: smontando entro 100ms dal load il timer
          // chiamerebbe resize() su una mappa già rimossa (TypeError).
          setTimeout(() => { if (!cancelled && mapRef.current) mapRef.current.resize(); }, 100);

          // Viaggio singolo e anno: si DECOLLA (scelta di Stefano: parte da
          // solo, «Salta» per il poster subito). Si aspetta il resize qui sopra,
          // sennò il video nascerebbe con le misure del canvas di prima.
          if (animato) {
            await attesa(150);
            if (cancelled || !mountedRef.current) return;
            avviaVolo(map);
            return;
          }

          // Mappa della vita: i NOMI (vedi calcolaNomi) spariscono mentre la
          // mappa si muove e si ricalcolano a mappa ferma — dopo ogni spostamento,
          // zoom, cambio di stile o di misura.
          if (lifeMap) {
            const m = map;
            // la Mappa della vita resta piatta e dritta, come la stampa: i
            // riquadri ingrandiscono la zona contando su una mappa senza
            // rotazione né inclinazione (con due dita la si girava)
            try { m.dragRotate.disable(); m.touchZoomRotate.disableRotation(); m.touchPitch.disable(); m.keyboard.disableRotation(); } catch { /* gesto assente */ }
            let attesaNomi: number | undefined;
            const aMappaFerma = () => {
              window.clearTimeout(attesaNomi);
              attesaNomi = window.setTimeout(() => { if (!cancelled && mountedRef.current) void calcolaNomi(m); }, 150);
            };
            m.on("movestart", () => { calcoloNomiRef.current++; setNomiFermi(false); });
            m.on("moveend", aMappaFerma);
            m.on("resize", aMappaFerma);
          }

          // Mappa della vita: nessun volo, inquadra subito il poster
          // sull'intero percorso, poi mostra gli overlay. Costellazione
          // piatta dall'alto (pitch 0), come il master di stampa.
          await flyToOverview(map, lifeMap ? 0 : 45);
          if (cancelled || !mountedRef.current) return;
          setPoster(true);
        });
      } catch {
        if (!cancelled && mountedRef.current) setPhase("error");
      }
    };

    // Il seguito di init() e' una catena di await su rete (import dinamico,
    // stile della mappa): senza raccogliere il rifiuto, un telefono offline
    // sputa un "Failed to fetch" non gestito in console. Il globo non si
    // disegna comunque -- ma in silenzio, e senza sporcare gli errori veri.
    init().catch(() => { /* rete gia' giu': nessun globo, nessun rumore */ });

    return () => {
      cancelled = true;
      mountedRef.current = false;
      precaricoRef.current?.abort();
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      // la mappa nascosta dei riquadri e i nomi della vista di prima
      calcoloNomiRef.current++;
      const riq = mappaRiqRef.current;
      if (riq) { try { riq.map.remove(); } catch { /* già via */ } riq.div.remove(); mappaRiqRef.current = null; }
      mappaRiqInVoloRef.current = null; // quella in costruzione si butta da sé (vedi mappaPerRiquadri)
      fotoInCorsoRef.current = null;
      nomiRef.current = null;
      setNomi(null);
    };
  // ⚠️ Dipendenza NON vuota: la mappa si ricostruisce quando cambia il filtro
  // per compagno. Ricostruire è il prezzo giusto qui — l'effetto è già scritto
  // per essere montato più volte (StrictMode), la pulizia fa `map.remove()` e
  // la riga in cima rimette `mountedRef` a true. L'alternativa (aggiornare
  // sorgente e vernice a mano) reggerebbe le linee ma non i limiti della vista
  // né i conteggi.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viaggi, stellaSecca]);

  // Portal su document.body: senza, il modale (position:fixed) verrebbe confinato
  // al primo antenato con `transform` (es. il wrapper .animate-fade-up della card
  // in MieiViaggi) e clippato dentro la card invece che sul viewport.
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "relative", width: "100%", height: "100%", maxWidth: 880, maxHeight: 600,
          background: "#060e1e", border: "0.5px solid #1a2d4a", borderRadius: 16,
          overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          animation: "flyoverModalIn 0.28s cubic-bezier(0.22,1,0.36,1) both",
        }}>
        <div style={{ position: "absolute", inset: 0 }} ref={containerRef} />

        {/* Mappa della vita: nomi, fili e riquadri (lib/etichetteMappa).
            Sopra la mappa e sotto i comandi; spariscono mentre la mappa si
            muove (la disposizione vale per una vista ferma). */}
        {lifeMap && poster && nomi && (
          <div aria-hidden style={{
            position: "absolute", inset: 0, zIndex: 20, pointerEvents: "none",
            opacity: nomiFermi ? 1 : 0, transition: nomiFermi ? "opacity 200ms ease" : "none",
          }}>
            <svg width={nomi.w} height={nomi.h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
              {nomi.d.riquadri.map(r => (
                <g key={`z${r.numero}`}>
                  <rect x={r.zona.x} y={r.zona.y} width={r.zona.w} height={r.zona.h} rx={3}
                    fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={1} strokeDasharray="3 3" />
                  <line x1={r.filo.x1} y1={r.filo.y1} x2={r.filo.x2} y2={r.filo.y2} stroke="rgba(255,255,255,0.5)" strokeWidth={0.9} />
                  <circle cx={r.numeroZona.x + r.numeroZona.w / 2} cy={r.numeroZona.y + r.numeroZona.h / 2} r={r.numeroZona.w / 2} fill={BOLLINO.fondo} stroke="#fff" strokeWidth={1} />
                  <text x={r.numeroZona.x + r.numeroZona.w / 2} y={r.numeroZona.y + r.numeroZona.h / 2} dy="0.35em" textAnchor="middle" fill="#fff" fontSize={BOLLINO.font} fontFamily="Georgia, serif">{r.numero}</text>
                </g>
              ))}
              {nomi.d.conFilo.map(e => (
                <g key={`f${e.id}`}>
                  <line x1={e.filo.x1} y1={e.filo.y1} x2={e.filo.x2} y2={e.filo.y2} stroke={FILO_NOME.colore} strokeWidth={FILO_NOME.spessore}
                    strokeDasharray={FILO_NOME.tratteggio.join(" ")} strokeLinecap="round" />
                  <circle cx={e.filo.x2} cy={e.filo.y2} r={FILO_NOME.puntino} fill="#fff" />
                </g>
              ))}
              {[...nomi.d.accanto, ...nomi.d.conFilo].map(e => (
                <text key={`n${e.id}`} x={e.testo.x} y={e.testo.y} textAnchor={e.testo.allinea} style={ALONE_NOMI}
                  fill="#fff" fontSize={FONT_NOMI.px} fontStyle="italic" fontFamily={FONT_NOMI.famiglia}>{e.nome}</text>
              ))}
            </svg>
            {nomi.d.riquadri.map(r => (
              <div key={`r${r.numero}`} style={{
                position: "absolute", left: r.posto.x, top: r.posto.y, width: r.posto.w, height: r.posto.h,
                border: "1px solid rgba(255,255,255,0.8)", borderRadius: 6, overflow: "hidden",
                background: "#000", boxShadow: "0 6px 18px rgba(0,0,0,0.6)",
              }}>
                {nomi.url[r.numero]
                  ? <img src={nomi.url[r.numero]} alt="" style={{ width: "100%", height: "100%", display: "block" }} />
                  // la foto non è ancora arrivata (in Satellite anche qualche
                  // secondo): intanto le stelle, come nell'immagine condivisa,
                  // invece di un rettangolo nero coi soli nomi
                  : <svg width={r.posto.w} height={r.posto.h} style={{ display: "block" }}>
                      {r.altre.map((s, i) => (
                        <circle key={`a${i}`} cx={s.x - r.posto.x} cy={s.y - r.posto.y} r={3 * ATTENUATE.misura}
                          fill={styleMode === "satellite" ? "#fbbf24" : "#fff"} fillOpacity={ATTENUATE.opacita} />
                      ))}
                      {r.stelle.map(s => (
                        <g key={s.id} fill={styleMode === "satellite" ? "#fbbf24" : "#fff"}>
                          <circle cx={s.x - r.posto.x} cy={s.y - r.posto.y} r={6} fillOpacity={0.25} />
                          <circle cx={s.x - r.posto.x} cy={s.y - r.posto.y} r={2.5} />
                        </g>
                      ))}
                    </svg>}
              </div>
            ))}
            <svg width={nomi.w} height={nomi.h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
              {nomi.d.riquadri.map(r => (
                <g key={r.numero}>
                  <circle cx={r.posto.x + BOLLINO.angolo} cy={r.posto.y + BOLLINO.angolo} r={BOLLINO.raggio} fill={BOLLINO.fondo} stroke="#fff" strokeWidth={1} />
                  <text x={r.posto.x + BOLLINO.angolo} y={r.posto.y + BOLLINO.angolo} dy="0.35em" textAnchor="middle" fill="#fff" fontSize={BOLLINO.font} fontFamily="Georgia, serif">{r.numero}</text>
                  {r.conFilo.map(e => (
                    <g key={`f${e.id}`}>
                  <line x1={e.filo.x1} y1={e.filo.y1} x2={e.filo.x2} y2={e.filo.y2} stroke={FILO_NOME.colore} strokeWidth={FILO_NOME.spessore}
                    strokeDasharray={FILO_NOME.tratteggio.join(" ")} strokeLinecap="round" />
                  <circle cx={e.filo.x2} cy={e.filo.y2} r={FILO_NOME.puntino} fill="#fff" />
                </g>
                  ))}
                  {[...r.nomi, ...r.conFilo].map(e => (
                    <text key={e.id} x={e.testo.x} y={e.testo.y} textAnchor={e.testo.allinea} style={ALONE_NOMI}
                      fill="#fff" fontSize={FONT_NOMI.px} fontStyle="italic" fontFamily={FONT_NOMI.famiglia}>{e.nome}</text>
                  ))}
                </g>
              ))}
            </svg>
          </div>
        )}

        {/* Mappa della vita: il TITOLO in alto a destra (lib/titoloVita), che
            resta anche a riposo e coi comandi accesi si tocca per scriverlo, e
            «By 🐻» in basso a destra, che coi comandi accesi lascia il posto ai
            bottoni (scelte di Stefano, 2026-10-16). Le stesse misure
            dell'immagine condivisa: a riposo lo schermo È il poster. */}
        {lifeMap && phase === "ready" && (() => {
          const Wc = nomi?.w ?? containerRef.current?.clientWidth ?? 0;
          const Hc = nomi?.h ?? containerRef.current?.clientHeight ?? 0;
          const g = scriviTitolo ? null : geometriaTitoloVita(titoloVita, Wc, misuraTesto);
          // la casella e il «+» stanno dove andrebbe un titolo di media lunghezza
          const alto = Wc / 2 - TITOLO_VITA.selettoreMezzo - TITOLO_VITA.destra >= 170 ? TITOLO_VITA.alto : TITOLO_VITA.altoSotto;
          const fine = (valore: string) => {
            if (!annullaTitoloRef.current) {
              const v = valore.trim().slice(0, TITOLO_VITA.lettere);
              salvaTitoloVita(v);
              setTitoloVita(v);
            }
            annullaTitoloRef.current = false;
            setScriviTitolo(false);
          };
          return (
            <>
              {g && (
                <svg width={Wc} height={Hc} style={{ position: "absolute", left: 0, top: 0, zIndex: 25, overflow: "visible", pointerEvents: "none" }}>
                  <text x={g.x} y={g.y} textAnchor="end"
                    transform={`rotate(${TITOLO_VITA.inclinazione} ${g.perno.x} ${g.perno.y})`}
                    fill="#fff" fontFamily={TITOLO_VITA.famiglia} fontSize={g.px} fontWeight={TITOLO_VITA.peso}
                    onClick={() => setScriviTitolo(true)}
                    style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.9))", cursor: "text", pointerEvents: comandiVisibili ? "auto" : "none" }}>
                    <title>{t("Modifica il titolo")}</title>
                    {titoloVita.trim()}
                  </text>
                </svg>
              )}
              {!g && !scriviTitolo && (
                <button onClick={() => setScriviTitolo(true)}
                  style={{
                    position: "absolute", right: TITOLO_VITA.destra, top: alto, zIndex: 30,
                    padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    background: "rgba(10,22,40,0.8)", border: "0.5px dashed #60a5fa", color: "#60a5fa",
                    ...velo,
                  }}>
                  ＋ {t("Aggiungi un titolo")}
                </button>
              )}
              {scriviTitolo && (
                <input autoFocus defaultValue={titoloVita} maxLength={TITOLO_VITA.lettere}
                  placeholder={t("Titolo della mappa")} aria-label={t("Titolo della mappa")}
                  onKeyDown={e => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") { annullaTitoloRef.current = true; e.currentTarget.blur(); }
                  }}
                  onBlur={e => fine(e.currentTarget.value)}
                  style={{
                    position: "absolute", right: TITOLO_VITA.destra, top: alto - 4, zIndex: 30,
                    width: Math.min(Wc - 2 * TITOLO_VITA.destra, 380), textAlign: "right",
                    fontFamily: TITOLO_VITA.famiglia, fontSize: TITOLO_VITA.px, fontWeight: TITOLO_VITA.peso, color: "#fff",
                    background: "rgba(10,22,40,0.7)", border: "1px dashed #60a5fa", borderRadius: 6,
                    padding: "2px 8px", outline: "none",
                  }} />
              )}
              <div aria-hidden style={{
                position: "absolute", right: 18, bottom: 18, zIndex: 25, display: "flex", alignItems: "center", gap: 7,
                opacity: comandiVisibili ? 0 : 0.9, transition: "opacity 400ms ease", pointerEvents: "none",
                filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.85))",
              }}>
                <span style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", fontSize: 16, color: "#fff" }}>By</span>
                <img src={`${import.meta.env.BASE_URL}logo-orsi.png`} alt="" width={34} height={34} style={{ display: "block" }} />
              </div>
            </>
          );
        })()}

        {/* Chiudi in alto a sinistra (la card dati sta in alto a destra). */}
        <button onClick={onClose} aria-label={t("Chiudi")}
          style={{
            position: "absolute", top: 16, left: 16, width: 34, height: 34, borderRadius: 10, zIndex: 30,
            background: "rgba(10,22,40,0.8)", border: "0.5px solid #1a2d4a", cursor: "pointer",
            color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center",
            ...velo,
          }}>
          <X className="w-4 h-4" />
        </button>

        {/* ⚠️ BANCO DI PROVA stelle (da smontare quando Stefano sceglie):
            l'interruttore fra «soffusa» (alone stretto) e «secca» (solo
            nucleo). Stesso posto e stessa forma del banco del tratto. */}
        {phase === "ready" && lifeMap && (
          <div style={{ position: "absolute", left: 16, top: 60, zIndex: 26, ...velo }}>
            <button type="button" aria-pressed={stellaSecca} onClick={() => cambiaStella(!stellaSecca)}
              style={{
                display: "flex", alignItems: "center", gap: 7, fontSize: 11, cursor: "pointer",
                padding: "5px 10px", borderRadius: 999, fontFamily: "inherit",
                background: "rgba(10,22,40,0.75)", border: "0.5px solid rgba(255,255,255,0.2)",
                color: stellaSecca ? "#93c5fd" : "rgba(255,255,255,0.45)",
              }}>
              <span aria-hidden style={{
                width: 20, height: 11, borderRadius: 999, flexShrink: 0, position: "relative",
                background: stellaSecca ? "rgba(96,165,250,0.5)" : "rgba(255,255,255,0.15)",
              }}>
                <span style={{
                  position: "absolute", top: 1.5, left: stellaSecca ? 10.5 : 1.5,
                  width: 8, height: 8, borderRadius: "50%", background: stellaSecca ? "#93c5fd" : "rgba(255,255,255,0.5)",
                  transition: "left 140ms ease",
                }}/>
              </span>
              {t("Punti secchi")}
            </button>
          </div>
        )}

        {/* IL VOLO: in alto il contatore dei km, in basso Pausa/Riprendi e Salta.
            Il contatore si aggiorna dal loop via ref (60 volte al secondo:
            niente stato React, che ridisegnerebbe tutto il componente). */}
        {phase === "ready" && inVolo && (
          <>
            <div style={{
              position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 30,
              background: "rgba(10,22,40,0.85)", borderRadius: 999, padding: "6px 14px",
              fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13, fontWeight: 600, color: "#fff",
              whiteSpace: "nowrap", pointerEvents: "none",
            }}>
              <span ref={contatoreRef}>{testoContatore()}</span>
            </div>
            {/* Il titolo d'apertura: nome del viaggio e date sul decollo, poi
                sfuma (lo stesso riquadro è disegnato nel video). */}
            <div style={{
              position: "absolute", left: 16, right: 16, bottom: 76, zIndex: 29, display: "flex", justifyContent: "center",
              pointerEvents: "none", opacity: titoloVisibile ? 1 : 0, transition: "opacity 500ms ease",
            }}>
              <div style={{
                background: "rgba(10,22,40,0.88)", border: "0.5px solid #1a2d4a", borderRadius: 14,
                padding: "9px 16px", textAlign: "center", maxWidth: "100%",
              }}>
                <div className="font-display" style={{ fontSize: 20, fontWeight: 700, color: "#f0f4ff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {posterTitle}
                </div>
                {dateRangeLabel && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{dateRangeLabel}</div>}
              </div>
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 20, zIndex: 30, display: "flex", justifyContent: "center", gap: 10 }}>
              {volo === "pausa" ? (
                <button type="button" onClick={riprendi} style={stileBottoneVolo}>
                  <Play className="w-3.5 h-3.5" /> {t("Riprendi")}
                </button>
              ) : (
                <button type="button" onClick={pausa} style={stileBottoneVolo}>
                  <Pause className="w-3.5 h-3.5" /> {t("Pausa")}
                </button>
              )}
              <button type="button" onClick={salta} style={stileBottoneVolo}>
                {t("Salta")} <SkipForward className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}

        {/* Toggle vista: satellite · costellazione (master di stampa). Anche
            sulla Mappa della vita dal 2026-10-15 (lì il Satellite è piatto e
            sparisce a riposo come gli altri comandi). Nascosto durante il volo
            (che è in Satellite: cambiare stile a metà azzererebbe tracciato e
            marker). */}
        {phase === "ready" && !inVolo && (
          <div style={{
            position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 30,
            display: "flex", gap: 2, padding: 3, borderRadius: 999,
            background: "rgba(10,22,40,0.8)", border: "0.5px solid #1a2d4a", backdropFilter: "blur(2px)",
            ...velo,
          }}>
            {([["satellite", "Satellite"], ["constellation", "Costellazione"]] as const).map(([mode, label]) => {
              const active = styleMode === mode;
              return (
                <button key={mode} onClick={() => selectStyle(mode)} disabled={switching || stampa !== null}
                  aria-pressed={active}
                  style={{
                    padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: "none",
                    whiteSpace: "nowrap",
                    cursor: switching ? "default" : "pointer",
                    background: active ? "rgba(96,165,250,0.18)" : "transparent",
                    color: active ? "#60a5fa" : "rgba(255,255,255,0.6)",
                  }}>
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {phase === "loading" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)", fontSize: 13, gap: 8 }}>
            <Loader2 className="w-4 h-4 animate-spin" /> {t("Caricamento della mappa…")}
          </div>
        )}

        {phase === "error" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
            {t("Impossibile caricare la mappa.")}
          </div>
        )}

        {phase === "empty" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)", fontSize: 13, textAlign: "center", padding: 24 }}>
            {t("Questo viaggio non ha punti sufficienti per la mappa 3D (manca la posizione di casa o della destinazione).")}
          </div>
        )}

        {/* «Crea video» al lavoro: sotto la mappa salta da un fotogramma
            all'altro, quindi la si copre; si vede invece il video che nasce. */}
        {creazione !== null && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 40, background: "#060e1e",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24,
          }}>
            <canvas ref={anteprimaRef} width={180} height={320}
              style={{ width: 180, maxWidth: "60%", aspectRatio: "9 / 16", borderRadius: 12, border: "0.5px solid #1a2d4a", background: "#060e1e" }} />
            <div style={{ width: 200, maxWidth: "70%", height: 4, borderRadius: 2, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
              <div style={{ width: `${creazione}%`, height: "100%", background: "#fbbf24", transition: "width 0.2s linear" }} />
            </div>
            <div style={{ color: "#f0f4ff", fontSize: 14, fontWeight: 600 }}>{t("Creo il video… {pct}%", { pct: creazione })}</div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, textAlign: "center", maxWidth: 260 }}>
              {t("Il video si crea fotogramma per fotogramma: tieni l'app aperta.")}
            </div>
            <button type="button" onClick={() => { annullaVideoRef.current = true; }} style={stileBottoneVolo}>
              <X className="w-3.5 h-3.5" /> {t("Annulla")}
            </button>
          </div>
        )}

        {poster && (
          <>
            {/* Dati viaggio, in alto a destra. Due stili di card:
                - satellite: vetro navy (font di marca + numeri mono),
                - costellazione: DIDASCALIA senza riquadro, serif elegante
                  (Cormorant) monocromatica, come la caption di una stampa celeste.
                Sulla "Mappa della vita" NON si mostra alcuna caption (mappa nuda,
                scelta utente): titolo/bandiere/date/stat tutti omessi. */}
            {!lifeMap && (styleMode === "constellation" ? (
              <div style={{
                position: "absolute", top: 20, right: 20, zIndex: 25, maxWidth: "72%",
                textAlign: "right", textShadow: "0 1px 5px rgba(0,0,0,0.9)",
                animation: "flyoverCardIn 0.35s cubic-bezier(0.22,1,0.36,1) both",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 9 }}>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, fontSize: 25, color: "#fff", lineHeight: 1, letterSpacing: 0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {posterTitle}
                  </div>
                  {flagCodes.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                      {flagCodes.map((c, i) => (
                        <img key={c + i} src={"https://flagcdn.com/w40/" + c + ".png"} alt="" width="22" height="15"
                          style={{ borderRadius: 2, objectFit: "cover", border: "1px solid rgba(255,255,255,0.9)", boxShadow: "0 1px 4px rgba(0,0,0,0.45)", marginLeft: i === 0 ? 0 : -6, position: "relative", zIndex: i }}
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ))}
                    </div>
                  )}
                </div>
                {dateRangeLabel && (
                  <div style={{ fontFamily: "'Noto Serif', serif", fontStyle: "italic", fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 6 }}>{dateRangeLabel}</div>
                )}
                {statMetrics().length > 0 && (
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 15, color: "rgba(255,255,255,0.9)", marginTop: 8, letterSpacing: 0.5 }}>
                    {statMetrics().map((m, i) => (
                      <span key={m.l}>{i > 0 && <>&nbsp;·&nbsp;</>}<b style={{ fontWeight: 600 }}>{m.v}</b> {m.l}</span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
            <div style={{
              position: "absolute", top: 16, right: 16, zIndex: 25, maxWidth: "70%",
              background: "rgba(10,22,40,0.92)",
              border: "0.5px solid #1a2d4a", borderRadius: 14,
              padding: "12px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.45)", backdropFilter: "blur(2px)",
              animation: "flyoverCardIn 0.35s cubic-bezier(0.22,1,0.36,1) both",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {flagCodes.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                    {flagCodes.map((c, i) => (
                      <img key={c + i} src={"https://flagcdn.com/w40/" + c + ".png"} alt="" width="24" height="17"
                        style={{
                          borderRadius: 3, objectFit: "cover",
                          border: "1.5px solid rgba(255,255,255,0.9)", boxShadow: "0 1px 4px rgba(0,0,0,0.45)",
                          marginLeft: i === 0 ? 0 : -9,
                          transform: `rotate(${(i - (flagCodes.length - 1) / 2) * 7}deg)`,
                          transformOrigin: "bottom center", position: "relative", zIndex: i,
                        }}
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ))}
                  </div>
                )}
                <div className="font-display" style={{
                  fontSize: 15, fontWeight: 700, color: "#f0f4ff",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {posterTitle}
                </div>
              </div>
              {dateRangeLabel && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>{dateRangeLabel}</div>
              )}
              {statMetrics().length > 0 && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                {statMetrics().map(s => (
                  <div key={s.l} style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "0.5px solid #1a2d4a",
                    borderRadius: 10, padding: "5px 12px", textAlign: "center",
                  }}>
                    <div className="font-mono" style={{
                      fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.1,
                    }}>{s.v}</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 2 }}>{s.l}</div>
                  </div>
                ))}
              </div>
              )}
            </div>
            ))}

            {/* Azioni: Salva (solo single-trip, → biglietto) + Condividi (immagine)
                + Esporta SVG (solo Costellazione: master vettoriale per stampa). */}
            {/* CON CHI — la costellazione dei viaggi fatti con una persona.
                ⚠️ Il filtro esisteva GIÀ (chip del compagno sul biglietto) e non
                si trovava: 2,1 schermate di scorrimento, e per vedere «tutti i
                viaggi con Giulia» bisognava prima TROVARE un viaggio con
                Giulia — circolare. Qui sei già davanti alla mappa e la filtri
                mentre la guardi. Il chip sul biglietto resta come scorciatoia.
                La riga scorre di lato: con dieci persone non deve mangiare la
                mappa su un telefono. */}
            {lifeMap && compagni.length > 0 && (
              // ⚠️ Riga PROPRIA sopra le azioni, non in basso a sinistra: a
              // 390px i chip finivano SOTTO «Esporta SVG / Ritaglia / Condividi»
              // — illeggibili e non toccabili (il collaudo dal vivo è andato in
              // timeout proprio su questo). Visto solo guardando lo screenshot
              // mobile: a 900px sembrava a posto.
              <div style={{ position: "absolute", left: 16, right: 16, bottom: 66, zIndex: 26,
                display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, ...velo }}>
                <button type="button" onClick={() => setSoloCon(null)} aria-pressed={soloCon === null}
                  style={{
                    flexShrink: 0, fontSize: 11, fontWeight: soloCon === null ? 700 : 500, cursor: "pointer",
                    padding: "6px 12px", borderRadius: 999, fontFamily: "inherit",
                    background: soloCon === null ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.06)",
                    border: soloCon === null ? "1px solid #60a5fa" : "0.5px solid rgba(255,255,255,0.25)",
                    color: soloCon === null ? "#93c5fd" : "rgba(255,255,255,0.6)",
                  }}>
                  {t("Tutti")} {trips.length}
                </button>
                {compagni.map(c => {
                  const attivo = soloCon?.toLowerCase() === c.nome.toLowerCase();
                  return (
                    <button key={c.nome} type="button" aria-pressed={attivo}
                      onClick={() => setSoloCon(attivo ? null : c.nome)}
                      style={{
                        flexShrink: 0, fontSize: 11, fontWeight: attivo ? 700 : 500, cursor: "pointer",
                        padding: "6px 12px", borderRadius: 999, fontFamily: "inherit",
                        background: attivo ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.06)",
                        border: attivo ? "1px solid #60a5fa" : "0.5px solid rgba(255,255,255,0.25)",
                        color: attivo ? "#93c5fd" : "rgba(255,255,255,0.6)",
                      }}>
                      {c.nome} {c.quanti}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Il volo appena fatto: il video (se questo browser sa registrarlo)
                e «Rivivi». Riga propria SOPRA le azioni: a 390px quattro bottoni
                in fila non ci stanno. «Rivivi» solo in Satellite, perché il volo
                è in Satellite. */}
            {animato && (video || styleMode === "satellite") && (
              <div style={{ position: "absolute", right: 16, bottom: 66, zIndex: 26, display: "flex", gap: 10 }}>
                {video ? (
                  <button type="button" onClick={scaricaVideo} style={stileBottoneVolo}>
                    <Film className="w-3.5 h-3.5" /> {t("Scarica video")}
                  </button>
                ) : sa && styleMode === "satellite" && (
                  <button type="button" onClick={() => { void costruisciVideo(); }} style={stileBottoneVolo}>
                    <Film className="w-3.5 h-3.5" /> {t("Crea video")}
                  </button>
                )}
                {styleMode === "satellite" && (
                  <button type="button" onClick={() => { if (mapRef.current) avviaVolo(mapRef.current); }} style={stileBottoneVolo}>
                    <RotateCcw className="w-3.5 h-3.5" /> {t("Rivivi")}
                  </button>
                )}
              </div>
            )}

            <div style={{ position: "absolute", right: 16, bottom: 20, zIndex: 26, display: "flex", gap: 10, ...velo }}>
              {lifeMap && window.innerWidth >= 768 && (
                <button onClick={handleStampa} disabled={stampa !== null}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
                    cursor: stampa !== null ? "default" : "pointer",
                    padding: "8px 16px", borderRadius: 999, background: "rgba(255,255,255,0.08)",
                    border: "0.5px solid rgba(255,255,255,0.35)", color: "rgba(255,255,255,0.85)",
                  }}>
                  {stampa !== null ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                  {stampa !== null ? t("Preparo la stampa… {pct}%", { pct: stampa })
                    : stampaFallita ? t("Stampa non riuscita: riprova") : t("Per la stampa")}
                </button>
              )}
              {styleMode === "constellation" && (
                <button onClick={handleExportSvg} disabled={exportingSvg}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
                    cursor: exportingSvg ? "default" : "pointer",
                    padding: "8px 16px", borderRadius: 999, background: "rgba(255,255,255,0.08)",
                    border: "0.5px solid rgba(255,255,255,0.35)", color: "rgba(255,255,255,0.85)",
                  }}>
                  <Download className="w-3.5 h-3.5" /> {exportingSvg ? t("Esporto…") : t("Esporta SVG")}
                </button>
              )}
              {tripsCount === 1 && !lifeMap && (
                <button onClick={handleSaveRelief} disabled={savingRelief}
                  style={{
                    padding: "8px 16px", borderRadius: 999, background: "rgba(96,165,250,0.15)",
                    border: "1px solid #60a5fa", color: "#60a5fa", fontSize: 12, fontWeight: 600,
                    cursor: savingRelief ? "default" : "pointer",
                  }}>
                  {savingRelief ? t("Salvo…") : t("Salva")}
                </button>
              )}
              <button onClick={handleSharePoster}
                style={{
                  display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  padding: "8px 16px", borderRadius: 999,
                  background: (tripsCount === 1 && !lifeMap) ? "rgba(10,22,40,0.85)" : "rgba(96,165,250,0.15)",
                  border: (tripsCount === 1 && !lifeMap) ? "0.5px solid #1a2d4a" : "1px solid #60a5fa",
                  color: (tripsCount === 1 && !lifeMap) ? "rgba(255,255,255,0.8)" : "#60a5fa",
                }}>
                <Share2 className="w-3.5 h-3.5" /> {t("Condividi")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
