import { describe, it, expect } from "vitest";
import { buildFlightPath, computeLegCamera, buildFlightLegs, pointAlongPath, easeInOutCubic, tripTotalKm, buildPerTripRouteCoords, tracciatoFitto, tracciaFittaSalvata, FlightStop } from "./flyover";
import { distanceKm } from "./geo";
import type { Trip } from "./storage";

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: Math.random().toString(36).slice(2),
    created_at: new Date().toISOString(),
    title: "Test",
    country: "Italia",
    city: "Roma",
    country_code: "IT",
    trip_date: "2024-01-01",
    date_end: null,
    rating: null,
    notes: null,
    transport_mode: null,
    waypoints: [],
    latitude: 41.9,
    longitude: 12.5,
    home_latitude: 45.5,
    home_longitude: 9.2,
    home_label: "Milano",
    route_geometry: null,
    temperature_c: null,
    altitude_m: null,
    max_altitude_m: null,
    max_altitude_city: null,
    distance_from_home_km: null,
    max_distance_from_home_km: null,
    max_distance_city: null,
    hottest_temp_c: null,
    hottest_city: null,
    coldest_temp_c: null,
    coldest_city: null,
    region: null,
    region_details: null,
    ...overrides,
  };
}

function makeStop(overrides: Partial<FlightStop> = {}): FlightStop {
  return {
    lat: 0, lon: 0, label: "Tappa", tripId: "1",
    transportMode: null, routeGeometry: null, routeKm: null,
    ...overrides,
  };
}

describe("buildFlightPath", () => {
  it("produce casa → destinazione per un viaggio senza waypoint", () => {
    const stops = buildFlightPath([makeTrip()]);
    expect(stops.map(s => s.label)).toEqual(["Milano", "Roma"]);
  });

  it("la casa ha transportMode/routeGeometry null", () => {
    const trip = makeTrip();
    const [home] = buildFlightPath([trip]);
    expect(home.transportMode).toBeNull();
    expect(home.routeGeometry).toBeNull();
  });

  it("la destinazione riporta transportMode/route_geometry del viaggio", () => {
    const trip = makeTrip({ transport_mode: "car", route_geometry: [[12.5, 41.9], [12.6, 42.0]] });
    const stops = buildFlightPath([trip]);
    const dest = stops[stops.length - 1];
    expect(dest.transportMode).toBe("car");
    expect(dest.routeGeometry).toEqual([[12.5, 41.9], [12.6, 42.0]]);
  });

  it("un waypoint riporta il proprio transportMode/route_geometry", () => {
    const trip = makeTrip({
      waypoints: [{ id: "wp-1", city: "Torino", country: "Italia", transport_mode: "car", lat: 45.07, lon: 7.68, route_geometry: [[9.19, 45.46], [7.68, 45.07]] }],
    });
    const stops = buildFlightPath([trip]);
    const wp = stops.find(s => s.label === "Torino")!;
    expect(wp.transportMode).toBe("car");
    expect(wp.routeGeometry).toEqual([[9.19, 45.46], [7.68, 45.07]]);
  });

  it("inserisce i waypoint tra casa e destinazione, nell'ordine dato", () => {
    const stops = buildFlightPath([makeTrip({
      waypoints: [{ id: "wp-1", city: "Torino", country: "Italia", transport_mode: "train", lat: 45.07, lon: 7.68 }],
    })]);
    expect(stops.map(s => s.label)).toEqual(["Milano", "Torino", "Roma"]);
  });

  it("salta la casa se home_latitude/longitude sono null", () => {
    const stops = buildFlightPath([makeTrip({ home_latitude: null, home_longitude: null })]);
    expect(stops.map(s => s.label)).toEqual(["Roma"]);
  });

  it("salta i waypoint senza coordinate", () => {
    const stops = buildFlightPath([makeTrip({
      waypoints: [{ city: "SenzaCoordinate", country: "Italia", transport_mode: "train" }],
    })]);
    expect(stops.map(s => s.label)).toEqual(["Milano", "Roma"]);
  });

  it("ordina più viaggi per data crescente", () => {
    const stops = buildFlightPath([
      makeTrip({ trip_date: "2024-06-01", city: "Napoli", latitude: 40.85, longitude: 14.27 }),
      makeTrip({ trip_date: "2024-01-01", city: "Roma" }),
    ]);
    // Il viaggio di gennaio (Roma) deve venire prima di quello di giugno (Napoli)
    const romaIndex = stops.findIndex(s => s.label === "Roma");
    const napoliIndex = stops.findIndex(s => s.label === "Napoli");
    expect(romaIndex).toBeLessThan(napoliIndex);
  });

  it("unisce due tappe consecutive con le stesse coordinate (niente tratta a lunghezza zero)", () => {
    // Il secondo viaggio parte esattamente dalla stessa città dove finiva il primo
    const stops = buildFlightPath([
      makeTrip({ trip_date: "2024-01-01", city: "Roma", latitude: 41.9, longitude: 12.5 }),
      makeTrip({ trip_date: "2024-02-01", home_latitude: 41.9, home_longitude: 12.5, home_label: "Roma", city: "Napoli", latitude: 40.85, longitude: 14.27 }),
    ]);
    // Milano -> Roma (dal primo viaggio) -> [Roma duplicata, saltata] -> Napoli
    expect(stops.map(s => s.label)).toEqual(["Milano", "Roma", "Napoli"]);
  });
});

