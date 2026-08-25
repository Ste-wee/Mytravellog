// [FROZEN] — Non modificare senza esplicita richiesta
import type { TransportMode } from "./transport";
import { localeAttivo } from "./settings";

export type Trip = {
  id: string;
  title: string;
  country: string;
  city: string;
  trip_date: string; // YYYY-MM-DD (inizio)
  date_end: string | null; // YYYY-MM-DD (fine)
  rating: number | null; // 1-5 stelle
  notes: string | null;
  purpose?: string | null; // motivo del viaggio: "Vacanza" | "Lavoro" (scelta singola, opzionale)
  companions?: string[];   // nomi delle persone con cui hai viaggiato (opzionali; assenti sui viaggi vecchi)
  diary?: { date: string; text: string; highlight?: boolean }[]; // racconto giorno-per-giorno (date YYYY-MM-DD; solo i giorni scritti); highlight = IL momento del viaggio (al più uno), riemerge nel recap
  status?: "planned" | "done"; // "planned" = viaggio in programma (vive nel bucket piani, non nel diario); assente/"done" = viaggio del diario
  // NB: il campo `budget` è stato RIMOSSO il 2026-08-16 (scelta di Stefano:
  // l'app non tiene conti). I dati già inseriti vengono cancellati una volta
  // per tutte da `dropBudgetData()`, chiamata all'avvio.
  checklist?: { text: string; done: boolean }[];               // "da organizzare" prima di partire
  booked?: boolean;                                            // viaggio in programma: prenotato o ancora da prenotare
  transport_mode: TransportMode | null;
  // `lat`/`lon` possono essere `null`, non solo assenti: una tappa senza
  // coordinate viene salvata come NaN (vedi il `?? NaN` dei form) e
  // JSON.stringify la riduce a `null`. Il tipo lo dice, così nessuno scrive
  // `w.lat === undefined` credendo di aver coperto il caso: il controllo giusto
  // è sempre `hasCoords` (lib/coords.ts).
  waypoints: { id?: string; city: string; country: string; country_code?: string; transport_mode: TransportMode; lat?: number | null; lon?: number | null; route_geometry?: [number, number][] | null; route_km?: number | null }[];
  latitude: number;
  longitude: number;
  home_latitude: number | null;
  home_longitude: number | null;
  home_label: string | null;
  route_geometry: [number, number][] | null; // percorso stradale reale per la tratta finale (solo se transport_mode="car")
  /** Lunghezza vera della tratta finale in km, come l'ha dichiarata il servizio
   *  di instradamento. Il disegno qui sopra è semplificato, quindi sommarne i
   *  segmenti sottostima il percorso del 2-7%: quando questo numero c'è, i km
   *  percorsi lo usano (vedi `tripTotalKm`). Assente sui viaggi salvati prima
   *  del 2026-08-22 e su quelli importati da GPX, dove la traccia è già fitta
   *  e la somma dei segmenti è precisa da sola. */
  route_km?: number | null;
  temperature_c: number | null;
  altitude_m: number | null;
  max_altitude_m: number | null; // altitudine massima tra tutte le tappe (non solo la destinazione)
  max_altitude_city: string | null; // nome della città più alta
  distance_from_home_km: number | null; // somma di tutti i segmenti (km totali percorsi)
  max_distance_from_home_km: number | null; // distanza massima raggiunta dalla città di residenza (per "più lontano")
  max_distance_city: string | null; // nome della città più lontana
  hottest_temp_c: number | null;    // temperatura più alta tra tutte le tappe
  hottest_city: string | null;      // città più calda
  coldest_temp_c: number | null;    // temperatura più bassa tra tutte le tappe
  coldest_city: string | null;      // città più fredda
  region: string | null;             // regione/stato della destinazione (nomi, per display)
  region_details: { name: string; code: string | null }[] | null; // stesse regioni con codice ISO 3166-2, per l'abbinamento indipendente dalla lingua in CountryMapModal
  country_code: string;
  created_at: string;
  /** Ultima modifica (ISO). Serve al backup su Drive per fondere PER VIAGGIO
   *  invece che per collezione intera: senza, il dispositivo col timestamp più
   *  vecchio perdeva le proprie modifiche anche sui viaggi che l'altro non aveva
   *  toccato. Assente sui viaggi salvati prima di questa versione: in quel caso
   *  il merge ricade sul timestamp della collezione (comportamento precedente). */
  updated_at?: string;
};

const KEY = "atlas.trips.v1";

