// [FROZEN] — Non modificare senza esplicita richiesta
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { PieChart, Sparkles } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Trip, loadTrips } from "@/lib/storage";
import { separaGite } from "@/lib/gite";
import { useT } from "@/lib/settings";
import { StatsSection } from "@/components/StatsSection";
import { ContinentsMap } from "@/components/ContinentsMap";
import { ComeViaggi } from "@/components/ComeViaggi";
import { TravelHighlights } from "@/components/TravelHighlights";
import { TravelHeatmap } from "@/components/TravelHeatmap";

const Stats = () => {
  const [trips, setTrips] = useState<Trip[]>([]);
  const location = useLocation();

  useEffect(() => {
    setTrips(loadTrips());
  }, [location]);

  /**
   * Le statistiche parlano dei VIAGGI: le gite in giornata sono contate a
   * parte (scelta di Stefano, 2026-08-24 — vedi lib/gite.ts), quindi restano
   * fuori da record, distanze, elenco paesi, continenti e "quando viaggi".
   *
   * L'unica sezione che riceve TUTTO è `ComeViaggi`: separa lei i due mucchi,
   * perché è il posto dove le gite vengono nominate e spiegate.
   */
  const { viaggi } = separaGite(trips);
  const t = useT();


  return (
    <main>
      <AppHeader/>

      {/* `viaggi`, non `trips`: con SOLO gite in giornata le sezioni
          mostrerebbero zeri senza dire perché — le gite sono contate a parte,
          e uno zero inspiegato è precisamente il difetto che stiamo chiudendo.
          Il testo qui sotto cambia in quel caso. */}
      {viaggi.length === 0 ? (
        /* Senza viaggi le sezioni mostravano un misto di zeri, un messaggio
           isolato e la heatmap sparita in silenzio: meglio un unico invito. */
        <div className="container mx-auto px-6" style={{paddingTop:80, paddingBottom:8, display:"flex", justifyContent:"center"}}>
          <div style={{maxWidth:320, textAlign:"center"}}>
            <div style={{width:48, height:48, borderRadius:"50%", background:"rgba(96,165,250,0.12)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px"}}>
              <PieChart style={{width:22, height:22, color:"#60a5fa"}}/>
            </div>
            <div className="font-display" style={{fontSize:15, fontWeight:700, color:"#f0f4ff"}}>{t("Ancora nessuna statistica")}</div>
            <p style={{fontSize:12, color:"rgba(255,255,255,0.6)", lineHeight:1.5, margin:"6px 0 16px"}}>
              {trips.length > 0
                ? t(trips.length === 1
                  ? "Per ora hai solo una gita in giornata: sono contate a parte e non entrano nelle statistiche. Aggiungi un viaggio con almeno una notte fuori."
                  : "Per ora hai solo gite in giornata: sono contate a parte e non entrano nelle statistiche. Aggiungi un viaggio con almeno una notte fuori.")
                : t("Le statistiche si costruiscono da sole man mano che aggiungi i tuoi viaggi.")}
            </p>
            <Link to="/nuovo-viaggio"
              style={{
                display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6,
                fontSize:13, fontWeight:600, padding:"10px 22px", borderRadius:999,
                background:"#60a5fa", color:"#0a1628", textDecoration:"none",
              }}>
              {t("Aggiungi il primo viaggio")}
            </Link>
          </div>
        </div>
      ) : (
        <div className="container mx-auto px-6 pt-8 pb-2 space-y-8 stats-stagger">
          {/* Ingresso al Recap annuale "Il tuo anno di viaggi" (card condivisibile). */}
          <Link to="/recap"
            style={{
              display: "flex", alignItems: "center", gap: 12, textDecoration: "none",
              background: "linear-gradient(135deg, rgba(96,165,250,0.16), rgba(251,191,36,0.10))",
              border: "0.5px solid #1a2d4a", borderRadius: 14, padding: "14px 16px",
            }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: "rgba(96,165,250,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Sparkles style={{ width: 20, height: 20, color: "#60a5fa" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="font-display" style={{ fontSize: 15, fontWeight: 700, color: "#f0f4ff" }}>{t("Il tuo anno di viaggi")}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{t("Apri il recap annuale, bello e condivisibile")}</div>
            </div>
            <span style={{ color: "#60a5fa", fontSize: 20 }}>→</span>
          </Link>

          <StatsSection trips={viaggi} />

          <ContinentsMap trips={viaggi} />

          {/* Dopo la geografia (dove sei stato), prima dei record (quanto in
              alto, quanto lontano): risponde a una domanda diversa, che tipo
              di viaggiatore sei. Posizione scelta da Stefano. */}
          <ComeViaggi trips={trips} />

          <TravelHighlights trips={viaggi} />

          <TravelHeatmap trips={viaggi} />
        </div>
      )}
    </main>
  );
};

export default Stats;