describe("computeLegCamera", () => {
  it("usa zoom più ravvicinato per tratte brevi (<50km)", () => {
    const cam = computeLegCamera({ lat: 45.5, lon: 9.2 }, { lat: 45.51, lon: 9.21 });
    expect(cam.zoom).toBe(8.5);
    expect(cam.pitch).toBe(50);
  });

  it("usa zoom basso per tratte intercontinentali (>3000km)", () => {
    // Milano -> Tokyo, ~9700km
    const cam = computeLegCamera({ lat: 45.46, lon: 9.19 }, { lat: 35.68, lon: 139.65 });
    expect(cam.zoom).toBe(3);
    expect(cam.pitch).toBe(50);
  });

  it("la durata resta clampata tra 7s e 16s", () => {
    const short = computeLegCamera({ lat: 45.5, lon: 9.2 }, { lat: 45.5001, lon: 9.2001 });
    const long = computeLegCamera({ lat: 45.46, lon: 9.19 }, { lat: 35.68, lon: 139.65 });
    expect(short.durationMs).toBe(7000);
    expect(long.durationMs).toBe(16000);
  });

  it("orientamento fisso: bearing a nord e pitch costante su ogni tratta", () => {
    const a = computeLegCamera({ lat: 45.5, lon: 9.2 }, { lat: 41.9, lon: 12.5 });
    const b = computeLegCamera({ lat: 41.9, lon: 12.5 }, { lat: 37.5, lon: 15.1 });
    expect(a.bearing).toBe(0);
    expect(b.bearing).toBe(0);
    expect(a.pitch).toBe(b.pitch);
  });
});

