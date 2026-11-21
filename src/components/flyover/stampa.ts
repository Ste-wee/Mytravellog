/**
 * «Per la stampa»: la Mappa della vita com'è nell'anteprima (stile,
 * inquadratura, nomi, riquadri, titolo, firma) in un JPEG 4:3 grande,
 * disegnato da una mappa NASCOSTA ad alta densità di pixel. Pensata per il
 * computer: su iPhone una tela così grande non si può fare (Safari si ferma a
 * 16,7 Mpx). Spostata da TripFlyover.tsx senza cambiarla: quello che serve del
 * componente arriva in `dip` — i valori letti dopo le attese sono funzioni
 * (letti al momento, come prima), quelli letti all'inizio sono valori.
 */
import type { MutableRefObject } from "react";
import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import type { loadMapLibre } from "@/lib/maplibre";
import type { Disposizione, RiquadroFisso } from "@/lib/etichetteMappa";
import { TITOLO_VITA, type GeometriaTitolo } from "@/lib/titoloVita";
import { loadCoste } from "@/lib/worldAtlas";
import { downloadBlob } from "@/lib/share";
import { BORDI_STAMPA, FONT_NOMI, STAMPA } from "./constants";
import type { MapStyleMode } from "./mapStyles";
import { createDotImageData, createStarImageData } from "./mapImages";
import { disegnaNomiSuCanvas, disegnaTitoloVitaSuCanvas, drawBrandSignatureCanvas } from "./canvasDraw";
import { copiaMappa, mappaFerma } from "./mapOps";
import { fotografaRiquadro } from "./nomiVita";

export interface DipendenzeStampa {
  lib: Awaited<ReturnType<typeof loadMapLibre>> | null;
  map: MapLibreMap | null;
  stile: StyleSpecification | null;
  /** Lo stile della vista, fermato all'inizio della stampa. */
  modo: MapStyleMode;
  stellaSecca: boolean;
  /** Una stampa già in corso (la segna anche questa funzione). */
  inCorso: MutableRefObject<boolean>;
  /** Le letture «al momento». */
  anteprima: () => boolean;
  vivo: () => boolean;
  fissi: () => Record<string, RiquadroFisso>;
  titolo: () => string;
  /** Le coste (si caricano qui se in Satellite non ci sono ancora). */
  costeRef: MutableRefObject<GeoJSON.Feature<GeoJSON.MultiLineString> | null>;
  setStampa: (pct: number | null) => void;
  setStampaFallita: (v: boolean) => void;
  addOverlayLayers: (m: MapLibreMap, modo: MapStyleMode) => void;
  disponiVita: (m: MapLibreMap, W: number, H: number,
    bordo: typeof BORDI_STAMPA & { fattore: number; fissi: Record<string, RiquadroFisso> }) => { d: Disposizione; gTitolo: GeometriaTitolo | null };
  loadBrandLogo: () => Promise<HTMLImageElement | null>;
}

