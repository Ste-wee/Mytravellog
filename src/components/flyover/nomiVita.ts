/**
 * La Mappa della vita, parte geometrica: dove vanno nomi, fili e riquadri su
 * un foglio, e la foto di un riquadro dalla mappa nascosta. Spostate da
 * TripFlyover.tsx senza cambiarle: quello che serve del componente (tappe,
 * linee, titolo, misura del testo) arriva in `fonti`, letto al momento.
 */
import type { Map as MapLibreMap } from "maplibre-gl";
import { unwrapNear } from "@/lib/lonWrap";
import { disponiEtichette, type Riquadro, type RiquadroFisso } from "@/lib/etichetteMappa";
import { geometriaTitoloVita, type BordiTitolo } from "@/lib/titoloVita";
import { ATTENUATE, FONT_NOMI } from "./constants";
import { copiaMappa, mappaFerma, visibile } from "./mapOps";

export interface FontiNomi {
  stops: { lat: number; lon: number; label: string }[];
  segmenti: [number, number][][];
  titolo: string;
  misuraTesto: (testo: string, font: string) => number;
}

export interface BordoNomi {
  margine: number; firma: number; titolo?: BordiTitolo; corpo?: number; riquadri?: number; fattore?: number; fissi?: Record<string, RiquadroFisso>;
}

/** Nomi, fili e riquadri della Mappa della vita su un foglio W×H della mappa
 *  `map`: lo schermo e la stampa usano la STESSA disposizione, cambiano solo
 *  i margini (e la stampa non ha il selettore degli stili da scavalcare). */
export function disponiNomiVita(fonti: FontiNomi, map: MapLibreMap, W: number, H: number,
  bordo: BordoNomi) {
  const corpo = bordo.corpo ?? FONT_NOMI.px;
  // fattore: pixel del foglio per pixel della mappa (anteprima di stampa: il
  // foglio è 1200 di larghezza, la mappa a schermo meno)
  const fa = bordo.fattore ?? 1;
  const misura = (t: string) => fonti.misuraTesto(t, `italic ${corpo}px ${FONT_NOMI.famiglia}`);
  // le longitudini vicino al centro della vista (antimeridiano: vedi lonWrap)
  const cLng = map.getCenter().lng;
  const punti = fonti.stops
    .map((s, i) => { const p = map.project([unwrapNear(s.lon, cLng), s.lat]); return { id: String(i), nome: s.label, x: p.x * fa, y: p.y * fa }; })
    .filter(p => p.nome && p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H);
  const linee = fonti.segmenti.filter(s => s.length > 1).map(seg => {
    const off = unwrapNear(seg[0][0], cLng) - seg[0][0];
    return seg.map(([lon, lat]) => { const p = map.project([lon + off, lat]); return { x: p.x * fa, y: p.y * fa }; });
  });
  // il titolo in alto a destra: nomi e riquadri gli girano intorno
  const gTitolo = geometriaTitoloVita(fonti.titolo, W, fonti.misuraTesto, bordo.titolo);
  const d = disponiEtichette(punti, {
    // tutto in proporzione al corpo: con nomi più grandi anche la distanza che fa
    // «gruppo» cresce, sennò le zone fitte spargono nomi lontani col filo invece
    // di andare in un riquadro (visto in stampa a 19 px: «Pisa» vicino a Trieste)
    w: W, h: H, misura, altezza: corpo + 2, raggioStella: 4, scostamento: Math.round(6 * corpo / FONT_NOMI.px),
    distanzaGrappolo: Math.round(15 * corpo / FONT_NOMI.px), margine: bordo.margine, linee, grandezzaRiquadri: bordo.riquadri,
    riquadriFissi: bordo.fissi,
    // la firma «By 🐻» in basso a destra (drawBrandSignatureCanvas): copriva «La Spezia»
    vietate: [
      { x: W - bordo.firma - 66, y: H - bordo.firma - 38, w: bordo.firma + 66, h: bordo.firma + 38 },
      ...(gTitolo ? [gTitolo.ingombro] : []),
    ],
  });
  return { d, gTitolo };
}

/** Un riquadro fotografato: la stessa mappa, centrata sulla zona e ingrandita
 *  della sua scala (in Mercatore ingrandire è proprio moltiplicare i pixel).
 *  Le stelle che NON sono del riquadro escono piccole e spente: senza nome
 *  lì (il loro è sulla mappa grande) sembravano tappe dimenticate (scelta B,
 *  «Attenuate», 2026-10-15). */
export async function fotografaRiquadro(map: MapLibreMap, m: MapLibreMap, r: Riquadro,
  riq: { div: HTMLDivElement; stella: number } | null, maxMs = 12000,
  /** pixel della mappa per pixel del foglio (anteprima di stampa: < 1) */ scalaFoglio = 1): Promise<HTMLCanvasElement | null> {
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
    const vx = r.centroZona.x + (r.posto.x + r.posto.w / 2 - r.centroPosto.x) / r.scala;
    const vy = r.centroZona.y + (r.posto.y + r.posto.h / 2 - r.centroPosto.y) / r.scala;
    const centro = map.unproject([vx * scalaFoglio, vy * scalaFoglio]);
    // il foglio è la mappa ingrandita di 1/scalaFoglio, il riquadro di r.scala in più
    m.jumpTo({ center: [centro.lng, centro.lat], zoom: map.getZoom() - Math.log2(scalaFoglio) + Math.log2(r.scala), pitch: 0, bearing: 0 });
    await mappaFerma(m, maxMs);
    await visibile();
    return await copiaMappa(m);
  } catch {
    return null;
  }
}
