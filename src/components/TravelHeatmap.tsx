import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import { Trip, parseLocalDate, formatTripDate } from "@/lib/storage";
import { stopChain } from "@/lib/stops";
import { Hourglass, CalendarDays, X } from "lucide-react";
import { fmtNumber } from "@/lib/settings";

const MONTH_LABELS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

/**
 * Giorni di viaggio (trip_date..date_end inclusi) per ogni mese, aggregati
 * per anno — usati per l'intensità della heatmap. Un viaggio a cavallo tra
 * due mesi/anni contribuisce a entrambi in proporzione ai giorni effettivi.
 */
export function computeMonthlyTravelDays(trips: Trip[]): Map<string, number> {
  const map = new Map<string, number>();
  const MAX_SPAN_DAYS = 366 * 30; // ~30 anni: oltre è quasi certamente una data corrotta
  for (const t of trips) {
    const start = parseLocalDate(t.trip_date);
    const end = t.date_end ? parseLocalDate(t.date_end) : start;
    if (end < start) continue;
    // Guardia: una data malformata (es. anno a 5 cifre "20250-06-01") produce
    // uno span enorme e il while sotto itererebbe centinaia di migliaia di
    // volte, congelando la UI. NaN (data non valida) non è finito → saltato.
    const spanDays = (end.getTime() - start.getTime()) / 86400000;
    if (!Number.isFinite(spanDays) || spanDays > MAX_SPAN_DAYS) continue;
    const cur = new Date(start);
    while (cur <= end) {
      const key = `${cur.getFullYear()}-${cur.getMonth()}`;
      map.set(key, (map.get(key) ?? 0) + 1);
      cur.setDate(cur.getDate() + 1);
    }
  }
  return map;
}

/** Viaggi che toccano almeno un giorno del mese indicato (month = 0-11),
 * anche solo parzialmente (es. un viaggio 28 giugno-3 luglio compare sia in
 * giugno che in luglio) — stesso criterio di sovrapposizione usato per
 * calcolare i giorni della cella corrispondente. */
export function tripsTouchingMonth(trips: Trip[], year: number, month: number): Trip[] {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  return trips.filter(t => {
    const start = parseLocalDate(t.trip_date);
    const end = t.date_end ? parseLocalDate(t.date_end) : start;
    return start <= monthEnd && end >= monthStart;
  });
}

/** Giorni trascorsi dalla fine dell'ultimo viaggio (0 se in corso oggi). */
export function daysSinceLastTrip(trips: Trip[]): number | null {
  if (trips.length === 0) return null;
  let lastEnd = parseLocalDate(trips[0].date_end || trips[0].trip_date);
  for (const t of trips) {
    const end = parseLocalDate(t.date_end || t.trip_date);
    if (end > lastEnd) lastEnd = end;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - lastEnd.getTime()) / 86400000);
  // Data corrotta → diff NaN: torna null (mostrato come "—") invece di "NaN".
  return Number.isFinite(diff) ? Math.max(0, diff) : null;
}

interface Props {
  trips: Trip[];
}

