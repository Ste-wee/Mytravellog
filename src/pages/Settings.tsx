// [FROZEN] — Non modificare senza esplicita richiesta
import { AppHeader } from "@/components/AppHeader";
import { MapPin, Search, X, Ruler, RotateCw, CircleDot, UserCircle } from "lucide-react";
import { useSettings, DistanceUnit, TemperatureUnit, AutoRotate, HomeCity } from "@/lib/settings";
import { GeoResult } from "@/lib/geo";
import { usePlaceSearch } from "@/lib/usePlaceSearch";
import { useState, useEffect } from "react";
import { CloudSection } from "@/components/CloudSection";

// Preset "da utente" per la dimensione dei marker sul globo: sotto il cofano
// impostano la coppia min/max che prima andava digitata a mano (con tanto di
// validazione numerica) — un dettaglio da sviluppatore, non da utente.
export const MARKER_SIZE_PRESETS = {
  small:    { label: "Piccoli",  min: 0.3, max: 0.7 },
  standard: { label: "Standard", min: 0.5, max: 1.0 },
  large:    { label: "Grandi",   min: 0.8, max: 1.5 },
} as const;
export type MarkerSizePreset = keyof typeof MARKER_SIZE_PRESETS;

/** Preset corrispondente ai valori correnti, o null se sono valori custom legacy. */
export function detectMarkerPreset(min: number, max: number): MarkerSizePreset | null {
  for (const [key, p] of Object.entries(MARKER_SIZE_PRESETS)) {
    if (Math.abs(p.min - min) < 0.001 && Math.abs(p.max - max) < 0.001) return key as MarkerSizePreset;
  }
  return null;
}

function SegmentControl<T extends string>({
  value, onChange, options,
}: {
  value: T | null;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
}) {
  return (
    <div className="flex bg-secondary rounded-xl p-1 gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          // L'opzione SCELTA è una pillola blu piena, come i pulsanti primari
          // dell'app. Prima era quasi-nera (bg-background) e le NON scelte
          // restavano azzurrine: la scelta sprofondava nella barra e da lontano
          // sembrava attiva quella sbagliata.
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            value === o.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
          {/* Sulla pillola blu il grigio-azzurro sparirebbe: sull'opzione
              scelta il suggerimento diventa scuro come l'etichetta. */}
          {o.hint && <span className={"ml-1 text-xs " + (value === o.value ? "" : "text-muted-foreground")}
            style={value === o.value ? { color: "rgba(6,14,30,0.72)" } : undefined}>({o.hint})</span>}
        </button>
      ))}
    </div>
  );
}

function Group({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 mb-3">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">{icon}</div>
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{desc}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

/** Intestazione di sezione: dà gerarchia a una pagina che prima era un elenco piatto di card. */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", margin: "22px 4px 10px" }}>
      {children}
    </div>
  );
}

