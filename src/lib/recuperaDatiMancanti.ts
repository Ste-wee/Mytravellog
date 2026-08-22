import { fetchTemperature, fetchElevation, fetchRegion, mergeRegions } from "./geo";
import { sequentialMap } from "./utils";
import { hasCoords } from "./coords";
import { loadTrips, updateTrip, Trip } from "./storage";

/**
 * Quali viaggi abbiamo già provato a completare, e quando. Stesso schema dei
 * tracciati (`ricalcolaTracciati`): la memoria è PER VIAGGIO, non un flag
 * globale, così un viaggio salvato domani viene provato comunque.
 */
export const CHIAVE_DATI = "navta.dati.tentati.v1";
/** Un dato che non arriva (rete giù, servizio storto) non si ritenta a ogni
 *  avvio: una volta a settimana basta a guarire senza pesare. */
const GIORNI_PRIMA_DI_RIPROVARE = 7;
/** Nominatim chiede di non superare una richiesta al secondo. */
const PAUSA_NOMINATIM_MS = 1100;

type Tentativi = Record<string, string>;   // id viaggio → data ISO del tentativo

function leggiTentativi(): Tentativi {
  try {
    const grezzo = localStorage.getItem(CHIAVE_DATI);
    const j = grezzo ? JSON.parse(grezzo) : null;
    return j && typeof j === "object" && !Array.isArray(j) ? j as Tentativi : {};
  } catch {
    return {};
  }
}

function daRiprovare(tentativi: Tentativi, id: string): boolean {
  const quando = tentativi[id];
  if (!quando) return true;
  const giorni = (Date.now() - new Date(quando).getTime()) / 86_400_000;
  return !(giorni >= 0) || giorni >= GIORNI_PRIMA_DI_RIPROVARE;
}

/** Le fermate con coordinate: tappe intermedie + destinazione, in ordine. */
function fermate(t: Trip): { city: string; lat: number; lon: number }[] {
  const tappe = (t.waypoints ?? [])
    .filter(w => hasCoords(w.lat, w.lon))
    .map(w => ({ city: w.city, lat: w.lat as number, lon: w.lon as number }));
  return hasCoords(t.latitude, t.longitude)
    ? [...tappe, { city: t.city, lat: t.latitude, lon: t.longitude }]
    : tappe;
}

/**
 * Completa i viaggi a cui manca la temperatura, l'altitudine o la regione.
 *
 * ⚠️ Storia da non ripetere (la stessa dei tracciati, scoperta il 2026-08-22).
 * Questi tre dati si chiedono UNA VOLTA SOLA, al salvataggio. Se in quel
 * momento la rete non c'era, il viaggio restava senza — e nessuno ci tornava
 * più: l'unico giro che li ricalcolava (`ricalcolaTemperature`) è una
 * migrazione una-tantum, che si chiude alle spalle un flag globale e non
 * riapre mai. Provato in laboratorio: col flag scritto, un viaggio senza
 * temperatura resta senza per sempre; togliendolo, si riempie in dodici
 * secondi. La cura non è riaprire la migrazione — quella ha finito il suo
 * lavoro — ma questa rete separata, con la memoria per viaggio.
 *
 * Regola generale, per la terza volta: una rete di sicurezza che si disarma da
 * sola dopo il primo giro protegge solo i dati che esistevano quel giorno.
 */
export async function recuperaDatiMancanti(annullato: () => boolean = () => false): Promise<number> {
  const tentativi = leggiTentativi();
  let riempiti = 0;
  let toccato = false;

  for (const t of loadTrips()) {
    if (annullato()) break;
    if (!daRiprovare(tentativi, t.id)) continue;

    const stops = fermate(t);
    const mancaTemperatura = t.temperature_c == null;
    const mancaAltitudine = t.altitude_m == null;
    const mancaRegione = !t.region;
    if (!stops.length || (!mancaTemperatura && !mancaAltitudine && !mancaRegione)) {
      tentativi[t.id] = new Date().toISOString();
      toccato = true;
      continue;
    }

    const patch: Partial<Trip> = {};

    if (mancaTemperatura) {
      const gradi: (number | null)[] = [];
      for (const s of stops) {
        if (annullato()) return riempiti;
        gradi.push(await fetchTemperature(s.lat, s.lon, t.trip_date, t.date_end));
      }
      const valide = stops
        .map((s, i) => ({ city: s.city, temp: gradi[i] }))
        .filter((x): x is { city: string; temp: number } => typeof x.temp === "number");
      if (valide.length) {
        const dest = gradi[gradi.length - 1];
        if (dest != null) patch.temperature_c = dest;
        const calda = valide.reduce((a, b) => (b.temp > a.temp ? b : a));
        const fredda = valide.reduce((a, b) => (b.temp < a.temp ? b : a));
        patch.hottest_temp_c = calda.temp; patch.hottest_city = calda.city;
        patch.coldest_temp_c = fredda.temp; patch.coldest_city = fredda.city;
      }
    }

    if (mancaAltitudine) {
      const quote: (number | null)[] = [];
      for (const s of stops) {
        if (annullato()) return riempiti;
        quote.push(await fetchElevation(s.lat, s.lon));
      }
      const valide = stops
        .map((s, i) => ({ city: s.city, alt: quote[i] }))
        .filter((x): x is { city: string; alt: number } => typeof x.alt === "number");
      if (valide.length) {
        const dest = quote[quote.length - 1];
        if (dest != null) patch.altitude_m = dest;
        const alta = valide.reduce((a, b) => (b.alt > a.alt ? b : a));
        patch.max_altitude_m = alta.alt; patch.max_altitude_city = alta.city;
      }
    }

    if (mancaRegione) {
      if (annullato()) return riempiti;
      // Una richiesta al secondo: è la regola di Nominatim, e qui giriamo in
      // sottofondo — non c'è nessuno che aspetta.
      const regioni = await sequentialMap(stops, s => fetchRegion(s.lat, s.lon), PAUSA_NOMINATIM_MS);
      const dettagli = mergeRegions(regioni);
      if (dettagli.length) {
        patch.region = dettagli.map(r => r.name).join(", ");
        patch.region_details = dettagli;
      }
    }

    // Come per tracciati e temperature: si scrive SOLO se è arrivato qualcosa.
    // `updateTrip` timbra `updated_at`, e un timbro gratuito farebbe vincere
    // questa copia sugli altri dispositivi nel merge del backup.
    if (Object.keys(patch).length > 0) { updateTrip(t.id, patch); riempiti++; }
    tentativi[t.id] = new Date().toISOString();
    toccato = true;
  }

  // I viaggi cancellati non restano nell'elenco a gonfiarlo.
  const vivi = new Set(loadTrips().map(t => t.id));
  const puliti: Tentativi = {};
  for (const [id, quando] of Object.entries(tentativi)) if (vivi.has(id)) puliti[id] = quando;
  const cambiato = toccato || Object.keys(puliti).length !== Object.keys(tentativi).length;
  if (cambiato) {
    try { localStorage.setItem(CHIAVE_DATI, JSON.stringify(puliti)); } catch { /* spazio pieno: pazienza */ }
  }
  return riempiti;
}