describe("buildFlightLegs", () => {
  it("produce N-1 tratte per N tappe", () => {
    const stops = buildFlightPath([makeTrip({
      waypoints: [{ id: "wp-1", city: "Torino", country: "Italia", transport_mode: "train", lat: 45.07, lon: 7.68 }],
    })]);
    const legs = buildFlightLegs(stops);
    expect(legs).toHaveLength(2);
    expect(legs[0].from.label).toBe("Milano");
    expect(legs[0].to.label).toBe("Torino");
    expect(legs[1].from.label).toBe("Torino");
    expect(legs[1].to.label).toBe("Roma");
  });

  it("nessuna tratta con una sola tappa", () => {
    const legs = buildFlightLegs([makeStop({ label: "Solo" })]);
    expect(legs).toHaveLength(0);
  });

  it("nessuna tratta con lista vuota", () => {
    expect(buildFlightLegs([])).toHaveLength(0);
  });

  it("pathCoords è una linea retta from→to quando non c'è un percorso stradale", () => {
    const from = makeStop({ lat: 45.5, lon: 9.2 });
    const to = makeStop({ lat: 41.9, lon: 12.5, routeGeometry: null });
    const [leg] = buildFlightLegs([from, to]);
    expect(leg.pathCoords).toEqual([[9.2, 45.5], [12.5, 41.9]]);
  });

  it("pathCoords usa il percorso stradale reale quando presente sulla tappa di arrivo", () => {
    const road: [number, number][] = [[9.2, 45.5], [10, 44], [12.5, 41.9]];
    const from = makeStop({ lat: 45.5, lon: 9.2 });
    const to = makeStop({ lat: 41.9, lon: 12.5, transportMode: "car", routeGeometry: road });
    const [leg] = buildFlightLegs([from, to]);
    expect(leg.pathCoords).toEqual(road);
  });

  it("ignora un percorso stradale con un solo punto (non è un percorso valido)", () => {
    const from = makeStop({ lat: 45.5, lon: 9.2 });
    const to = makeStop({ lat: 41.9, lon: 12.5, routeGeometry: [[12.5, 41.9]] });
    const [leg] = buildFlightLegs([from, to]);
    expect(leg.pathCoords).toEqual([[9.2, 45.5], [12.5, 41.9]]);
  });
});

describe("easeInOutCubic", () => {
  it("t=0 ritorna 0 e t=1 ritorna 1", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it("t=0.5 ritorna 0.5 (simmetrica)", () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 5);
  });

  it("è crescente monotona su tutto l'intervallo", () => {
    const samples = Array.from({ length: 11 }, (_, i) => easeInOutCubic(i / 10));
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeGreaterThan(samples[i - 1]);
  });

  it("parte più lenta della velocità costante (accelerazione in apertura)", () => {
    // Nella prima metà la curva ease-in-out deve restare sotto la retta t=t
    // (parte piano), altrimenti non risolverebbe il problema misurato dal
    // vivo (la camera che scatta subito quasi a destinazione).
    expect(easeInOutCubic(0.2)).toBeLessThan(0.2);
  });

  it("clampa input fuori range [0,1]", () => {
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
  });
});

describe("pointAlongPath", () => {
  it("t=0 ritorna il primo punto", () => {
    expect(pointAlongPath([[0, 0], [10, 10]], 0)).toEqual([0, 0]);
  });

  it("t=1 ritorna l'ultimo punto", () => {
    expect(pointAlongPath([[0, 0], [10, 10]], 1)).toEqual([10, 10]);
  });

  it("t=0.5 su un percorso a due punti ritorna circa il punto medio", () => {
    const [lon, lat] = pointAlongPath([[0, 0], [10, 0]], 0.5);
    expect(lon).toBeCloseTo(5, 0);
    expect(lat).toBeCloseTo(0, 5);
  });

  it("su un percorso con segmenti di lunghezza diversa avanza in proporzione alla distanza reale, non al numero di punti", () => {
    // Primo segmento molto più lungo del secondo: a metà percorso (per distanza)
    // il punto deve trovarsi ancora dentro il primo segmento, non al secondo vertice.
    const path: [number, number][] = [[0, 0], [10, 0], [10.1, 0]];
    const [lon] = pointAlongPath(path, 0.5);
    expect(lon).toBeLessThan(10);
  });

  it("un percorso con un solo punto ritorna sempre quel punto", () => {
    expect(pointAlongPath([[5, 5]], 0.3)).toEqual([5, 5]);
  });

  it("un percorso vuoto non lancia un errore", () => {
    expect(pointAlongPath([], 0.5)).toEqual([0, 0]);
  });
});

