import { useMemo, useState } from "react";
import { useT } from "@/lib/settings";
import { loadTrips } from "@/lib/storage";
import { X } from "lucide-react";

/** Motivi del viaggio (scelta singola). */
export const PURPOSES = ["Vacanza", "Lavoro"];

interface Props {
  purpose: string | null;
  setPurpose: (p: string | null) => void;
  companions: string[];
  setCompanions: (c: string[]) => void;
}

const box: React.CSSProperties = {
  background: "#0a1628", border: "0.5px solid #1a2d4a", borderRadius: 8, padding: "14px 16px",
};
const label: React.CSSProperties = {
  fontSize: 9, color: "rgba(255,255,255,0.6)", letterSpacing: "1.5px", textTransform: "uppercase",
  display: "block", marginBottom: 9,
};
const smallInput: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)", border: "0.5px solid #1a2d4a", borderRadius: 8,
  padding: "8px 12px", color: "#f0f4ff", fontSize: 13, outline: "none", width: "100%",
};

/**
 * Blocco "Motivo + Compagni" del form viaggio: il MOTIVO è a scelta singola
 * (Vacanza/Lavoro, ri-toccare deseleziona → nessuno); i COMPAGNI sono nomi con
 * autocomplete dai viaggi già salvati. Componente controllato: lo stato vive
 * nel form. Standalone di proposito (TripFormParts è FROZEN).
 */
