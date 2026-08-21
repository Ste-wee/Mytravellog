import { fetchDrivingRoute } from "./geo";
import { hasCoords } from "./coords";
import { followsRoad } from "./transport";
import { loadTrips, updateTrip, Trip } from "./storage";

/** Quali viaggi abbiamo già provato a riparare, e quando. */
export const CHIAVE_TRACCIATI = "navta.tracciati.tentati.v1";
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

function daRiprovare(tentativi: Tentativi, id: string): boolean {
  const quando = tentativi[id];
  if (!quando) return true;
  const giorni = (Date.now() - new Date(quando).getTime()) / 86_400_000;
  return !(giorni >= 0) || giorni >= GIORNI_PRIMA_DI_RIPROVARE;
}

/**
 * Riprova a scaricare i tracciati stradali MANCANTI dei viaggi già salvati.
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
  const oggi = new Date().toISOString();
  let aggiunti = 0;
  let toccato = false;

  for (const t of loadTrips()) {
    if (annullato()) break;
    if (!daRiprovare(tentativi, t.id)) continue;
    // Le fermate in ordine: casa → tappe → destinazione. Il mezzo di una
    // tratta sta sulla fermata di ARRIVO (descrive come ci si arriva).
    const tappe = (t.waypoints ?? []).filter(w => hasCoords(w.lat, w.lon));
    const partenza = hasCoords(t.home_latitude, t.home_longitude)
      ? { lat: t.home_latitude as number, lon: t.home_longitude as number } : null;
    if (!partenza || !hasCoords(t.latitude, t.longitude)) continue;

    // Niente da riparare: si registra comunque, così non si ricontrolla ogni volta.
    const serveQualcosa = (t.waypoints ?? []).some(w => !w.route_geometry && followsRoad(w.transport_mode) && hasCoords(w.lat, w.lon))
      || (!t.route_geometry && followsRoad(t.transport_mode));
    if (!serveQualcosa) { tentativi[t.id] = oggi; toccato = true; continue; }

    const patch: Partial<Trip> = {};
    let prima = partenza;
    const nuoveTappe = [...tappe];
    for (let i = 0; i < nuoveTappe.length; i++) {
      const w = nuoveTappe[i];
      if (!w.route_geometry && followsRoad(w.transport_mode)) {
        if (annullato()) break;
        const r = await fetchDrivingRoute(prima.lat, prima.lon, w.lat as number, w.lon as number);
        if (r) { nuoveTappe[i] = { ...w, route_geometry: r }; aggiunti++; }
      }
      prima = { lat: w.lat as number, lon: w.lon as number };
    }
    if (nuoveTappe.some((w, i) => w !== tappe[i])) patch.waypoints = nuoveTappe;

    if (!t.route_geometry && followsRoad(t.transport_mode)) {
      if (annullato()) break;
      const r = await fetchDrivingRoute(prima.lat, prima.lon, t.latitude, t.longitude);
      if (r) { patch.route_geometry = r; aggiunti++; }
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
