import { Trip } from "./storage";
import { distanceKm } from "./geo";
import { haversineKm } from "./haversine";
import { unwrapNear, unwrapSegments } from "./lonWrap";

// Il tipo viene dalla fonte unica: ridichiararlo qui significava aggiornare
// due elenchi a ogni mezzo nuovo (il pullman ha trovato 3 di questi fossili).
export type { TransportMode } from "./transport";
import type { TransportMode } from "./transport";

export interface FlightStop {
  lat: number;
  lon: number;
  label: string;
  tripId: string;
  /** Mezzo usato per ARRIVARE a questa tappa (null per la prima, es. casa). */
  transportMode: TransportMode | null;
  /** Percorso stradale reale per arrivare qui, se disponibile (solo mezzo "car"). */
  routeGeometry: [number, number][] | null;
  /** Lunghezza vera di quel percorso in km, dichiarata dal servizio di
   *  instradamento (vedi `Trip.route_km`). Null quando non la conosciamo: si
   *  ricade sulla somma dei segmenti del disegno. */
  routeKm: number | null;
  /** True se questa tappa è la CASA di partenza, non un posto visitato. La
   *  Mappa della vita la esclude (né stella né tratta): senza il contrassegno
   *  dovrebbe indovinarla dalle coordinate, e la casa può cambiare nel tempo. */
  casa?: boolean;
}

export interface LegCamera {
  zoom: number;
  pitch: number;
  bearing: number;
  durationMs: number;
}

export interface FlightLeg {
  from: FlightStop;
  to: FlightStop;
  camera: LegCamera;
  /**
   * Punti [lon,lat] da percorrere per questa tratta: il tracciato stradale
   * reale (from `to.routeGeometry`) quando disponibile, altrimenti una linea
   * retta da `from` a `to`. Usata per disegnare il percorso e per animare
   * l'icona del mezzo — la telecamera invece vola sempre dritta verso `to`
   * (vedi computeLegCamera), non segue le curve.
   */
  pathCoords: [number, number][];
  /**
   * Lunghezza della tratta in km. NON è sempre la somma di `pathCoords`: sui
   * tracciati stradali il disegno è semplificato e taglia le curve, quindi si
   * preferisce la distanza dichiarata dal servizio quando c'è. Chi mostra dei
   * km deve leggere QUESTO, non ricalcolarlo dal disegno.
   */
  km: number;
}

const COORD_EPSILON = 1e-6;

function sameCoords(a: { lat: number; lon: number }, lat: number, lon: number): boolean {
  return Math.abs(a.lat - lat) < COORD_EPSILON && Math.abs(a.lon - lon) < COORD_EPSILON;
}

/**
 * Sequenza di tappe (casa → waypoint → destinazione) per uno o più viaggi,
 * ordinati per data — per il recap multi-viaggio è la stessa funzione,
 * semplicemente con più di un trip in ingresso. Tappe consecutive con le
 * stesse coordinate (es. la destinazione di un viaggio coincide con la casa
 * di quello successivo) vengono unite in una sola, altrimenti la tratta
 * risultante avrebbe lunghezza zero e bearing/zoom indefiniti.
 */
export function buildFlightPath(trips: Trip[]): FlightStop[] {
  const sorted = [...trips].sort((a, b) => a.trip_date.localeCompare(b.trip_date));
  const stops: FlightStop[] = [];

  const push = (
    lat: number, lon: number, label: string, tripId: string,
    transportMode: TransportMode | null, routeGeometry: [number, number][] | null,
    routeKm: number | null = null,
    casa = false,
  ) => {
    const last = stops[stops.length - 1];
    if (last && sameCoords(last, lat, lon)) return;
    stops.push({ lat, lon, label, tripId, transportMode, routeGeometry, routeKm, casa });
  };

  for (const t of sorted) {
    if (t.home_latitude != null && t.home_longitude != null) {
      push(t.home_latitude, t.home_longitude, t.home_label ?? "Casa", t.id, null, null, null, true);
    }
    for (const w of t.waypoints ?? []) {
      if (w.lat != null && w.lon != null) {
        push(w.lat, w.lon, w.city, t.id, w.transport_mode, w.route_geometry ?? null, w.route_km ?? null);
      }
    }
    push(t.latitude, t.longitude, t.city, t.id, t.transport_mode, t.route_geometry ?? null, t.route_km ?? null);
  }

  return stops;
}

