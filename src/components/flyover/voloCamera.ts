/**
 * La camera del volo: i riquadri scaricati in anticipo e il pilotaggio a mano,
 * frame per frame. Spostati da TripFlyover.tsx senza cambiarli: le ref del
 * componente arrivano come ref e si leggono a ogni frame, come prima.
 */
import type { MutableRefObject } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { easeInOutCubic, type FlightLeg } from "@/lib/flyover";
import { unwrapNear } from "@/lib/lonWrap";
import { riquadriDelVolo } from "@/lib/riquadriVolo";

/** Le ref del volo che il pilotaggio legge a ogni frame (e `raf`, che scrive). */
export interface RefVolo {
  vivo: MutableRefObject<boolean>;
  voloId: MutableRefObject<number>;
  inPausa: MutableRefObject<boolean>;
  raf: MutableRefObject<number | null>;
}

/**
 * Scarica in anticipo i riquadri satellite che la camera vedrà, sezione per
 * sezione (0 = decollo, poi una per tratta), così quando ci arriva la mappa
 * è già nitida. Li consegna la cache del browser (o del service worker) alla
 * richiesta di MapLibre. `pronta(i)` si risolve quando le sezioni 0..i sono
 * scaricate; chi la usa mette sempre un tetto all'attesa.
 */
export function avviaPrecarico(map: MapLibreMap, tratte: FlightLeg[], precarico: MutableRefObject<AbortController | null>) {
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
  precarico.current = ctrl;
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
}

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
export function animaCamera(
  ref: RefVolo, map: MapLibreMap, id: number,
  verso: { lon: number; lat: number; zoom: number; pitch: number; bearing: number },
  durataMs: number, suFrame?: (t: number, rawT: number) => void,
): Promise<boolean> {
  const { vivo, voloId, inPausa, raf } = ref;
  return new Promise(resolve => {
    const c0 = map.getCenter(), z0 = map.getZoom(), p0 = map.getPitch(), b0 = map.getBearing();
    // la strada CORTA anche oltre l'antimeridiano (Tokyo → Los Angeles sul Pacifico)
    const lon1 = unwrapNear(verso.lon, c0.lng);
    let inizio = performance.now();
    let pausaDa: number | null = null;
    const tick = () => {
      if (!vivo.current || voloId.current !== id) { resolve(false); return; }
      const ora = performance.now();
      if (inPausa.current) {
        if (pausaDa == null) pausaDa = ora;
        raf.current = requestAnimationFrame(tick);
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
      if (rawT < 1) raf.current = requestAnimationFrame(tick);
      else { raf.current = null; resolve(true); }
    };
    raf.current = requestAnimationFrame(tick);
  });
}
