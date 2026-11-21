/**
 * Mappa della vita: nomi, fili e riquadri sopra la mappa (lib/etichetteMappa).
 * Sopra la mappa e sotto i comandi; spariscono mentre la mappa si muove (la
 * disposizione vale per una vista ferma). In anteprima di stampa i riquadri si
 * prendono col mouse: `onTrascina` (sposta, o tira un bordo/angolo).
 * Spostato da TripFlyover.tsx senza cambiare il disegno.
 */
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Riquadro } from "@/lib/etichetteMappa";
import { ALONE_NOMI, ATTENUATE, BOLLINO, FILO_NOME, FONT_NOMI } from "./constants";
import type { MapStyleMode } from "./mapStyles";
import type { Cornice, NomiMappa, Trascinamento } from "./tipi";

interface Props {
  nomi: NomiMappa;
  /** In anteprima di stampa (con la sua cornice 4:3). */
  anteprima: boolean;
  cornice: Cornice | null;
  /** False mentre la mappa si muove. */
  nomiFermi: boolean;
  styleMode: MapStyleMode;
  /** Il riquadro scelto (le maniglie) e quello che si sta trascinando. */
  scelto: string | null;
  trascina: Trascinamento | null;
  onTrascina: (r: Riquadro, modo: string, e: ReactPointerEvent) => void;
}

