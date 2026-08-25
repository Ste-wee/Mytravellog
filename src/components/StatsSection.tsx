// [FROZEN] — Non modificare senza esplicita richiesta
import { useMemo, useState } from "react";
import { useT } from "@/lib/settings";
import { Trip as LocalTrip } from "@/lib/storage";
import { paeseVisibileDiViaggio, paeseVisibileDiTappa } from "@/lib/paesi";
import { CountryMapModal } from "@/components/CountryMapModal";

// Su quanti "paesi" si calcola la percentuale del mondo visto: i 195
// riconosciuti (membri ONU + osservatori) MENO il Regno Unito PIÙ le sue
// quattro nazioni — che da noi contano separate (Scozia, Inghilterra, Galles,
// Irlanda del Nord). Senza questo aggiustamento chi le visita tutte e quattro
// supererebbe il numeratore rispetto a una base che le conta come una.
const TOTAL_COUNTRIES = 195 - 1 + 4;

interface Props {
  trips: LocalTrip[];
}

export function StatsSection({ trips }: Props) {
  const t = useT();
  const [showAll, setShowAll] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Ogni viaggio "visita" non solo la destinazione finale ma anche ogni tappa
  // intermedia (waypoint): ha una data, un mezzo di trasporto e coordinate
  // proprie, quindi conta come paese visitato.
  const countriesTouchedByTrip = useMemo(() => {
    return trips.map((t) => {
      const seen = new Map<string, { key: string; name: string; code?: string }>();
      // Deduplica per NOME normalizzato, non per `code || name`: lo stesso
      // paese può comparire una volta col codice ISO (es. destinazione "IT")
      // e una senza (es. una tappa con country_code vuoto) → prima diventava
      // due chiavi distinte, quindi due chip "Italia" e un conteggio gonfiato.
      // Il nome viene sempre dal geocoder in italiano, quindi è stabile; il
      // codice si conserva da qualunque occorrenza ce l'abbia (per la bandiera).
      const add = (name: string, code?: string) => {
        if (!name) return;
        const key = name.trim().toLowerCase();
        const existing = seen.get(key);
        if (!existing) seen.set(key, { key, name, code: code || undefined });
        else if (!existing.code && code) existing.code = code;
      };
      // Dentro il Regno Unito vale la NAZIONE (Scozia, Galles...), con la sua
      // bandiera: stessa funzione che usa il conteggio della Home, così i due
      // numeri non possono divergere.
      const p = paeseVisibileDiViaggio(t);
      add(p.nome, p.codice ?? undefined);
      for (const w of t.waypoints ?? []) {
        // stessa eredità del conteggio in Home: una tappa britannica di un
        // viaggio scozzese non aggiunge un secondo chip "Regno Unito"
        const pw = paeseVisibileDiTappa(w, p);
        add(pw.nome, pw.codice ?? undefined);
      }
      return { trip: t, countries: Array.from(seen.values()) };
    });
  }, [trips]);

  const tripsByCountry = useMemo(() => {
    const map = new Map<string, LocalTrip[]>();
    for (const { trip: t, countries: cs } of countriesTouchedByTrip) {
      for (const c of cs) {
        const arr = map.get(c.key) ?? [];
        arr.push(t);
        map.set(c.key, arr);
      }
    }
    return map;
  }, [countriesTouchedByTrip]);


  const countries = useMemo(() => {
    const map = new Map<string, { key: string; name: string; code?: string; visits: number }>();
    for (const { countries: cs } of countriesTouchedByTrip) {
      for (const c of cs) {
        const existing = map.get(c.key);
        if (existing) { existing.visits += 1; if (!existing.code && c.code) existing.code = c.code; }
        else map.set(c.key, { ...c, visits: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name, "it"));
  }, [countriesTouchedByTrip]);

  const selectedCountry = selectedKey ? countries.find((c) => c.key === selectedKey) ?? null : null;
  const selectedTrips = selectedKey ? (tripsByCountry.get(selectedKey) ?? []).slice().sort((a, b) => b.trip_date.localeCompare(a.trip_date)) : [];

  const count = countries.length;
  const percent = Math.min(100, (count / TOTAL_COUNTRIES) * 100);
  const percentLabel = percent < 1 && percent > 0 ? percent.toFixed(1) : Math.round(percent).toString();

  const visible = showAll ? countries : countries.slice(0, 8);

  return (
    <section className="mb-8 animate-fade-up">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
        <StatHero
          value={count.toString()}
          label={t("paesi visitati")}
          accent="#60a5fa"
          gradient="linear-gradient(135deg, #0d2847 0%, #0a1628 62%)"
        />
        <StatHero
          value={`${percentLabel}%`}
          label={t("del mondo visto")}
          accent="#34d399"
          gradient="linear-gradient(135deg, #0d3327 0%, #0a1628 62%)"
          mirror
        />
      </div>

      <div>
        <h2 className="text-lg font-bold mb-3">{t("Elenco dei paesi")}</h2>
        {countries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("Nessun paese ancora. Aggiungi il tuo primo viaggio per popolare le statistiche.")}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visible.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setSelectedKey(c.key)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/40 border border-border hover:border-primary/40 hover:bg-muted/60 transition-colors cursor-pointer"
              >
                <img
                  src={`https://flagcdn.com/w20/${(c.code || "").toLowerCase()}.png`}
                  width="20" height="14"
                  alt={c.name} loading="lazy"
                  style={{ borderRadius:2, objectFit:"cover", flexShrink:0 }}
                  onError={e => { (e.target as HTMLImageElement).style.display="none"; }}
                />
                <span className="text-sm font-medium">{c.name}</span>
                <span className="text-xs font-semibold text-primary bg-primary/10 rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                  {c.visits}
                </span>
              </button>
            ))}
            {countries.length > 8 && (
              <button
                onClick={() => setShowAll((v) => !v)}
                className="inline-flex items-center px-3 py-1.5 rounded-full bg-muted/40 border border-border text-sm font-semibold text-primary hover:bg-muted/60 transition-colors"
              >
                {showAll ? "Mostra meno" : `Mostra tutto (${countries.length})`}
              </button>
            )}
          </div>
        )}
      </div>

      {selectedCountry && (
        <CountryMapModal
          countryCode={selectedCountry.code ?? ""}
          countryName={selectedCountry.name}
          trips={selectedTrips}
          onClose={() => setSelectedKey(null)}
        />
      )}
    </section>
  );
}

