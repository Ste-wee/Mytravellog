import { useEffect, useState } from "react";
import { Trip, formatTripDate, updatePlan } from "@/lib/storage";
import { planCountdown } from "@/lib/plans";
import { MapPin, Check, CircleCheck, Circle } from "lucide-react";

/**
 * Card di un viaggio "in programma": conto alla rovescia, tappe, cose da
 * organizzare e la spunta "prenotato". Toccandola si apre il pannello di
 * pianificazione.
 *
 * Vive qui perché la usano DUE pagine: "In programma" (l'elenco) e "I miei
 * viaggi" (in cima, sopra i ricordi).
 *
 * NB struttura: la card NON è più un unico <button>, perché la spunta è essa
 * stessa un pulsante e i bottoni non si annidano (HTML non valido, e da
 * tastiera il tab non ci arriverebbe). Fuori un div, dentro due pulsanti:
 * l'area che apre il pannello e la spunta.
 */

function dateRange(t: Trip): string {
  return t.date_end ? `${formatTripDate(t.trip_date)} – ${formatTripDate(t.date_end)}` : formatTripDate(t.trip_date);
}

export function PlanCard({ plan: p, onOpen }: { plan: Trip; onOpen: () => void }) {
  const cl = p.checklist ?? [];
  const done = cl.filter(c => c.done).length;
  const cd = planCountdown(p);
  // La spunta si salva da sé: così le due pagine che usano questa card non
  // devono passare nulla (e "I miei viaggi" resta intoccato).
  const [booked, setBooked] = useState(!!p.booked);
  // …ma deve anche ASCOLTARE: se la spunta cambia su un altro dispositivo, il
  // sync di Drive riscrive i piani senza rimontare la card. Senza questo la
  // card mostrerebbe il valore vecchio e il tocco successivo calcolerebbe il
  // contrario di un valore stantio (sembra che la spunta non risponda).
  useEffect(() => { setBooked(!!p.booked); }, [p.booked]);

  const toggleBooked = () => {
    const next = !booked;
    setBooked(next);
    updatePlan(p.id, { booked: next });
  };

  return (
    <div
      style={{ background: "#0b1a33",
        border: "0.5px solid " + (cd.returned ? "rgba(52,211,153,0.35)" : "#1a2d4a"),
        borderRadius: 12, color: "#f0f4ff" }}>
      <button type="button" onClick={onOpen}
        style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none",
          padding: "16px 18px 10px", color: "inherit", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 16, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.title || p.city} {p.country_code && <span style={{ fontSize: 10, color: "#93c5fd" }}>{p.country_code.toUpperCase()}</span>}
          </div>
          <div style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, color: cd.returned ? "#34d399" : cd.urgent ? "#fbbf24" : "rgba(255,255,255,0.6)" }}>{cd.text}</div>
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{dateRange(p)} · in programma</div>
        {(p.waypoints?.length ?? 0) > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#93c5fd", marginTop: 6, minWidth: 0 }}>
            <MapPin style={{ width: 12, height: 12, flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {[...p.waypoints.map(w => w.city), p.city].join(" → ")}
            </span>
          </div>
        )}
        {cd.returned && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 11, color: "#34d399" }}>
            <Check style={{ width: 14, height: 14 }} /> Viaggio concluso — aprilo e segnalo come fatto
          </div>
        )}
        {cl.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 9, letterSpacing: ".06em", color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>DA ORGANIZZARE</div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{done} / {cl.length} <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: 400 }}>fatte</span></div>
            <div style={{ height: 5, borderRadius: 999, background: "#16233d", marginTop: 6, overflow: "hidden" }}>
              <div style={{ width: `${Math.round((done / cl.length) * 100)}%`, height: "100%", background: "#60a5fa" }} />
            </div>
          </div>
        )}
      </button>

      {/* Prenotato: un tocco cambia stato senza aprire nulla. */}
      <div style={{ padding: "0 18px 14px" }}>
        <button type="button" onClick={toggleBooked} aria-pressed={booked}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 500,
            padding: "6px 11px", borderRadius: 9, cursor: "pointer",
            background: booked ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.04)",
            border: "0.5px solid " + (booked ? "rgba(52,211,153,0.4)" : "#1a2d4a"),
            color: booked ? "#6ee7b7" : "rgba(255,255,255,0.6)" }}>
          {booked
            ? <CircleCheck style={{ width: 15, height: 15 }} />
            : <Circle style={{ width: 15, height: 15 }} />}
          {booked ? "Prenotato" : "Da prenotare"}
        </button>
      </div>
    </div>
  );
}
