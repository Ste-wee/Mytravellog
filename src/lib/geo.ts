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

/**
 * Anche il geocoder delle città (GeoNames) restituisce monti, laghi e isole:
 * senza questa mappa uscivano SENZA etichetta accanto ai luoghi di Nominatim
 * che ce l'hanno ("Pantheon Range, Canada" nudo sotto "Pantheon · monumento").
 * I codici PPL* (abitati) restano senza kind: sono le città, la norma.
 */
const GEONAMES_KIND: Record<string, PlaceKind> = {
  MT: "montagna", MTS: "montagna", PK: "montagna", PKS: "montagna",
  VLC: "montagna", HLL: "montagna", HLLS: "montagna", GLCR: "montagna",
  LK: "lago", LKS: "lago", LGN: "lago", RSV: "lago",
  ISL: "luogo", ISLS: "luogo",
  BCH: "spiaggia", BCHS: "spiaggia",
  PRK: "parco", RESN: "parco", RESF: "parco",
};

export async function searchPlaces(query: string, count = 6): Promise<GeoResult[]> {
  if (!query.trim()) return [];
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=${count}&language=it&format=json`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const data = await r.json();
    return ((data.results ?? []) as (GeoResult & { feature_code?: string })[]).map(p => {
      const kind = p.feature_code ? GEONAMES_KIND[p.feature_code] : undefined;
      return kind ? { ...p, kind } : p;
    });
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
/**
 * Aspetta il proprio turno e lo prenota SOLO nell'istante in cui si parte
 * davvero. Prima la prenotazione avveniva all'ingresso in coda: le query
 * abbandonate a metà digitazione spostavano comunque la fila, e la query
 * buona ereditava l'attesa dei morti (misurato: partiva a +1336ms invece
 * che appena scaduto l'intervallo). `ancoraValida` viene richiesta a ogni
 * giro: chi è stato superato esce senza consumare nulla.
 */
async function attendiTurno(minMs = 1100, ancoraValida: () => boolean = () => true): Promise<boolean> {
  for (;;) {
    if (!ancoraValida()) return false;
    const attesa = ultimaChiamata + minMs - Date.now();
    if (attesa <= 0) {
      ultimaChiamata = Date.now();     // prenoto adesso, che parto davvero
      return true;
    }
    await new Promise(r => setTimeout(r, Math.min(attesa, 100)));
  }
}

const cacheLuoghi = new Map<string, GeoResult[]>();

/**
 * Luoghi che NON sono centri abitati: laghi, monumenti, montagne, parchi.
 * Il geocoder delle città (open-meteo) non li conosce affatto — "Lago di
 * Garda" e "Colosseo" lì danno zero risultati.
 */
// Contatore di generazione: se mentre una ricerca aspetta il suo turno di
// coda ne parte una PIÙ NUOVA, la vecchia è già superata (il chiamante la
// scarterà comunque) — inutile che consumi anche la rete. Il risultato
// vuoto della superata NON va in cache.
let generazioneLuoghi = 0;

// `superabile = false` per il ricambio senza prefisso: non è una digitazione
// nuova, non deve né scavalcare la query corrente né farsi scartare.
export async function searchLandmarks(query: string, count = 4, superabile = true): Promise<GeoResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const chiave = q.toLowerCase();
  const inCache = cacheLuoghi.get(chiave);
  if (inCache) return inCache.slice(0, count);
  const mia = superabile ? ++generazioneLuoghi : 0;
  try {
    const tocca = await attendiTurno(1100, () => !superabile || mia === generazioneLuoghi);
    if (!tocca) return [];   // superata mentre aspettava: niente rete, niente turno
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
        // Località prima, regione come ripiego: un monumento si pensa per
        // città ("Pantheon · Roma", non "· Lazio") e disambigua meglio
        // (Roma vs Parigi). Laghi e monti una città non ce l'hanno e ricadono
        // da soli sulla regione. Scelta di Stefano, 2026-08-19.
        admin1: a.city ?? a.town ?? a.village ?? a.municipality ?? a.state ?? a.region ?? a.county ?? undefined,
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
/**
 * Prefissi generici che Nominatim non digerisce sui nomi ESTERI: "lago di
 * loch ness" → vuoto, ma "loch ness" → il lago. Il ricambio scatta SOLO se
 * il primo tentativo non trova nulla, quindi "Lago di Garda" (che su OSM si
 * chiama proprio così) continua a passare al primo colpo.
 */
const PREFISSO_GENERICO = /^(lago|monte|monti|isola|isole|parco|spiaggia|cascata|cascate|lake|mount)\s+(di|del|della|dello|delle|dei|degli|d['’])?\s*/i;

/** Ordinamento (nome esatto in cima, da qualunque fonte) + dedupe per
 *  nome+paese: GeoNames manda DUE "Città del Vaticano" (città PPLC e Stato
 *  PCLI), e un luogo può arrivare da entrambe le fonti. Vince il primo. */
function ordinaEDeduplica(q: string, citta: GeoResult[], luoghi: GeoResult[], count: number): GeoResult[] {
  const esatto = (p: GeoResult) => p.name.toLowerCase() === q.toLowerCase();
  const ordinati = [
    ...citta.filter(esatto),
    ...luoghi.filter(esatto),
    ...citta.filter(p => !esatto(p)),
    ...luoghi.filter(p => !esatto(p)),
  ];
  const visti = new Set<string>();
  return ordinati.filter(p => {
    const chiave = `${p.name.toLowerCase()}|${(p.country_code || p.country || "").toLowerCase()}`;
    if (visti.has(chiave)) return false;
    visti.add(chiave);
    return true;
  }).slice(0, count);
}

/**
 * `onParziale`: le città arrivano in ~300ms, i luoghi pagano la coda di
 * Nominatim (1 richiesta/secondo di policy) — tenerle in ostaggio del
 * Promise.all significava non mostrare NULLA per oltre un secondo. Chi passa
 * il callback riceve subito le città; il valore di ritorno resta la lista
 * completa e ordinata, identica a prima.
 */
export async function searchAnyPlace(query: string, count = 6, onParziale?: (r: GeoResult[]) => void): Promise<GeoResult[]> {
  const q = query.trim();
  if (!q) return [];
  const cittaP = searchPlaces(q, count).catch(() => [] as GeoResult[]);
  const luoghiP = searchLandmarks(q, 4).catch(() => [] as GeoResult[]);
  if (onParziale) {
    let luoghiArrivati = false;
    luoghiP.finally(() => { luoghiArrivati = true; });
    cittaP.then(c => {
      // se i luoghi hanno già risposto, il parziale non serve: esce il totale
      if (!luoghiArrivati && c.length) onParziale(ordinaEDeduplica(q, c, [], count));
    });
  }
  const [citta, luoghi] = await Promise.all([cittaP, luoghiP]);
  let luoghiTrovati = luoghi;
  if (luoghiTrovati.length === 0 && PREFISSO_GENERICO.test(q)) {
    const senzaPrefisso = q.replace(PREFISSO_GENERICO, "").trim();
    if (senzaPrefisso.length >= 2) {
      luoghiTrovati = await searchLandmarks(senzaPrefisso, 4, false).catch(() => [] as GeoResult[]);
    }
  }
  return ordinaEDeduplica(q, citta, luoghiTrovati, count);
}

/**
 * Sottotitolo grigio di un risultato ("Veneto, Italia"): regione e paese,
 * ognuno taciuto se ripeterebbe il nome — "Città del Vaticano · Città del
 * Vaticano" diceva due volte la stessa cosa. Null = niente sottotitolo.
 */
export function placeSubtitle(p: Pick<GeoResult, "name" | "admin1" | "country">): string | null {
  const parti = [
    p.admin1 && p.admin1 !== p.name ? p.admin1 : null,
    p.country && p.country !== p.name ? p.country : null,
  ].filter(Boolean);
  return parti.length ? parti.join(", ") : null;
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

/**
 * La temperatura che si RACCONTA di un viaggio: d'inverno la minima toccata,
 * d'estate la massima. Prima mostravamo la media giornaliera, che annacqua di
 * ~10 gradi il dato memorabile (Lapponia: media -20 mentre il termometro
 * segnava -31; Siviglia: media 31 con 40,7 di massima).
 * Il criterio è la distanza da una temperatura mite: vince l'estremo più
 * lontano dai 18°, a parità la massima (l'estate è la norma).
 */
export function temperaturaMemorabile(min: number, max: number): number {
  const MITE = 18;
  return Math.abs(min - MITE) > Math.abs(max - MITE) ? min : max;
}

export async function fetchTemperature(lat: number, lon: number, dateISO: string, dateEndISO?: string | null): Promise<number | null> {
  try {
    // Locale, non UTC: dateISO è una data di calendario scelta dall'utente
    // (fuso locale), confrontarla con "oggi" in UTC farebbe scegliere il ramo
    // sbagliato (archivio vs previsioni) nelle prime ore del giorno in Italia.
    const today = todayLocalISO();
    // Future dates: no historical data available
    if (dateISO > today) return null;
    if (dateISO < today) {
      // Il periodo INTERO del viaggio, non il solo giorno di partenza: il
      // freddo che si ricorda può essere caduto al terzo giorno. Se il
      // viaggio è ancora in corso ci si ferma a oggi.
      const fine = dateEndISO && dateEndISO > dateISO ? (dateEndISO > today ? today : dateEndISO) : dateISO;
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dateISO}&end_date=${fine}&daily=temperature_2m_min,temperature_2m_max&timezone=auto`;
      const r = await fetch(url);
      if (!r.ok) return null;
      const d = await r.json();
      const min = (d?.daily?.temperature_2m_min ?? []).filter((v: unknown): v is number => typeof v === "number");
      const max = (d?.daily?.temperature_2m_max ?? []).filter((v: unknown): v is number => typeof v === "number");
      if (!min.length || !max.length) return null;
      return temperaturaMemorabile(Math.min(...min), Math.max(...max));
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

/** Un percorso su strada: il disegno e la sua lunghezza vera. */
export type RottaStradale = {
  /** Punti [lon,lat] in versione SEMPLIFICATA (poche decine): è il disegno che
   *  finisce in memoria e nel backup, e va tenuto leggero. */
  coords: [number, number][];
  /** Distanza reale dichiarata dal servizio, in km (null se non l'ha detta).
   *
   *  Perché si salva invece di ricavarla dal disegno: la versione semplificata
   *  taglia le curve, e sommarne i segmenti SOTTOSTIMA il percorso del 2-7%
   *  (misurato il 2026-08-22 su cinque tratte: Roma→Napoli -1,6%,
   *  Milano→Friburgo -6,6%, in media -3,8%). La versione completa sarebbe
   *  esatta ma pesa 50-160 KB per tratta contro 0,5: fuori discussione per un
   *  archivio che sta tutto in localStorage. Questo numero costa 8 byte. */
  km: number | null;
};

/**
 * Percorso stradale reale (stile Google Maps) tra due punti, per le tratte
 * in auto. Usa il server demo pubblico di OSRM (gratuito, nessuna chiave,
 * non garantito per uso intensivo): in caso di errore ritorna null e chi
 * chiama ricade sulla linea retta.
 */
export async function fetchDrivingRoute(
  lat1: number, lon1: number, lat2: number, lon2: number
): Promise<RottaStradale | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=simplified&geometries=geojson`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    const coords = d?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const metri = d?.routes?.[0]?.distance;
    const km = typeof metri === "number" && Number.isFinite(metri) && metri > 0 ? metri / 1000 : null;
    return { coords: coords as [number, number][], km };
  } catch {
    return null;
  }
}
