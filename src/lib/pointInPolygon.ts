/**
 * Un punto cade dentro un poligono GeoJSON? (ray casting)
 *
 * Serve a capire in QUALE regione si trova una città quando il dato di regione
 * non c'è: l'app lo calcola solo per la destinazione finale di un viaggio, non
 * per le tappe intermedie — così un viaggio Milano→Trieste→Vienna non faceva
 * risultare visitata nessuna regione italiana pur passando da Trieste.
 *
 * Il conteggio degli incroci è fatto su TUTTI gli anelli del poligono, esterno
 * e buchi insieme: la parità che ne esce esclude naturalmente i buchi (un punto
 * dentro un'enclave attraversa due contorni, quindi risulta fuori).
 */
export function pointInPolygon(lon: number, lat: number, polygon: GeoJSON.Position[][]): boolean {
  let dentro = false;
  for (const ring of polygon) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      // Il segmento attraversa la latitudine del punto, e l'incrocio è alla
      // sua destra: `yj - yi + 1e-12` evita la divisione per zero sui
      // segmenti orizzontali.
      const attraversa = (yi > lat) !== (yj > lat)
        && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
      if (attraversa) dentro = !dentro;
    }
  }
  return dentro;
}

/** true se il punto cade in ALMENO uno dei poligoni (es. le isole di una regione). */
export function pointInPolygons(lon: number, lat: number, polygons: GeoJSON.Position[][][]): boolean {
  return polygons.some(p => pointInPolygon(lon, lat, p));
}