function HomeCityPicker({ value, onChange }: { value: HomeCity; onChange: (v: HomeCity) => void }) {
  const [query, setQuery] = useState(value?.label ?? "");

  // Ricerca unificata (usePlaceSearch): solo città — è una residenza.
  // `ignora`: l'etichetta già scelta non deve riaprire la lista.
  const { results, loading, clear: clearResults } = usePlaceSearch(query, { ignora: value?.label ?? null });

  return (
    <div className="relative mt-2">
      <div className="flex items-center gap-2 bg-secondary/20 border border-border rounded-xl px-3 py-2.5">
        <Search className="w-4 h-4 text-muted-foreground flex-shrink-0"/>
        <input
          className="bg-transparent flex-1 text-sm outline-none placeholder:text-muted-foreground"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Cerca la tua città…"
        />
        {value && (
          <button type="button" onClick={() => { onChange(null); setQuery(""); }}
            aria-label="Rimuovi la città di residenza"
            className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4"/>
          </button>
        )}
      </div>
      {value && query === value.label && (
        <div className="mt-1.5 flex items-center gap-2 text-sm text-primary">
          {/* Niente nome ripetuto: è già scritto nell'input qui sopra. Il pin
              e le coordinate confermano che la città è agganciata davvero. */}
          <MapPin className="w-3.5 h-3.5"/>
          <span className="text-muted-foreground text-xs">posizione agganciata ({value.lat.toFixed(2)}, {value.lon.toFixed(2)})</span>
        </div>
      )}
      {results.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden">
          {results.map((r, i) => (
            <button key={i} type="button"
              onClick={() => {
                onChange({ label: `${r.name}, ${r.country}`, lat: r.latitude, lon: r.longitude });
                setQuery(`${r.name}, ${r.country}`);
                clearResults();
              }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent/10 flex items-center gap-2 border-b border-border last:border-0">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"/>
              {r.name}, {r.country}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const s = useSettings();
  const markerPreset = detectMarkerPreset(s.minMarkerScale, s.maxMarkerScale);

  const applyMarkerPreset = (key: MarkerSizePreset) => {
    const p = MARKER_SIZE_PRESETS[key];
    s.setMinMarkerScale(p.min);
    s.setMaxMarkerScale(p.max);
  };

  return (
    <main>
      <AppHeader/>

      <div className="container mx-auto px-4 pt-8 pb-2 max-w-xl">

        <SectionHeading>Misure</SectionHeading>

        <Group
          icon={<Ruler width="18" height="18"/>}
          title="Unità di misura"
          desc="Come mostrare distanze, altitudini e temperature"
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Distanze e altitudini</label>
              <SegmentControl<DistanceUnit>
                value={s.distanceUnit} onChange={s.setDistanceUnit}
                options={[{ value: "metric", label: "Metrico", hint: "km, m" }, { value: "imperial", label: "Imperiale", hint: "mi, ft" }]}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Temperatura</label>
              <SegmentControl<TemperatureUnit>
                value={s.temperatureUnit} onChange={s.setTemperatureUnit}
                options={[{ value: "celsius", label: "Celsius", hint: "°C" }, { value: "fahrenheit", label: "Fahrenheit", hint: "°F" }]}
              />
            </div>
          </div>
        </Group>

        <Group
          icon={<MapPin width="18" height="18"/>}
          title="Città di residenza"
          desc="Usata per calcolare le distanze e precompilare il punto di partenza"
        >
          <HomeCityPicker value={s.homeCity} onChange={s.setHomeCity}/>
        </Group>

        <SectionHeading>Globo</SectionHeading>

        <Group
          icon={<RotateCw width="18" height="18"/>}
          title="Rotazione automatica"
          desc="Il globo ruota da solo all'avvio"
        >
          <SegmentControl<AutoRotate>
            value={s.autoRotate} onChange={s.setAutoRotate}
            options={[
              { value: "on",  label: "Attiva" },
              { value: "off", label: "Disattiva" },
            ]}
          />
        </Group>

        <Group
          icon={<CircleDot width="18" height="18"/>}
          title="Dimensione marker"
          desc="Quanto grandi sono i punti dei viaggi sul globo"
        >
          <SegmentControl<MarkerSizePreset>
            value={markerPreset}
            onChange={applyMarkerPreset}
            options={(Object.keys(MARKER_SIZE_PRESETS) as MarkerSizePreset[]).map(key => ({
              value: key, label: MARKER_SIZE_PRESETS[key].label,
            }))}
          />
          {markerPreset === null && (
            <p className="mt-2 text-xs text-muted-foreground">
              Al momento è attiva una dimensione personalizzata: scegli un preset per sostituirla.
            </p>
          )}
        </Group>

        <SectionHeading>Account e backup</SectionHeading>

        <Group
          icon={<UserCircle width="18" height="18"/>}
          title="Backup nel cloud"
          desc="Accedi con Google per salvare i viaggi nel cloud, in automatico, e ritrovarli su ogni dispositivo (facoltativo: l'app funziona anche come ospite)"
        >
          <CloudSection/>
        </Group>

      </div>
    </main>
  );
}
