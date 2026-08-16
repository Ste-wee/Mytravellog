import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";

/**
 * Fonte unica dei confini world-atlas: fetch + cache + conversione topojson.
 * Prima ContinentsMap e posterSvg scaricavano lo stesso file ognuno per conto
 * suo (il 110m due volte nella stessa sessione) e ripetevano in due punti lo
 * stesso doppio cast con lo stesso commento.
 *
 * Si cache la PROMISE così anche richieste concorrenti condividono un solo
 * fetch; in caso di errore la voce viene rimossa (nessuna cache avvelenata).
 */
const topoCache = new Map<string, Promise<Topology>>();

export type WorldAtlasResolution = "110m" | "50m";

/** Test-only: reset la cache del topojson tra i test (che stubbano fetch). */
export function __clearWorldAtlasCache() {
  topoCache.clear();
}

/** Il TopoJSON grezzo di world-atlas (110m leggero, 50m dettagliato). */
export function loadWorldAtlasTopology(resolution: WorldAtlasResolution = "110m"): Promise<Topology> {
  let topoP = topoCache.get(resolution);
  if (!topoP) {
    topoP = fetch(`https://cdn.jsdelivr.net/npm/world-atlas@2/countries-${resolution}.json`).then(r => r.json());
    topoCache.set(resolution, topoP);
    topoP.catch(() => { topoCache.delete(resolution); });
  }
  return topoP;
}

/**
 * I paesi come FeatureCollection GeoJSON. Il doppio cast è l'UNICO sanzionato:
 * l'overload di topojson-client inferisce Feature<Point> dal JSON grezzo, ma
 * il world-atlas contiene una GeometryCollection di paesi, quindi il risultato
 * è sempre una FeatureCollection.
 */
export async function loadWorldAtlasCountries(resolution: WorldAtlasResolution = "110m"): Promise<GeoJSON.FeatureCollection> {
  const topo = await loadWorldAtlasTopology(resolution);
  return feature(topo, topo.objects.countries) as unknown as GeoJSON.FeatureCollection;
}
