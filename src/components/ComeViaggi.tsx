import { Trip } from "@/lib/storage";
import { contaForme } from "@/lib/forme";
import { Sun, Tent, Waypoints } from "lucide-react";

/**
 * "Come viaggi": le forme dei viaggi, in Statistiche.
 *
 * Tre caselle che si escludono a vicenda e sommano al totale — la differenza
 * con gli "Highlights di viaggio" qui accanto è che quelli sono RECORD ("il
 * più alto", "il più lontano") e questi sono CONTEGGI: risponde a "che tipo di
 * viaggiatore sei", non a "qual è il tuo primato". Per questo è una sezione
 * sua e non due card in più là dentro.
 *
 * Erano quattro: "tappa fissa" (base con gite) e "andata e ritorno" (una meta
 * sola) sono state unite perché descrivevano la stessa esperienza — in
 * entrambe dormi in un posto solo — e Stefano l'ha visto dai suoi numeri, 0
 * contro 10. Le gite dalla base ora sono un dettaglio nel sottotitolo.
 *
 * Le caselle a zero si mostrano comunque: in una scomposizione uno zero è
 * un'informazione ("non fai gite in giornata").
 */
export function ComeViaggi({ trips }: { trips: Trip[] }) {
  if (trips.length === 0) return null;   // niente caselle a zero su un archivio vuoto
  const c = contaForme(trips);

  const caselle = [
    { label: "In giornata", valore: c.giornata, colore: "#fbbf24", Icona: Sun,
      sub: "parti e torni" },
    { label: "Tappa fissa", valore: c.fissa, colore: "#5dcaa5", Icona: Tent,
      // Le gite si nominano solo se ci sono: senza, il sottotitolo dice
      // semplicemente com'è fatto un viaggio a tappa fissa.
      sub: c.conGite > 0
        ? `un posto, più notti · ${c.conGite} con gite`
        : "un posto, più notti" },
    { label: "Itineranti", valore: c.itinerante, colore: "#a78bfa", Icona: Waypoints,
      sub: c.tappeMedie > 0 ? `${c.tappeMedie} ${c.tappeMedie === 1 ? "tappa" : "tappe"} in media` : undefined },
  ];

  return (
    <section className="mb-8 animate-fade-up">
      <h2 className="text-lg font-bold mb-1">Come viaggi</h2>
      {/* Il totale si dice DISTINGUENDO le gite, o non torna con la Home:
          lì "26 viaggi" esclude le gite (sono un'altra cosa, per scelta), e
          qui un "27 in tutto" sembrava un numero sbagliato. 26 + 1 = 27, ma
          va detto. La gita è la stessa cosa che conta la casella "in
          giornata": lo stesso predicato, quindi i numeri non possono
          divergere. */}
      <p className="text-xs text-muted-foreground mb-4">
        Ogni viaggio in una casella sola:{" "}
        {trips.length - c.giornata} {trips.length - c.giornata === 1 ? "viaggio" : "viaggi"}
        {c.giornata > 0 && ` e ${c.giornata} ${c.giornata === 1 ? "gita" : "gite"} in giornata`}.
      </p>
      {/* Tre in riga anche sul telefono: le etichette sono corte e i numeri
          grandi, e sotto i 120px di card il testo regge ancora. */}
      <div className="grid grid-cols-3 gap-2">
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
