import { useEffect, useRef, useState, ReactNode } from "react";
import { localeAttivo } from "@/lib/settings";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { YearRecap } from "@/lib/recap";
import { parseLocalDate } from "@/lib/storage";
import { transportColor, transportLabel } from "@/lib/transport";

interface Fmt { dist: (km: number) => string; alt: (m: number) => string; temp: (c: number) => string }

// Colori ed etichette dalla fonte unica (@/lib/transport). Qui le etichette
// vanno in minuscolo: è il tono delle storie di fine anno.
const MODE_COLOR = (m: string) => transportColor(m);
const MODE_LABEL = (m: string) => transportLabel(m, m).toLowerCase();
const EARTH_KM = 40075;

const kicker: React.CSSProperties = { fontSize: 13, letterSpacing: 2, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase" };
const big = (size: number, color = "#f0f4ff"): React.CSSProperties => ({ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: size, color, lineHeight: 1 });
const sub: React.CSSProperties = { fontSize: 15, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 };

export function RecapStories({ recap: r, fmt, flagUrl, onClose }: { recap: YearRecap; fmt: Fmt; flagUrl: string | null; onClose: () => void }) {
  // Costruisce le slide in base ai dati (salta quelle senza contenuto).
  const usedModes = Object.entries(r.byMode).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const aroundWorld = r.km / EARTH_KM;
  const slides: ReactNode[] = [];

  slides.push(
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
      <div style={kicker}>Il tuo anno di viaggi</div>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 96, lineHeight: 1, marginTop: 12, backgroundImage: "linear-gradient(120deg,#60a5fa,#34d399)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{r.year}</div>
      <div style={{ ...sub, marginTop: 18 }}>Ripercorriamolo insieme →</div>
    </div>
  );

  slides.push(
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
      <div style={sub}>Hai percorso</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8 }}>
        <span style={big(80)}>{fmt.dist(r.km).replace(/\s*(km|mi)$/i, "")}</span>
        <span style={{ fontSize: 34, fontWeight: 700, color: "#fbbf24" }}>{/mi$/i.test(fmt.dist(r.km)) ? "mi" : "km"}</span>
      </div>
      {aroundWorld >= 0.005 && (
        <div style={{ ...sub, marginTop: 18 }}>più o meno <b style={{ color: "#fff" }}>{aroundWorld.toFixed(2).replace(".", ",")}×</b> il giro del mondo</div>
      )}
    </div>
  );

  slides.push(
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", gap: 18 }}>
      <div style={sub}>Sei stato in</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}><span style={big(56, "#34d399")}>{r.countries}</span><span style={{ fontSize: 18, color: "rgba(255,255,255,0.7)" }}>{r.countries === 1 ? "paese" : "paesi"}</span></div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}><span style={big(56, "#60a5fa")}>{r.cities}</span><span style={{ fontSize: 18, color: "rgba(255,255,255,0.7)" }}>{r.cities === 1 ? "città" : "città"}</span></div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}><span style={big(56, "#fbbf24")}>{r.days}</span><span style={{ fontSize: 18, color: "rgba(255,255,255,0.7)" }}>{r.days === 1 ? "giorno in viaggio" : "giorni in viaggio"}</span></div>
    </div>
  );

  if (usedModes.length > 0) {
    const total = usedModes.reduce((s, [, v]) => s + v, 0);
    slides.push(
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
        <div style={kicker}>Come ti sei mosso</div>
        <div style={{ display: "flex", height: 14, borderRadius: 8, overflow: "hidden", marginTop: 20, background: "rgba(255,255,255,0.06)" }}>
          {usedModes.map(([m, v]) => <div key={m} style={{ flexGrow: v, background: MODE_COLOR(m) }} />)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 22 }}>
          {usedModes.map(([m, v]) => (
            <div key={m} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: MODE_COLOR(m) }} />
              <span style={{ fontSize: 15, color: "rgba(255,255,255,0.8)" }}>{MODE_LABEL(m)}</span>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{Math.round((v / total) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const records = [
    r.farthest && ["Più lontano", fmt.dist(r.farthest.value), r.farthest.city],
    r.highest && ["Più in alto", fmt.alt(r.highest.value), r.highest.city],
    r.hottest && ["Più caldo", fmt.temp(r.hottest.value), r.hottest.city],
    r.coldest && ["Più freddo", fmt.temp(r.coldest.value), r.coldest.city],
  ].filter(Boolean) as [string, string, string][];
  if (records.length > 0) {
    slides.push(
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", gap: 22 }}>
        <div style={kicker}>I tuoi record</div>
        {records.map(([lab, val, city]) => (
          <div key={lab}>
            <div style={{ fontSize: 11, letterSpacing: 1, color: "rgba(255,255,255,0.6)", textTransform: "uppercase" }}>{lab}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={big(30, "#fbbf24")}>{val}</span>
              {city && <span style={{ fontSize: 14, color: "rgba(255,255,255,0.55)" }}>{city}</span>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // La riga di congedo vive sull'ULTIMA slide effettiva: sul momento se c'è
  // (chiusura calda con le parole dell'utente), altrimenti sul paese dell'anno.
  const farewell = <div style={{ ...sub, marginTop: 24 }}>Alla prossima avventura ✦</div>;

  if (r.topCountry) {
    slides.push(
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
        <div style={kicker}>Il tuo paese dell'anno</div>
        {flagUrl && <img src={flagUrl} alt="" width="120" height="80" style={{ borderRadius: 8, objectFit: "cover", border: "2px solid rgba(255,255,255,0.85)", marginTop: 22, marginBottom: 16 }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />}
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 48, color: "#f0f4ff" }}>{r.topCountry.name}</div>
        {!r.moment && farewell}
      </div>
    );
  }

  // ★ Il momento dell'anno: la voce di diario scelta dall'utente — le sue
  // parole come chiusura delle stories, al posto di un numero.
  if (r.moment) {
    const md = parseLocalDate(r.moment.date);
    // Data di diario malformata → la slide diceva "· NaN Invalid Date NaN".
    const mdValid = Number.isFinite(md.getTime());
    const mon = mdValid ? md.toLocaleDateString(localeAttivo(), { month: "short" }).replace(".", "") : "";
    slides.push(
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 34, color: "#fbbf24", marginBottom: 14 }}>★</div>
        <div style={kicker}>Il momento dell'anno</div>
        <div style={{
          fontFamily: "'Space Grotesk', sans-serif", fontStyle: "italic", fontSize: 22, lineHeight: 1.6,
          color: "#f0f4ff", marginTop: 20, maxWidth: 340,
          display: "-webkit-box", WebkitLineClamp: 6, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          «{r.moment.text}»
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginTop: 16 }}>
          {mdValid ? `${r.moment.tripTitle} · ${md.getDate()} ${mon} ${md.getFullYear()}` : r.moment.tripTitle}
        </div>
        {farewell}
      </div>
    );
  }

  const [i, setI] = useState(0);
  const n = slides.length;
  const iRef = useRef(0);
  useEffect(() => { iRef.current = i; }, [i]);
  // onClose FUORI dall'updater di setI: chiamarlo dentro l'updater = setState
  // del padre durante il render → warning "Cannot update while rendering".
  const next = () => { if (iRef.current >= n - 1) { onClose(); return; } setI(iRef.current + 1); };
  const prev = () => { if (iRef.current > 0) setI(iRef.current - 1); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "linear-gradient(165deg,#0c1f3d,#060b16)", display: "flex", justifyContent: "center" }}>
      <div style={{ position: "relative", width: "100%", maxWidth: 460, height: "100%", padding: "0 32px" }}>
        {/* Barrette di avanzamento */}
        <div style={{ display: "flex", gap: 4, paddingTop: 18 }}>
          {slides.map((_, k) => (
            <div key={k} style={{ flex: 1, height: 3, borderRadius: 2, background: k <= i ? "#60a5fa" : "rgba(255,255,255,0.2)" }} />
          ))}
        </div>

        <button onClick={onClose} aria-label="Chiudi"
          style={{ position: "absolute", top: 30, right: 24, width: 34, height: 34, borderRadius: 10, zIndex: 3, background: "rgba(255,255,255,0.08)", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <X className="w-4 h-4" />
        </button>

        {/* Contenuto slide (key = i per rilanciare l'animazione a ogni cambio) */}
        <div key={i} className="animate-fade-up" style={{ position: "absolute", inset: 0, padding: "70px 32px 90px" }}>
          {slides[i]}
        </div>

        {/* Zone di tap: sinistra = indietro, destra = avanti */}
        <button onClick={prev} aria-label="Slide precedente" style={{ position: "absolute", top: 40, left: 0, bottom: 0, width: "32%", background: "transparent", border: "none", cursor: "pointer" }} />
        <button onClick={next} aria-label="Slide successiva" style={{ position: "absolute", top: 40, right: 0, bottom: 0, width: "68%", background: "transparent", border: "none", cursor: "pointer" }} />
      </div>
    </div>,
    document.body
  );
}
