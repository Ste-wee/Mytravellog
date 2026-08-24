import { Trip } from "@/lib/storage";
import { contaForme } from "@/lib/forme";
import { separaGite } from "@/lib/gite";
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
 * Poi sono diventate DUE: le gite in giornata sono uscite dalle statistiche
 * (scelta di Stefano, 2026-08-24 — vedi lib/gite.ts). Non erano una forma di
 * viaggio come le altre: erano un'altra cosa messa in fila con le forme. Ora
 * hanno la loro riga sotto le caselle, dove si può anche dire che stanno fuori
 * dai conti — cosa che una casella in griglia non può spiegare.
 *
 * Le caselle a zero si mostrano comunque: in una scomposizione uno zero è
 * un'informazione ("non fai viaggi itineranti").
 */
export function ComeViaggi({ trips }: { trips: Trip[] }) {
  if (trips.length === 0) return null;   // niente caselle a zero su un archivio vuoto
  // Le forme si contano sui VIAGGI: le gite stanno fuori dalle statistiche.
  const { viaggi, gite } = separaGite(trips);
  const c = contaForme(viaggi);

  const caselle = [
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
      {/* Il numero qui DEVE essere quello della Home: stessa `separaGite`,
          quindi non possono divergere. Le gite si nominano nella riga sotto
          le caselle, non qui, per non dire due volte la stessa cosa. */}
      <p className="text-xs text-muted-foreground mb-4">
        Ogni viaggio in una casella sola:{" "}
        {viaggi.length} {viaggi.length === 1 ? "viaggio" : "viaggi"}.
      </p>
      {/* Due in riga: erano tre quando c'era anche "in giornata". Con due
          caselle le card sono più larghe e i sottotitoli respirano. */}
      <div className="grid grid-cols-2 gap-2">
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
      {/* Le gite: fuori dai conti, dette qui. Una riga può spiegare quello che
          una casella in griglia non può — ed è la spiegazione che mancava
          quando la stessa gita era fuori dal numero dei viaggi e dentro le
          città. Compare solo se ne hai. */}
      {gite.length > 0 && (
        <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:10,
          padding:"10px 12px", background:"rgba(251,191,36,0.07)",
          border:"0.5px solid rgba(251,191,36,0.25)", borderRadius:12 }}>
          <Sun style={{ width:16, height:16, color:"#fbbf24", flexShrink:0 }}/>
          <span style={{ fontSize:12, color:"rgba(255,255,255,0.7)" }}>
            <b className="font-mono" style={{ color:"#fbbf24", fontWeight:700 }}>{gite.length}</b>
            {" "}{gite.length === 1 ? "gita" : "gite"} in giornata, contate a parte: parti e torni lo stesso giorno.
          </span>
        </div>
      )}
    </section>
  );
}
