/** Operazioni sulla mappa del viaggio in 3D che non dipendono dallo stato del
 *  componente: inquadratura del poster, tracciato del volo, attese, copia del
 *  canvas. Spostate da TripFlyover.tsx senza cambiarle. */
import { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import { FINALE_PADDING, OPACITA_DA_FARE, SCHEDA_POSTER, TAGLIO } from "./constants";
import { FlightLeg } from "@/lib/flyover";

/**
 * Dove mettere la camera perché il tracciato stia DAVVERO dentro i margini.
 * fitBounds calcola sulla mappa piatta e poi inclina: con pitch 45 sul globo
 * le tappe non restano dove le aveva messe (misurato su desktop: Milano a
 * 22 px dal bordo sinistro e 102 a destra, coi margini a 60). Qui si prova la
 * camera, si guarda dove cadono le tappe e si correggono centro e zoom, poi
 * si torna indietro: tutto nello stesso fotogramma, quindi non si vede.
 */
export const inquadraturaVera = (
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

/**
 * Il TRACCIATO CHE SI DISEGNA (2026-10-06): durante il volo il percorso
 * intero si spegne (OPACITA_DA_FARE) e cresce una seconda linea, piena, che
 * finisce esattamente sotto l'icona. È ciò che fa di un volo un racconto:
 * prima la linea era già tutta tracciata e l'icona sembrava un cursore su un
 * percorso noto. Dal 2026-10-12 la linea intera si passa alla mappa UNA volta
 * e si scopre con un taglio (vedi tracciatoProgressivo in lib/flyover): prima
 * si ricalcolava a ogni fotogramma e sul telefono restava indietro all'icona.
 */
export const lineaFatta = (coords: [number, number][]) => ({
  type: "Feature" as const, properties: {},
  geometry: { type: "LineString" as const, coordinates: coords.length > 1 ? coords : [] },
});

export const preparaTracciatoFatto = (map: MapLibreMap) => {
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
export const tagliaTraccia = (map: MapLibreMap, p: number) => {
  for (const id of ["flyover-traccia-casing", "flyover-traccia"] as const) {
    if (map.getLayer(id)) map.setPaintProperty(id, "line-gradient", TAGLIO[id](p));
  }
};

/** Aspetta che la mappa abbia caricato i riquadri della vista (evento "idle"),
 *  con un tetto: su una rete lenta il finale non può aspettare per sempre. */
export const attendiMappaPronta = (map: MapLibreMap, maxMs: number) => new Promise<void>(res => {
  let fatto = false;
  const fine = () => { if (!fatto) { fatto = true; res(); } };
  try {
    if (map.areTilesLoaded()) { fine(); return; }
    map.once("idle", fine);
  } catch { fine(); return; }
  setTimeout(fine, maxMs);
});

/** A fine volo (o saltando) il percorso torna intero e la linea del volo sparisce. */
export const chiudiTracciatoFatto = (map: MapLibreMap) => {
  for (const id of ["flyover-route", "flyover-route-casing"]) {
    if (map.getLayer(id)) map.setPaintProperty(id, "line-opacity", 1);
  }
  tagliaTraccia(map, 0);
  (map.getSource("flyover-traccia") as GeoJSONSource | undefined)?.setData(lineaFatta([]));
};

/** Durante il volo la camera la guida l'animazione: un trascinamento la
 *  strattonerebbe a ogni frame. I gesti tornano all'atterraggio. */
export const gesti = (map: MapLibreMap, attivi: boolean) => {
  for (const h of [map.dragPan, map.scrollZoom, map.boxZoom, map.dragRotate, map.keyboard,
    map.doubleClickZoom, map.touchZoomRotate, map.touchPitch]) {
    try { if (attivi) h.enable(); else h.disable(); } catch { /* handler assente: pazienza */ }
  }
};

/** La chiave del mezzo di una tratta: la casa (rientro fra due viaggi) ha la sua. */
export const modoDi = (leg: FlightLeg) => (leg.to.casa || !leg.to.transportMode ? "casa" : leg.to.transportMode);

/** Aspetta che la pagina sia in primo piano. Con l'app in background la mappa
 *  non disegna, e la copia di salvataggio di `catturaCanvasMappa` (dopo
 *  400 ms) metterebbe nel video un fotogramma nero. */
export const visibile = () => new Promise<void>(res => {
  if (document.visibilityState !== "hidden") { res(); return; }
  const su = () => {
    if (document.visibilityState === "hidden") return;
    document.removeEventListener("visibilitychange", su);
    // un giro di disegno prima di copiare: al ritorno il canvas può essere vuoto
    requestAnimationFrame(() => res());
  };
  document.addEventListener("visibilitychange", su);
});

// ══ I NOMI DELLA MAPPA DELLA VITA ═════════════════════════════════════
// Scelta di Stefano (2026-10-15, fra due mockup sulla mappa vera): nomi
// OVUNQUE e, dove le stelle quasi si toccano, RIQUADRI di ingrandimento
// quanti ne servono; un nome isolato che non entra va col filo. Il dove lo
// decide lib/etichetteMappa (puro); qui lo si disegna sopra la mappa, e la
// stessa disposizione finisce nell'immagine condivisa.

/** Copia del canvas di una mappa, presa dentro il suo evento "render". */
export const copiaMappa = (m: MapLibreMap) => new Promise<HTMLCanvasElement>(res => {
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

/** Aspetta che la mappa dei riquadri abbia finito di caricare la vista
 *  («idle»: tutti i suoi riquadri arrivati, niente in corso). ⚠️ Con
 *  `mappaNitida` e 3 s di tetto le foto in Satellite uscivano sgranate e
 *  restavano così finché non si spostava la mappa (visto: Genova–Pisa). */
export const mappaFerma = (m: MapLibreMap, maxMs: number) => new Promise<void>(res => {
  let fatto = false;
  const fin = () => { if (!fatto) { fatto = true; res(); } };
  m.once("idle", fin);
  m.triggerRepaint();
  setTimeout(fin, maxMs);
});