// ── Tombstone: le cancellazioni devono propagarsi ────────────────────────────
// Senza, l'unione dei due lati faceva RESUSCITARE i viaggi cancellati (il
// dispositivo che ancora li aveva li ri-aggiungeva, e li ri-pubblicava).
// Sono per BUCKET: promotePlanToTrip cancella il piano e crea un viaggio con lo
// STESSO id — un tombstone condiviso ucciderebbe il viaggio appena promosso.
export type Tombstone = { id: string; at: number }; // at = ms epoch
export type TombstoneBucket = "trips" | "plans";
const KEY_DELETED: Record<TombstoneBucket, string> = {
  trips: "atlas.deleted.trips.v1",
  plans: "atlas.deleted.plans.v1",
};
/** Oltre questo tempo un tombstone si può dimenticare: un dispositivo rimasto
 *  offline più di così ripescherebbe comunque dati troppo vecchi. Evita che la
 *  lista cresca per sempre. */
export const TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * Butta le lapidi scadute o malformate e tiene UNA sola lapide per id, la più
 * recente. Il doppione nasce facile — si cancella un viaggio, il backup lo
 * riporta, lo si ricancella — e prima restava lì per sei mesi insieme al primo:
 * la stessa regola del merge (`mergeTombstones`), applicata anche in lettura e
 * in scrittura.
 */
const prune = (list: Tombstone[], now = Date.now()): Tombstone[] => {
  const piuRecente = new Map<string, Tombstone>();
  for (const d of list) {
    if (!d || typeof d.id !== "string" || !Number.isFinite(d.at)) continue;
    if (now - d.at >= TOMBSTONE_TTL_MS) continue;
    const gia = piuRecente.get(d.id);
    if (!gia || d.at > gia.at) piuRecente.set(d.id, d);
  }
  return [...piuRecente.values()];
};

export function loadTombstones(bucket: TombstoneBucket): Tombstone[] {
  try {
    const raw = localStorage.getItem(KEY_DELETED[bucket]);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? prune(arr) : [];
  } catch {
    return [];
  }
}

export function saveTombstones(bucket: TombstoneBucket, list: Tombstone[]): boolean {
  return persist(KEY_DELETED[bucket], JSON.stringify(prune(list)));
}

/** Unione di due liste di tombstone: per ogni id vince la cancellazione più
 *  recente. Pura, così è testabile e riusabile dal merge del backup. */
export function mergeTombstones(a: Tombstone[], b: Tombstone[]): Tombstone[] {
  const byId = new Map<string, number>();
  for (const d of [...prune(a ?? []), ...prune(b ?? [])]) {
    const cur = byId.get(d.id);
    if (cur == null || d.at > cur) byId.set(d.id, d.at);
  }
  return [...byId.entries()].map(([id, at]) => ({ id, at }));
}

function recordTombstone(bucket: TombstoneBucket, id: string): void {
  saveTombstones(bucket, [...loadTombstones(bucket), { id, at: Date.now() }]);
}

export function loadTrips(): Trip[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Trip[];
    // Sort difensivo: un solo record con trip_date mancante faceva lanciare
    // localeCompare -> il catch restituiva [] NASCONDENDO TUTTI i viaggi, e la
    // successiva addTrip salvava sopra un array vuoto (perdita totale).
    return escludiCancellati(arr, "trips")
      .sort((a, b) => (b.trip_date || "").localeCompare(a.trip_date || ""));
  } catch {
    return [];
  }
}

/**
 * Si usa sia in LETTURA sia in SCRITTURA. In scrittura è la differenza fra
 * "nascosto" e "cancellato": senza, un record già sepolto restava nel dato
 * grezzo — intero, con coordinate, tracciato e temperature — finché la lapide
 * non scadeva, sei mesi dopo. Invisibile nell'app, ma pesante nell'archivio e
 * soprattutto CARICATO NEL BACKUP, quindi propagato a tutti i dispositivi.
 * (Segnalato da Stefano il 2026-08-21: "non dovrebbe rimanere in memoria per
 * 180 giorni no?" — no, infatti. A restare 180 giorni è solo la lapide, che
 * pesa 38 byte e serve a propagare la cancellazione.)
 *
 * Un viaggio con la lapide non deve MAI comparire nella lista, nemmeno se
 * qualcuno l'ha rimesso nell'array (un merge andato storto, un backup
 * ripristinato a mano, una scheda aperta da prima della cancellazione).
 *
 * Perché è difesa necessaria e non paranoia: è successo davvero (Zurigo,
 * 2026-08-20). Il viaggio era tornato nell'array locale pur avendo la sua
 * lapide, e un ricalcolo in sottofondo l'ha riscritto: da quel momento la
 * sua data di modifica batteva la cancellazione e il merge lo teneva in vita
 * per sempre. Filtrando qui, chi legge non lo vede e chi riscrive non può
 * resuscitarlo — la lapide vale finché non scade il suo TTL.
 */
