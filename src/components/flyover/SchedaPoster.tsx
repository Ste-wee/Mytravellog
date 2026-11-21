/** I dati del viaggio sul poster, in alto a destra. Due stili:
 *  - satellite: vetro navy (font di marca + numeri mono),
 *  - costellazione: DIDASCALIA senza riquadro, serif elegante (Cormorant)
 *    monocromatica, come la caption di una stampa celeste.
 *  Sulla Mappa della vita non c'è (mappa nuda): lo decide chi la usa.
 *  Spostata da TripFlyover.tsx senza cambiare il disegno. */
import type { MapStyleMode } from "./mapStyles";

interface Props {
  styleMode: MapStyleMode;
  posterTitle: string;
  flagCodes: string[];
  dateRangeLabel: string | null;
  /** Valore ed etichetta di ogni statistica (km · tappe, o viaggi · paesi · km). */
  metriche: { v: string; l: string }[];
}

export function SchedaPoster({ styleMode, posterTitle, flagCodes, dateRangeLabel, metriche }: Props) {
  return (styleMode === "constellation" ? (
          <div style={{
            position: "absolute", top: 20, right: 20, zIndex: 25, maxWidth: "72%",
            textAlign: "right", textShadow: "0 1px 5px rgba(0,0,0,0.9)",
            animation: "flyoverCardIn 0.35s cubic-bezier(0.22,1,0.36,1) both",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 9 }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, fontSize: 25, color: "#fff", lineHeight: 1, letterSpacing: 0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {posterTitle}
              </div>
              {flagCodes.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                  {flagCodes.map((c, i) => (
                    <img key={c + i} src={"https://flagcdn.com/w40/" + c + ".png"} alt="" width="22" height="15"
                      style={{ borderRadius: 2, objectFit: "cover", border: "1px solid rgba(255,255,255,0.9)", boxShadow: "0 1px 4px rgba(0,0,0,0.45)", marginLeft: i === 0 ? 0 : -6, position: "relative", zIndex: i }}
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ))}
                </div>
              )}
            </div>
            {dateRangeLabel && (
              <div style={{ fontFamily: "'Noto Serif', serif", fontStyle: "italic", fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 6 }}>{dateRangeLabel}</div>
            )}
            {metriche.length > 0 && (
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 15, color: "rgba(255,255,255,0.9)", marginTop: 8, letterSpacing: 0.5 }}>
                {metriche.map((m, i) => (
                  <span key={m.l}>{i > 0 && <>&nbsp;·&nbsp;</>}<b style={{ fontWeight: 600 }}>{m.v}</b> {m.l}</span>
                ))}
              </div>
            )}
          </div>
        ) : (
        <div style={{
          position: "absolute", top: 16, right: 16, zIndex: 25, maxWidth: "70%",
          background: "rgba(10,22,40,0.92)",
          border: "0.5px solid #1a2d4a", borderRadius: 14,
          padding: "12px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.45)", backdropFilter: "blur(2px)",
          animation: "flyoverCardIn 0.35s cubic-bezier(0.22,1,0.36,1) both",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {flagCodes.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                {flagCodes.map((c, i) => (
                  <img key={c + i} src={"https://flagcdn.com/w40/" + c + ".png"} alt="" width="24" height="17"
                    style={{
                      borderRadius: 3, objectFit: "cover",
                      border: "1.5px solid rgba(255,255,255,0.9)", boxShadow: "0 1px 4px rgba(0,0,0,0.45)",
                      marginLeft: i === 0 ? 0 : -9,
                      transform: `rotate(${(i - (flagCodes.length - 1) / 2) * 7}deg)`,
                      transformOrigin: "bottom center", position: "relative", zIndex: i,
                    }}
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ))}
              </div>
            )}
            <div className="font-display" style={{
              fontSize: 15, fontWeight: 700, color: "#f0f4ff",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {posterTitle}
            </div>
          </div>
          {dateRangeLabel && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>{dateRangeLabel}</div>
          )}
          {metriche.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {metriche.map(s => (
              <div key={s.l} style={{
                background: "rgba(255,255,255,0.06)",
                border: "0.5px solid #1a2d4a",
                borderRadius: 10, padding: "5px 12px", textAlign: "center",
              }}>
                <div className="font-mono" style={{
                  fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.1,
                }}>{s.v}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>
          )}
        </div>
        ));
}
