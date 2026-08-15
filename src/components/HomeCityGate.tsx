import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, Loader2, Home } from "lucide-react";
import { searchPlaces, GeoResult } from "@/lib/geo";
import { useSettings } from "@/lib/settings";
import { adoptHomeForTripsWithout, countTripsWithoutHome } from "@/lib/storage";
import { useModalFocus } from "@/lib/useModalFocus";
import { shouldShowWelcome } from "@/components/WelcomeGate";

/**
 * Chiede la città di partenza, e non si passa finché non c'è.
 *
 * Perché bloccante: tutta l'app è costruita sull'idea che un viaggio parta da
 * un posto — le distanze, il "più lontano da casa", i raggi del globo e dei
 * poster. Un viaggio senza partenza non produce nessuna tratta e sparisce da
 * globo, poster dell'anno e mappa della vita, senza che l'utente capisca
 * perché. Prima la città era solo suggerita (un link nella Home, visibile
 * peraltro soltanto con zero viaggi) e si poteva ignorare per sempre.
 *
 * Copre da solo i due casi, perché la regola è una sola — manca la città:
 * il primo avvio (dopo il benvenuto) e chi usa l'app da prima, che in più si
 * vede sistemare i viaggi rimasti orfani.
 */
export function HomeCityGate() {
  const { homeCity, setHomeCity } = useSettings();
  // Aspetta che il benvenuto sia archiviato: al primo avvio lo coprirebbe
  // (questo gate sta più in alto) e il benvenuto non si vedrebbe affatto.
  // Stesso meccanismo del tutorial: stato iniziale + evento di congedo.
  const [welcomeGone, setWelcomeGone] = useState(() => !shouldShowWelcome());
  useEffect(() => {
    const onDismiss = () => setWelcomeGone(true);
    window.addEventListener("navta:welcome-dismissed", onDismiss);
    return () => window.removeEventListener("navta:welcome-dismissed", onDismiss);
  }, []);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  // Contato una volta all'apertura: dopo l'adozione tornerebbe zero e il
  // messaggio cambierebbe sotto gli occhi mentre si sceglie la città.
  const [orfani] = useState(() => (homeCity ? 0 : countTripsWithoutHome()));
  const attivo = !homeCity && welcomeGone;
  const modalRef = useModalFocus<HTMLDivElement>(attivo);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ricerca con attesa, e guardia contro le risposte fuori ordine: la lenta
  // di ieri non deve sovrascrivere la veloce di adesso.
  useEffect(() => {
    if (!attivo) return;
    const q = query.trim();
    if (q.length < 2) { setResults([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchPlaces(q);
      if (cancelled) return;
      setResults(r);
      setLoading(false);
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, attivo]);

  if (!attivo) return null;

  const scegli = (r: GeoResult) => {
    const label = r.country ? `${r.name}, ${r.country}` : r.name;
    setHomeCity({ label, lat: r.latitude, lon: r.longitude });
    // I viaggi salvati senza partenza la ereditano e tornano sulle mappe.
    adoptHomeForTripsWithout({ lat: r.latitude, lon: r.longitude, label });
  };

  return createPortal(
    <div ref={modalRef} role="dialog" aria-modal="true" aria-label="Da dove parti?"
      style={{
        position: "fixed", inset: 0, zIndex: 300, background: "#060e1e",
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "24px 22px", overflowY: "auto",
      }}>
      <div style={{ width: "100%", maxWidth: 380, margin: "0 auto" }}>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <div style={{ width: 52, height: 52, borderRadius: 15, background: "rgba(96,165,250,0.16)",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Home style={{ width: 24, height: 24, color: "#60a5fa" }} />
          </div>
        </div>

        {orfani > 0 && (
          <div style={{ fontSize: 11, letterSpacing: "1.5px", fontWeight: 600, color: "#fbbf24", textAlign: "center" }}>
            MANCA UNA COSA
          </div>
        )}
        <h1 className="font-display" style={{ fontSize: 22, fontWeight: 700, color: "#f0f4ff", textAlign: "center", marginTop: 8 }}>
          Da dove parti?
        </h1>
        <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "rgba(255,255,255,0.6)", textAlign: "center", marginTop: 10 }}>
          {orfani > 0 ? (
            <>Non l'hai mai indicata, così <b style={{ color: "#f0f4ff", fontWeight: 600 }}>
              {orfani} {orfani === 1 ? "viaggio" : "viaggi"}</b> non {orfani === 1 ? "compare" : "compaiono"} sul
              globo né sui poster: senza un punto di partenza non si può disegnare la linea.</>
          ) : (
            <>Ogni viaggio parte da casa: da qui nascono le linee del globo e i tuoi poster.</>
          )}
        </p>

        <div style={{ marginTop: 20, background: "rgba(255,255,255,0.05)", border: "0.5px solid #1a2d4a",
          borderRadius: 10, padding: "9px 13px", display: "flex", alignItems: "center", gap: 8 }}>
          <Search style={{ width: 15, height: 15, color: "rgba(255,255,255,0.5)", flexShrink: 0 }} />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="La tua città…" aria-label="Cerca la tua città di partenza"
            style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none",
              color: "#f0f4ff", fontSize: 13 }} />
          {loading && <Loader2 className="w-4 h-4 animate-spin" style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }} />}
        </div>

        {results.length > 0 && (
          <div role="listbox" aria-label="Città trovate"
            style={{ marginTop: 6, border: "0.5px solid #1a2d4a", borderRadius: 10, overflow: "hidden" }}>
            {results.map((r, i) => (
              <button key={`${r.name}-${r.latitude}-${r.longitude}-${i}`} type="button" role="option"
                aria-selected={false} onClick={() => scegli(r)}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 13px",
                  background: "none", border: "none", cursor: "pointer", fontSize: 12.5, color: "#f0f4ff" }}>
                {r.name} <span style={{ color: "rgba(255,255,255,0.5)" }}>· {r.country}</span>
              </button>
            ))}
          </div>
        )}

        {query.trim().length >= 2 && !loading && results.length === 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.6)", textAlign: "center" }}>
            Nessuna città trovata. Prova con un nome più semplice.
          </div>
        )}

        {orfani > 0 && (
          <div style={{ marginTop: 20, background: "rgba(52,211,153,0.10)", border: "0.5px solid rgba(52,211,153,0.3)",
            borderRadius: 10, padding: "10px 12px", fontSize: 11.5, color: "#6ee7b7", lineHeight: 1.5 }}>
            I viaggi già salvati senza partenza la erediteranno, e torneranno sulle mappe.
          </div>
        )}

        <div style={{ marginTop: 16, fontSize: 11, color: "rgba(255,255,255,0.45)", textAlign: "center" }}>
          Si cambia quando vuoi dalle impostazioni.
        </div>
      </div>
    </div>,
    document.body,
  );
}