export async function stampaMappaVita(dip: DipendenzeStampa): Promise<void> {
  const lib = dip.lib, map = dip.map, stile = dip.stile;
  if (!lib || !map || !stile || dip.inCorso.current || !dip.anteprima()) return;
  // la mappa dell'anteprima (il riquadro 4:3 a schermo): stessa inquadratura,
  // stesse proporzioni di stelle e linee, solo più pixel
  const Wm = map.getContainer().clientWidth, Hm = map.getContainer().clientHeight;
  if (!Wm || !Hm) return;
  const kMappa = (STAMPA.w * STAMPA.k) / Wm;
  // foto satellitari abbastanza dettagliate per kMappa (a 512 sarebbero sgranate)
  const tileMappa = 512 / 2 ** Math.ceil(Math.log2(kMappa));
  dip.inCorso.current = true;
  dip.setStampa(0);
  const nascoste: { m: MapLibreMap; div: HTMLDivElement }[] = [];
  // non riuscita: lo dice il bottone per 5 secondi (prima: niente file e nessun avviso)
  const fallita = () => {
    if (!dip.vivo()) return;
    dip.setStampaFallita(true);
    window.setTimeout(() => { if (dip.vivo()) dip.setStampaFallita(false); }, 5000);
  };
  const modo = dip.modo;   // fermo: anche se cambiasse, la stampa resta di questo stile
  const satellite = modo === "satellite";
  // lo stesso stile, con le foto satellitari più dettagliate
  const stileCon = (tile: number) => {
    const st = JSON.parse(JSON.stringify(stile)) as StyleSpecification;
    for (const src of Object.values(st.sources)) if (src.type === "raster") src.tileSize = tile;
    return st;
  };
  const nuovaMappa = async (w: number, h: number, k = STAMPA.k, tile = STAMPA.tileSize) => {
    const div = document.createElement("div");
    div.style.cssText = `position:fixed;left:-20000px;top:0;width:${w}px;height:${h}px;pointer-events:none;`;
    document.body.appendChild(div);
    const m = new lib.Map({
      container: div, style: stileCon(tile), interactive: false, attributionControl: false,
      fadeDuration: 0, pixelRatio: k, maxCanvasSize: [8192, 8192],
    });
    nascoste.push({ m, div });
    await new Promise<void>(r => { m.once("load", () => r()); setTimeout(r, 20000); });
    // stelle e punti disegnati GRANDI: a k× quelli dello schermo sarebbero sfocati
    const sc = Math.ceil(k / 2);
    if (satellite) m.addImage("flyover-dot", createDotImageData(sc), { pixelRatio: 2 * sc });
    else m.addImage("flyover-star", createStarImageData(dip.stellaSecca ? "secca" : "soffusa", sc), { pixelRatio: 2 * sc });
    dip.addOverlayLayers(m, modo);
    return { m, div };
  };
  try {
    await Promise.all([
      document.fonts?.load(`italic ${FONT_NOMI.px}px "Noto Serif"`),
      document.fonts?.load(`${TITOLO_VITA.peso} ${TITOLO_VITA.px}px "Cormorant Garamond"`),
    ]).catch(() => undefined);
    if (satellite && !dip.costeRef.current) dip.costeRef.current = await loadCoste("50m").catch(() => null);
    const { m } = await nuovaMappa(Wm, Hm, kMappa, tileMappa);
    // ESATTAMENTE l'inquadratura dell'anteprima
    m.jumpTo({ center: map.getCenter(), zoom: map.getZoom(), pitch: 0, bearing: 0 });
    dip.setStampa(5);
    await mappaFerma(m, STAMPA.attesaMs);
    if (!dip.vivo()) return;
    const sfondo = await copiaMappa(m);
    dip.setStampa(25);
    // la stessa disposizione dell'anteprima (stessa mappa, stessi conti)
    const scalaFoglio = Wm / STAMPA.w;
    const { d, gTitolo } = dip.disponiVita(m, STAMPA.w, STAMPA.h, { ...BORDI_STAMPA, fattore: 1 / scalaFoglio, fissi: dip.fissi() });
    const foto: Record<number, HTMLCanvasElement> = {};
    if (d.riquadri.length) {
      const riq = await nuovaMappa(200, 150);
      const misura = riq.m.getLayer("flyover-stops") ? riq.m.getLayoutProperty("flyover-stops", "icon-size") : 1;
      const stella = typeof misura === "number" ? misura : 1;
      for (const [i, r] of d.riquadri.entries()) {
        if (!dip.vivo()) return;
        const c = await fotografaRiquadro(m, riq.m, r, { div: riq.div, stella }, STAMPA.attesaMs, scalaFoglio);
        if (c) foto[r.numero] = c;
        dip.setStampa(25 + Math.round((65 * (i + 1)) / d.riquadri.length));
      }
    }
    // il foglio: mappa, nomi e riquadri, titolo, firma — come «Condividi»
    // esattamente 7680×5760: la cornice a schermo arrotonda al pixel (es. 797×598)
    // e la mappa usciva 7679×5762; il ritocco è sotto lo 0,1%
    const c = document.createElement("canvas");
    c.width = STAMPA.w * STAMPA.k; c.height = STAMPA.h * STAMPA.k;
    const ctx = c.getContext("2d")!;
    const k = c.width / STAMPA.w;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(sfondo, 0, 0, c.width, c.height);
    disegnaNomiSuCanvas(ctx, { d, foto }, k, satellite ? "#fbbf24" : "#ffffff", STAMPA.corpoNomi);
    if (gTitolo) disegnaTitoloVitaSuCanvas(ctx, dip.titolo(), gTitolo, k);
    const logo = await dip.loadBrandLogo();
    if (logo) drawBrandSignatureCanvas(ctx, c.width, c.height, k, logo, STAMPA.margine);
    dip.setStampa(95);
    const blob = await new Promise<Blob | null>(res => c.toBlob(res, "image/jpeg", 0.92));
    if (!blob) { fallita(); return; }   // tela troppo grande per questo browser
    downloadBlob(blob, `mappa-della-vita-stampa-${c.width}x${c.height}.jpg`);
  } catch (e) {
    console.error("Per la stampa:", e);
    fallita();
  } finally {
    for (const { m, div } of nascoste) { try { m.remove(); } catch { /* già via */ } div.remove(); }
    dip.inCorso.current = false;
    if (dip.vivo()) dip.setStampa(null);
  }
}