describe("tracciatoFitto", () => {
  it("riconosce una traccia GPX (punti ravvicinati) come già esatta", () => {
    const gpx: [number, number][] = Array.from({ length: 100 }, (_, i) => [9.19 + i * 0.001, 45.46]);
    expect(tracciatoFitto(gpx)).toBe(true);
  });

  it("non si fa ingannare da un percorso stradale semplificato", () => {
    // Tre punti per centinaia di km: segmenti lunghissimi, curve tagliate.
    expect(tracciatoFitto([[9.19, 45.46], [8.9, 46.2], [8.55, 47.37]])).toBe(false);
  });

  it("un disegno assente o di un solo punto non è nè fitto nè affidabile", () => {
    expect(tracciatoFitto(null)).toBe(false);
    expect(tracciatoFitto([])).toBe(false);
    expect(tracciatoFitto([[9.19, 45.46]])).toBe(false);
  });
});

describe("tracciaFittaSalvata", () => {
  // Una traccia registrata sul campo: 200 punti da Milano verso nord-est.
  const gpx: [number, number][] = Array.from({ length: 200 }, (_, i) => [9.19 + i * 0.002, 45.46 + i * 0.002]);
  const capoA = { lat: 45.46, lon: 9.19 };
  const capoB = { lat: gpx[199][1], lon: gpx[199][0] };

  it("riconosce la traccia fitta i cui capi combaciano con la tratta", () => {
    const trip = makeTrip({ route_geometry: gpx });
    expect(tracciaFittaSalvata(trip, capoA, capoB)?.coords).toBe(gpx);
  });

  it("porta con sé anche la lunghezza salvata, se c'era", () => {
    const trip = makeTrip({ route_geometry: gpx, route_km: 71 });
    expect(tracciaFittaSalvata(trip, capoA, capoB)?.km).toBe(71);
  });

  it("non protegge un percorso su strada semplificato: quello si può rifare", () => {
    const trip = makeTrip({ route_geometry: [[9.19, 45.46], [8.9, 46.2], [8.55, 47.37]] });
    expect(tracciaFittaSalvata(trip, { lat: 45.46, lon: 9.19 }, { lat: 47.37, lon: 8.55 })).toBeNull();
  });

  it("non spaccia una traccia per un'altra tratta: contano i capi", () => {
    const trip = makeTrip({ route_geometry: gpx });
    expect(tracciaFittaSalvata(trip, capoA, { lat: 41.9, lon: 12.5 })).toBeNull();
    expect(tracciaFittaSalvata(trip, { lat: 41.9, lon: 12.5 }, capoB)).toBeNull();
  });

  it("la cerca anche fra le tappe, non solo sulla tratta finale", () => {
    const trip = makeTrip({
      route_geometry: null,
      waypoints: [{ city: "Meta", country: "Italia", transport_mode: "bici", lat: capoB.lat, lon: capoB.lon, route_geometry: gpx, route_km: 71 }],
    });
    expect(tracciaFittaSalvata(trip, capoA, capoB)?.km).toBe(71);
  });

  it("nessuna traccia salvata, nessuna protezione", () => {
    expect(tracciaFittaSalvata(makeTrip(), capoA, capoB)).toBeNull();
    expect(tracciaFittaSalvata(null, capoA, capoB)).toBeNull();
  });
});