/**
 * Camera per la tratta a→b: più la distanza è corta più si vola vicini al
 * suolo con inclinazione forte (effetto "cinematografico"), più è lunga
 * (intercontinentale) più si sale di quota restando sul globo. La durata
 * è proporzionale alla distanza ma restA in un range godibile (3.5-7.5s).
 */
export function computeLegCamera(from: { lat: number; lon: number }, to: { lat: number; lon: number }): LegCamera {
  const km = distanceKm(from.lat, from.lon, to.lat, to.lon);

  // Orientamento FISSO per tutto il volo: bearing a nord e pitch costante. Prima
  // ogni tratta ruotava la camera verso la propria direzione e cambiava molto il
  // pitch/zoom → il video "si muoveva troppo" e disorientava tra una tratta e
  // l'altra. Ora la camera tiene un assetto fermo e si limita a scorrere per
  // seguire il percorso; lo zoom varia in modo lieve con la distanza della tratta.
  const bearing = 0;
  const pitch = 50;

  let zoom: number;
  if (km < 50) { zoom = 8.5; }
  else if (km < 500) { zoom = 6.5; }
  else if (km < 3000) { zoom = 4.5; }
  else { zoom = 3; }

  // Durata della tratta = quanto tempo marker e camera impiegano a percorrerla
  // (condivisa da entrambi, così restano sincronizzati). Rallentata di nuovo:
  // il pallino del mezzo risultava ancora troppo veloce. Range più ampio e più
  // lento (prima min 5000 / max 11000, km*6) per un viaggio disteso e calmo.
  const durationMs = Math.min(16000, Math.max(7000, km * 9));

  return { zoom, pitch, bearing, durationMs };
}

/**
 * Easing condiviso tra camera e icona del mezzo, applicato a mano al `t` di
 * entrambe prima di interpolare posizione/zoom/pitch/bearing (camera) e
 * pointAlongPath (icona). Necessario pilotare la camera a mano frame per
 * frame (invece del `flyTo` nativo di MapLibre) perché la sua curva di volo
 * predefinita non avanza in modo geograficamente lineare nemmeno passandole
 * un easing custom (lo zoom-out/in intermedio distorce comunque il
 * progresso: misurato dal vivo, a metà durata la camera nativa era già al
 * 97% del tragitto mentre l'icona a velocità costante era solo al 50%).
 * Con la STESSA easeInOutCubic e la STESSA interpolazione lineare a guidare
 * entrambe, restano allineate per l'intera tratta.
 */
export function easeInOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/**
 * Punti da percorrere per arrivare a `to`: il tracciato stradale reale se
 * presente (solo tratte in auto con route_geometry salvata), altrimenti la
 * linea retta from→to.
 */
function legPathCoords(from: FlightStop, to: FlightStop): [number, number][] {
  if (to.routeGeometry && to.routeGeometry.length > 1) return to.routeGeometry;
  return [[from.lon, from.lat], [to.lon, to.lat]];
}

/**
 * Quanto è lunga davvero questa tratta.
 *
 * Sul tracciato stradale si crede alla distanza dichiarata dal servizio di
 * instradamento invece che al disegno: il disegno è la versione semplificata
 * (20-35 punti), le curve sono tagliate e sommarne i segmenti sottostima il
 * percorso del 2-7%. Fuori da quel caso — linea d'aria, tracce GPX fitte,
 * viaggi salvati prima del 2026-08-22 — la somma dei segmenti è l'unica cosa
 * che abbiamo, ed è precisa.
 */
function legKm(to: FlightStop, pathCoords: [number, number][]): number {
  const usaTracciato = !!(to.routeGeometry && to.routeGeometry.length > 1);
  if (usaTracciato && to.routeKm != null && to.routeKm > 0) return to.routeKm;
  return pathLengthKm(pathCoords);
}

/** Spezza la sequenza di tappe in tratte, ciascuna con la propria camera e il proprio percorso. */
export function buildFlightLegs(stops: FlightStop[]): FlightLeg[] {
  const legs: FlightLeg[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i];
    const to = stops[i + 1];
    const pathCoords = legPathCoords(from, to);
    legs.push({ from, to, camera: computeLegCamera(from, to), pathCoords, km: legKm(to, pathCoords) });
  }
  return legs;
}

