import { Trip } from "@/lib/storage";
import { contaForme } from "@/lib/forme";
import { useT } from "@/lib/settings";
import { Tent, Waypoints } from "lucide-react";

/**
 * "Come viaggi": le forme dei viaggi, in Statistiche.
 *
 * Due caselle che si escludono a vicenda e sommano al totale — la differenza
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
 * Poi sono diventate DUE: per due giorni c'era anche "in giornata", con una
 * riga sotto le caselle che spiegava che quelle stavano fuori dai conti. La
 * feature delle gite in giornata è stata rimossa per intero il 2026-08-26 —
 * l'app censisce solo viaggi con più giorni — e con lei la casella e la riga.
 *
 * Le caselle a zero si mostrano comunque: in una scomposizione uno zero è
 * un'informazione ("non fai viaggi itineranti").
 */
export function ComeViaggi({ trips }: { trips: Trip[] }) {
  const t = useT();
  if (trips.length === 0) return null;   // niente caselle a zero su un archivio vuoto
  const c = contaForme(trips);

  const caselle = [
    { label: t("Tappa fissa"), valore: c.fissa, colore: "#5dcaa5", Icona: Tent,
      // Le gite si nominano solo se ci sono: senza, il sottotitolo dice
      // semplicemente com'è fatto un viaggio a tappa fissa.
      sub: c.conGite > 0
        ? t("un posto, più notti · {quante} con gite", { quante: c.conGite })
        : t("un posto, più notti") },
    { label: t("Itineranti"), valore: c.itinerante, colore: "#a78bfa", Icona: Waypoints,
      sub: c.tappeMedie > 0
        ? t(c.tappeMedie === 1 ? "{quante} tappa in media" : "{quante} tappe in media", { quante: c.tappeMedie })
        : undefined },
  ];

  return (
    <section className="mb-8 animate-fade-up">
      <h2 className="text-lg font-bold mb-1">{t("Come viaggi")}</h2>
      {/* Il numero qui DEVE essere quello della Home: entrambi contano `trips`
          senza filtri, quindi non possono divergere. */}
      <p className="text-xs text-muted-foreground mb-4">
        {t("Ogni viaggio in una casella sola: {quanti}.", {
          quanti: t(trips.length === 1 ? "{quanti} viaggio" : "{quanti} viaggi", { quanti: trips.length }),
        })}
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
    </section>
  );
}
