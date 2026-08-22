import { fetchDrivingRoute } from "./geo";
import { hasCoords } from "./coords";
import { followsRoad } from "./transport";
import { tracciatoFitto } from "./flyover";
import { loadTrips, updateTrip, Trip } from "./storage";

/** Quali viaggi abbiamo già provato a riparare, e quando.
 *
 *  v2 (2026-08-22): il recupero non cerca più solo i tracciati mancanti ma
 *  anche le LUNGHEZZE mancanti. Ripartire da una chiave nuova è il modo più
 *  semplice per far ricontrollare subito i viaggi già timbrati con la v1 —
 *  altrimenti si sarebbero sistemati solo a scadenza, fino a una settimana dopo. */
export const CHIAVE_TRACCIATI = "navta.tracciati.tentati.v2";
/** La chiave della versione precedente, da buttare: non serve più a nessuno. */
const CHIAVE_VECCHIA = "navta.tracciati.tentati.v1";
/** Un viaggio irreparabile (tratta senza strade, servizio giù per giorni) non
 *  va ritentato a ogni avvio, ma nemmeno abbandonato per sempre: una volta a
 *  settimana è abbastanza raro da non pesare e abbastanza spesso da guarire. */
const GIORNI_PRIMA_DI_RIPROVARE = 7;

type Tentativi = Record<string, string>;   // id viaggio → data ISO del tentativo

function leggiTentativi(): Tentativi {
  try {
    const grezzo = localStorage.getItem(CHIAVE_TRACCIATI);
    const j = grezzo ? JSON.parse(grezzo) : null;
    return j && typeof j === "object" && !Array.isArray(j) ? j as Tentativi : {};
  } catch {
    return {};   // chiave illeggibile o vecchio formato: si riparte da zero
  }
}

/**
 * Cosa manca a una tratta su strada: il disegno, la sua lunghezza vera, o
 * niente.
 *
 * La lunghezza si va a ripescare anche quando il disegno c'è già, perché il
 * disegno è semplificato e sommarne i segmenti sottostima il percorso del
 * 2-7%. Ma NON per le tracce fitte (GPX registrati sul campo): lì la somma è
 * esatta, e il percorso su strada che il servizio restituirebbe sarebbe
 * un'altra strada, non quella davvero fatta.
 */
function daRipescare(geom: [number, number][] | null | undefined, km: number | null | undefined): boolean {
  if (!geom || geom.length < 2) return true;
  if (km != null && km > 0) return false;
  return !tracciatoFitto(geom);
}

function daRiprovare(tentativi: Tentativi, id: string): boolean {
  const quando = tentativi[id];
  if (!quando) return true;
  const giorni = (Date.now() - new Date(quando).getTime()) / 86_400_000;
  return !(giorni >= 0) || giorni >= GIORNI_PRIMA_DI_RIPROVARE;
}

/**
 * Riprova a scaricare quello che manca alle tratte su strada dei viaggi già
 * salvati: il tracciato, oppure la sua lunghezza vera.
 *
 * La lunghezza (2026-08-22) è arrivata dopo il disegno: i primi viaggi hanno
 * il tracciato ma non il numero, e i loro km risultavano sottostimati del 2-7%
 * perché calcolati sommando i segmenti di un disegno semplificato. Questo giro
 * li ripesca uno per uno, senza toccare le tracce GPX (vedi `daRipescare`).
 *
 * Perché serve: il percorso su strada si chiede una volta sola, al
 * salvataggio. Se in quel momento la rete non c'era o il servizio di
 * instradamento era irraggiungibile, il viaggio resta senza tracciato — sul
 * globo si vede la linea d'aria e nulla dice che manchi qualcosa.
 *
 * ⚠️ Storia da non ripetere: fino al 2026-08-21 questo recupero girava **una
 * volta sola per dispositivo** (un flag booleano in localStorage). Andava bene
 * come migrazione una tantum, ma lasciava scoperto tutto ciò che veniva DOPO:
 * Stefano ha cancellato e ricreato un Milano→Zurigo in auto, il salvataggio
 * non ha ottenuto il percorso, e la rete di sicurezza non è mai più scattata —
 * il viaggio sarebbe rimasto senza tracciato per sempre. Verificato in
 * laboratorio: col flag scritto restava vuoto, senza flag si riparava con 35
 * punti. Ora si tiene traccia dei tentativi PER VIAGGIO, così un viaggio nuovo
 * viene sempre provato almeno una volta.
 *
 * Regola generale: una rete di sicurezza che si disarma da sola dopo il primo
 * giro protegge solo i dati che esistevano quel giorno.
 */
