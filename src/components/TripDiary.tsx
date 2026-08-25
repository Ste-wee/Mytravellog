import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT, localeAttivo } from "@/lib/settings";
import { createPortal } from "react-dom";
import { Trip, updateTrip, parseLocalDate, isValidDateISO } from "@/lib/storage";
import { X } from "lucide-react";
import { useModalFocus } from "@/lib/useModalFocus";

export interface DiaryEntry { date: string; text: string; highlight?: boolean }

interface Props {
  trip: Trip;
  /** Diario CORRENTE (dal chiamante, sempre fresco) — non `trip.diary`, che in
   *  memoria resta stantio dopo un salvataggio finché la pagina non ricarica. */
  entries: DiaryEntry[];
  onClose: () => void;
  /** Chiamato al salvataggio col diario aggiornato, così il biglietto rinfresca il conteggio. */
  onSaved?: (diary: DiaryEntry[]) => void;
}

const MAX_DAYS = 120; // salvagente per "viaggi" lunghissimi (anno all'estero ecc.)

/** Giorni [YYYY-MM-DD] dal range del viaggio (partenza→ritorno, inclusivi). */
function tripDays(trip: Trip): string[] {
  const start = parseLocalDate(trip.trip_date);
  const end = trip.date_end ? parseLocalDate(trip.date_end) : start;
  const days: string[] = [];
  const d = new Date(start);
  while (d <= end && days.length < MAX_DAYS) {
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    d.setDate(d.getDate() + 1);
  }
  return days.length ? days : [trip.trip_date];
}

function dayLabel(iso: string): { day: string; wd: string; mon: string } {
  // Il fallback di tripDays può restituire una trip_date malformata così
  // com'è: senza guardia il riquadro mostrava "NaN Invalid Date".
  if (!isValidDateISO(iso)) return { day: "—", wd: "", mon: "" };
  const d = parseLocalDate(iso);
  return {
    day: String(d.getDate()),
    wd: d.toLocaleDateString(localeAttivo(), { weekday: "short" }).replace(".", ""),
    mon: d.toLocaleDateString(localeAttivo(), { month: "short" }).replace(".", ""),
  };
}

/** Timbro-data della modalità lettura: "GIO · 04 APR". */
function stampLabel(iso: string): string {
  if (!isValidDateISO(iso)) return "—";
  const d = parseLocalDate(iso);
  const wd = d.toLocaleDateString(localeAttivo(), { weekday: "short" }).replace(".", "");
  const mon = d.toLocaleDateString(localeAttivo(), { month: "short" }).replace(".", "");
  return `${wd.toUpperCase()} · ${String(d.getDate()).padStart(2, "0")} ${mon.toUpperCase()}`;
}

/** Intervallo di copertina compatto: "3–10 apr 2024" / "4 apr 2024". */
function coverRange(trip: Trip): string {
  if (!isValidDateISO(trip.trip_date)) return "—";
  const s = parseLocalDate(trip.trip_date);
  const e = trip.date_end && isValidDateISO(trip.date_end) ? parseLocalDate(trip.date_end) : s;
  const mon = (d: Date) => d.toLocaleDateString(localeAttivo(), { month: "short" }).replace(".", "");
  const y = e.getFullYear();
  if (s.getTime() === e.getTime()) return `${s.getDate()} ${mon(s)} ${y}`;
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) return `${s.getDate()}–${e.getDate()} ${mon(e)} ${y}`;
  // A cavallo d'anno serve ANCHE l'anno di partenza: "28 dic – 3 gen 2025"
  // faceva sembrare la partenza del 2025.
  if (s.getFullYear() !== e.getFullYear()) return `${s.getDate()} ${mon(s)} ${s.getFullYear()} – ${e.getDate()} ${mon(e)} ${y}`;
  return `${s.getDate()} ${mon(s)} – ${e.getDate()} ${mon(e)} ${y}`;
}

const MONO = '"JetBrains Mono", monospace';
const BRAND = '"Space Grotesk", system-ui, sans-serif';

/**
 * Diario giorno-per-giorno di un viaggio, in un pannello a schermo intero
 * (portal su body). Un riquadro per ogni giorno del range; si salva alla
 * chiusura (updateTrip) tenendo solo i giorni con testo + eventuali voci di
 * date fuori-range già scritte (non si perde nulla se le date del viaggio
 * cambiano). Scroll della pagina bloccato con il pattern iOS-proof.
 */
