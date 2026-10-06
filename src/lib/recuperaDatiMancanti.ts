import { fetchElevation, fetchRegion, mergeRegions } from "./geo";
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
/**
 * Nominatim chiede di non superare una richiesta al secondo.
 *
 * Il ritmo va tenuto su TUTTO il giro, non dentro il singolo viaggio: con
 * `sequentialMap` la pausa cadeva solo fra una tappa e l'altra, così nove
 * viaggi a tappa singola sparavano nove richieste in due secondi e mezzo
 * (misurato: 274 ms di distanza minima). Il cronometro qui sotto è di modulo:
 * conta i secondi dall'ultima richiesta, chiunque l'abbia fatta.
 */
const PAUSA_NOMINATIM_MS = 1100;
let ultimaNominatim = 0;

async function turnoNominatim(pausaMs: number): Promise<void> {
  const restano = pausaMs - (Date.now() - ultimaNominatim);
  if (restano > 0) await new Promise(r => setTimeout(r, restano));
  ultimaNominatim = Date.now();
}

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
 * Completa i viaggi a cui manca l'altitudine o la regione.
 *
 * ⚠️ Storia da non ripetere (la stessa dei tracciati, scoperta il 2026-08-22).
 * Questi dati si chiedono UNA VOLTA SOLA, al salvataggio. Se in quel momento
 * la rete non c'era, il viaggio restava senza — e nessuno ci tornava più:
 * l'unico giro che ricalcolava qualcosa era una migrazione una-tantum, che
 * si chiudeva alle spalle un flag globale e non riapriva mai. La cura è
 * questa rete separata, con la memoria per viaggio.
 *
 * (Fino al 2026-10-06 completava anche la TEMPERATURA: la feature è stata
 * rimossa per intero, e con lei la migrazione `ricalcolaTemperature`.)
 *
 * Regola generale, per la terza volta: una rete di sicurezza che si disarma da
 * sola dopo il primo giro protegge solo i dati che esistevano quel giorno.
 */
export async function recuperaDatiMancanti(
  annullato: () => boolean = () => false,
  pausaNominatimMs: number = PAUSA_NOMINATIM_MS,
): Promise<number> {
  const tentativi = leggiTentativi();
  let riempiti = 0;
  let toccato = false;

  for (const t of loadTrips()) {
    if (annullato()) break;
    if (!daRiprovare(tentativi, t.id)) continue;

    const stops = fermate(t);
    const mancaAltitudine = t.altitude_m == null;
    const mancaRegione = !t.region;
    if (!stops.length || (!mancaAltitudine && !mancaRegione)) {
      tentativi[t.id] = new Date().toISOString();
      toccato = true;
      continue;
    }

    const patch: Partial<Trip> = {};

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
      // Una richiesta al secondo: è la regola di Nominatim, e qui giriamo in
      // sottofondo — non c'è nessuno che aspetta.
      const regioni = [];
      for (const s of stops) {
        if (annullato()) return riempiti;
        await turnoNominatim(pausaNominatimMs);
        regioni.push(await fetchRegion(s.lat, s.lon));
      }
      const dettagli = mergeRegions(regioni);
      if (dettagli.length) {
        patch.region = dettagli.map(r => r.name).join(", ");
        patch.region_details = dettagli;
      }
    }

    // Come per i tracciati: si scrive SOLO se è arrivato qualcosa.
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