/**
 * Km totali "percorsi" di un viaggio: somma delle tratte seguendo la STRADA
 * reale dove disponibile (route_geometry, per auto/bici/moto), altrimenti la
 * linea d'aria. Fonte UNICA usata ovunque (Home, Statistiche, card, poster) così
 * il numero è coerente e corretto per i mezzi che seguono la strada — invece del
 * vecchio `distance_from_home_km` salvato, che era sempre in linea d'aria.
 */
export function tripTotalKm(trip: Trip): number {
  const legs = buildFlightLegs(buildFlightPath([trip]));
  return legs.reduce((sum, leg) => sum + leg.km, 0);
}

/**
 * Un tracciato è "fitto" quando i suoi punti sono così ravvicinati che
 * sommarne i segmenti dà già la lunghezza vera: è il caso delle tracce GPX
 * registrate sul campo (punti ogni pochi metri). I percorsi che chiediamo al
 * servizio di instradamento sono invece semplificati — segmenti da chilometri
 * — e la loro somma va corretta con la distanza dichiarata.
 *
 * Serve a non andare a ripescare la distanza di una traccia GPS reale: quella
 * è già esatta, e il percorso su strada che ci verrebbe restituito
 * descriverebbe un altro viaggio.
 */
export function tracciatoFitto(coords: [number, number][] | null | undefined): boolean {
  if (!coords || coords.length < 2) return false;
  return pathLengthKm(coords) / (coords.length - 1) < 1;   // meno di 1 km per segmento
}

/** Quanto lontano possono stare i capi di una traccia dai punti della tratta
 *  perché sia ancora "la stessa tratta": 300 m coprono l'imprecisione di un
 *  GPS acceso in strada senza confondere due tappe diverse. */
const VICINO_KM = 0.3;

/**
 * La traccia GPS già salvata per la tratta `da` → `a`, se esiste.
 *
 * Serve a NON buttare via un GPX importato. Salvando un viaggio, i due form
 * richiedono il percorso su strada di ogni tratta e sovrascrivono quello che
 * c'era: chi importava una traccia registrata sul campo e poi apriva "Modifica
 * viaggio" (dove l'import porta subito dopo) si ritrovava il viaggio davvero
 * fatto sostituito da un itinerario calcolato.
 *
 * Si riconosce dai fatti, non dalla provenienza: una traccia FITTA (punti ogni
 * pochi metri, vedi `tracciatoFitto`) i cui capi coincidono con la tratta che
 * si sta per salvare. Si cercano tutte le tratte del viaggio, non solo quella
 * di pari indice: le tappe si possono riordinare, e sono i capi a dire di che
 * tratta si tratta.
 */
export function tracciaFittaSalvata(
  trip: Pick<Trip, "route_geometry" | "route_km" | "waypoints"> | null | undefined,
  da: { lat: number; lon: number },
  a: { lat: number; lon: number },
): { coords: [number, number][]; km: number | null } | null {
  if (!trip) return null;
  const salvate = [
    ...(trip.waypoints ?? []).map(w => ({ coords: w.route_geometry, km: w.route_km })),
    { coords: trip.route_geometry, km: trip.route_km },
  ];
  for (const s of salvate) {
    const g = s.coords;
    if (!tracciatoFitto(g)) continue;
    const primo = g![0], ultimo = g![g!.length - 1];
    if (haversineKm(primo[1], primo[0], da.lat, da.lon) > VICINO_KM) continue;
    if (haversineKm(ultimo[1], ultimo[0], a.lat, a.lon) > VICINO_KM) continue;
    return { coords: g!, km: s.km ?? null };
  }
  return null;
}

/**
 * Percorsi SEPARATI per la "Mappa della vita": una polilinea [lon,lat][] per
 * ciascun viaggio (tracciato stradale reale dove disponibile), SENZA tratte di
 * collegamento tra un viaggio e l'altro — così la costellazione di tutti i
 * viaggi resta pulita anche con molte mete (a differenza di buildFlightPath che
 * concatena tutto in un'unica polilinea, aggiungendo linee di "ritorno a casa").
 * I viaggi senza punti sufficienti (< 2 tappe) vengono esclusi.
 */
