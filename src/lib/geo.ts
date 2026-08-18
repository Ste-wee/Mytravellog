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
};

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
