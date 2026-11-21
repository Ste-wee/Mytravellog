/**
 * La registrazione DAL VIVO del volo (il ripiego di «Crea video» dove il
 * browser non sa costruirlo fotogramma per fotogramma). Spostata da
 * TripFlyover.tsx senza cambiarla: le ref del componente arrivano in
 * `RefRegistrazione` e si destrutturano coi loro nomi, lette al momento come prima.
 */
import type { MutableRefObject } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import fixWebmDuration from "fix-webm-duration";
import { misureVideo, type FormatoVideo } from "@/lib/voloVideo";
import { FINALE_VIDEO_MS } from "./constants";
import { disegnaIcona, disegnaContatore, disegnaTitolo } from "./canvasDraw";

/** Le ref (e i pochi valori) che la registrazione legge e scrive. */
export interface RefRegistrazione {
  formato: FormatoVideo | null;
  mountedRef: MutableRefObject<boolean>;
  congelaVideoRef: MutableRefObject<boolean>;
  markerFissoRef: MutableRefObject<{ x: number; y: number; t0: number; color: string; img: HTMLImageElement | null } | null>;
  staccaRenderRef: MutableRefObject<(() => void) | null>;
  finaleVideoRef: MutableRefObject<HTMLCanvasElement | null>;
  finaleT0Ref: MutableRefObject<number>;
  rafVideoRef: MutableRefObject<number | null>;
  markerRef: MutableRefObject<MapLibreMarker | null>;
  markerVesteRef: MutableRefObject<{ color: string; img: HTMLImageElement | null }>;
  titoloFinoRef: MutableRefObject<number>;
  pezziRef: MutableRefObject<Blob[]>;
  registratoreRef: MutableRefObject<MediaRecorder | null>;
  regInizioRef: MutableRefObject<number>;
  regPausaDaRef: MutableRefObject<number | null>;
  regPausaTotRef: MutableRefObject<number>;
  videoUrlRef: MutableRefObject<string | null>;
  setVideo: (v: { url: string; blob: Blob } | null) => void;
}

/** In più, per avviarla: titolo e date del video e il testo del contatore. */
export interface AvvioRegistrazione extends RefRegistrazione {
  posterTitle: string;
  dateRangeLabel: string | null;
  testoContatore: () => string;
}

/**
 * La registrazione. Il canvas WebGL non conserva il buffer, quindi una copia
 * si prende DENTRO ogni evento "render" (come lo snapshot del poster); un loop
 * a parte la ricompone sul canvas del video insieme a marker e contatore, che
 * sono elementi HTML e non finirebbero mai nel canvas della mappa.
 */
export function avviaRegistrazione(dip: AvvioRegistrazione, map: MapLibreMap) {
  const { formato, congelaVideoRef, markerFissoRef, staccaRenderRef, finaleVideoRef, finaleT0Ref, rafVideoRef, markerRef, markerVesteRef, titoloFinoRef, pezziRef, registratoreRef, regInizioRef, regPausaDaRef, regPausaTotRef, posterTitle, dateRangeLabel, testoContatore } = dip;
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
    fermaRegistrazione(dip, false);
  }
}

/** Chiude la registrazione: `tieni` decide se ne nasce un video (Salta lo butta). */
export function fermaRegistrazione(dip: RefRegistrazione, tieni: boolean) {
  const { formato, mountedRef, staccaRenderRef, rafVideoRef, pezziRef, registratoreRef, regInizioRef, regPausaDaRef, regPausaTotRef, videoUrlRef, setVideo } = dip;
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
}
