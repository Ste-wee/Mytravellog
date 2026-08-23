import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Trip, parseLocalDate, formatTripDate } from "@/lib/storage";
import { calendarDayKeys } from "@/lib/travelDays";
import { stopChain } from "@/lib/stops";
import { availableYears, computeYearRecap } from "@/lib/recap";
import { Hourglass, CalendarDays, X, ChevronRight } from "lucide-react";
import { fmtNumber } from "@/lib/settings";

const MONTH_LABELS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

/**
 * Giorni di viaggio (trip_date..date_end inclusi) per ogni mese, aggregati
 * per anno — usati per l'intensità della heatmap. Un viaggio a cavallo tra
 * due mesi/anni contribuisce a entrambi in proporzione ai giorni effettivi.
 */
export function computeMonthlyTravelDays(trips: Trip[]): Map<string, number> {
  // I giorni si contano UNICI (calendarDayKeys): prima due viaggi che
  // condividevano un giorno — torni il 21 e riparti il 21 — lo contavano due
  // volte, gonfiando cella del mese e totale (una cella poteva pure superare
  // i giorni del mese). Le guardie sulle date malformate vivono nell'helper.
  const map = new Map<string, number>();
  for (const key of calendarDayKeys(trips)) {
    const meseKey = key.slice(0, key.lastIndexOf("-"));
    map.set(meseKey, (map.get(meseKey) ?? 0) + 1);
  }
  return map;
}

/**
 * Giorni di viaggio per MESE DELL'ANNO (0-11), sommando tutti gli anni: la
 * stagionalità di una vita di viaggi in dodici numeri.
 *
 * Sostituisce la griglia anno×mese, che cresceva di una riga all'anno (tredici
 * righe per una quindicina di celle accese) e in larghezza non teneva i dodici
 * mesi: da agosto in poi si vedeva solo scorrendo di lato.
 */
export function computeSeasonality(trips: Trip[]): number[] {
  const perMese = new Array(12).fill(0) as number[];
  for (const key of calendarDayKeys(trips)) {
    // le chiavi sono "anno-mese-giorno" con mese 0-11
    const pezzi = key.split("-");
    const mese = Number(pezzi[1]);
    if (mese >= 0 && mese < 12) perMese[mese]++;
  }
  return perMese;
}