describe("tripTotalKm", () => {
  it("senza route_geometry usa la linea d'aria casa → destinazione", () => {
    const trip = makeTrip(); // Milano (45.5, 9.2) → Roma (41.9, 12.5)
    const straight = distanceKm(45.5, 9.2, 41.9, 12.5);
    expect(tripTotalKm(trip)).toBeCloseTo(straight, 0);
  });

  it("con route_geometry (mezzo su strada) conta il percorso reale, più lungo della linea d'aria", () => {
    const straight = makeTrip();
    const road = makeTrip({
      transport_mode: "car",
      // deviazione verso est: casa → (20, 45.5) → destinazione, più lunga della retta
      route_geometry: [[9.2, 45.5], [20, 45.5], [12.5, 41.9]],
    });
    expect(tripTotalKm(road)).toBeGreaterThan(tripTotalKm(straight));
  });

  it("ritorna 0 se manca la casa (nessuna tratta da percorrere)", () => {
    const trip = makeTrip({ home_latitude: null, home_longitude: null });
    expect(tripTotalKm(trip)).toBe(0);
  });

  it("crede alla lunghezza dichiarata invece che al disegno semplificato", () => {
    // Il tracciato che salviamo ha 20-35 punti: le curve sono tagliate e
    // sommarne i segmenti sottostima il percorso del 2-7% (Milano→Zurigo: 268
    // km invece di 282). Quando il servizio ci ha detto la distanza vera,
    // quella vince sul disegno.
    const trip = makeTrip({
      transport_mode: "car",
      route_geometry: [[9.2, 45.5], [11, 44], [12.5, 41.9]],
      route_km: 999,
    });
    expect(tripTotalKm(trip)).toBe(999);
  });

  it("ignora una lunghezza rimasta orfana, senza il disegno a cui si riferiva", () => {
    // Se il tracciato sparisce (rotta rifatta e fallita), il numero vecchio
    // descrive un percorso che non c'è più: meglio la linea d'aria.
    const trip = makeTrip({ transport_mode: "car", route_geometry: null, route_km: 999 });
    expect(tripTotalKm(trip)).toBeCloseTo(distanceKm(45.5, 9.2, 41.9, 12.5), 0);
  });

  it("senza lunghezza dichiarata somma i segmenti, come prima", () => {
    const trip = makeTrip({
      transport_mode: "car",
      route_geometry: [[9.2, 45.5], [20, 45.5], [12.5, 41.9]],
    });
    const somma = distanceKm(45.5, 9.2, 45.5, 20) + distanceKm(45.5, 20, 41.9, 12.5);
    expect(tripTotalKm(trip)).toBeCloseTo(somma, 0);
  });

  it("mescola tappe con e senza lunghezza dichiarata", () => {
    // Un viaggio riparato a metà: la prima tratta ha il numero, la seconda no.
    const trip = makeTrip({
      transport_mode: "car",
      waypoints: [{
        city: "Torino", country: "Italia", transport_mode: "car", lat: 45.07, lon: 7.68,
        route_geometry: [[9.2, 45.5], [8.5, 45.3], [7.68, 45.07]], route_km: 140,
      }],
      route_geometry: null, latitude: 41.9, longitude: 12.5,
    });
    expect(tripTotalKm(trip)).toBeCloseTo(140 + distanceKm(45.07, 7.68, 41.9, 12.5), 0);
  });

  it("somma le tratte di un viaggio multi-tappa", () => {
    // Milano → Torino → Roma: somma delle due tratte, non la retta Milano→Roma
    const trip = makeTrip({
      waypoints: [{ city: "Torino", country: "Italia", transport_mode: "train", lat: 45.07, lon: 7.68 }],
      latitude: 41.9, longitude: 12.5,
    });
    const legMi_To = distanceKm(45.5, 9.2, 45.07, 7.68);
    const legTo_Ro = distanceKm(45.07, 7.68, 41.9, 12.5);
    expect(tripTotalKm(trip)).toBeCloseTo(legMi_To + legTo_Ro, 0);
  });
});

describe("buildPerTripRouteCoords", () => {
  it("restituisce una polilinea separata per ogni viaggio (nessun collegamento tra viaggi)", () => {
    const t1 = makeTrip({ home_latitude: 45.5, home_longitude: 9.2, latitude: 48.86, longitude: 2.35 }); // Milano→Parigi
    const t2 = makeTrip({ home_latitude: 45.5, home_longitude: 9.2, latitude: 41.39, longitude: 2.17 }); // Milano→Barcellona
    const segs = buildPerTripRouteCoords([t1, t2]);
    expect(segs).toHaveLength(2);
    // ogni segmento va da casa alla destinazione, senza tratta di ritorno
    expect(segs[0][0]).toEqual([9.2, 45.5]);
    expect(segs[0][segs[0].length - 1]).toEqual([2.35, 48.86]);
    expect(segs[1][0]).toEqual([9.2, 45.5]);
    expect(segs[1][segs[1].length - 1]).toEqual([2.17, 41.39]);
  });

  it("segue il tracciato stradale reale quando presente", () => {
    const road = makeTrip({
      transport_mode: "car",
      route_geometry: [[9.2, 45.5], [11, 46], [2.35, 48.86]],
      latitude: 48.86, longitude: 2.35,
    });
    const [seg] = buildPerTripRouteCoords([road]);
    expect(seg).toEqual([[9.2, 45.5], [11, 46], [2.35, 48.86]]);
  });

  it("esclude i viaggi senza punti sufficienti", () => {
    const noHome = makeTrip({ home_latitude: null, home_longitude: null });
    const ok = makeTrip({ home_latitude: 45.5, home_longitude: 9.2, latitude: 48.86, longitude: 2.35 });
    expect(buildPerTripRouteCoords([noHome, ok])).toHaveLength(1);
  });
});

