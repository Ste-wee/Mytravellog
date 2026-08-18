// [FROZEN] — Non modificare senza esplicita richiesta
import { todayLocalISO } from "./storage";

export type GeoResult = {
  id: number;
  name: string;
  country: string;
  country_code: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  /** Che cosa è il posto, quando non è una città: "lago", "monumento"…
   *  Assente sui risultati del geocoder delle località abitate. */
  kind?: PlaceKind;
};

/** Categorie mostrate accanto ai luoghi non abitati nei risultati di ricerca. */
export const PLACE_KINDS = ["lago", "monumento", "montagna", "parco", "spiaggia", "luogo"] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export async function searchPlaces(query: string, count = 6): Promise<GeoResult[]> {
  if (!query.trim()) return [];
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=${count}&language=it&format=json`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const data = await r.json();
    return (data.results ?? []) as GeoResult[];
  } catch {
    return [];
  }
}

/**
 * Che cos'è un risultato di Nominatim, dalla coppia class/type di OSM.
 * `null` = non è un posto da mostrare in un diario di viaggio (strade,
 * ferrovie, negozi, confini amministrativi): sono la maggior parte del
 * rumore, e senza filtro cercando "Colosseo" il primo risultato è la via.
 */
export function placeKindOf(osmClass: string, osmType: string): PlaceKind | null {
  if (["water", "waterway"].includes(osmClass) || (osmClass === "natural" && ["water", "bay", "strait"].includes(osmType))) {
    return ["lake", "reservoir", "lagoon", "water", "pond"].includes(osmType) ? "lago" : "luogo";
  }
  if (osmClass === "natural") {
    if (["peak", "volcano", "glacier", "ridge", "massif", "saddle"].includes(osmType)) return "montagna";
    if (["beach", "cape", "coastline", "shoal"].includes(osmType)) return "spiaggia";
    if (["wood", "heath", "cliff", "cave_entrance", "spring", "geyser"].includes(osmType)) return "luogo";
    return null;
  }
  if (osmClass === "historic") return "monumento";
  if (osmClass === "man_made") return ["lighthouse", "tower", "obelisk", "bridge", "pier", "windmill"].includes(osmType) ? "monumento" : null;
  // I luoghi di culto celebri (Pantheon, Duomo di Milano, Sagrada Familia)
  // su OSM sono amenity/place_of_worship, NON historic/tourism: senza questo
  // ramo il Pantheon di Roma spariva mentre il Panthéon di Parigi
  // (tourism/attraction) passava. `fountain` per la Fontana di Trevi.
  // Il resto di amenity resta fuori: sono bar, scuole, ospedali — rumore.
  if (osmClass === "amenity") return ["place_of_worship", "fountain"].includes(osmType) ? "monumento" : null;
  if (osmClass === "tourism") {
    if (["attraction", "museum", "artwork", "viewpoint", "gallery"].includes(osmType)) return "monumento";
    if (["theme_park", "zoo", "aquarium"].includes(osmType)) return "luogo";
    return null; // hotel, b&b, campeggi: non sono mete da censire
  }
  if (osmClass === "leisure") return ["park", "nature_reserve", "garden"].includes(osmType) ? "parco" : null;
  if (osmClass === "boundary") return osmType === "national_park" ? "parco" : null;
  // `square`: Piazza San Marco e simili vivono in place/square.
  if (osmClass === "place") return ["island", "islet", "archipelago", "locality", "square"].includes(osmType) ? "luogo" : null;
  return null;
}

// Nominatim chiede di non superare 1 richiesta al secondo: le chiamate si
// mettono in fila da sole, così un utente che digita in fretta non genera
// una raffica (il debounce del form non basta: sono due form diversi).
let ultimaChiamata = 0;
async function attendiTurno(minMs = 1100) {
  const ora = Date.now();
  const attesa = Math.max(0, ultimaChiamata + minMs - ora);
  ultimaChiamata = ora + attesa;
  if (attesa > 0) await new Promise(r => setTimeout(r, attesa));
}

const cacheLuoghi = new Map<string, GeoResult[]>();

/**
 * Luoghi che NON sono centri abitati: laghi, monumenti, montagne, parchi.
 * Il geocoder delle città (open-meteo) non li conosce affatto — "Lago di
 * Garda" e "Colosseo" lì danno zero risultati.
 */
export async function searchLandmarks(query: string, count = 4): Promise<GeoResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const chiave = q.toLowerCase();
  const inCache = cacheLuoghi.get(chiave);
  if (inCache) return inCache.slice(0, count);
  try {
    await attendiTurno();
    // `extratags`/`namedetails` non servono: bastano class/type e l'indirizzo.
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}` +
      `&format=json&limit=12&addressdetails=1&accept-language=it`;
    const r = await fetch(url, { headers: { "Accept-Language": "it" } });
    if (!r.ok) return [];
    const dati = await r.json();
    if (!Array.isArray(dati)) return [];
    const out: GeoResult[] = [];
    for (const d of dati) {
      const kind = placeKindOf(String(d?.class ?? ""), String(d?.type ?? ""));
      if (!kind) continue;
      const lat = Number(d?.lat), lon = Number(d?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const a = d?.address ?? {};
      out.push({
        // id negativo: gli id di Nominatim e quelli di open-meteo vivono nella
        // stessa lista e possono coincidere (sono due numerazioni diverse).
        id: -Math.abs(Number(d?.osm_id) || out.length + 1),
        name: String(d?.name || String(d?.display_name ?? "").split(",")[0] || q),
        country: String(a.country ?? ""),
        country_code: String(a.country_code ?? "").toUpperCase(),
        admin1: a.state ?? a.region ?? a.county ?? a.city ?? undefined,
        latitude: lat,
        longitude: lon,
        kind,
      });
    }
    // Un nome può ripetersi a pochi metri (il poligono del lago e il suo
    // punto centrale): tengo il primo di ogni nome.
    const visti = new Set<string>();
    const unici = out.filter(p => {
      const k = p.name.toLowerCase() + "|" + p.country_code;
      if (visti.has(k)) return false;
      visti.add(k);
      return true;
    });
    cacheLuoghi.set(chiave, unici);
    return unici.slice(0, count);
  } catch {
    return [];
  }
}