/** Viaggi che toccano un dato mese in QUALSIASI anno, dal più recente. */
export function tripsInMonthAnyYear(trips: Trip[], month: number): Trip[] {
  return trips
    .filter(t => {
      const start = parseLocalDate(t.trip_date);
      const end = t.date_end ? parseLocalDate(t.date_end) : start;
      // Un viaggio a cavallo di più mesi tocca ognuno di quelli attraversati.
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cur <= end) {
        if (cur.getMonth() === month) return true;
        cur.setMonth(cur.getMonth() + 1);
      }
      return false;
    })
    .sort((a, b) => (b.trip_date || "").localeCompare(a.trip_date || ""));
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

  // La striscia: dodici numeri, tutti gli anni sommati.
  const stagionalita = useMemo(() => computeSeasonality(trips), [trips]);
  // Gli anni, dal più recente: solo quelli con almeno un viaggio (li filtra
  // già availableYears, la stessa fonte del Recap annuale).
  const anni = useMemo(() => availableYears(trips), [trips]);
  const riassuntoAnno = useMemo(
    () => new Map(anni.map(a => [a, computeYearRecap(trips, a)])),
    [trips, anni],
  );
  /** Quanti anni si vedono prima di "mostra tutti": cinque riempiono lo
   *  schermo senza allungare la pagina. */
  const ANNI_A_VISTA = 5;
  const [tuttiGliAnni, setTuttiGliAnni] = useState(false);
  const anniVisibili = tuttiGliAnni ? anni : anni.slice(0, ANNI_A_VISTA);

  const maxDays = useMemo(() => Math.max(1, ...stagionalita), [stagionalita]);

  const cellColor = (days: number) => {
    if (days === 0) return "rgba(255,255,255,0.06)";
    const alpha = 0.18 + (days / maxDays) * 0.82;
    return `rgba(96,165,250,${alpha.toFixed(2)})`;
  };

  // Riassunto del mese: si apre/chiude toccando una cella (niente hover — su
  // touch non esiste, e così l'interazione è identica su ogni dispositivo).
  // Ora il mese è quello dell'ANNO (0-11) e il riquadro elenca tutti i viaggi
  // fatti in quel mese, di ogni anno: "tutti i miei marzo".
  const [meseAperto, setMeseAperto] = useState<number | null>(null);
  const viaggiDelMese = useMemo(
    () => meseAperto == null ? [] : tripsInMonthAnyYear(trips, meseAperto),
    [trips, meseAperto],
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

      <h2 className="text-lg font-bold mb-1">Quando viaggi</h2>
      <p className="text-xs text-muted-foreground mb-4">
        I giorni di viaggio mese per mese, tutti gli anni insieme.
      </p>

      {/* La striscia: dodici celle, una per mese dell'anno. Prima qui c'era
          una griglia anno×mese che cresceva di una riga all'anno — tredici
          righe per una quindicina di celle accese — e in larghezza non teneva
          i dodici mesi: da agosto in poi si vedeva solo scorrendo di lato.
          Ora l'altezza è la stessa per sempre e i mesi ci stanno tutti. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 3 }}>
        {MONTH_LABELS.map((m, i) => (
          // Tre lettere, non l'iniziale: con dodici colonne su una riga sola lo
          // spazio adesso c'è, e "G F M A M G L A S O N D" era indecifrabile
          // (G = gennaio o giugno? M = marzo o maggio?).
          <div key={`l${i}`} style={{ fontSize: 8, textAlign: "center", color: "rgba(255,255,255,0.6)", letterSpacing: "-0.2px" }}>
            {m}
          </div>
        ))}
        {MONTH_LABELS.map((label, m) => {
          const days = stagionalita[m];
          const aperto = meseAperto === m;
          const voce = `${label}: ${days} giorn${days === 1 ? "o" : "i"} di viaggio in tutto`;
          const stile = {
            height: 34, borderRadius: 5, background: cellColor(days),
            outline: aperto ? "1.5px solid #60a5fa" : "none", outlineOffset: 1,
          } as const;
          // Le celle senza giorni non sono interattive: restano <div>, fuori
          // dal giro del Tab. Quelle con giorni sono <button> reali.
          if (days === 0) {
            return <div key={m} title={voce} style={{ ...stile, cursor: "default" }} />;
          }
          return (
            <button key={m} type="button" onClick={() => setMeseAperto(aperto ? null : m)}
              title={voce} aria-label={voce} aria-pressed={aperto}
              style={{ ...stile, cursor: "pointer", border: "none", padding: 0, font: "inherit" }} />
          );
        })}
      </div>

      {anni.length > 0 && (
      <div className="flex items-center justify-end gap-1.5 mt-3">
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.6)" }}>0</span>
        {[0, 0.25, 0.5, 0.75, 1].map(a => (
          <div key={a} style={{ width: 10, height: 10, borderRadius: 3, background: a === 0 ? "rgba(255,255,255,0.06)" : `rgba(96,165,250,${a})` }} />
        ))}
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.6)" }}>{maxDays} giorni</span>
      </div>
      )}

      {meseAperto != null && (
        <div style={{ marginTop: 14, padding: "12px 14px", background: "#0a1e38", border: "0.5px solid #1a2d4a", borderRadius: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#f0f4ff" }}>
              {`${MONTH_LABELS[meseAperto]} — ${stagionalita[meseAperto]} giorn${stagionalita[meseAperto] === 1 ? "o" : "i"}`}
            </span>
            <button type="button" onClick={() => setMeseAperto(null)} aria-label="Chiudi"
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex" }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {viaggiDelMese.map(t => (
              <div key={t.id} style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                {/* La catena delle tappe, come la fila sul biglietto: prima si
                    leggeva solo la destinazione, quindi un Milano→Trieste→
                    Ljubljana→Vienna nominava una meta su quattro. */}
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

      {/* Gli anni come righe di testo, dal più recente. Ognuna porta al recap
          di quell'anno: i dati per il riassunto vengono da computeYearRecap,
          la stessa funzione del poster, così i numeri non possono divergere. */}
      {anni.length > 0 && (
        <div style={{ marginTop: 18, borderTop: "0.5px solid #1a2d4a", paddingTop: 12 }}>
          {anniVisibili.map(a => {
            const r = riassuntoAnno.get(a);
            if (!r) return null;
            return (
              <Link key={a} to={`/recap?anno=${a}`}
                aria-label={`Il tuo ${a}: ${r.trips} viagg${r.trips === 1 ? "io" : "i"}, ${r.days} giorn${r.days === 1 ? "o" : "i"}. Apri il recap dell'anno`}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 10, padding: "9px 2px", textDecoration: "none",
                  borderBottom: "0.5px solid rgba(26,45,74,0.6)" }}>
                <span className="font-mono" style={{ fontSize: 13, fontWeight: 700, color: "#f0f4ff" }}>{a}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "rgba(255,255,255,0.6)" }}>
                  {r.trips} {r.trips === 1 ? "viaggio" : "viaggi"} · {r.days} {r.days === 1 ? "giorno" : "giorni"}
                  <ChevronRight className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.35)" }} aria-hidden />
                </span>
              </Link>
            );
          })}
          {anni.length > ANNI_A_VISTA && (
            <button type="button" onClick={() => setTuttiGliAnni(v => !v)}
              style={{ width: "100%", marginTop: 10, background: "none", border: "none",
                color: "#60a5fa", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "6px 0" }}>
              {tuttiGliAnni ? "Mostra meno" : `Mostra tutti i ${anni.length} anni`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
