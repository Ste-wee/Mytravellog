/**
 * Mappa della vita: il TITOLO in alto a destra (lib/titoloVita), che resta
 * anche a riposo e coi comandi accesi si tocca per scriverlo, e «By 🐻» in
 * basso a destra, che coi comandi accesi lascia il posto ai bottoni (scelte di
 * Stefano, 2026-10-16). Le stesse misure dell'immagine condivisa: a riposo lo
 * schermo È il poster. In anteprima di stampa: sul foglio 1200×900.
 * Spostato da TripFlyover.tsx senza cambiare il disegno.
 */
import { useRef, type CSSProperties } from "react";
import { useT } from "@/lib/settings";
import { geometriaTitoloVita, TITOLO_VITA } from "@/lib/titoloVita";
import { BORDI_STAMPA, STAMPA } from "./constants";
import type { Cornice } from "./tipi";

interface Props {
  titoloVita: string;
  /** Il titolo scritto (già pulito e accorciato): lo salva chi usa il componente. */
  onTitolo: (titolo: string) => void;
  scriviTitolo: boolean;
  setScriviTitolo: (v: boolean) => void;
  /** In anteprima di stampa: la cornice 4:3; altrimenti null. */
  cornice: Cornice | null;
  /** La misura della mappa a schermo (fuori dall'anteprima). */
  larghezza: number;
  altezza: number;
  comandiVisibili: boolean;
  /** Lo stile del riposo dei comandi (vedi TripFlyover). */
  velo: CSSProperties;
  misuraTesto: (testo: string, font: string) => number;
}

export function TitoloFirmaVita({ titoloVita, onTitolo, scriviTitolo, setScriviTitolo, cornice, larghezza, altezza, comandiVisibili, velo, misuraTesto }: Props) {
  const t = useT();
  /** Esc mentre si scrive: si esce senza salvare. */
  const annullaRef = useRef(false);
  // in anteprima di stampa: il foglio 1200×900, rimpicciolito nella cornice
  const fo = cornice;
  const Wc = fo ? STAMPA.w : larghezza;
  const Hc = fo ? STAMPA.h : altezza;
  const g = scriviTitolo ? null : geometriaTitoloVita(titoloVita, Wc, misuraTesto, fo ? BORDI_STAMPA.titolo : undefined);
  // la casella e il «+» stanno dove andrebbe un titolo di media lunghezza
  const alto = fo ? STAMPA.margine : Wc / 2 - TITOLO_VITA.selettoreMezzo - TITOLO_VITA.destra >= 170 ? TITOLO_VITA.alto : TITOLO_VITA.altoSotto;
  const destra = fo ? STAMPA.margine : TITOLO_VITA.destra;
  const bordoFirma = fo ? STAMPA.margine : 18;
  const fine = (valore: string) => {
    if (!annullaRef.current) onTitolo(valore.trim().slice(0, TITOLO_VITA.lettere));
    annullaRef.current = false;
    setScriviTitolo(false);
  };
  const contenuto = (
    <>
      {g && (
        <svg width={Wc} height={Hc} style={{ position: "absolute", left: 0, top: 0, zIndex: 25, overflow: "visible", pointerEvents: "none" }}>
          <text x={g.x} y={g.y} textAnchor="end"
            transform={`rotate(${TITOLO_VITA.inclinazione} ${g.perno.x} ${g.perno.y})`}
            fill="#fff" fontFamily={TITOLO_VITA.famiglia} fontSize={g.px} fontWeight={TITOLO_VITA.peso}
            onClick={() => setScriviTitolo(true)}
            style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.9))", cursor: "text", pointerEvents: comandiVisibili ? "auto" : "none" }}>
            <title>{t("Modifica il titolo")}</title>
            {titoloVita.trim()}
          </text>
        </svg>
      )}
      {!g && !scriviTitolo && (
        <button onClick={() => setScriviTitolo(true)}
          style={{
            position: "absolute", right: destra, top: alto, zIndex: 30,
            padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: "rgba(10,22,40,0.8)", border: "0.5px dashed #60a5fa", color: "#60a5fa",
            ...velo,
          }}>
          ＋ {t("Aggiungi un titolo")}
        </button>
      )}
      {scriviTitolo && (
        <input autoFocus defaultValue={titoloVita} maxLength={TITOLO_VITA.lettere}
          placeholder={t("Titolo della mappa")} aria-label={t("Titolo della mappa")}
          onKeyDown={e => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") { annullaRef.current = true; e.currentTarget.blur(); }
          }}
          onBlur={e => fine(e.currentTarget.value)}
          style={{
            position: "absolute", right: destra, top: alto - 4, zIndex: 30, pointerEvents: "auto",
            width: Math.min(Wc - 2 * destra, 380), textAlign: "right",
            fontFamily: TITOLO_VITA.famiglia, fontSize: TITOLO_VITA.px, fontWeight: TITOLO_VITA.peso, color: "#fff",
            background: "rgba(10,22,40,0.7)", border: "1px dashed #60a5fa", borderRadius: 6,
            padding: "2px 8px", outline: "none",
          }} />
      )}
      <div aria-hidden style={{
        position: "absolute", right: bordoFirma, bottom: bordoFirma, zIndex: 25, display: "flex", alignItems: "center", gap: 7,
        opacity: comandiVisibili ? 0 : 0.9, transition: "opacity 400ms ease", pointerEvents: "none",
        filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.85))",
      }}>
        <span style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", fontSize: 16, color: "#fff" }}>By</span>
        <img src={`${import.meta.env.BASE_URL}logo-orsi.png`} alt="" width={34} height={34} style={{ display: "block" }} />
      </div>
    </>
  );
  return fo ? (
    <div style={{
      position: "absolute", left: fo.x, top: fo.y, width: STAMPA.w, height: STAMPA.h, zIndex: 25,
      transform: `scale(${fo.w / STAMPA.w})`, transformOrigin: "0 0", pointerEvents: "none",
    }}>{contenuto}</div>
  ) : contenuto;
}
