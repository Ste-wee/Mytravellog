// [FROZEN] — Non modificare senza esplicita richiesta
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { PieChart, Sparkles } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Trip, loadTrips } from "@/lib/storage";
import { StatsSection } from "@/components/StatsSection";
import { ContinentsMap } from "@/components/ContinentsMap";
import { TravelHighlights } from "@/components/TravelHighlights";
import { TravelHeatmap } from "@/components/TravelHeatmap";

const Stats = () => {
  const [trips, setTrips] = useState<Trip[]>([]);
  const location = useLocation();

  useEffect(() => {
    setTrips(loadTrips());
  }, [location]);


  return (
    <main>
      <AppHeader/>

      {trips.length === 0 ? (
        /* Senza viaggi le sezioni mostravano un misto di zeri, un messaggio
           isolato e la heatmap sparita in silenzio: meglio un unico invito. */
        <div className="container mx-auto px-6" style={{paddingTop:80, paddingBottom:8, display:"flex", justifyContent:"center"}}>
          <div style={{maxWidth:320, textAlign:"center"}}>
            <div style={{width:48, height:48, borderRadius:"50%", background:"rgba(96,165,250,0.12)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px"}}>
              <PieChart style={{width:22, height:22, color:"#60a5fa"}}/>
            </div>
            <div className="font-display" style={{fontSize:15, fontWeight:700, color:"#f0f4ff"}}>Ancora nessuna statistica</div>
            <p style={{fontSize:12, color:"rgba(255,255,255,0.6)", lineHeight:1.5, margin:"6px 0 16px"}}>
              Le statistiche si costruiscono da sole man mano che aggiungi i tuoi viaggi.
            </p>
            <Link to="/nuovo-viaggio"
              style={{
                display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6,
                fontSize:13, fontWeight:600, padding:"10px 22px", borderRadius:999,
                background:"#60a5fa", color:"#0a1628", textDecoration:"none",
              }}>
              Aggiungi il primo viaggio
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
              <div className="font-display" style={{ fontSize: 15, fontWeight: 700, color: "#f0f4ff" }}>Il tuo anno di viaggi</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Apri il recap annuale, bello e condivisibile</div>
            </div>
            <span style={{ color: "#60a5fa", fontSize: 20 }}>→</span>
          </Link>

          <StatsSection trips={trips} />

          <ContinentsMap trips={trips} />

          <TravelHighlights trips={trips} />

          <TravelHeatmap trips={trips} />
        </div>
      )}
    </main>
  );
};

export default Stats;
