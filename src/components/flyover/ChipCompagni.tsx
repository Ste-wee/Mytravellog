/** CON CHI — la costellazione dei viaggi fatti con una persona: una riga di
 *  chip col conteggio, che scorre di lato (con dieci persone non deve mangiare
 *  la mappa su un telefono). Spostati da TripFlyover.tsx senza cambiare il
 *  disegno. */
import type { CSSProperties } from "react";
import { useT } from "@/lib/settings";

interface Props {
  compagni: { nome: string; quanti: number }[];
  /** La persona scelta, o null per tutti. */
  soloCon: string | null;
  setSoloCon: (nome: string | null) => void;
  /** Quanti viaggi in tutto (il chip «Tutti»). */
  totale: number;
  /** Lo stile del riposo dei comandi (vedi TripFlyover). */
  velo: CSSProperties;
}

export function ChipCompagni({ compagni, soloCon, setSoloCon, totale, velo }: Props) {
  const t = useT();
  return (
    // ⚠️ Riga PROPRIA sopra le azioni, non in basso a sinistra: a
    // 390px i chip finivano SOTTO «Esporta SVG / Ritaglia / Condividi»
    // — illeggibili e non toccabili (il collaudo dal vivo è andato in
    // timeout proprio su questo). Visto solo guardando lo screenshot
    // mobile: a 900px sembrava a posto.
    <div style={{ position: "absolute", left: 16, right: 16, bottom: 66, zIndex: 26,
      display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, ...velo }}>
      <button type="button" onClick={() => setSoloCon(null)} aria-pressed={soloCon === null}
        style={{
          flexShrink: 0, fontSize: 11, fontWeight: soloCon === null ? 700 : 500, cursor: "pointer",
          padding: "6px 12px", borderRadius: 999, fontFamily: "inherit",
          background: soloCon === null ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.06)",
          border: soloCon === null ? "1px solid #60a5fa" : "0.5px solid rgba(255,255,255,0.25)",
          color: soloCon === null ? "#93c5fd" : "rgba(255,255,255,0.6)",
        }}>
        {t("Tutti")} {totale}
      </button>
      {compagni.map(c => {
        const attivo = soloCon?.toLowerCase() === c.nome.toLowerCase();
        return (
          <button key={c.nome} type="button" aria-pressed={attivo}
            onClick={() => setSoloCon(attivo ? null : c.nome)}
            style={{
              flexShrink: 0, fontSize: 11, fontWeight: attivo ? 700 : 500, cursor: "pointer",
              padding: "6px 12px", borderRadius: 999, fontFamily: "inherit",
              background: attivo ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.06)",
              border: attivo ? "1px solid #60a5fa" : "0.5px solid rgba(255,255,255,0.25)",
              color: attivo ? "#93c5fd" : "rgba(255,255,255,0.6)",
            }}>
            {c.nome} {c.quanti}
          </button>
        );
      })}
    </div>
  );
}