export async function ricalcolaTracciati(annullato: () => boolean = () => false): Promise<number> {
  const tentativi = leggiTentativi();
  try { localStorage.removeItem(CHIAVE_VECCHIA); } catch { /* niente localStorage: pazienza */ }
  const oggi = new Date().toISOString();
  let aggiunti = 0;
  let toccato = false;

  for (const t of loadTrips()) {
    if (annullato()) break;
    if (!daRiprovare(tentativi, t.id)) continue;
    // Le fermate in ordine: casa → tappe → destinazione. Il mezzo di una
    // tratta sta sulla fermata di ARRIVO (descrive come ci si arriva).
    const tappe = t.waypoints ?? [];
    const partenza = hasCoords(t.home_latitude, t.home_longitude)
      ? { lat: t.home_latitude as number, lon: t.home_longitude as number } : null;
    if (!partenza || !hasCoords(t.latitude, t.longitude)) continue;

    // Niente da riparare: si registra comunque, così non si ricontrolla ogni volta.
    const serveQualcosa = (t.waypoints ?? []).some(w => followsRoad(w.transport_mode) && hasCoords(w.lat, w.lon) && daRipescare(w.route_geometry, w.route_km))
      || (followsRoad(t.transport_mode) && daRipescare(t.route_geometry, t.route_km));
    if (!serveQualcosa) { tentativi[t.id] = oggi; toccato = true; continue; }

    const patch: Partial<Trip> = {};
    let prima = partenza;
    const nuoveTappe = [...tappe];
    for (let i = 0; i < nuoveTappe.length; i++) {
      const w = nuoveTappe[i];
      // Una tappa senza coordinate non si può instradare — ma va comunque
      // ricopiata nell'elenco nuovo: prima veniva filtrata via all'inizio, e
      // il salvataggio qui sotto la CANCELLAVA dal viaggio.
      if (!hasCoords(w.lat, w.lon)) continue;
      if (followsRoad(w.transport_mode) && daRipescare(w.route_geometry, w.route_km)) {
        if (annullato()) break;
        const r = await fetchDrivingRoute(prima.lat, prima.lon, w.lat as number, w.lon as number);
        // Disegno e lunghezza si scrivono SEMPRE in coppia: sono la stessa
        // risposta, e una lunghezza che non descrive il disegno accanto
        // sarebbe peggio di nessuna lunghezza.
        if (r) { nuoveTappe[i] = { ...w, route_geometry: r.coords, route_km: r.km }; aggiunti++; }
      }
      prima = { lat: w.lat as number, lon: w.lon as number };
    }
    if (nuoveTappe.some((w, i) => w !== tappe[i])) patch.waypoints = nuoveTappe;

    if (followsRoad(t.transport_mode) && daRipescare(t.route_geometry, t.route_km)) {
      if (annullato()) break;
      const r = await fetchDrivingRoute(prima.lat, prima.lon, t.latitude, t.longitude);
      if (r) { patch.route_geometry = r.coords; patch.route_km = r.km; aggiunti++; }
    }
    // Come per le temperature: si scrive SOLO se c'è davvero qualcosa di
    // nuovo — updateTrip timbra `updated_at`, e un timbro gratuito farebbe
    // vincere questa copia sugli altri dispositivi nel merge del backup.
    if (Object.keys(patch).length > 0) updateTrip(t.id, patch);
    tentativi[t.id] = oggi;
    toccato = true;
  }

  // I viaggi cancellati non devono restare nell'elenco a gonfiarlo: lo spazio
  // di localStorage è condiviso con l'archivio vero.
  const vivi = new Set(loadTrips().map(t => t.id));
  const puliti: Tentativi = {};
  for (const [id, quando] of Object.entries(tentativi)) if (vivi.has(id)) puliti[id] = quando;
  // Si riscrive anche quando non c'è stato nulla da riparare, se nel frattempo
  // qualche viaggio è stato cancellato: altrimenti i suoi id resterebbero lì
  // per sempre. (Trovato da un test: la pulizia legata al solo "ho lavorato"
  // non scattava mai al giro in cui non c'era lavoro da fare.)
  const cambiato = toccato || Object.keys(puliti).length !== Object.keys(tentativi).length;
  if (cambiato) {
    try { localStorage.setItem(CHIAVE_TRACCIATI, JSON.stringify(puliti)); } catch { /* spazio pieno: pazienza */ }
  }
  return aggiunti;
}
