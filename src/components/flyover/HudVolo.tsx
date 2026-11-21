/** IL VOLO: in alto il contatore dei km, in basso Pausa/Riprendi e Salta, e il
 *  titolo d'apertura. Il contatore si aggiorna dal loop via ref (60 volte al
 *  secondo: niente stato React, che ridisegnerebbe tutto). Spostato da
 *  TripFlyover.tsx senza cambiare il disegno. */
import type { RefObject } from "react";
import { Pause, Play, SkipForward } from "lucide-react";
import { useT } from "@/lib/settings";
import { stileBottoneVolo } from "./constants";

interface Props {
  contatoreRef: RefObject<HTMLSpanElement>;
  /** Il testo del contatore al momento del render (poi lo aggiorna il loop). */
  contatore: string;
  titoloVisibile: boolean;
  posterTitle: string;
  dateRangeLabel: string | null;
  volo: string;
  onPausa: () => void;
  onRiprendi: () => void;
  onSalta: () => void;
}

export function HudVolo({ contatoreRef, contatore, titoloVisibile, posterTitle, dateRangeLabel, volo, onPausa, onRiprendi, onSalta }: Props) {
  const t = useT();
  return (
    <>
      <div style={{
        position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 30,
        background: "rgba(10,22,40,0.85)", borderRadius: 999, padding: "6px 14px",
        fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13, fontWeight: 600, color: "#fff",
        whiteSpace: "nowrap", pointerEvents: "none",
      }}>
        <span ref={contatoreRef}>{contatore}</span>
      </div>
      {/* Il titolo d'apertura: nome del viaggio e date sul decollo, poi
          sfuma (lo stesso riquadro è disegnato nel video). */}
      <div style={{
        position: "absolute", left: 16, right: 16, bottom: 76, zIndex: 29, display: "flex", justifyContent: "center",
        pointerEvents: "none", opacity: titoloVisibile ? 1 : 0, transition: "opacity 500ms ease",
      }}>
        <div style={{
          background: "rgba(10,22,40,0.88)", border: "0.5px solid #1a2d4a", borderRadius: 14,
          padding: "9px 16px", textAlign: "center", maxWidth: "100%",
        }}>
          <div className="font-display" style={{ fontSize: 20, fontWeight: 700, color: "#f0f4ff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {posterTitle}
          </div>
          {dateRangeLabel && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{dateRangeLabel}</div>}
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 20, zIndex: 30, display: "flex", justifyContent: "center", gap: 10 }}>
        {volo === "onPausa" ? (
          <button type="button" onClick={onRiprendi} style={stileBottoneVolo}>
            <Play className="w-3.5 h-3.5" /> {t("Riprendi")}
          </button>
        ) : (
          <button type="button" onClick={onPausa} style={stileBottoneVolo}>
            <Pause className="w-3.5 h-3.5" /> {t("Pausa")}
          </button>
        )}
        <button type="button" onClick={onSalta} style={stileBottoneVolo}>
          {t("Salta")} <SkipForward className="w-3.5 h-3.5" />
        </button>
      </div>
    </>
  );
}
