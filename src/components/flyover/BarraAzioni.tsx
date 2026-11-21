/** I bottoni in basso a destra del poster: anteprima e stampa (Mappa della
 *  vita, da computer), Esporta SVG (Costellazione), Salva (viaggio singolo),
 *  Condividi. Spostati da TripFlyover.tsx senza cambiare il disegno. */
import type { CSSProperties } from "react";
import { Download, Loader2, Printer, RotateCcw, Share2, X } from "lucide-react";
import { useT } from "@/lib/settings";
import type { MapStyleMode } from "./mapStyles";

interface Props {
  lifeMap: boolean;
  tripsCount: number;
  styleMode: MapStyleMode;
  velo: CSSProperties;
  /** Anteprima di stampa: aperta? qualche riquadro regolato a mano? */
  anteprima: boolean;
  setAnteprima: (v: boolean) => void;
  regolati: boolean;
  onRimetti: () => void;
  /** «Per la stampa»: avanzamento (null = ferma) ed esito. */
  stampa: number | null;
  stampaFallita: boolean;
  onStampa: () => Promise<void>;
  exportingSvg: boolean;
  onEsportaSvg: () => void;
  savingRelief: boolean;
  onSalva: () => void;
  onCondividi: () => void;
}

export function BarraAzioni({ lifeMap, tripsCount, styleMode, velo, anteprima, setAnteprima, regolati, onRimetti,
  stampa, stampaFallita, onStampa, exportingSvg, onEsportaSvg, savingRelief, onSalva, onCondividi }: Props) {
  const t = useT();
  return (
      <div style={{ position: "absolute", right: 16, bottom: 20, zIndex: 26, display: "flex", gap: 10, ...velo }}>
        {lifeMap && anteprima && (
          <span style={{ alignSelf: "center", fontSize: 11, color: "rgba(255,255,255,0.6)", textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>
            {t("Clicca un riquadro per spostarlo o tirarne i bordi")}
          </span>
        )}
        {lifeMap && anteprima && regolati && (
          <button onClick={onRimetti} disabled={stampa !== null}
            style={{
              display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
              cursor: stampa !== null ? "default" : "pointer",
              padding: "8px 16px", borderRadius: 999, background: "rgba(255,255,255,0.08)",
              border: "0.5px solid rgba(255,255,255,0.35)", color: "rgba(255,255,255,0.85)",
            }}>
            <RotateCcw className="w-3.5 h-3.5" /> {t("Rimetti com'era")}
          </button>
        )}
        {lifeMap && window.innerWidth >= 768 && anteprima && (
          <button onClick={() => setAnteprima(false)} disabled={stampa !== null}
            style={{
              display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
              cursor: stampa !== null ? "default" : "pointer",
              padding: "8px 16px", borderRadius: 999, background: "rgba(255,255,255,0.08)",
              border: "0.5px solid rgba(255,255,255,0.35)", color: "rgba(255,255,255,0.85)",
            }}>
            <X className="w-3.5 h-3.5" /> {t("Esci dall'anteprima")}
          </button>
        )}
        {lifeMap && window.innerWidth >= 768 && (
          <button onClick={() => { if (anteprima) void onStampa(); else setAnteprima(true); }} disabled={stampa !== null}
            style={{
              display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
              cursor: stampa !== null ? "default" : "pointer",
              padding: "8px 16px", borderRadius: 999, background: "rgba(255,255,255,0.08)",
              border: "0.5px solid rgba(255,255,255,0.35)", color: "rgba(255,255,255,0.85)",
            }}>
            {stampa !== null ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
            {stampa !== null ? t("Preparo la stampa… {pct}%", { pct: stampa })
              : stampaFallita ? t("Stampa non riuscita: riprova")
              : anteprima ? t("Scarica per la stampa") : t("Per la stampa")}
          </button>
        )}
        {styleMode === "constellation" && !anteprima && (
          <button onClick={onEsportaSvg} disabled={exportingSvg}
            style={{
              display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
              cursor: exportingSvg ? "default" : "pointer",
              padding: "8px 16px", borderRadius: 999, background: "rgba(255,255,255,0.08)",
              border: "0.5px solid rgba(255,255,255,0.35)", color: "rgba(255,255,255,0.85)",
            }}>
            <Download className="w-3.5 h-3.5" /> {exportingSvg ? t("Esporto…") : t("Esporta SVG")}
          </button>
        )}
        {tripsCount === 1 && !lifeMap && (
          <button onClick={onSalva} disabled={savingRelief}
            style={{
              padding: "8px 16px", borderRadius: 999, background: "rgba(96,165,250,0.15)",
              border: "1px solid #60a5fa", color: "#60a5fa", fontSize: 12, fontWeight: 600,
              cursor: savingRelief ? "default" : "pointer",
            }}>
            {savingRelief ? t("Salvo…") : t("Salva")}
          </button>
        )}
        {!anteprima && <button onClick={onCondividi}
          style={{
            display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
            padding: "8px 16px", borderRadius: 999,
            background: (tripsCount === 1 && !lifeMap) ? "rgba(10,22,40,0.85)" : "rgba(96,165,250,0.15)",
            border: (tripsCount === 1 && !lifeMap) ? "0.5px solid #1a2d4a" : "1px solid #60a5fa",
            color: (tripsCount === 1 && !lifeMap) ? "rgba(255,255,255,0.8)" : "#60a5fa",
          }}>
          <Share2 className="w-3.5 h-3.5" /> {t("Condividi")}
        </button>}
      </div>
  );
}