/**
 * `senzaCasa` (2026-08-26). Stefano: «così è molto caotica, colleghiamo solo i
 * viaggi senza partire da Milano». Ogni polilinea partiva da casa, quindi N
 * viaggi = N raggi dallo stesso punto.
 *
 * ⚠️ Il prezzo, che questi test fissano nero su bianco: un viaggio con UNA meta
 * sola senza la tratta da casa non è più una linea — è un punto, e sparisce dai
 * segmenti. È una scelta consapevole, non un difetto: se un domani qualcuno
 * "aggiusta" questo comportamento, deve prima leggere qui.
 */
describe("buildPerTripRouteCoords — senzaCasa", () => {
  const conCasa = (over: Partial<Trip> = {}): Trip => ({
    id: "t", created_at: "2024-01-01T00:00:00.000Z", title: "Zurigo", city: "Zurigo",
    country: "Svizzera", country_code: "CH", trip_date: "2026-06-01", date_end: "2026-06-05",
    rating: null, notes: null, transport_mode: "car", waypoints: [],
    latitude: 47.37, longitude: 8.54,
    home_latitude: 45.46, home_longitude: 9.19, home_label: "Milano",
    route_geometry: null, temperature_c: null, altitude_m: null,
    distance_from_home_km: null, max_distance_from_home_km: null, max_distance_city: null,
    max_altitude_m: null, max_altitude_city: null, hottest_temp_c: null, hottest_city: null,
    coldest_temp_c: null, coldest_city: null, region: null, region_details: null,
    ...over,
  } as Trip);

  it("com'è oggi: la polilinea PARTE da casa", () => {
    const [seg] = buildPerTripRouteCoords([conCasa()]);
    expect(seg[0]).toEqual([9.19, 45.46]);
  });

  it("senzaCasa: la tratta da casa non c'è più", () => {
    const segs = buildPerTripRouteCoords([conCasa({
      waypoints: [{ id: "w", city: "Como", country: "Italia", country_code: "IT",
        transport_mode: "car", lat: 45.81, lon: 9.08 }],
    })], { senzaCasa: true });
    expect(segs).toHaveLength(1);
    expect(segs[0][0]).toEqual([9.08, 45.81]);   // parte da Como, non da Milano
  });

  it("IL PREZZO: un viaggio con una meta sola sparisce dai segmenti", () => {
    // Casa → Zurigo, senza tappe: togliendo casa resta un punto, e un punto non
    // è una linea. Sul globo resta il pallino della meta, non il tratto.
    expect(buildPerTripRouteCoords([conCasa()], { senzaCasa: true })).toHaveLength(0);
    expect(buildPerTripRouteCoords([conCasa()])).toHaveLength(1);
  });

  it("un viaggio senza casa dichiarata non perde la prima tappa", () => {
    // Qui la prima tappa NON è casa: togliere il primo punto a caso
    // mangerebbe una tappa vera.
    const senzaCasaDichiarata = conCasa({
      home_latitude: null, home_longitude: null,
      waypoints: [{ id: "w", city: "Como", country: "Italia", country_code: "IT",
        transport_mode: "car", lat: 45.81, lon: 9.08 }],
    });
    const [seg] = buildPerTripRouteCoords([senzaCasaDichiarata], { senzaCasa: true });
    expect(seg[0]).toEqual([9.08, 45.81]);
  });
});
