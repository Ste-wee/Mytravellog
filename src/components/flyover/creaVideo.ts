/**
 * «Crea video»: il volo ricostruito fotogramma per fotogramma e codificato in
 * mp4. Spostato da TripFlyover.tsx senza cambiarlo: quello che serve del
 * componente arriva in `dip` — i valori letti dopo le attese sono funzioni
 * (letti al momento, come prima), quelli letti all'inizio sono valori, le ref
 * che modifica restano ref.
 */
import type { MutableRefObject } from "react";
import type { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import { Home } from "lucide-react";
import type { FlightLeg } from "@/lib/flyover";
import { tracciatoProgressivo } from "@/lib/flyover";
import { codecCostruzione, kmContatiPerTratta, misureVideo, type FormatoVideo } from "@/lib/voloVideo";
import { copioneVolo, type Camera } from "@/lib/copioneVolo";
import { ATTESA_FOTOGRAMMA_MS, FPS_VIDEO, TEMPI_VIDEO } from "./constants";
import { TRANSPORT_MAP, loadModeIcon } from "./mapImages";
import { disegnaContatore, disegnaIcona, disegnaTitolo } from "./canvasDraw";
import { attesa, formatKm } from "./util";
import { chiudiTracciatoFatto, gesti, lineaFatta, modoDi, preparaTracciatoFatto, tagliaTraccia, visibile } from "./mapOps";

export interface DipendenzeVideo {
  map: MapLibreMap | null;
  tratte: FlightLeg[];
  /** Il ripiego dal vivo (MediaRecorder), se il browser lo sa fare. */
  formato: FormatoVideo | null;
  posterTitle: string;
  dateRangeLabel: string | null;
  /** Le letture «al momento». */
  kmTotali: () => number;
  vivo: () => boolean;
  anteprima: () => HTMLCanvasElement | null;
  /** Una creazione già in corso (la segna anche questa funzione). */
  inCorso: MutableRefObject<boolean>;
  annulla: MutableRefObject<boolean>;
  iconeModi: MutableRefObject<Record<string, HTMLImageElement>>;
  videoUrlRef: MutableRefObject<string | null>;
  avviaVolo: (map: MapLibreMap, registra?: boolean) => void;
  buttaVideo: () => void;
  setCreazione: (pct: number | null) => void;
  cameraPoster: (map: MapLibreMap, pitch?: number) => Camera | null;
  loadFlagImages: () => Promise<HTMLImageElement[]>;
  loadBrandLogo: () => Promise<HTMLImageElement | null>;
  catturaCanvasMappa: () => Promise<HTMLCanvasElement | null>;
  composePoster: (mapCanvas: HTMLCanvasElement, flagImgs: HTMLImageElement[], logoImg: HTMLImageElement | null, dpr?: number) => HTMLCanvasElement;
  setVideo: (v: { url: string; blob: Blob }) => void;
}

/** Il colore e il simbolo dell'icona per un mezzo (come vestiMarker, senza DOM). */
export function vesteDi(modo: string, icone: Record<string, HTMLImageElement>) {
  return {
    color: modo === "casa" ? "#64748b" : (TRANSPORT_MAP[modo]?.color ?? "#60a5fa"),
    img: icone[modo] ?? null,
  };
}

/** Aspetta che la mappa abbia i riquadri della vista, con un tetto. Dopo un
 *  jumpTo i riquadri si chiedono solo al render successivo: si fa girare. */
export function mappaNitida(map: MapLibreMap, maxMs: number, vivo: () => boolean) {
  return new Promise<void>(res => {
    const t0 = performance.now();
    let giri = 0;
    const prova = () => {
      giri++;
      let pronta = true;
      try { pronta = map.areTilesLoaded(); } catch { /* mappa sparita: si va avanti */ }
      if ((pronta && giri > 1) || performance.now() - t0 > maxMs || !vivo()) { res(); return; }
      requestAnimationFrame(prova);
    };
    map.triggerRepaint();
    requestAnimationFrame(prova);
  });
}

/**
 * «Crea video»: il volo ricostruito FOTOGRAMMA PER FOTOGRAMMA (lib/copioneVolo)
 * e codificato in mp4 (WebCodecs + mp4-muxer). Per ogni fotogramma: la mappa
 * va dove dice il copione, si aspetta che sia nitida, la si copia, sopra si
 * disegnano icona, contatore e titolo, e si codifica con il SUO istante
 * (n/30 s) — così il video è sempre a 30 fps pieni, anche se ogni fotogramma
 * ha richiesto un secondo. Dove il browser non sa farlo, si ripiega sul volo
 * registrato dal vivo.
 */
export async function creaVideo(dip: DipendenzeVideo): Promise<void> {
  const map = dip.map;
  const tratte = dip.tratte;
  if (!map || !tratte.length || dip.inCorso.current) return;
  // ⚠️ il segnale si accende PRIMA dell'attesa sul codice: con due tocchi
  // rapidi partivano due creazioni sulla stessa mappa
  dip.inCorso.current = true;
  const mc = map.getCanvas();
  const { w, h } = misureVideo(mc.width, mc.height);
  const codec = await codecCostruzione(w, h);
  if (!codec) {
    dip.inCorso.current = false;
    if (dip.formato && dip.vivo()) dip.avviaVolo(map, true);   // il ripiego: registrazione dal vivo
    return;
  }
  dip.annulla.current = false;
  dip.buttaVideo();
  dip.setCreazione(0);
  gesti(map, false);
  const camPoster = dip.cameraPoster(map, 45);
  let encoder: VideoEncoder | null = null;
  try {
    const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
    // le icone dei mezzi, come nel volo dal vivo
    const modi = new Set(tratte.map(modoDi));
    await Promise.all([...modi].filter(m => !dip.iconeModi.current[m]).map(async m => {
      const Icon = m === "casa" ? Home : TRANSPORT_MAP[m]?.Icon;
      if (!Icon) return;
      try { dip.iconeModi.current[m] = await loadModeIcon(Icon, "#ffffff"); } catch { /* solo il colore */ }
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
    await Promise.all([mappaNitida(map, 4000, dip.vivo), attesa(450)]);
    await visibile();
    const [flagImgs, logoImg] = await Promise.all([dip.loadFlagImages(), dip.loadBrandLogo()]);
    const snap = await dip.catturaCanvasMappa();
    const finale = snap ? dip.composePoster(snap, flagImgs, logoImg, mc.width / (mc.clientWidth || mc.width)) : null;

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
      if (dip.annulla.current || !dip.vivo()) break;
      if (errore) throw errore;
      const s = copione.statoAl(i * passo);
      ctx.fillStyle = SFONDO;
      ctx.fillRect(0, 0, w, h);
      if (s.fase !== "finale") {
        map.jumpTo({ center: [s.camera.lon, s.camera.lat], zoom: s.camera.zoom, pitch: s.camera.pitch, bearing: s.camera.bearing });
        tagliaTraccia(map, s.tratta >= 0 ? traccia.progresso(s.tratta, s.tm) : 0);
        await mappaNitida(map, ATTESA_FOTOGRAMMA_MS, dip.vivo);
        await visibile();
        const img = await dip.catturaCanvasMappa();
        if (img) ctx.drawImage(img, 0, 0, w, h);
        if (s.icona) {
          const p = map.project(s.icona);
          // solo se il punto si vede: `project` dà un pixel anche a un punto
          // DIETRO il globo (Milano, all'inizio di Milano → Tokyo → Honolulu)
          const q = map.unproject(p);
          const visto = Math.abs(q.lat - s.icona[1]) < 0.5 && Math.abs(((q.lng - s.icona[0]) % 360 + 540) % 360 - 180) < 0.5;
          if (visto) disegnaIcona(ctx, p.x * k, p.y * k, k, vesteDi(modoDi(tratte[Math.max(0, s.tratta)]), dip.iconeModi.current));
        }
        disegnaContatore(ctx, `${formatKm(s.km)} / ${formatKm(dip.kmTotali())} km`, w, k);
        if (s.titolo > 0) disegnaTitolo(ctx, s.titolo, dip.posterTitle, dip.dateRangeLabel, w, h, k);
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
        dip.setCreazione(Math.round((i / n) * 100));
        const a = dip.anteprima();
        if (a) {
          // le proporzioni del video vero (verticale sul telefono, larga su desktop)
          const ah = Math.round(180 * h / w);
          if (a.height !== ah) { a.width = 180; a.height = ah; a.style.aspectRatio = `${w} / ${h}`; }
          a.getContext("2d")?.drawImage(tela, 0, 0, a.width, a.height);
        }
      }
    }
    if (dip.annulla.current || !dip.vivo()) return;
    await encoder.flush();
    if (errore) throw errore;
    muxer.finalize();
    const blob = new Blob([target.buffer], { type: "video/mp4" });
    if (!dip.vivo()) return;
    const url = URL.createObjectURL(blob);
    dip.videoUrlRef.current = url;
    dip.setVideo({ url, blob });
  } catch {
    // il video non è venuto: il poster resta com'era, si può riprovare
  } finally {
    try { if (encoder && encoder.state !== "closed") encoder.close(); } catch { /* già chiuso */ }
    dip.inCorso.current = false;
    if (dip.vivo()) {
      try {
        chiudiTracciatoFatto(map);
        if (camPoster) map.jumpTo({ center: [camPoster.lon, camPoster.lat], zoom: camPoster.zoom, pitch: camPoster.pitch, bearing: camPoster.bearing });
        gesti(map, true);
      } catch { /* mappa sparita */ }
      dip.setCreazione(null);
    }
  }
}
