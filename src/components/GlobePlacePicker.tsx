import { useEffect, useState } from "react";
import { useT } from "@/lib/settings";
import { createPortal } from "react-dom";
import { X, MapPin } from "lucide-react";
import { WorldMap, CityInfo } from "@/components/WorldMap";
import { StarField } from "@/components/StarField";
import { GeoResult } from "@/lib/geo";
import { useModalFocus } from "@/lib/useModalFocus";

/**
 * Scelta di una tappa toccando il globo, invece di scriverne il nome.
 *
 * Riusa WorldMap così com'è: il globo sa già trasformare un tocco su un punto
 * qualsiasi nel nome del posto (reverse geocoding), ed è il meccanismo che in
 * Home apre "Aggiungi come viaggio". Qui quel risultato diventa una tappa.
 *
 * `createPortal` sul body: l'overlay è `position: fixed`, e dentro un antenato
 * con `transform` (le card hanno .animate-fade-up) si ancorerebbe alla card
 * invece che allo schermo — lezione già pagata.
 */
export function GlobePlacePicker({ onClose, onPick }: {
  onClose: () => void;
  onPick: (r: GeoResult) => void;
}) {
  const t = useT();
  // Il punto toccato, in attesa di conferma: mai aggiunto alla cieca.
  const [scelto, setScelto] = useState<CityInfo | null>(null);
  // Il nome è modificabile: toccando in mezzo al nulla il reverse geocoding
  // può restituire una frazione o un nome tecnico.
  const [nome, setNome] = useState("");
  const boxRef = useModalFocus<HTMLDivElement>(true);

  // Esc chiude: prima la conferma (torna alla scelta), poi il picker.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (scelto) setScelto(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scelto, onClose]);

  const conferma = () => {
    if (!scelto) return;
    const etichetta = nome.trim() || scelto.name;
    onPick({
      // id negativo come i luoghi di Nominatim: non deve collidere con quelli
      // del geocoder delle città, che vivono nella stessa lista.
      id: -Math.abs(Math.round(scelto.latitude * 1e4) * 1000 + Math.round(scelto.longitude * 1e4) % 1000) - 1,
      name: etichetta,
      country: scelto.country,
      country_code: scelto.country_code,
      latitude: scelto.latitude,
      longitude: scelto.longitude,
    });
    onClose();
  };

  const gradi = (v: number, pos: string, neg: string) =>
    `${Math.abs(v).toFixed(2).replace(".", ",")}° ${v >= 0 ? pos : neg}`;

  return createPortal(
    <div ref={boxRef} role="dialog" aria-modal="true" aria-label={t("Scegli la tappa sul globo")}
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "#060e1e", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
        borderBottom: "0.5px solid #1a2d4a", flexShrink: 0 }}>
        <button type="button" onClick={onClose} aria-label={t("Chiudi la scelta sul globo")}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "rgba(255,255,255,0.7)", display: "flex" }}>
          <X style={{ width: 22, height: 22 }}/>
        </button>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#f0f4ff" }}>{t("Scegli la tappa")}</span>
          <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
            {t("Ruota il globo e tocca un punto")}
          </span>
        </span>
      </div>

      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* trips vuoto: qui il globo serve a scegliere un posto, non a
            raccontare i viaggi — i pallini esistenti sarebbero solo rumore
            (e cliccabili, con la loro mini-card che ruberebbe il tocco). */}
        {/* Stesso cielo della Home: senza, il globo galleggia sul nero piatto. */}
        <StarField />
        <WorldMap trips={[]} autoRotateSetting="off" onSelectCity={c => { setScelto(c); setNome(c.name); }}/>
      </div>

      {scelto && (
        <div style={{ position: "absolute", left: 12, right: 12, bottom: 16, zIndex: 210,
          background: "#0b1524", border: "0.5px solid #1a2d4a", borderRadius: 16, padding: 16,
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 10 }}>
            {scelto.country_code
              ? <img src={`https://flagcdn.com/w40/${scelto.country_code.toLowerCase()}.png`} width={28} alt=""
                  style={{ borderRadius: 4, flexShrink: 0 }}
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}/>
              : <MapPin style={{ width: 20, height: 20, color: "#60a5fa", flexShrink: 0 }}/>}
            <span style={{ flex: 1, minWidth: 0 }}>
              <input value={nome} onChange={e => setNome(e.target.value)}
                aria-label={t("Nome della tappa")}
                style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "0.5px solid #1a2d4a",
                  borderRadius: 8, padding: "7px 10px", fontSize: 14, fontWeight: 700, color: "#f0f4ff",
                  outline: "none", fontFamily: "inherit" }}/>
              <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
                {[scelto.country, `${gradi(scelto.latitude, "N", "S")} ${gradi(scelto.longitude, "E", "O")}`]
                  .filter(Boolean).join(" · ")}
              </span>
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setScelto(null)}
              style={{ flex: 1, padding: 11, borderRadius: 10, background: "transparent",
                border: "0.5px solid #1a2d4a", color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit" }}>
              {t("Scegli un altro punto")}
            </button>
            <button type="button" onClick={conferma} disabled={!nome.trim()}
              style={{ flex: 1, padding: 11, borderRadius: 10, border: "none",
                background: nome.trim() ? "#60a5fa" : "rgba(96,165,250,0.3)", color: "#0a1628",
                fontSize: 13, fontWeight: 700, cursor: nome.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
              {t("Aggiungi tappa")}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
