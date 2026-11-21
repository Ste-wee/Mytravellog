/** «Crea video» al lavoro: sotto la mappa salta da un fotogramma all'altro,
 *  quindi la si copre; si vede invece il video che nasce. Spostato da
 *  TripFlyover.tsx senza cambiare il disegno. */
import type { RefObject } from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/settings";
import { stileBottoneVolo } from "./constants";

interface Props {
  /** Avanzamento 0-100. */
  creazione: number;
  /** Il canvas dell'anteprima, su cui disegna la costruzione del video. */
  anteprimaRef: RefObject<HTMLCanvasElement>;
  onAnnulla: () => void;
}

export function CreazioneVideo({ creazione, anteprimaRef, onAnnulla }: Props) {
  const t = useT();
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 40, background: "#060e1e",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24,
    }}>
      <canvas ref={anteprimaRef} width={180} height={320}
        style={{ width: 180, maxWidth: "60%", aspectRatio: "9 / 16", borderRadius: 12, border: "0.5px solid #1a2d4a", background: "#060e1e" }} />
      <div style={{ width: 200, maxWidth: "70%", height: 4, borderRadius: 2, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
        <div style={{ width: `${creazione}%`, height: "100%", background: "#fbbf24", transition: "width 0.2s linear" }} />
      </div>
      <div style={{ color: "#f0f4ff", fontSize: 14, fontWeight: 600 }}>{t("Creo il video… {pct}%", { pct: creazione })}</div>
      <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, textAlign: "center", maxWidth: 260 }}>
        {t("Il video si crea fotogramma per fotogramma: tieni l'app aperta.")}
      </div>
      <button type="button" onClick={onAnnulla} style={stileBottoneVolo}>
        <X className="w-3.5 h-3.5" /> {t("Annulla")}
      </button>
    </div>
  );
}