export function OverlayNomi({ nomi, anteprima, cornice, nomiFermi, styleMode, scelto, trascina, onTrascina }: Props) {
  return (
    <div aria-hidden style={{
      position: "absolute", zIndex: 20, pointerEvents: "none",
      ...(anteprima && cornice ? { left: cornice.x, top: cornice.y } : { left: 0, top: 0 }),
      opacity: nomiFermi ? 1 : 0, transition: nomiFermi ? "opacity 200ms ease" : "none",
    }}>
      {/* il foglio su cui è fatta la disposizione: lo schermo (scala 1) o, in
          anteprima di stampa, il foglio 1200×900 rimpicciolito nella cornice */}
      <div style={{ position: "relative", width: nomi.w, height: nomi.h, transform: `scale(${nomi.scala})`, transformOrigin: "0 0" }}>
      <svg width={nomi.w} height={nomi.h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        {nomi.d.riquadri.map(r => (
          <g key={`z${r.numero}`}>
            <rect x={r.zona.x} y={r.zona.y} width={r.zona.w} height={r.zona.h} rx={3}
              fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={1} strokeDasharray="3 3" />
            <line x1={r.filo.x1} y1={r.filo.y1} x2={r.filo.x2} y2={r.filo.y2} stroke="rgba(255,255,255,0.5)" strokeWidth={0.9} />
            <circle cx={r.numeroZona.x + r.numeroZona.w / 2} cy={r.numeroZona.y + r.numeroZona.h / 2} r={r.numeroZona.w / 2} fill={BOLLINO.fondo} stroke="#fff" strokeWidth={1} />
            <text x={r.numeroZona.x + r.numeroZona.w / 2} y={r.numeroZona.y + r.numeroZona.h / 2} dy="0.35em" textAnchor="middle" fill="#fff" fontSize={BOLLINO.font} fontFamily="Georgia, serif">{r.numero}</text>
          </g>
        ))}
        {nomi.d.conFilo.map(e => (
          <g key={`f${e.id}`}>
            <line x1={e.filo.x1} y1={e.filo.y1} x2={e.filo.x2} y2={e.filo.y2} stroke={FILO_NOME.colore} strokeWidth={FILO_NOME.spessore}
              strokeDasharray={FILO_NOME.tratteggio.join(" ")} strokeLinecap="round" />
            <circle cx={e.filo.x2} cy={e.filo.y2} r={FILO_NOME.puntino} fill="#fff" />
          </g>
        ))}
        {[...nomi.d.accanto, ...nomi.d.conFilo].map(e => (
          <text key={`n${e.id}`} x={e.testo.x} y={e.testo.y} textAnchor={e.testo.allinea} style={ALONE_NOMI}
            fill="#fff" fontSize={nomi.corpo} fontStyle="italic" fontFamily={FONT_NOMI.famiglia}>{e.nome}</text>
        ))}
      </svg>
      {nomi.d.riquadri.map(r => (
        <div key={`r${r.numero}`} data-riquadro={anteprima ? "" : undefined}
          onPointerDown={anteprima ? e => onTrascina(r, "sposta", e) : undefined}
          style={{
          position: "absolute", left: r.posto.x, top: r.posto.y, width: r.posto.w, height: r.posto.h,
          borderStyle: "solid", borderWidth: r.chiave === scelto && anteprima ? 2 / nomi.scala : 1,
          borderColor: r.chiave === scelto && anteprima ? "#60a5fa" : "rgba(255,255,255,0.8)",
          borderRadius: 6, overflow: "hidden",
          background: "#000", boxShadow: "0 6px 18px rgba(0,0,0,0.6)",
          ...(anteprima ? { pointerEvents: "auto", cursor: "move", touchAction: "none" } : {}),
        }}>
          {nomi.url[r.numero]
            ? <img src={nomi.url[r.numero]} alt="" style={{ width: "100%", height: "100%", display: "block" }} />
            // la foto non è ancora arrivata (in Satellite anche qualche
            // secondo): intanto le stelle, come nell'immagine condivisa,
            // invece di un rettangolo nero coi soli nomi
            : <svg width={r.posto.w} height={r.posto.h} style={{ display: "block" }}>
                {r.altre.map((s, i) => (
                  <circle key={`a${i}`} cx={s.x - r.posto.x} cy={s.y - r.posto.y} r={3 * ATTENUATE.misura}
                    fill={styleMode === "satellite" ? "#fbbf24" : "#fff"} fillOpacity={ATTENUATE.opacita} />
                ))}
                {r.stelle.map(s => (
                  <g key={s.id} fill={styleMode === "satellite" ? "#fbbf24" : "#fff"}>
                    <circle cx={s.x - r.posto.x} cy={s.y - r.posto.y} r={6} fillOpacity={0.25} />
                    <circle cx={s.x - r.posto.x} cy={s.y - r.posto.y} r={2.5} />
                  </g>
                ))}
              </svg>}
        </div>
      ))}
      <svg width={nomi.w} height={nomi.h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        {nomi.d.riquadri.map(r => (
          <g key={r.numero}>
            <circle cx={r.posto.x + BOLLINO.angolo} cy={r.posto.y + BOLLINO.angolo} r={BOLLINO.raggio} fill={BOLLINO.fondo} stroke="#fff" strokeWidth={1} />
            <text x={r.posto.x + BOLLINO.angolo} y={r.posto.y + BOLLINO.angolo} dy="0.35em" textAnchor="middle" fill="#fff" fontSize={BOLLINO.font} fontFamily="Georgia, serif">{r.numero}</text>
            {r.conFilo.map(e => (
              <g key={`f${e.id}`}>
            <line x1={e.filo.x1} y1={e.filo.y1} x2={e.filo.x2} y2={e.filo.y2} stroke={FILO_NOME.colore} strokeWidth={FILO_NOME.spessore}
              strokeDasharray={FILO_NOME.tratteggio.join(" ")} strokeLinecap="round" />
            <circle cx={e.filo.x2} cy={e.filo.y2} r={FILO_NOME.puntino} fill="#fff" />
          </g>
            ))}
            {[...r.nomi, ...r.conFilo].map(e => (
              <text key={e.id} x={e.testo.x} y={e.testo.y} textAnchor={e.testo.allinea} style={ALONE_NOMI}
                fill="#fff" fontSize={nomi.corpo} fontStyle="italic" fontFamily={FONT_NOMI.famiglia}>{e.nome}</text>
            ))}
          </g>
        ))}
      </svg>
      {anteprima && nomi.d.riquadri.filter(r => r.chiave === scelto).map(r => {
        const m = 10 / nomi.scala;   // ~10 px a schermo
        const b = trascina?.chiave === r.chiave ? trascina.box : r.posto;
        const maniglie: [string, number, number, string][] = [
          ["nw", b.x, b.y, "nwse-resize"], ["n", b.x + b.w / 2, b.y, "ns-resize"], ["ne", b.x + b.w, b.y, "nesw-resize"],
          ["w", b.x, b.y + b.h / 2, "ew-resize"], ["e", b.x + b.w, b.y + b.h / 2, "ew-resize"],
          ["sw", b.x, b.y + b.h, "nesw-resize"], ["s", b.x + b.w / 2, b.y + b.h, "ns-resize"], ["se", b.x + b.w, b.y + b.h, "nwse-resize"],
        ];
        return maniglie.map(([modo, x, y, cursore]) => (
          <div key={`m${r.chiave}${modo}`} data-riquadro="" onPointerDown={e => onTrascina(r, modo, e)}
            style={{
              position: "absolute", left: x - m / 2, top: y - m / 2, width: m, height: m, borderRadius: m / 5,
              background: "#60a5fa", border: `${1 / nomi.scala}px solid #fff`, cursor: cursore,
              pointerEvents: "auto", touchAction: "none",
            }} />
        ));
      })}
      {trascina && (
        <div style={{
          position: "absolute", left: trascina.box.x, top: trascina.box.y, width: trascina.box.w, height: trascina.box.h,
          border: `${2 / nomi.scala}px dashed #60a5fa`, borderRadius: 6, background: "rgba(96,165,250,0.12)", pointerEvents: "none",
        }} />
      )}
      </div>
    </div>
  );
}
