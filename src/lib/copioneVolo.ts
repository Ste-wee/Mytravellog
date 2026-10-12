/**
 * Il COPIONE del video del volo: dato un istante del video, dove stanno la
 * camera, l'icona del mezzo, il taglio della linea, i km e il titolo.
 *
 * Perché esiste (2026-10-12): il video si registrava DAL VIVO mentre si volava
 * (MediaRecorder sul canvas). Su un telefono la registrazione si mangiava più
 * di metà della fluidità (misurato a CPU/4: 28 → 11 fotogrammi al secondo) e
 * il file ne usciva scattoso, con riquadri sgranati quando la rete era lenta.
 * Ora il video si COSTRUISCE dopo, fotogramma per fotogramma: per ognuno si
 * posiziona la mappa come dice il copione, si aspetta che sia nitida e lo si
 * codifica — sempre 30 fps, qualunque sia il telefono. Il volo a schermo non
 * registra più niente.
 *
 * Le curve sono le STESSE del volo dal vivo (TripFlyover, animaCamera):
 * easeInOutCubic su posizione, zoom, inclinazione; l'icona un filo più veloce
 * della camera (`velocitaIcona`); la strada corta oltre il 180°.
 */
import { easeInOutCubic, pointAlongPath, type LegCamera } from "./flyover";
import { unwrapNear } from "./lonWrap";

export interface Camera { lon: number; lat: number; zoom: number; pitch: number; bearing: number }

export interface TempiCopione {
  /** Sulla vista d'apertura, col titolo, mentre la camera si avvicina piano. */
  aperturaMs: number;
  /** Quanto si avvicina in apertura (livelli di zoom). */
  avvicinamentoZoom: number;
  decolloMs: number;
  /** Fermi sulla meta, con un ultimo avvicinamento. */
  arrivoMs: number;
  arrivoZoom: number;
  /** Il poster finale (dissolvenza + avvicinamento lentissimo). */
  finaleMs: number;
  /** Il titolo resta questo tempo DOPO l'apertura, poi sfuma in `sfumaturaMs`. */
  titoloMs: number;
  sfumaturaMs: number;
  /** L'icona corre un filo più della camera (vedi VELOCITA_MARKER). */
  velocitaIcona: number;
}

/** Quello che il copione legge di una tratta (FlightLeg lo soddisfa). */
export interface TrattaCopione {
  from: { lon: number; lat: number };
  to: { lon: number; lat: number };
  camera: LegCamera;
  pathCoords: [number, number][];
}

export type Fase = "apertura" | "decollo" | "tratta" | "arrivo" | "finale";

export interface StatoCopione {
  fase: Fase;
  /** Millisecondi dall'inizio della fase. */
  inFase: number;
  /** Frazione 0..1 della fase. */
  k: number;
  camera: Camera;
  /** Dove sta l'icona del mezzo (null prima del decollo e nel finale). */
  icona: [number, number] | null;
  /** La tratta in corso (o l'ultima, all'arrivo); -1 prima della prima. */
  tratta: number;
  /** Frazione della tratta percorsa dall'icona: per il taglio della linea. */
  tm: number;
  /** Km da mostrare nel contatore. */
  km: number;
  /** Opacità del titolo d'apertura (0 = sparito). */
  titolo: number;
}

export interface Copione {
  durataMs: number;
  statoAl: (ms: number) => StatoCopione;
}

/** La camera a metà strada fra `da` e `a` (stessa interpolazione del volo dal vivo). */
function fra(da: Camera, a: Camera, t: number): Camera {
  const lon1 = unwrapNear(a.lon, da.lon);
  return {
    lon: da.lon + (lon1 - da.lon) * t,
    lat: da.lat + (a.lat - da.lat) * t,
    zoom: da.zoom + (a.zoom - da.zoom) * t,
    pitch: da.pitch + (a.pitch - da.pitch) * t,
    bearing: da.bearing + (a.bearing - da.bearing) * t,
  };
}

/**
 * Il copione di un volo: `apertura` è la camera della vista d'apertura (la
 * stessa inquadratura del poster), `kmTratte` i km che ogni tratta aggiunge al
 * contatore (vedi kmContatiPerTratta: i rientri a casa valgono zero).
 */
