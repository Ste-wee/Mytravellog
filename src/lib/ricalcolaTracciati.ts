import { fetchDrivingRoute } from "./geo";
import { hasCoords } from "./coords";
import { followsRoad } from "./transport";
import { loadTrips, updateTrip, Trip } from "./storage";

/** Una volta sola per dispositivo. */
export const CHIAVE_TRACCIATI = "navta.tracciati.recupero.v1";

/**
 * Riprova a scaricare i tracciati stradali MANCANTI dei viaggi già salvati.
 *
 * Perché serve: il percorso su strada si chiede una volta sola, al
 * salvataggio. Se in quel momento la rete non c'era o il servizio di
 * instradamento era irraggiungibile, il viaggio resta senza tracciato PER
 * SEMPRE — sul globo si vede la linea d'aria e nulla dice che manchi
 * qualcosa. (Segnalato da Stefano su un Milano→Zurigo in auto: il flusso di
 * salvataggio è sano, provato dal vivo; è il dato vecchio a essere rimasto
 * vuoto, senza modo di rimediare se non risalvando il viaggio a mano.)
 *
 * Si tenta UNA volta: se anche il recupero fallisce (tratta senza strade,
 * servizio giù) il flag viene comunque scritto, così non si martella la rete
 * a ogni avvio.
 */
export async function ricalcolaTracciati(annullato: () => boolean = () => false): Promise<number> {
  if (localStorage.getItem(CHIAVE_TRACCIATI)) return 0;
  let aggiunti = 0;
  for (const t of loadTrips()) {
    if (annullato()) return aggiunti;
    // Le fermate in ordine: casa → tappe → destinazione. Il mezzo di una
    // tratta sta sulla fermata di ARRIVO (descrive come ci si arriva).
    const tappe = (t.waypoints ?? []).filter(w => hasCoords(w.lat, w.lon));
    const partenza = hasCoords(t.home_latitude, t.home_longitude)
      ? { lat: t.home_latitude as number, lon: t.home_longitude as number } : null;
    if (!partenza || !hasCoords(t.latitude, t.longitude)) continue;

    const patch: Partial<Trip> = {};
    let prima = partenza;
    const nuoveTappe = [...tappe];
    for (let i = 0; i < nuoveTappe.length; i++) {
      const w = nuoveTappe[i];
      if (!w.route_geometry && followsRoad(w.transport_mode)) {
        if (annullato()) return aggiunti;
        const r = await fetchDrivingRoute(prima.lat, prima.lon, w.lat as number, w.lon as number);
        if (r) { nuoveTappe[i] = { ...w, route_geometry: r }; aggiunti++; }
      }
      prima = { lat: w.lat as number, lon: w.lon as number };
    }
    if (nuoveTappe.some((w, i) => w !== tappe[i])) patch.waypoints = nuoveTappe;

    if (!t.route_geometry && followsRoad(t.transport_mode)) {
      if (annullato()) return aggiunti;
      const r = await fetchDrivingRoute(prima.lat, prima.lon, t.latitude, t.longitude);
      if (r) { patch.route_geometry = r; aggiunti++; }
    }
    // Come per le temperature: si scrive SOLO se c'è davvero qualcosa di
    // nuovo — updateTrip timbra `updated_at`, e un timbro gratuito farebbe
    // vincere questa copia sugli altri dispositivi nel merge del backup.
    if (Object.keys(patch).length > 0) updateTrip(t.id, patch);
  }
  localStorage.setItem(CHIAVE_TRACCIATI, new Date().toISOString());
  return aggiunti;
}
