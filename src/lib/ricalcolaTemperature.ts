import { fetchTemperature } from "./geo";
import { hasCoords } from "./coords";
import { loadTrips, updateTrip, Trip } from "./storage";

/** Una volta sola per dispositivo: la chiave dice QUALE criterio è stato applicato. */
export const CHIAVE_RICALCOLO = "navta.temperature.estremo.v1";

/** Le fermate di un viaggio che hanno coordinate: tappe + destinazione. */
function fermate(t: Trip): { city: string; lat: number; lon: number }[] {
  const tappe = (t.waypoints ?? [])
    .filter(w => w.lat != null && w.lon != null && hasCoords(w.lat as number, w.lon as number))
    .map(w => ({ city: w.city, lat: w.lat as number, lon: w.lon as number }));
  return hasCoords(t.latitude, t.longitude)
    ? [...tappe, { city: t.city, lat: t.latitude, lon: t.longitude }]
    : tappe;
}

/**
 * Riscarica la temperatura dei viaggi già salvati col criterio nuovo
 * (l'estremo del PERIODO, non la media del solo giorno di partenza).
 *
 * Ricalcola anche la tappa più calda e la più fredda: lasciarle col vecchio
 * criterio darebbe numeri incoerenti sullo stesso viaggio (destinazione a
 * -31° e "tappa più fredda" a -12°).
 *
 * `annullato` permette a chi chiama di fermare il giro quando la pagina se ne
 * va: sono richieste di rete in sottofondo, non devono sopravvivere alla
 * schermata che le ha avviate.
 */
export async function ricalcolaTemperature(annullato: () => boolean = () => false): Promise<number> {
  if (localStorage.getItem(CHIAVE_RICALCOLO)) return 0;
  let aggiornati = 0;
  for (const t of loadTrips()) {
    if (annullato()) return aggiornati;                 // niente flag: si riprende al prossimo avvio
    const stops = fermate(t);
    if (!stops.length) continue;
    const temperature: (number | null)[] = [];
    for (const s of stops) {
      if (annullato()) return aggiornati;
      temperature.push(await fetchTemperature(s.lat, s.lon, t.trip_date, t.date_end));
    }
    const valide = stops
      .map((s, i) => ({ city: s.city, temp: temperature[i] }))
      .filter((x): x is { city: string; temp: number } => typeof x.temp === "number");
    if (!valide.length) continue;
    const dest = temperature[temperature.length - 1];
    const piuCalda = valide.reduce((a, b) => (b.temp > a.temp ? b : a));
    const piuFredda = valide.reduce((a, b) => (b.temp < a.temp ? b : a));
    const patch = {
      temperature_c: dest ?? t.temperature_c,
      hottest_temp_c: piuCalda.temp, hottest_city: piuCalda.city,
      coldest_temp_c: piuFredda.temp, coldest_city: piuFredda.city,
    };
    // Scrive solo se qualcosa è davvero cambiato: updateTrip timbra
    // `updated_at`, e in un sync last-write-wins un timbro gratuito farebbe
    // vincere questa copia su quelle degli altri dispositivi senza motivo.
    if (patch.temperature_c !== t.temperature_c || patch.hottest_temp_c !== t.hottest_temp_c ||
        patch.coldest_temp_c !== t.coldest_temp_c) {
      updateTrip(t.id, patch);
      aggiornati++;
    }
  }
  localStorage.setItem(CHIAVE_RICALCOLO, new Date().toISOString());
  return aggiornati;
}