export function copioneVolo(
  tratte: TrattaCopione[],
  apertura: Camera,
  kmTratte: number[],
  tempi: TempiCopione,
): Copione {
  type Pezzo = { fase: Fase; da: number; durata: number; tratta: number; inizio: Camera; fine: Camera };
  const pezzi: Pezzo[] = [];
  let ora = 0;
  const aggiungi = (fase: Fase, durata: number, tratta: number, inizio: Camera, fine: Camera) => {
    pezzi.push({ fase, da: ora, durata: Math.max(0, durata), tratta, inizio, fine });
    ora += Math.max(0, durata);
  };

  const finitaApertura: Camera = { ...apertura, zoom: apertura.zoom + tempi.avvicinamentoZoom };
  aggiungi("apertura", tempi.aperturaMs, -1, apertura, finitaApertura);
  let qui = finitaApertura;
  if (tratte.length > 0) {
    const c0 = tratte[0].camera;
    const partenza: Camera = { lon: tratte[0].from.lon, lat: tratte[0].from.lat, zoom: c0.zoom, pitch: c0.pitch, bearing: c0.bearing };
    aggiungi("decollo", tempi.decolloMs, -1, qui, partenza);
    qui = partenza;
    tratte.forEach((tr, i) => {
      const meta: Camera = { lon: tr.to.lon, lat: tr.to.lat, zoom: tr.camera.zoom, pitch: tr.camera.pitch, bearing: tr.camera.bearing };
      aggiungi("tratta", tr.camera.durationMs, i, qui, meta);
      qui = meta;
    });
    aggiungi("arrivo", tempi.arrivoMs, tratte.length - 1, qui, { ...qui, zoom: qui.zoom + tempi.arrivoZoom });
  }
  aggiungi("finale", tempi.finaleMs, tratte.length - 1, apertura, apertura);
  const durataMs = ora;

  const kmPrima: number[] = [];
  let somma = 0;
  for (const k of kmTratte) { kmPrima.push(somma); somma += Number.isFinite(k) ? k : 0; }
  const kmTotali = somma;
  const fineTitolo = tempi.aperturaMs + tempi.titoloMs;

  const statoAl = (msGrezzo: number): StatoCopione => {
    const ms = Math.min(Math.max(0, msGrezzo), durataMs);
    // l'ultimo pezzo che è già cominciato (i pezzi di durata zero si saltano)
    let p = pezzi[0];
    for (const x of pezzi) { if (x.durata > 0 && ms >= x.da) p = x; }
    const inFase = ms - p.da;
    const k = p.durata > 0 ? Math.min(1, inFase / p.durata) : 1;
    const titolo = Math.min(1, Math.max(0, (fineTitolo - ms) / Math.max(1, tempi.sfumaturaMs)));
    const base = { fase: p.fase, inFase, k, titolo };

    if (p.fase === "apertura") {
      // si avvicina e rallenta (come l'avvicinamento dal vivo)
      return { ...base, camera: fra(p.inizio, p.fine, Math.sin(k * Math.PI / 2)), icona: null, tratta: -1, tm: 0, km: 0 };
    }
    if (p.fase === "decollo") {
      return { ...base, camera: fra(p.inizio, p.fine, easeInOutCubic(k)), icona: tratte.length ? [tratte[0].from.lon, tratte[0].from.lat] : null, tratta: -1, tm: 0, km: 0 };
    }
    if (p.fase === "tratta") {
      const tr = tratte[p.tratta];
      const t = easeInOutCubic(k);
      const tm = easeInOutCubic(Math.min(1, k * tempi.velocitaIcona));
      return { ...base, camera: fra(p.inizio, p.fine, t), icona: pointAlongPath(tr.pathCoords, tm), tratta: p.tratta, tm, km: kmPrima[p.tratta] + (kmTratte[p.tratta] ?? 0) * t };
    }
    if (p.fase === "arrivo") {
      const tr = tratte[p.tratta];
      const ultimo = tr.pathCoords[tr.pathCoords.length - 1] ?? [tr.to.lon, tr.to.lat];
      return { ...base, camera: fra(p.inizio, p.fine, Math.sin(k * Math.PI / 2)), icona: ultimo, tratta: p.tratta, tm: 1, km: kmTotali };
    }
    return { ...base, camera: p.inizio, icona: null, tratta: p.tratta, tm: 1, km: kmTotali };
  };

  return { durataMs, statoAl };
}