export function TravelHeatmap({ trips }: Props) {
  const monthlyDays = useMemo(() => computeMonthlyTravelDays(trips), [trips]);
  const abstinence = useMemo(() => daysSinceLastTrip(trips), [trips]);
  // Somma dei giorni di calendario effettivamente coperti dai viaggi (estremi
  // inclusi) — stessa fonte della heatmap, quindi coerente con le sue celle.
  // Diverso (più corretto) del vecchio calcolo per differenza di date usato
  // in TravelHighlights/Index: un viaggio 1-5 giugno conta 5 giorni, non 4.
  const totalTravelDays = useMemo(
    () => Array.from(monthlyDays.values()).reduce((sum, d) => sum + d, 0),
    [monthlyDays]
  );

  // Solo gli anni con almeno un giorno di viaggio: niente righe vuote per gli
  // anni senza nessun viaggio, anche se sono "in mezzo" tra due anni con
  // viaggi o se coincidono con l'anno corrente.
  const years = useMemo(() => {
    const withTravel = new Set<number>();
    for (const key of monthlyDays.keys()) withTravel.add(Number(key.split("-")[0]));
    return Array.from(withTravel).sort((a, b) => a - b);
  }, [monthlyDays]);

  const maxDays = useMemo(() => Math.max(1, ...Array.from(monthlyDays.values())), [monthlyDays]);

  const cellColor = (days: number) => {
    if (days === 0) return "rgba(255,255,255,0.06)";
    const alpha = 0.18 + (days / maxDays) * 0.82;
    return `rgba(96,165,250,${alpha.toFixed(2)})`;
  };

  // Riassunto del mese: si apre/chiude cliccando una cella (niente hover —
  // su touch non esiste, e così l'interazione è identica su ogni dispositivo).
  const [selectedCell, setSelectedCell] = useState<{ year: number; month: number } | null>(null);
  // C'è ancora griglia oltre il bordo destro? Guida la sfumatura-indizio.
  // Si ricalcola su scroll, al mount/cambio viaggi E al RESIZE: ruotando il
  // telefono la griglia può entrare tutta (o smettere di entrare) senza che
  // nessuno scrolli, e lo stato resterebbe stantio fino al primo tocco.
  const [scrollabile, setScrollabile] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const aggiorna = () => {
      const el = scrollRef.current;
      if (el) setScrollabile(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    };
    aggiorna();
    window.addEventListener("resize", aggiorna);
    return () => window.removeEventListener("resize", aggiorna);
  }, [trips]);
  const selectedMonthTrips = useMemo(
    () => selectedCell ? tripsTouchingMonth(trips, selectedCell.year, selectedCell.month) : [],
    [trips, selectedCell]
  );

  return (
    <div className="glass-card p-5 animate-fade-up">
      <div className="flex items-center justify-between gap-3 sm:gap-4 pb-5 border-b border-border mb-5 flex-nowrap">
        <div className="flex items-center gap-3">
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(96,165,250,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <CalendarDays className="w-5 h-5" style={{ color: "#60a5fa" }} />
          </div>
          <div>
            <div className="font-mono" style={{ fontSize: 24, fontWeight: 700, color: "#f0f4ff", lineHeight: 1 }}>{fmtNumber(totalTravelDays)}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>giorni in viaggio</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(96,165,250,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Hourglass className="w-5 h-5" style={{ color: "#60a5fa" }} />
          </div>
          <div>
            <div className="font-mono" style={{ fontSize: 24, fontWeight: 700, color: "#f0f4ff", lineHeight: 1 }}>
              {abstinence == null ? "—" : fmtNumber(abstinence)}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>giorni senza viaggiare</div>
          </div>
        </div>
      </div>

      <h2 className="text-lg font-bold mb-4">Anni e mesi di viaggio</h2>

      {/* Larghezza minima + scroll orizzontale: su schermi stretti le celle
          altrimenti si comprimono sotto i ~17px, troppo piccole per un tap
          preciso — meglio scorrere che rimpicciolire all'infinito. La
          SFUMATURA sul bordo destro dice che c'è altro oltre il taglio
          ("Lug A…" troncato sembrava un difetto): sparisce a fine corsa. */}
      <div style={{ position: "relative" }}>
        <div style={{ overflowX: "auto" }} ref={scrollRef} onScroll={e => {
          const el = e.currentTarget;
          setScrollabile(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
        }}>
        <div style={{ display: "grid", gridTemplateColumns: "34px repeat(12,1fr)", gap: 4, alignItems: "center", minWidth: 460 }}>
          <div />
          {MONTH_LABELS.map(m => (
            <div key={m} style={{ fontSize: 9, textAlign: "center", color: "rgba(255,255,255,0.6)" }}>{m}</div>
          ))}
          {years.map(year => (
            <Fragment key={year}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>{year}</div>
              {MONTH_LABELS.map((label, m) => {
                const days = monthlyDays.get(`${year}-${m}`) ?? 0;
                const isSelected = selectedCell?.year === year && selectedCell?.month === m;
                const cellLabel = `${label} ${year}: ${days} giorn${days === 1 ? "o" : "i"} di viaggio`;
                const cellStyle = {
                  aspectRatio: "1", borderRadius: 4, background: cellColor(days),
                  outline: isSelected ? "1.5px solid #60a5fa" : "none", outlineOffset: 1,
                } as const;
                // Le celle senza giorni non sono interattive: restano <div>, non
                // fanno parte del focus da tastiera. Quelle con giorni sono
                // <button> reali (non solo div con onClick) così Tab/Enter/Spazio
                // funzionano e uno screen reader le annuncia come tali.
                if (days === 0) {
                  return <div key={`${year}-${m}`} title={cellLabel} style={{ ...cellStyle, cursor: "default" }} />;
                }
                return (
                  <button key={`${year}-${m}`} type="button"
                    onClick={() => setSelectedCell(isSelected ? null : { year, month: m })}
                    title={cellLabel} aria-label={cellLabel} aria-pressed={isSelected}
                    style={{ ...cellStyle, cursor: "pointer", border: "none", padding: 0, font: "inherit" }} />
                );
              })}
            </Fragment>
          ))}
        </div>
        </div>
        {scrollabile && (
          <div aria-hidden style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 28,
            pointerEvents: "none", background: "linear-gradient(to right, rgba(10,22,40,0), #0a1628)" }}/>
        )}
      </div>

      {years.length > 0 && (
      <div className="flex items-center justify-end gap-1.5 mt-3.5">
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.6)" }}>0</span>
        {[0, 0.25, 0.5, 0.75, 1].map(a => (
          <div key={a} style={{ width: 10, height: 10, borderRadius: 3, background: a === 0 ? "rgba(255,255,255,0.06)" : `rgba(96,165,250,${a})` }} />
        ))}
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.6)" }}>{maxDays} giorni</span>
      </div>
      )}

      {selectedCell && (
        <div style={{ marginTop: 14, padding: "12px 14px", background: "#0a1e38", border: "0.5px solid #1a2d4a", borderRadius: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#f0f4ff" }}>
              {(() => {
                const d = monthlyDays.get(`${selectedCell.year}-${selectedCell.month}`) ?? 0;
                return `${MONTH_LABELS[selectedCell.month]} ${selectedCell.year} — ${d} giorn${d === 1 ? "o" : "i"}`;
              })()}
            </span>
            <button type="button" onClick={() => setSelectedCell(null)} aria-label="Chiudi"
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex" }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {selectedMonthTrips.map(t => (
              <div key={t.id} style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                {/* La catena delle tappe, come la fila sul biglietto: prima si
                    leggeva solo la destinazione, quindi un Milano→Trieste→
                    Ljubljana→Vienna nominava una meta su quattro. Con una sola
                    meta resta il nome nudo (non c'è nessun percorso da dire).
                    La catena VA A CAPO invece di troncarsi: l'ellipsis si
                    mangiava proprio l'arrivo ("Vienn…") e, a ruota, la data
                    che stava sulla stessa riga. La data vive su una riga sua,
                    più piccola e tenue: è servizio, non racconto. */}
                <span style={{ display: "block", lineHeight: 1.5 }}>
                  {stopChain(t) ?? t.city}
                </span>
                <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
                  {formatTripDate(t.trip_date)}
                  {t.date_end && t.date_end !== t.trip_date ? ` → ${formatTripDate(t.date_end)}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
