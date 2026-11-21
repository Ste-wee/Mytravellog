/**
 * L'inquadratura del poster: dove si mette la camera perché il tracciato
 * riempia il quadro (senza finire sotto la scheda col titolo). Spostata da
 * TripFlyover.tsx senza cambiarla: il tracciato arriva come `coords`.
 */
import type { Map as MapLibreMap } from "maplibre-gl";
import type { Camera } from "@/lib/copioneVolo";
import { FINALE_PADDING, FINALE_PADDING_STELLE, SCHEDA_POSTER } from "./constants";
import { inquadraturaVera } from "./mapOps";

/** L'inquadratura del poster, senza muovere niente: la camera misurata
 *  (`inquadraturaVera`) quando riesce, e in ogni caso i confini del tracciato
 *  per il ripiego su fitBounds. */
export function inquadraturaPoster(map: MapLibreMap, coords: [number, number][], pitch: number) {
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
}

/** La camera del poster come numeri (per il video, che la deve raggiungere a
 *  scatti e non in volo). Null se non c'è niente da inquadrare. */
export function cameraPoster(map: MapLibreMap, coords: [number, number][], pitch = 45): Camera | null {
  const q = inquadraturaPoster(map, coords, pitch);
  if (!q) return null;
  if (q.cam) return { lon: q.cam.center[0], lat: q.cam.center[1], zoom: q.cam.zoom, pitch, bearing: 0 };
  const c = map.cameraForBounds(q.bounds, { padding: q.padding, pitch, bearing: 0, maxZoom: 12 });
  if (!c) return null;
  const cc = c.center;
  const [lon, lat] = Array.isArray(cc) ? [cc[0], cc[1]] : "lng" in cc ? [cc.lng, cc.lat] : [cc.lon, cc.lat];
  return { lon, lat, zoom: c.zoom ?? map.getZoom(), pitch, bearing: 0 };
}

/** Inquadra l'intero tracciato: il percorso riempie sempre il frame allo
 *  stesso modo (margini fissi), qualunque sia la lunghezza. */
export function flyToOverview(map: MapLibreMap, coords: [number, number][], pitch = 45): Promise<void> {
  return new Promise(resolve => {
    let done = false;
    const finish = () => { if (done) return; done = true; resolve(); };
    try {
      const q = inquadraturaPoster(map, coords, pitch);
      if (!q) { finish(); return; }
      map.once("moveend", finish);
      if (q.cam) map.flyTo({ center: q.cam.center, zoom: q.cam.zoom, pitch, bearing: 0, duration: 1400 });
      else map.fitBounds(q.bounds, { pitch, bearing: 0, padding: q.padding, duration: 1400, maxZoom: 12 });
    } catch { finish(); return; }
    setTimeout(finish, 2200); // salvagente se moveend non scatta
  });
}