function escludiCancellati<T extends { id: string }>(arr: T[], bucket: TombstoneBucket): T[] {
  const morti = new Set(loadTombstones(bucket).map(d => d.id));
  return morti.size ? arr.filter(x => !morti.has(x.id)) : arr;
}

/**
 * Notificatore degli errori di scrittura, iniettato dall'app (main.tsx) per non
 * legare questo modulo alla UI: qui resta senza dipendenze e testabile.
 */
let onWriteError: ((err: unknown) => void) | null = null;
export function setStorageErrorHandler(fn: ((err: unknown) => void) | null): void {
  onWriteError = fn;
}

/**
 * Scrittura a prova di quota piena. `setItem` lancia QuotaExceededError quando
 * lo spazio finisce (le `route_geometry` dei percorsi stradali sono grosse):
 * prima l'eccezione risaliva fino ad addTrip/updateTrip e il salvataggio
 * falliva SENZA alcun segnale per l'utente. Ora l'errore viene notificato
 * (toast) e la funzione dice se ha scritto davvero.
 */
function persist(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    onWriteError?.(err);
    return false;
  }
}

/**
 * Toglie il campo `budget` (rimosso dall'app il 2026-08-16). Applicato su OGNI
 * scrittura: così il dato sparisce da solo, senza bisogno di dichiarare "questo
 * record è più recente" — che nel merge di Drive farebbe vincere una copia
 * vecchia e riesumare i viaggi cancellati altrove.
 */
export function stripBudget<T extends object>(t: T): T {
  if (!t || !("budget" in t)) return t;
  const { budget: _via, ...rest } = t as T & { budget?: unknown };
  return rest as T;
}

export function saveTrips(trips: Trip[]): boolean {
  return persist(KEY, JSON.stringify(escludiCancellati(trips, "trips").map(stripBudget)));
}

/**
 * `id` è opzionale e serve solo a NuovoViaggio.tsx, che conia l'id della
 * bozza PRIMA di salvare e lo passa qui: il viaggio nasce con l'identità che
 * aveva già mentre lo si scriveva, invece di riceverne una nuova all'ultimo
 * momento.
 */
export function addTrip(t: Omit<Trip, "id" | "created_at">, id?: string): Trip {
  const now = new Date().toISOString();
  const full: Trip = { ...t, id: id ?? crypto.randomUUID(), created_at: now, updated_at: now };
  const all = loadTrips();
  all.unshift(full);
  saveTrips(all);
  return full;
}

export function updateTrip(id: string, patch: Partial<Omit<Trip, "id" | "created_at">>): Trip | null {
  const all = loadTrips();
  const idx = all.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  // `updated_at` DOPO il patch: è la verità su QUANDO è cambiato, non un campo
  // che il chiamante possa impostare per sbaglio. Lo usa il merge del backup.
  const updated = { ...all[idx], ...patch, updated_at: new Date().toISOString() };
  all[idx] = updated;
  saveTrips(all);
  return updated;
}

/**
 * Dà la città di partenza ai viaggi che non ne hanno una, e restituisce quanti
 * ne ha sistemati.
 *
 * Serve a chi ha usato l'app prima che la partenza fosse obbligatoria: un
 * viaggio senza casa non produce nessuna tratta, quindi spariva da globo,
 * poster dell'anno e mappa della vita — senza spiegazione. Chiamata una volta
 * sola, quando la città viene finalmente impostata.
 *
 * Tocca SOLO i viaggi orfani: chi una partenza ce l'ha se la tiene, perché un
 * viaggio è partito da dove è partito — un trasloco di oggi non riscrive il
 * passato.
 */
export function adoptHomeForTripsWithout(home: { lat: number; lon: number; label: string }): number {
  const all = loadTrips();
  let n = 0;
  const next = all.map(t => {
    if (t.home_latitude != null && t.home_longitude != null) return t;
    n++;
    return {
      ...t,
      home_latitude: home.lat, home_longitude: home.lon, home_label: home.label,
      updated_at: new Date().toISOString(), // il backup Drive deve accorgersene
    };
  });
  if (n > 0) saveTrips(next);
  return n;
}