// Prima queste due hero erano foto stock di Unsplash caricate via URL: si
// rompevano offline, erano l'unico elemento "non nostro" del design e non
// c'entravano col tema (una foresta per "% del mondo"). Ora sono un globo
// wireframe disegnato in SVG — coerente con l'identità dell'app (il globo del
// logo e della Home), a tinta piena col navy, e funziona sempre.
function StatHero({
  value, label, accent, gradient, mirror = false,
}: { value: string; label: string; accent: string; gradient: string; mirror?: boolean }) {
  return (
    <div className="relative rounded-2xl overflow-hidden aspect-[4/3] sm:aspect-[16/10] group"
      style={{ background: gradient }}>
      {/* Globo wireframe decorativo: grande, parzialmente fuori dal riquadro
          per dare profondità; specchiato sulla seconda hero così le due card
          sono una coppia simmetrica invece di due immagini scollegate. */}
      <svg viewBox="0 0 120 120" aria-hidden="true"
        className="absolute transition-transform duration-700 group-hover:scale-110"
        style={{
          width: "75%", bottom: "-28%", [mirror ? "left" : "right"]: "-18%",
          opacity: 0.55, color: accent,
        }}>
        <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="1"/>
        <ellipse cx="60" cy="60" rx="52" ry="20" fill="none" stroke="currentColor" strokeWidth="0.7"/>
        <ellipse cx="60" cy="60" rx="52" ry="40" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.7"/>
        <ellipse cx="60" cy="60" rx="20" ry="52" fill="none" stroke="currentColor" strokeWidth="0.7"/>
        <ellipse cx="60" cy="60" rx="40" ry="52" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.7"/>
        <line x1="8" y1="60" x2="112" y2="60" stroke="currentColor" strokeWidth="0.7"/>
      </svg>
      {/* Glow d'accento nell'angolo del globo, per staccarlo dal fondo piatto. */}
      <div className="absolute inset-0" style={{
        background: `radial-gradient(circle at ${mirror ? "15%" : "85%"} 90%, ${accent}2e, transparent 55%)`,
      }}/>
      {/* Bottom fade for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
      <div className="relative h-full flex flex-col items-center justify-center text-center px-2 sm:px-4">
        <div className="text-3xl sm:text-6xl font-extrabold text-white tracking-tight font-mono"
          style={{textShadow:"0 2px 20px rgba(0,0,0,0.4)"}}>
          {value}
        </div>
        <div className="text-xs sm:text-base text-white/90 font-medium mt-1"
          style={{textShadow:"0 1px 8px rgba(0,0,0,0.5)"}}>
          {label}
        </div>
      </div>
    </div>
  );
}
