import { useEffect, useMemo, useRef, useState, createElement } from "react";
import { useT, fmtNumber } from "@/lib/settings";
import type { ElementType } from "react";
// SOLO i tipi: `import type` sparisce alla compilazione — maplibre-gl resta
// caricato dinamicamente (loadMapLibre) e fuori dal bundle iniziale.
import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { loadMapLibre, type StyleExpr } from "@/lib/maplibre";
import { createPortal } from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { Trip, formatTripDate } from "@/lib/storage";
import { buildFlightPath, buildFlightLegs, tripTotalKm, buildPerTripRouteCoords, FlightLeg } from "@/lib/flyover";
import { compagniDeiViaggi, viaggiCon } from "@/lib/compagni";
import { fetchMapStyle } from "@/components/WorldMap";
import { saveReliefImage } from "@/lib/photoStorage";
import { buildPosterSvg, loadCountryRings, routeBounds, unwrapSegments, CONFINI } from "@/lib/posterSvg";
import { X, Share2, Loader2, Download, Frame } from "lucide-react";
import { canShareFile, downloadBlob, shareOrDownload } from "@/lib/share";
import { useNavigate } from "react-router-dom";
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
function createStarImageData(forma: "larga" | "soffusa" | "secca"): ImageData {
  const s = 48;
  const c = document.createElement("canvas");
  c.width = s; c.height = s;
  const ctx = c.getContext("2d")!;
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
  return ctx.getImageData(0, 0, s, s);
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
function drawBrandSignatureCanvas(ctx: CanvasRenderingContext2D, W: number, H: number, dpr: number, logo: HTMLImageElement) {
  const u = dpr;
  const size = 34 * u, pad = 18 * u, gap = 7 * u;
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
// qualunque sia la lunghezza (lo zoom si adatta).
const FINALE_PADDING = { top: 50, right: 60, bottom: 110, left: 60 };

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
 * Sostituisce il vecchio flyover animato + video .webm (rimosso, ripescabile
 * dal tag git `flyover-animato-v1`): più leggero, robusto e condivisibile ovunque.
 */
export function TripFlyover({ trips, onClose, lifeMap = false }: Props) {
  const t = useT();
  const navigate = useNavigate();
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
  // La Mappa della vita parte (e resta) in Costellazione: niente Satellite,
  // che lì è quasi identico al globo della Home.
  const [styleMode, setStyleMode] = useState<MapStyleMode>(lifeMap ? "constellation" : "satellite");
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
        { v: String(legsRef.current.length), l: "tappe" },
      ];
  const statLine = (): string => statMetrics().map(m => `${m.v} ${m.l}`).join("  ·  ");

  // Esc chiude il poster (oltre a click fuori / X).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Inquadra l'intero tracciato con fitBounds: il percorso riempie sempre il
   *  frame allo stesso modo (margini fissi), qualunque sia la lunghezza.
   *  Inclinata (pitch 45) in entrambe le viste. */
  const flyToOverview = (map: MapLibreMap, pitch = 45): Promise<void> => new Promise(resolve => {
    const coords = allCoordsRef.current;
    if (!coords.length) { resolve(); return; }
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const [lon, lat] of coords) {
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    }
    let done = false;
    const finish = () => { if (done) return; done = true; resolve(); };
    try {
      map.once("moveend", finish);
      map.fitBounds([[minLon, minLat], [maxLon, maxLat]], {
        pitch, bearing: 0, padding: FINALE_PADDING, duration: 1400, maxZoom: 12,
      });
    } catch { finish(); return; }
    setTimeout(finish, 2200); // salvagente se moveend non scatta
  });

  /**
   * (Ri)aggiunge tracciato + puntine SOPRA lo stile corrente. Idempotente e
   * necessaria dopo ogni `setStyle` (che azzera sorgenti/layer/immagini
   * personalizzati): le guardie `getSource`/`getLayer`/`hasImage` evitano i
   * doppioni al primo caricamento e ricreano tutto dopo un cambio stile.
   */
  const addOverlayLayers = (map: MapLibreMap, mode: MapStyleMode) => {
    const stops = stopsRef.current;
    if (!stops.length) return;
    const constellation = mode === "constellation";
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
        data: { type: "FeatureCollection", features: stops.map((s, i) => ({ type: "Feature", geometry: { type: "Point", coordinates: [s.lon, s.lat] }, properties: { name: s.label, final: i === stops.length - 1 } })) },
      });
    }
    if (!map.hasImage("flyover-pin")) map.addImage("flyover-pin", createPinImageData(), { pixelRatio: 2 });
    if (constellation && !map.hasImage("flyover-star")) {
      map.addImage("flyover-star",
        createStarImageData(lifeMap ? (stellaSecca ? "secca" : "soffusa") : "larga"),
        { pixelRatio: 2 });
    }
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
            : (hasFinalPin ? ["case", ["get", "final"], "flyover-pin-final", "flyover-pin"] : "flyover-pin"),
          "icon-size": constellation ? 0.8 : 0.9,
          "icon-anchor": constellation ? "center" : "bottom",
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
      const style = mode === "satellite" ? await buildSatelliteStyle() : buildConstellationStyle();
      if (!mapRef.current) return;
      map.setStyle(style, { diff: false });
      await new Promise<void>(res => {
        let done = false;
        const fin = () => { if (done) return; done = true; res(); };
        map.once("style.load", fin);
        setTimeout(fin, 2500); // salvagente se l'evento non scatta
      });
      if (!mapRef.current || !mountedRef.current) return;
      addOverlayLayers(map, mode);
      await flyToOverview(map, mode === "constellation" ? 0 : 45);
    } catch { /* se il cambio stile fallisce, resta la vista precedente */ }
    finally {
      switchingRef.current = false;
      if (mountedRef.current) setSwitching(false);
    }
  };

  const selectStyle = (mode: MapStyleMode) => {
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
    // (coerente con la vista a schermo, mappa "nuda").
    if (lifeMap) { stamp(); return c; }

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

  /** Cattura il poster come JPEG. Forza un render fresco e copia il canvas
   *  in modo SINCRONO dentro l'evento "render": il buffer WebGL non è
   *  preservato (vedi nota alle MapOptions), quindi fuori da quel frame
   *  drawImage leggerebbe nero. */
  const captureSnapshotBlob = async (): Promise<Blob | null> => {
    try {
      const map = mapRef.current;
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
      // Copia il canvas DENTRO il gestore dell'evento "render", in modo
      // sincrono: il backbuffer WebGL (non preservato) è garantito pieno solo
      // lì. Prima la copia avveniva dopo l'await — sul percorso felice reggeva
      // (un solo salto di microtask, prima del compositing), ma il salvagente
      // a tempo scattava in un macrotask a buffer ormai svuotato → poster nero
      // salvato in silenzio (es. app mandata in background subito dopo "Salva").
      const snapshot = await new Promise<HTMLCanvasElement>(res => {
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
    await shareOrDownload(file, lifeMap ? posterTitle : (tripsCount > 1 ? "Il mio viaggio in 3D" : viaggi[0].title));
  };

  // "Esporta SVG" (solo Costellazione): master VETTORIALE a livelli per la stampa
  // (resina + LED). Confini dal world-atlas ritagliati sul riquadro; tracciato e
  // stelle da dati nostri (precisi); nodi-stella marcati come punti-LED.
  const handleExportSvg = async () => {
    if (exportingSvg) return;
    setExportingSvg(true);
    try {
      const route = allCoordsRef.current;
      const stops = stopsRef.current;
      let rings: [number, number][][] = [];
      try {
        rings = await loadCountryRings(routeBounds(route.length ? route : stops.map(s => [s.lon, s.lat] as [number, number])));
      } catch { /* confini non disponibili: esporta comunque rotta+stelle */ }
      // Mappa della vita: SVG "nudo" (nessuna caption) → niente titolo/date/stat.
      const title = lifeMap ? "" : (tripsCount > 1 ? `${tripsCount} viaggi` : viaggi[0].title);
      const stats = statLine();
      const svg = buildPosterSvg({ routeSegments: routeSegsRef.current, stops, borders: rings, title, dateLabel: lifeMap ? null : dateRangeLabel, stats, hideLabels: lifeMap });
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const base = lifeMap ? "mappa-della-vita" : (tripsCount === 1 ? viaggi[0].title : "viaggio").replace(/[^\w.-]+/g, "_").slice(0, 40) || "viaggio";
      downloadBlob(blob, `${base}-costellazione.svg`);
    } catch { /* export fallito: non bloccare */ }
    finally {
      if (mountedRef.current) setExportingSvg(false);
    }
  };

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

          // Nessuna animazione di volo: inquadra subito il poster sull'intero
          // percorso, poi mostra gli overlay. Costellazione (Mappa della vita)
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
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
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

        {/* Chiudi in alto a sinistra (la card dati sta in alto a destra). */}
        <button onClick={onClose} aria-label={t("Chiudi")}
          style={{
            position: "absolute", top: 16, left: 16, width: 34, height: 34, borderRadius: 10, zIndex: 30,
            background: "rgba(10,22,40,0.8)", border: "0.5px solid #1a2d4a", cursor: "pointer",
            color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          <X className="w-4 h-4" />
        </button>

        {/* ⚠️ BANCO DI PROVA stelle (da smontare quando Stefano sceglie):
            l'interruttore fra «soffusa» (alone stretto) e «secca» (solo
            nucleo). Stesso posto e stessa forma del banco del tratto. */}
        {phase === "ready" && lifeMap && (
          <div style={{ position: "absolute", left: 16, top: 60, zIndex: 26 }}>
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

        {/* Toggle vista: satellite inclinato · costellazione (master di stampa).
            Nascosto sulla Mappa della vita: lì c'è solo la Costellazione. */}
        {phase === "ready" && !lifeMap && (
          <div style={{
            position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 30,
            display: "flex", gap: 2, padding: 3, borderRadius: 999,
            background: "rgba(10,22,40,0.8)", border: "0.5px solid #1a2d4a", backdropFilter: "blur(2px)",
          }}>
            {([["satellite", "Satellite"], ["constellation", "Costellazione"]] as const).map(([mode, label]) => {
              const active = styleMode === mode;
              return (
                <button key={mode} onClick={() => selectStyle(mode)} disabled={switching}
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
                display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
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

            <div style={{ position: "absolute", right: 16, bottom: 20, zIndex: 26, display: "flex", gap: 10 }}>
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
              {lifeMap && (
                // Aggancio all'editor del quadro: guardi la costellazione, poi
                // la ritagli. La navigazione smonta MieiViaggi e quindi anche
                // questo portale (cleanup WebGL compreso).
                <button onClick={() => navigate("/editor-quadro")}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    padding: "8px 16px", borderRadius: 999, background: "rgba(255,255,255,0.08)",
                    border: "0.5px solid rgba(255,255,255,0.35)", color: "rgba(255,255,255,0.85)",
                  }}>
                  <Frame className="w-3.5 h-3.5" /> {t("Ritaglia quadro")}
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
