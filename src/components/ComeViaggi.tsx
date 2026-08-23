import { Trip } from "@/lib/storage";
import { contaForme } from "@/lib/forme";
import { Sun, Tent, Waypoints, ArrowRightLeft } from "lucide-react";

/**
 * "Come viaggi": le quattro forme dei viaggi, in Statistiche.
 *
 * Quattro caselle che si escludono a vicenda e sommano al totale — la
 * differenza con gli "Highlights di viaggio" qui accanto è che quelli sono
 * RECORD ("il più alto", "il più lontano") e questi sono CONTEGGI: risponde a
 * "che tipo di viaggiatore sei", non a "qual è il tuo primato". Per questo è
 * una sezione sua e non due card in più là dentro.
 *
 * Le caselle a zero si mostrano comunque: in una scomposizione uno zero è
 * un'informazione ("non fai gite"), e togliere una casella spaccherebbe la
 * griglia 2×2 del telefono.
 */
export function ComeViaggi({ trips }: { trips: Trip[] }) {
  if (trips.length === 0) return null;   // niente quattro zeri su un archivio vuoto
  const c = contaForme(trips);

  const caselle = [
    { label: "In giornata", valore: c.giornata, colore: "#fbbf24", Icona: Sun,
      sub: "parti e torni" },
    { label: "Tappa fissa", valore: c.base, colore: "#5dcaa5", Icona: Tent,
      sub: c.giteDallaBase > 0 ? `${c.giteDallaBase} ${c.giteDallaBase === 1 ? "gita" : "gite"} dalla base` : undefined },
    { label: "Itineranti", valore: c.itinerante, colore: "#a78bfa", Icona: Waypoints,
      sub: c.tappeMedie > 0 ? `${c.tappeMedie} ${c.tappeMedie === 1 ? "tappa" : "tappe"} in media` : undefined },
    { label: "Andata e ritorno", valore: c.diretto, colore: "#60a5fa", Icona: ArrowRightLeft,
      sub: "una meta sola" },
  ];

  return (
    <section className="mb-8 animate-fade-up">
      <h2 className="text-lg font-bold mb-1">Come viaggi</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Ogni viaggio in una casella sola: {trips.length} in tutto.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {caselle.map(({ label, valore, colore, Icona, sub }) => (
          <div key={label}
            style={{ background:"#0a1628", border:"0.5px solid #1a2d4a", borderRadius:14,
              padding:"18px 10px", display:"flex", flexDirection:"column",
              alignItems:"center", textAlign:"center", gap:4,
              // Le caselle vuote si vedono, ma non chiedono attenzione.
              opacity: valore === 0 ? 0.45 : 1 }}>
            <Icona style={{ width:30, height:30, color: colore, strokeWidth:1.6 }}/>
            <div className="font-mono" style={{ fontSize:19, fontWeight:800, color:"#f0f4ff", marginTop:4 }}>
              {valore}
            </div>
            <div style={{ fontSize:10, letterSpacing:"0.5px", textTransform:"uppercase", fontWeight:700, color: colore }}>
              {label}
            </div>
            {valore > 0 && sub && (
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.6)" }}>{sub}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