/** Quanti viaggi non hanno una città di partenza (per il messaggio del gate). */
export function countTripsWithoutHome(): number {
  return loadTrips().filter(t => t.home_latitude == null || t.home_longitude == null).length;
}

/**
 * Cancella i budget salvati in viaggi e piani (scelta di Stefano del
 * 2026-08-16: l'app non tiene conti). Idempotente; ritorna quanti record ha
 * ripulito (per i test).
 *
 * NB: NON tocca `updated_at`. La prima versione lo timbrava per "far
 * propagare la cancellazione", ed era un'arma carica: il merge di Drive
 * confronta i record INTERI per data, quindi una copia locale vecchia
 * dichiarata "appena modificata" (a) riportava indietro titoli, note, diario e
 * itinerario modificati su un altro dispositivo, e (b) batteva la lapide di un
 * viaggio cancellato altrove, facendolo resuscitare ovunque. La cancellazione
 * si propaga senza bugie perché `saveTrips`/`savePlans` e `mergeTrips`
 * tolgono il campo a ogni scrittura.
 */
export function dropBudgetData(): number {
  let n = 0;
  const conta = (list: Trip[]) => { n += list.filter(t => "budget" in t).length; return list; };
  const trips = conta(loadTrips());
  const plans = conta(loadPlans());
  if (n > 0) { saveTrips(trips); savePlans(plans); } // lo strip lo fanno loro
  return n;
}

/**
 * Butta via i record già sepolti rimasti nell'archivio grezzo.
 *
 * Da quando saveTrips/savePlans filtrano, un nuovo sepolto sparisce subito.
 * Ma i fantasmi VECCHI — chi ha aggiornato l'app con qualcuno già in pancia,
 * come l'archivio di Stefano dopo il caso Zurigo — resterebbero finché la
 * lapide non scade, sei mesi dopo, occupando spazio e viaggiando nel backup.
 * Basta una scrittura per liberarsene: si fa all'avvio, e solo se serve
 * davvero (nessuna scrittura a vuoto: timbrare l'archivio senza motivo è
 * proprio l'abitudine che ha resuscitato un viaggio ad agosto).
 *
 * Ritorna quanti record ha buttato via.
 */
export function pulisciSepolti(): number {
  let buttati = 0;
  // Anche le lapidi vanno normalizzate, non solo lette bene: `prune` toglie
  // scadute e doppioni a ogni lettura, ma il dato GREZZO resta sporco finché
  // qualcuno non lo riscrive — e intanto è quello che parte nel backup. Si
  // riscrive solo se c'è davvero qualcosa da togliere.
  for (const bucket of ["trips", "plans"] as TombstoneBucket[]) {
    let grezze: unknown;
    try { grezze = JSON.parse(localStorage.getItem(KEY_DELETED[bucket]) || "null"); } catch { continue; }
    if (!Array.isArray(grezze)) continue;
    const pulite = loadTombstones(bucket);
    if (pulite.length !== grezze.length) saveTombstones(bucket, pulite);
  }
  for (const [chiave, bucket, salva] of [
    [KEY, "trips", saveTrips],
    [KEY_PLANS, "plans", savePlans],
  ] as [string, TombstoneBucket, (v: Trip[]) => boolean][]) {
    let grezzi: Trip[];
    try {
      const raw = localStorage.getItem(chiave);
      grezzi = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(grezzi)) continue;
    } catch {
      continue;   // archivio illeggibile: non è compito di questa funzione
    }
    const vivi = escludiCancellati(grezzi, bucket);
    if (vivi.length === grezzi.length) continue;   // niente da fare: non si scrive
    buttati += grezzi.length - vivi.length;
    salva(vivi);
  }
  return buttati;
}

export function deleteTrip(id: string): void {
  saveTrips(loadTrips().filter((t) => t.id !== id));
  recordTombstone("trips", id); // così la cancellazione si propaga agli altri dispositivi
}

// ————————————————————————————————————————————————————————————————
// Viaggi "in programma": bucket SEPARATO dal diario, così i viaggi futuri non
// entrano in statistiche/globo/recap/mappe (che leggono solo loadTrips()).
// Stesso identico tipo Trip, con status "planned". "Segna come fatto"
// (promotePlanToTrip) sposta il viaggio nel diario, dove diventa "done".
// ————————————————————————————————————————————————————————————————
const KEY_PLANS = "atlas.plans.v1";