export function TripDiary({ trip, entries, onClose, onSaved }: Props) {
  const t = useT();
  // Il pannello dichiara aria-modal: il focus deve restarci dentro e tornare
  // al pulsante "Diario" alla chiusura.
  const modalRef = useModalFocus<HTMLDivElement>();
  const days = useMemo(() => tripDays(trip), [trip]);

  // Giorni totali del range: se superano MAX_DAYS il troncamento va DETTO
  // (prima era silenzioso: un viaggio da 200 giorni ne mostrava 120 e basta).
  const totalDays = useMemo(() => {
    const start = parseLocalDate(trip.trip_date);
    const end = trip.date_end ? parseLocalDate(trip.date_end) : start;
    const d = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    // Data malformata → NaN: il banner "il viaggio ne ha NaN" non deve
    // comparire (1 = nessun troncamento da dichiarare).
    return Number.isFinite(d) ? d : 1;
  }, [trip]);
  const truncated = totalDays > MAX_DAYS;

  // "dirty": l'utente ha scritto qualcosa. Senza, ogni apri-e-chiudi riscriveva
  // il diario identico su localStorage (innocuo ma inutile, e incoerente con
  // TripPlanner che il flag ce l'ha già).
  const dirtyRef = useRef(false);

  // Mappa date→testo iniziale dal diario corrente (prop, sempre fresco).
  const [texts, setTexts] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const e of entries) m[e.date] = e.text;
    return m;
  });

  // Leggi (rileggi il racconto) vs Scrivi (editor). Si apre in lettura se c'è
  // già del testo; se il diario è vuoto parte in scrittura.
  const [mode, setMode] = useState<"read" | "write">(() => entries.some(e => e.text.trim().length > 0) ? "read" : "write");

  // IL momento del viaggio: al più UN giorno marcato con la stella. La frase
  // di quel giorno riemerge nel recap annuale (citazione + slide stories).
  const [highlightDate, setHighlightDate] = useState<string | null>(() => entries.find(e => e.highlight)?.date ?? null);
  const toggleHighlight = (date: string) => {
    dirtyRef.current = true;
    setHighlightDate(prev => (prev === date ? null : date)); // ri-tocco = smarca; altro giorno = sposta
  };

  // Voci scritte (dallo stato `texts`, così la lettura riflette anche ciò che
  // hai appena battuto): solo giorni con testo, in ordine cronologico.
  const readEntries = useMemo(
    () => Object.entries(texts)
      .map(([date, text]) => ({ date, text: text.trim() }))
      .filter(e => e.text.length > 0)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [texts],
  );

  // Voci con testo che NON stanno nei riquadri mostrati, divise in due nature
  // diverse: "oltre il giorno 120" (dentro le date del viaggio, solo tagliate
  // dal salvagente MAX_DAYS — prima finivano sotto l'etichetta sbagliata
  // "fuori dalle date") e le vere orfane (fuori dal range, es. viaggio
  // accorciato dopo). Entrambe restano visibili così non si perde nulla.
  const { beyondCapDates, orphanDates } = useMemo(() => {
    const end = trip.date_end ?? trip.trip_date;
    const missing = entries.map(e => e.date).filter(d => !days.includes(d)).sort();
    return {
      beyondCapDates: missing.filter(d => d >= trip.trip_date && d <= end),
      orphanDates: missing.filter(d => d < trip.trip_date || d > end),
    };
  }, [entries, days, trip]);

  // Blocco scroll pagina sotto (iOS-proof): body fixed + posizione ripristinata.
  useEffect(() => {
    const html = document.documentElement, body = document.body;
    const scrollY = window.scrollY;
    const prev = { htmlO: html.style.overflow, pos: body.style.position, top: body.style.top, w: body.style.width };
    html.style.overflow = "hidden";
    body.style.position = "fixed"; body.style.top = `-${scrollY}px`; body.style.left = "0"; body.style.right = "0"; body.style.width = "100%";
    return () => {
      html.style.overflow = prev.htmlO;
      body.style.position = prev.pos; body.style.top = prev.top; body.style.left = ""; body.style.right = ""; body.style.width = prev.w;
      window.scrollTo(0, scrollY);
    };
  }, []);

  const save = () => {
    if (!dirtyRef.current) return; // niente modifiche: non riscrivere il diario identico
    const diary: DiaryEntry[] = Object.entries(texts)
      .map(([date, text]) => ({ date, text: text.trim() }))
      .filter(e => e.text.length > 0)
      // La stella vive solo su un giorno CON testo: se il giorno marcato è
      // stato svuotato, il filtro sopra l'ha già tolto e il flag decade con lui.
      .map(e => (e.date === highlightDate ? { ...e, highlight: true as const } : e))
      .sort((a, b) => a.date.localeCompare(b.date));
    updateTrip(trip.id, { diary: diary.length ? diary : undefined });
    dirtyRef.current = false;
    onSaved?.(diary);
  };

  const close = () => { save(); onClose(); };

  // Ref sempre aggiornate per i listener/cleanup qui sotto (evitano closure stantie).
  const saveRef = useRef(save); saveRef.current = save;
  const closeRef = useRef(close); closeRef.current = close;

  // Esc chiude (salvando) + salvataggio allo SMONTAGGIO: su mobile il gesto
  // istintivo per uscire da un pannello a schermo intero è il back di
  // Android/lo swipe indietro, che cambia rotta e smonta il componente senza
  // passare dalla X — senza questo cleanup tutto il testo scritto andava perso.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); saveRef.current(); };
  }, []);

  // Auto-grow: la textarea cresce col testo (la maniglia di resize manuale è
  // inutilizzabile su touch). useCallback stabile: gira solo al mount di ogni
  // textarea (per il testo precompilato), NON a ogni render della lista.
  const growRef = useCallback((el: HTMLTextAreaElement | null) => {
    if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
  }, []);
  const autoGrow = (el: HTMLTextAreaElement) => { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; };

  const renderDay = (iso: string) => {
    const { day, wd, mon } = dayLabel(iso);
    return (
      <div key={iso} style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <div style={{ flexShrink: 0, width: 54, textAlign: "center", background: "rgba(96,165,250,0.12)", border: "0.5px solid rgba(96,165,250,0.3)", borderRadius: 8, padding: "7px 0" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#60a5fa", lineHeight: 1 }}>{day}</div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: ".5px", marginTop: 3 }}>{wd} {mon}</div>
        </div>
        <textarea
          ref={growRef}
          value={texts[iso] ?? ""}
          onChange={e => { dirtyRef.current = true; autoGrow(e.target); setTexts(t => ({ ...t, [iso]: e.target.value })); }}
          placeholder={t("Cosa hai fatto questo giorno?")}
          rows={2}
          style={{
            flex: 1, background: "rgba(255,255,255,0.04)", border: "0.5px solid #1a2d4a", borderRadius: 8,
            padding: "8px 10px", fontSize: 13, color: "#f0f4ff", lineHeight: 1.45, outline: "none",
            resize: "none", overflow: "hidden", fontFamily: "inherit", minHeight: 42,
          }}
        />
      </div>
    );
  };

  // Modalità LETTURA — "diario di bordo": copertina + colonna delle tappe
  // (un LED blu per giorno scritto) con timbro-data e testo in monospace.
  const renderRead = () => {
    if (readEntries.length === 0) {
      return (
        <div style={{ textAlign: "center", padding: "56px 16px", color: "rgba(255,255,255,0.55)" }}>
          <div style={{ fontFamily: MONO, fontSize: 13, lineHeight: 1.7 }}>{t("Il diario di bordo è ancora vuoto.")}</div>
          <button type="button" onClick={() => setMode("write")}
            style={{ marginTop: 16, padding: "9px 18px", borderRadius: 999, background: "rgba(96,165,250,0.15)", border: "0.5px solid rgba(96,165,250,0.4)", color: "#93c5fd", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Inizia a scrivere
          </button>
        </div>
      );
    }
    return (
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "4px", color: "rgba(255,255,255,0.6)", textTransform: "uppercase" }}>{t("diario di bordo")}</div>
        <div style={{ color: "#f0f4ff", fontFamily: BRAND, fontSize: 26, fontWeight: 700, lineHeight: 1.1, margin: "9px 0 5px" }}>{trip.title || trip.city}</div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 22 }}>
          {coverRange(trip)} · {readEntries.length} {readEntries.length === 1 ? "giorno scritto" : "giorni scritti"}
        </div>
        <div style={{ position: "relative", paddingLeft: 26, borderLeft: "1px solid rgba(96,165,250,0.22)", marginLeft: 5 }}>
          {readEntries.map((e, i) => {
            const last = i === readEntries.length - 1;
            const marked = e.date === highlightDate;
            return (
              <div key={e.date} style={{ position: "relative", paddingBottom: last ? 0 : 24 }}>
                <div style={{
                  position: "absolute", left: -31, top: 2, width: 11, height: 11, borderRadius: "50%",
                  background: marked ? "#fbbf24" : "#60a5fa",
                  boxShadow: marked ? "0 0 8px 1px rgba(251,191,36,0.8)" : "0 0 8px 1px rgba(96,165,250,0.6)",
                  border: "2px solid #060e1e",
                }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, letterSpacing: "1px", color: "#fbbf24" }}>{stampLabel(e.date)}</span>
                  <button type="button" onClick={() => toggleHighlight(e.date)} aria-pressed={marked}
                    aria-label={marked ? "Rimuovi il momento del viaggio" : "Segna come il momento del viaggio"}
                    title={marked ? "Il momento del viaggio (tocca per rimuovere)" : "Segna come il momento del viaggio"}
                    style={{
                      // padding/corpo generosi: è l'interazione primaria della
                      // feature e su touch 25×17px erano sotto lo standard che
                      // l'app si è già data altrove (maniglie/tap target larghi).
                      background: "none", border: "none", cursor: "pointer", padding: "6px 10px", lineHeight: 1,
                      fontSize: 15, color: marked ? "#fbbf24" : "rgba(255,255,255,0.3)",
                    }}>
                    {marked ? "★" : "☆"}
                  </button>
                  {marked && <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: "1.5px", color: "rgba(251,191,36,0.8)" }}>{t("IL MOMENTO")}</span>}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 13, lineHeight: 1.75, color: "#e6e0d2", marginTop: 7, letterSpacing: ".1px", whiteSpace: "pre-wrap" }}>
                  {e.text}
                  {last && <span style={{ display: "inline-block", width: 8, height: 16, background: "#fbbf24", opacity: 0.7, verticalAlign: -3, marginLeft: 3 }} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return createPortal(
    <div ref={modalRef} role="dialog" aria-modal="true" aria-label={`Diario — ${trip.title || trip.city}`}
      style={{
        position: "fixed", inset: 0, zIndex: 200, background: "#060e1e",
        display: "flex", flexDirection: "column",
      }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
        borderBottom: "0.5px solid rgba(255,255,255,0.1)", background: "rgba(6,14,30,0.95)",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#f0f4ff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            📖 Diario — {trip.title || trip.city}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
            {mode === "read" ? t("Il tuo racconto, giorno per giorno") : t("Scrivi il racconto giorno per giorno · si salva da solo")}
          </div>
        </div>
        <div role="group" aria-label={t("Leggi o scrivi il diario")} style={{ flexShrink: 0, display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: 2 }}>
          {(["read", "write"] as const).map(m => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
              style={{
                fontFamily: MONO, fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                background: mode === m ? "rgba(96,165,250,0.22)" : "transparent",
                color: mode === m ? "#93c5fd" : "rgba(255,255,255,0.5)",
                fontWeight: mode === m ? 500 : 400,
              }}>
              {m === "read" ? "Leggi" : "Scrivi"}
            </button>
          ))}
        </div>
        <button type="button" onClick={close} aria-label={t("Chiudi il diario")}
          style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "0.5px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.8)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <X style={{ width: 18, height: 18 }} />
        </button>
      </div>

      {/* Giorni */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", padding: 16 }}>
        {mode === "read" ? renderRead() : (
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          {days.map(renderDay)}
          {truncated && (
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", margin: "2px 0 14px" }}>
              Mostro i primi {MAX_DAYS} giorni — il viaggio ne ha {totalDays}.
            </div>
          )}
          {beyondCapDates.length > 0 && (
            <>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", letterSpacing: "1.5px", textTransform: "uppercase", margin: "18px 0 10px" }}>
                Giorni scritti oltre il {MAX_DAYS}° (dentro le date del viaggio)
              </div>
              {beyondCapDates.map(renderDay)}
            </>
          )}
          {orphanDates.length > 0 && (
            <>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", letterSpacing: "1.5px", textTransform: "uppercase", margin: "18px 0 10px" }}>
                Altri giorni (fuori dalle date attuali del viaggio)
              </div>
              {orphanDates.map(renderDay)}
            </>
          )}
        </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