/**
 * La ricerca che vede il form: città + luoghi, in una lista sola.
 * Le due fonti sono indipendenti — se una cade, l'altra risponde comunque.
 */
export async function searchAnyPlace(query: string, count = 6): Promise<GeoResult[]> {
  const q = query.trim();
  if (!q) return [];
  const [citta, luoghi] = await Promise.all([
    searchPlaces(q, count).catch(() => [] as GeoResult[]),
    searchLandmarks(q, 4).catch(() => [] as GeoResult[]),
  ]);
  const esatto = (p: GeoResult) => p.name.toLowerCase() === q.toLowerCase();
  // Chi si chiama esattamente come la ricerca va in cima, da qualunque fonte
  // arrivi: cercando "Lago di Garda" il lago deve battere il paese "Garda".
  return [
    ...citta.filter(esatto),
    ...luoghi.filter(esatto),
    ...citta.filter(p => !esatto(p)),
    ...luoghi.filter(p => !esatto(p)),
  ].slice(0, count);
}

/** Solo per i test: svuota la cache dei luoghi e azzera il turno di attesa. */
export function __resetLandmarkCache() {
  cacheLuoghi.clear();
  ultimaChiamata = 0;
}

export async function fetchElevation(lat: number, lon: number): Promise<number | null> {
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
    if (!r.ok) return null;
    const d = await r.json();
    return d?.elevation?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function fetchTemperature(lat: number, lon: number, dateISO: string): Promise<number | null> {
  try {
    // Locale, non UTC: dateISO è una data di calendario scelta dall'utente
    // (fuso locale), confrontarla con "oggi" in UTC farebbe scegliere il ramo
    // sbagliato (archivio vs previsioni) nelle prime ore del giorno in Italia.
    const today = todayLocalISO();
    // Future dates: no historical data available
    if (dateISO > today) return null;
    if (dateISO < today) {
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dateISO}&end_date=${dateISO}&daily=temperature_2m_mean&timezone=auto`;
      const r = await fetch(url);
      if (!r.ok) return null;
      const d = await r.json();
      return d?.daily?.temperature_2m_mean?.[0] ?? null;
    } else {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&timezone=auto`;
      const r = await fetch(url);
      if (!r.ok) return null;
      const d = await r.json();
      return d?.current?.temperature_2m ?? null;
    }
  } catch {
    return null;
  }
}

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

export type RegionInfo = { name: string | null; code: string | null };

/**
 * Nome e codice ISO 3166-2 (es. "AT-9") della regione/stato in cui si trova
 * un punto. Il codice è indipendente dalla lingua: permette di abbinare le
 * regioni visitate ai confini geografici (CountryMapModal) senza dover
 * tradurre i nomi da inglese a lingua locale paese per paese.
 */
export async function fetchRegion(lat: number, lon: number): Promise<RegionInfo> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=6&addressdetails=1`;
    // "it", non "en": un viaggio creato qui e uno modificato in ModificaViaggio.tsx
    // (che interroga la stessa API in italiano) devono salvare la regione nella
    // stessa lingua — prima "Tuscany" da uno e "Toscana" dall'altro per lo stesso posto.
    const r = await fetch(url, { headers: { "Accept-Language": "it", "User-Agent": "NAV-TA/1.0" } });
    if (!r.ok) return { name: null, code: null };
    const d = await r.json();
    // Nominatim non usa lo stesso campo per tutti i paesi: "state" per la
    // maggior parte, ma "province" (Giappone) o "city" per le città-stato
    // (Berlino, Vienna, Amburgo...) che non hanno un livello "state" sopra
    // di loro. "name" di primo livello riflette comunque l'area risolta a
    // questo zoom, quindi è un fallback affidabile quando gli altri mancano.
    const name = d?.address?.state ?? d?.address?.region ?? d?.address?.county
      ?? d?.address?.province ?? d?.address?.city ?? d?.name ?? null;
    const code = d?.address?.["ISO3166-2-lvl4"] ?? null;
    return { name, code };
  } catch {
    return { name: null, code: null };
  }
}

/**
 * Deduplica una lista di regioni (nome + codice) raccolte dalle tappe di un
 * viaggio: due tappe nella stessa regione (stesso codice ISO, o stesso nome
 * normalizzato quando il codice manca) contano una sola volta.
 */
export function mergeRegions(entries: RegionInfo[]): { name: string; code: string | null }[] {
  const seen = new Set<string>();
  const out: { name: string; code: string | null }[] = [];
  for (const { name, code } of entries) {
    if (!name && !code) continue;
    const key = code ? `code:${code}` : `name:${name!.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: name ?? code!, code });
  }
  return out;
}

/**
 * Percorso stradale reale (stile Google Maps) tra due punti, per le tratte
 * in auto. Usa il server demo pubblico di OSRM (gratuito, nessuna chiave,
 * non garantito per uso intensivo): in caso di errore ritorna null e chi
 * chiama ricade sulla linea retta.
 */
export async function fetchDrivingRoute(
  lat1: number, lon1: number, lat2: number, lon2: number
): Promise<[number, number][] | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=simplified&geometries=geojson`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    const coords = d?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    return coords as [number, number][];
  } catch {
    return null;
  }
}