export function loadPlans(): Trip[] {
  try {
    const raw = localStorage.getItem(KEY_PLANS);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Trip[];
    // Stessa difesa dei viaggi: i programmi cancellati hanno il loro bucket
    // di lapidi e non devono tornare a galla.
    return escludiCancellati(arr, "plans")
      .sort((a, b) => (a.trip_date || "").localeCompare(b.trip_date || "")); // i più imminenti prima
  } catch {
    return [];
  }
}

export function savePlans(plans: Trip[]): boolean {
  return persist(KEY_PLANS, JSON.stringify(escludiCancellati(plans, "plans").map(stripBudget)));
}

export function addPlan(t: Omit<Trip, "id" | "created_at" | "status">, id?: string): Trip {
  const now = new Date().toISOString();
  const full: Trip = { ...t, id: id ?? crypto.randomUUID(), status: "planned", created_at: now, updated_at: now };
  const all = loadPlans();
  all.push(full);
  savePlans(all);
  return full;
}

export function updatePlan(id: string, patch: Partial<Omit<Trip, "id" | "created_at">>): Trip | null {
  const all = loadPlans();
  const idx = all.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  const updated = { ...all[idx], ...patch, updated_at: new Date().toISOString() };
  all[idx] = updated;
  savePlans(all);
  return updated;
}

export function deletePlan(id: string): void {
  savePlans(loadPlans().filter((t) => t.id !== id));
  recordTombstone("plans", id);
}

/**
 * "Segna come fatto": sposta un piano dal bucket piani a quello del diario
 * (status "done", in cima alla lista). Ritorna il viaggio promosso, o null se
 * l'id non esiste.
 */
export function promotePlanToTrip(id: string): Trip | null {
  const plans = loadPlans();
  const plan = plans.find((t) => t.id === id);
  if (!plan) return null;
  savePlans(plans.filter((t) => t.id !== id));
  // Tombstone nel bucket PIANI: il piano deve sparire anche sugli altri
  // dispositivi. È per bucket, quindi non tocca il viaggio con lo stesso id che
  // stiamo creando qui nel diario.
  recordTombstone("plans", id);
  // `booked` è roba da viaggio in programma: un viaggio già fatto non è
  // "prenotato". Senza toglierlo qui resterebbe appiccicato per sempre al
  // ricordo (e nel backup) come campo-fossile che nessuno legge.
  const { booked: _prenotato, ...senzaBooked } = plan;
  const done: Trip = { ...senzaBooked, status: "done", updated_at: new Date().toISOString() };
  const trips = loadTrips();
  trips.unshift(done);
  saveTrips(trips);
  return done;
}

/** Parse a YYYY-MM-DD string as local midnight (avoids UTC off-by-one). */
export function parseLocalDate(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

/**
 * Data valida per un viaggio: formato YYYY-MM-DD, parsabile, anno 1900-2100.
 * Il cap sugli anni non è pedanteria: su desktop l'input date permette di
 * digitare a mano anni a 4+ cifre arbitrari ("9999", o "20261" per un refuso),
 * e una sola data così avvelenava a cascata biglietto, timeline del globo,
 * recap e poster (NaN/"Invalid Date"). I dati possono inoltre arrivare da
 * backup/sync Drive o GPX, quindi la difesa serve anche a valle dei form.
 */
export function isValidDateISO(iso: string | null | undefined): iso is string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const t = parseLocalDate(iso).getTime();
  if (!Number.isFinite(t)) return false;
  const y = Number(iso.slice(0, 4));
  return y >= 1900 && y <= 2100;
}

/**
 * Data di oggi in YYYY-MM-DD, nel fuso orario locale — non
 * `new Date().toISOString().slice(0,10)`, che legge il calendario UTC: tra
 * mezzanotte e l'ora del proprio fuso (es. le prime ~1-2 ore in Italia)
 * avrebbe precompilato/valutato "ieri" invece di oggi.
 */
export function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatTripDate(iso: string): string {
  // "—" invece di "Invalid Date" per le date malformate: questo formatter è
  // l'unico sink di biglietto, flyover e poster, quindi la guardia qui li
  // copre tutti in un colpo.
  if (!isValidDateISO(iso)) return "—";
  return parseLocalDate(iso).toLocaleDateString(localeAttivo(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
// Backwards-compatible alias (created_at optional for test fixtures)
export type LocalTrip = Omit<Trip, "created_at"> & { created_at?: string };
