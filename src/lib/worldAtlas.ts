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

/**
 * Normalizza una geometria in lista di poligoni (ognuno = lista di anelli).
 * Fonte unica della ternaria Polygon/MultiPolygon (prima viveva in 4 copie,
 * e una aveva perso la guardia): qualunque ALTRA geometria (Point,
 * GeometryCollection, dato stantio da una cache) torna [] e viene saltata
 * in silenzio — mai far cadere un'intera mappa per una feature strana.
 */
export function polygonsOf(g: GeoJSON.Geometry | null | undefined): GeoJSON.Position[][][] {
  if (!g) return [];
  if (g.type === "Polygon") return [g.coordinates];
  if (g.type === "MultiPolygon") return g.coordinates;
  return [];
}

/** Il TopoJSON grezzo di world-atlas (110m leggero, 50m dettagliato). Privata:
 *  da fuori si usa loadWorldAtlasCountries, che passa dal cast sanzionato. */
function loadWorldAtlasTopology(resolution: WorldAtlasResolution): Promise<Topology> {
  let topoP = topoCache.get(resolution);
  if (!topoP) {
    topoP = fetch(`https://cdn.jsdelivr.net/npm/world-atlas@2/countries-${resolution}.json`).then(async r => {
      if (!r.ok) throw new Error(`world-atlas ${r.status}`);
      const t: Topology = await r.json();
      // Un 200 farlocco (proxy/captive portal) con JSON senza i paesi NON deve
      // restare in cache: rigettando qui, l'eviction sotto la espelle e il
      // prossimo mount riprova (prima ContinentsMap rifetchava sempre e guariva).
      if (!t?.objects?.countries) throw new Error("world-atlas malformato");
      return t;
    });
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

/**
 * Le coste: gli anelli delle terre emerse come UNA MultiLineString — linee,
 * non poligoni. ⚠️ Con le coste prese dai poligoni delle mattonelle della
 * mappa, ogni taglio fra due mattonelle diventava un pezzo di costa finto in
 * mezzo al mare (visto il 2026-10-19); una linea tagliata invece non aggiunge
 * bordi. Accetta un Feature o una FeatureCollection di (Multi)Polygon.
 */
export function costeDaTerre(terre: GeoJSON.Feature | GeoJSON.FeatureCollection): GeoJSON.Feature<GeoJSON.MultiLineString> {
  const features = terre.type === "FeatureCollection" ? terre.features : [terre];
  const linee: GeoJSON.Position[][] = [];
  for (const f of features) for (const poligono of polygonsOf(f.geometry)) for (const anello of poligono) linee.push(anello);
  return { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: linee } };
}

/** Le coste del mondo (world-atlas «land», stessa cache dei paesi). */
export async function loadCoste(resolution: WorldAtlasResolution = "50m"): Promise<GeoJSON.Feature<GeoJSON.MultiLineString>> {
  const topo = await loadWorldAtlasTopology(resolution);
  // senza terre emerse nel file: nessuna costa (la mappa resta com'è)
  if (!topo.objects.land) return costeDaTerre({ type: "FeatureCollection", features: [] });
  return costeDaTerre(feature(topo, topo.objects.land) as unknown as GeoJSON.Feature | GeoJSON.FeatureCollection);
}