/**
 * ⚠️ **La tratta da casa NON si disegna** (2026-08-27, il contrario di quanto
 * scritto qui fino a ieri). Stefano l'aveva chiesto subito («colleghiamo solo
 * i viaggi senza partire da Milano»), l'aveva provato col banco di prova e
 * scelto — e io avevo letto male il suo «tieni solo il tratto sottile»,
 * ricablando i raggi da Milano. Aprendo l'app se n'è accorto: «mica avevamo
 * detto che si collegavano solo le tappe?». Questa mappa dice **dove sono
 * stato**, non da dove parto.
 *
 * Il prezzo, detto e accettato: un viaggio con UNA meta sola non ha nessuna
 * linea — resta la sua stella (la casa invece non ha nemmeno quella: vedi
 * `casa` in FlightStop e il filtro in TripFlyover). Gli altri poster (flyover
 * per anno, biglietto) continuano a partire da casa: lì il racconto è il
 * percorso.
 */
export function buildPerTripRouteCoords(trips: Trip[]): [number, number][][] {
  const out: [number, number][][] = [];
  for (const t of trips) {
    // ⚠️ La casa si toglie DAL VIAGGIO, non filtrando le tappe dopo:
    // buildFlightPath unisce tappe consecutive con le stesse coordinate, e una
    // prima tappa censita proprio a casa verrebbe inghiottita dalla
    // tappa-casa — filtrata via con lei, portandosi dietro la prima tratta
    // (trovato in revisione con una prova secca, non a occhio).
    const stops = buildFlightPath([{ ...t, home_latitude: null, home_longitude: null }]);
    const legs = buildFlightLegs(stops);
    if (legs.length === 0) continue;
    const coords: [number, number][] = [[stops[0].lon, stops[0].lat]];
    for (const leg of legs) coords.push(...leg.pathCoords.slice(1));
    out.push(coords);
  }
  return out;
}

/** Lunghezza approssimata (km) di un percorso [lon,lat][], sommando ogni
 *  segmento con la haversine NON arrotondata: coi tracciati densi
 *  (route_geometry stradale, GPX) i segmenti sono spesso < 1 km e
 *  l'arrotondamento a km intero di `distanceKm` li azzererebbe uno per uno. */
export function pathLengthKm(path: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += haversineKm(path[i - 1][1], path[i - 1][0], path[i][1], path[i][0]);
  }
  return total;
}

/** La y di Mercatore in "giri di mondo": l'unità con cui la mappa misura le linee. */
function yMercatore(lat: number): number {
  const l = Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + l / 2)) / (2 * Math.PI);
}
/** Lunghezza di un segmento come la misura la mappa (per `line-progress`). */
function lunghezzaMappa(a: [number, number], b: [number, number]): number {
  return Math.hypot((b[0] - a[0]) / 360, yMercatore(b[1]) - yMercatore(a[1]));
}

export interface TracciatoProgressivo {
  /** Tutte le tratte in UNA linea srotolata: alla mappa si passa una volta sola. */
  percorso: [number, number][];
  /** Dove sta l'icona — tratta `i`, frazione `t` come `pointAlongPath` — in
   *  frazione 0..1 della linea intera, misurata come la misura la mappa. */
  progresso: (i: number, t: number) => number;
}

/**
 * Il tracciato che si disegna, senza ridisegnarlo.
 *
 * Prima, a ogni fotogramma, si mandava alla mappa la linea fatta fino
 * all'icona (setData a ogni fotogramma): la mappa la ricalcola nel suo
 * processo secondario, lo stesso che prepara i riquadri, e su un telefono
 * la linea restava INDIETRO rispetto all'icona — misurato a CPU/4: fino a
 * 64 px, l'auto che corre dove la linea non c'è ancora («non segue la
 * strada»), e un terzo dei fotogrammi persi. Ora la linea intera si manda
 * UNA volta e si scopre con un taglio (`line-gradient` su `line-progress`),
 * che è solo stile: si applica nel fotogramma stesso.
 *
 * `line-progress` misura la linea in coordinate di Mercatore, mentre l'icona
 * avanza a km veri: qui si converte il punto dell'icona nella misura della
 * mappa, così il taglio cade esattamente sotto di lei.
 */