export function TripPurposeCompanions({ purpose, setPurpose, companions, setCompanions }: Props) {
  const t = useT();
  const [nameInput, setNameInput] = useState("");
  // Suggerimento evidenziato da tastiera (-1 = nessuno) e chiusura con Esc.
  // I bottoni dei suggerimenti usano onMouseDown (per battere il blur), che
  // Enter/Spazio non attivano: senza le frecce la lista era solo-mouse.
  const [hi, setHi] = useState(-1);
  const [hideSug, setHideSug] = useState(false);

  // Autocomplete compagni: nomi già usati negli altri viaggi (dedup).
  const knownNames = useMemo(() => {
    const set = new Set<string>();
    for (const tr of loadTrips()) for (const c of tr.companions ?? []) set.add(c);
    return Array.from(set);
  }, []);

  const addName = (raw: string) => {
    const v = raw.trim();
    if (v && !companions.some(c => c.toLowerCase() === v.toLowerCase())) setCompanions([...companions, v]);
    setNameInput("");
  };

  const suggestions = nameInput.trim() && !hideSug
    ? knownNames.filter(n =>
        n.toLowerCase().includes(nameInput.trim().toLowerCase()) &&
        !companions.some(c => c.toLowerCase() === n.toLowerCase()),
      ).slice(0, 5)
    : [];
  // La lista può accorciarsi mentre si digita: l'indice va riagganciato.
  const hiEff = hi >= 0 && hi < suggestions.length ? hi : -1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Motivo — segmented a scelta singola */}
      <div style={box}>
        <label style={label}>Motivo <span style={{ opacity: 0.4, textTransform: "none" }}>(opzionale)</span></label>
        <div style={{ display: "inline-flex", background: "rgba(255,255,255,0.04)", border: "0.5px solid #1a2d4a", borderRadius: 999, padding: 3, gap: 3 }}>
          {PURPOSES.map(p => {
            const on = purpose === p;
            return (
              <button key={p} type="button" aria-pressed={on}
                onClick={() => setPurpose(on ? null : p)}
                style={{
                  fontSize: 12, fontWeight: 600, padding: "6px 18px", borderRadius: 999, cursor: "pointer",
                  border: "none",
                  background: on ? "rgba(96,165,250,0.18)" : "transparent",
                  color: on ? "#60a5fa" : "rgba(255,255,255,0.55)",
                }}>
                {p}
              </button>
            );
          })}
        </div>
      </div>

      {/* Compagni di viaggio */}
      <div style={box}>
        <label style={label}>{t("Compagni di viaggio")} <span style={{ opacity: 0.4, textTransform: "none" }}>{t("(opzionale)")}</span></label>
        {companions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 10 }}>
            {companions.map(c => (
              <span key={c} style={{
                display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
                padding: "6px 8px 6px 12px", borderRadius: 999,
                background: "rgba(52,211,153,0.14)", border: "0.5px solid rgba(52,211,153,0.5)", color: "#6ee7b7",
              }}>
                {c}
                <button type="button" onClick={() => setCompanions(companions.filter(x => x !== c))}
                  aria-label={`Rimuovi ${c}`}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", display: "flex", opacity: 0.7 }}>
                  <X style={{ width: 12, height: 12 }} />
                </button>
              </span>
            ))}
          </div>
        )}
        {/* Il campo e il suo "+": aggiungere un compagno era possibile SOLO
            premendo Invio, e il placeholder che lo diceva sparisce appena si
            digita — nessun modo visibile di confermare, tanto che sembrava si
            potesse inserire una persona sola. */}
        <div style={{ position: "relative" }}>
        <input
          value={nameInput}
          onChange={e => { setNameInput(e.target.value); setHideSug(false); setHi(-1); }}
          role="combobox" aria-expanded={suggestions.length > 0} aria-autocomplete="list"
          aria-controls="companion-suggestions"
          enterKeyHint="done"
          onKeyDown={e => {
            // Combobox da tastiera: il focus resta sull'input (spostarlo sui
            // bottoni farebbe scattare il blur che committa il testo parziale).
            if (e.key === "ArrowDown" && suggestions.length) {
              e.preventDefault(); setHi((hiEff + 1) % suggestions.length);
            } else if (e.key === "ArrowUp" && suggestions.length) {
              e.preventDefault(); setHi((hiEff - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === "Escape" && suggestions.length) {
              e.preventDefault(); setHideSug(true); setHi(-1);
            } else if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addName(hiEff >= 0 ? suggestions[hiEff] : nameInput);
              setHi(-1);
            }
          }}
          onBlur={() => addName(nameInput)}
          placeholder={t("Aggiungi un nome…")}
          style={{ ...smallInput, paddingRight: 46 }}
        />
        {/* onMouseDown+preventDefault: senza, il tocco sul + toglie prima il
            focus all'input (e la tastiera del telefono si chiude). Così il
            focus resta dov'è e si può incatenare il nome successivo. */}
        <button type="button" aria-label={t("Aggiungi il compagno")}
          disabled={!nameInput.trim()}
          onMouseDown={e => e.preventDefault()}
          onClick={() => { addName(nameInput); setHi(-1); }}
          style={{
            position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)",
            width: 30, height: 30, borderRadius: 8, lineHeight: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 600, fontFamily: "inherit",
            background: nameInput.trim() ? "rgba(96,165,250,0.18)" : "transparent",
            border: `1px solid ${nameInput.trim() ? "rgba(96,165,250,0.5)" : "#16263f"}`,
            color: nameInput.trim() ? "#60a5fa" : "rgba(255,255,255,0.2)",
            cursor: nameInput.trim() ? "pointer" : "default",
          }}>
          +
        </button>
        </div>
        {/* Riga d'aiuto PERSISTENTE: il placeholder sparisce proprio quando
            servirebbe, cioè mentre si scrive il nome. */}
        <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)", marginTop: 5 }}>
          Tocca + o premi Invio per aggiungere
        </div>
        {suggestions.length > 0 && (
          <div id="companion-suggestions" role="listbox"
            style={{ marginTop: 6, background: "#0b1524", border: "0.5px solid #1a2d4a", borderRadius: 8, overflow: "hidden" }}>
            {suggestions.map((n, i) => (
              <button key={n} type="button" role="option" aria-selected={i === hiEff}
                // onMouseDown (non onClick): parte PRIMA del blur dell'input.
                onMouseDown={e => { e.preventDefault(); addName(n); }}
                onMouseEnter={() => setHi(i)}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "8px 12px",
                  fontSize: 12, cursor: "pointer", border: "none",
                  color: i === hiEff ? "#60a5fa" : "rgba(255,255,255,0.8)",
                  background: i === hiEff ? "rgba(96,165,250,0.12)" : "none",
                }}>
                {n} <span style={{ opacity: 0.4 }}>· già usato</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
