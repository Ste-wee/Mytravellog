import { Trip, parseLocalDate, todayLocalISO } from "@/lib/storage";
import { fmtNumber, tr } from "@/lib/settings";

export interface PlanCountdown {
  text: string;
  /** Partenza vicina (≤14 giorni): la card la evidenzia in ambra. */
  urgent: boolean;
  /** Date già passate: il viaggio è concluso ma non ancora "segnato come fatto". */
  returned: boolean;
}

/**
 * Stato temporale di un viaggio in programma rispetto a oggi:
 * "tra N giorni" / "domani" / "oggi" / "in corso" (tra partenza e ritorno) /
 * "sei tornato?" (ritorno già passato → invito a segnarlo come fatto).
 * `todayISO` è iniettabile per i test.
 */
export function planCountdown(trip: Trip, todayISO: string = todayLocalISO()): PlanCountdown {
  const today = parseLocalDate(todayISO).getTime();
  const start = parseLocalDate(trip.trip_date).getTime();
  const end = parseLocalDate(trip.date_end || trip.trip_date).getTime();
  // Data malformata → NaN: tutti i confronti sotto sarebbero falsi e un
  // viaggio futuro finiva su "sei tornato?" (o "tra NaN giorni" con anni
  // fuori scala). Meglio dirlo com'è.
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { text: tr("data non valida"), urgent: false, returned: false };
  }
  const days = Math.round((start - today) / 86400000);
  // fmtNumber: un viaggio programmato ad anni di distanza scriverebbe
  // "tra 1024 giorni" mentre tutto il resto dell'app scrive "1.024".
  if (days > 1) return { text: tr("tra {quanti} giorni", { quanti: fmtNumber(days) }), urgent: days <= 14, returned: false };
  if (days === 1) return { text: tr("domani"), urgent: true, returned: false };
  if (days === 0) return { text: tr("oggi"), urgent: true, returned: false };
  if (today <= end) return { text: tr("in corso"), urgent: false, returned: false };
  return { text: tr("sei tornato?"), urgent: false, returned: true };
}