export function tracciatoProgressivo(tratte: [number, number][][]): TracciatoProgressivo {
  // ⚠️ niente filtro sulle tratte vuote: gli indici devono restare quelli del volo
  const segs = unwrapSegments(tratte);
  const percorso: [number, number][] = [];
  const inizio: number[] = [];      // lunghezza-mappa prima di ogni tratta
  const lunghezza: number[] = [];   // lunghezza-mappa di ogni tratta
  let totale = 0;
  for (const seg of segs) {
    inizio.push(totale);
    if (seg.length === 0) { lunghezza.push(0); continue; }
    let l = 0;
    for (let j = 1; j < seg.length; j++) l += lunghezzaMappa(seg[j - 1], seg[j]);
    lunghezza.push(l);
    totale += l;
    const ultimo = percorso[percorso.length - 1];
    const daQui = ultimo && ultimo[0] === seg[0][0] && ultimo[1] === seg[0][1] ? seg.slice(1) : seg;
    percorso.push(...daQui);
  }
  const progresso = (i: number, t: number): number => {
    const seg = segs[i];
    if (!seg || totale === 0) return 0;
    const frazione = (m: number) => Math.min(1, Math.max(0, m / totale));
    if (t <= 0 || seg.length < 2) return frazione(inizio[i]);
    if (t >= 1) return frazione(inizio[i] + lunghezza[i]);
    // lo stesso cammino di pointAlongPath (km veri), contando però la mappa
    const km = pathLengthKm(seg) * t;
    let fatti = 0, mappa = 0;
    for (let j = 1; j < seg.length; j++) {
      const segKm = haversineKm(seg[j - 1][1], seg[j - 1][0], seg[j][1], seg[j][0]);
      if (fatti + segKm >= km || j === seg.length - 1) {
        const f = segKm === 0 ? 0 : Math.min(1, Math.max(0, (km - fatti) / segKm));
        const p: [number, number] = [seg[j - 1][0] + (seg[j][0] - seg[j - 1][0]) * f, seg[j - 1][1] + (seg[j][1] - seg[j - 1][1]) * f];
        return frazione(inizio[i] + mappa + lunghezzaMappa(seg[j - 1], p));
      }
      fatti += segKm;
      mappa += lunghezzaMappa(seg[j - 1], seg[j]);
    }
    return frazione(inizio[i] + lunghezza[i]);
  };
  return { percorso, progresso };
}

/**
 * Punto [lon,lat] alla frazione `t` (0-1) di un percorso, camminando a
 * velocità costante lungo i suoi segmenti (non semplicemente interpolando
 * tra il primo e l'ultimo punto) — usata per animare l'icona del mezzo
 * lungo un tracciato stradale con molti punti ravvicinati in modo ineguale.
 */
export function pointAlongPath(path: [number, number][], t: number): [number, number] {
  if (path.length === 0) return [0, 0];
  if (path.length === 1 || t <= 0) return path[0];
  if (t >= 1) return path[path.length - 1];

  const total = pathLengthKm(path);
  if (total === 0) return path[0];

  const targetKm = total * t;
  let covered = 0;
  for (let i = 1; i < path.length; i++) {
    const segKm = haversineKm(path[i - 1][1], path[i - 1][0], path[i][1], path[i][0]);
    if (covered + segKm >= targetKm || i === path.length - 1) {
      const segT = segKm === 0 ? 0 : (targetKm - covered) / segKm;
      const clampedT = Math.min(1, Math.max(0, segT));
      const [lon1, lat1] = path[i - 1];
      // ⚠️ la strada CORTA oltre il 180°: Tokyo (139.6) → Honolulu (-157.9)
      // interpolato alla lettera passava sopra Asia, Europa e Africa, mentre
      // linea e camera andavano sul Pacifico (visto nel video, 2026-10-12)
      const lon2 = unwrapNear(path[i][0], lon1);
      const lat2 = path[i][1];
      const lon = lon1 + (lon2 - lon1) * clampedT;
      return [((lon % 360) + 540) % 360 - 180, lat1 + (lat2 - lat1) * clampedT];
    }
    covered += segKm;
  }
  return path[path.length - 1];
}
