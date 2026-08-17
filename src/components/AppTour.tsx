import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { shouldShowWelcome } from "@/components/WelcomeGate";
import {
  Compass, Hand, Plane, BookOpen, Globe2, CalendarClock, ListChecks,
  PieChart, Share2, X, ArrowRight,
} from "lucide-react";

interface Step { Icon: React.ElementType; title: string; body: string }
interface Section { key: string; version: number; steps: Step[] }

// Un "mini tutorial" per sezione: schede esplicative alla PRIMA visita. Scelta
// deliberata rispetto allo spotlight sugli elementi reali: nessun bersaglio che
// si muove → niente timer di sincronizzazione, niente scrollIntoView, niente
// dropdown da aprire, niente selettori nei file congelati. Impossibile da
// desincronizzare per costruzione.
const SECTIONS: Record<string, Section> = {
  home: {
    key: "home", version: 1,
    steps: [
      { Icon: Compass, title: "Benvenuto in NAV·TA", body: "Il tuo atlante di viaggio: segna dove sei stato e guardalo prendere forma sul globo." },
      { Icon: Hand, title: "Ruota il mondo", body: "Trascina il globo per girarlo. I tuoi viaggi appaiono come archi luminosi tra le città." },
    ],
  },
  trips: {
    key: "trips", version: 1,
    steps: [
      { Icon: Plane, title: "I tuoi viaggi", body: "Ogni viaggio è un biglietto. Aggiungine uno con tappe, mezzi e date dal pulsante «Nuovo viaggio» nel menu." },
      { Icon: BookOpen, title: "Diario e ricordi", body: "Apri un biglietto per scrivere il diario giorno per giorno e rivedere il rilievo 3D del percorso." },
      { Icon: Globe2, title: "La mappa della vita", body: "Con l'icona del globo in alto trasformi tutti i viaggi in un'unica costellazione, pronta da stampare." },
    ],
  },
  plans: {
    key: "plans", version: 1,
    steps: [
      { Icon: CalendarClock, title: "In programma", body: "I viaggi che devi ancora fare. Programma destinazione, tappe e date del tuo prossimo itinerario." },
      { Icon: ListChecks, title: "Cose da fare", body: "Segna cosa resta da organizzare e se hai già prenotato. Al ritorno tocca «Segna come fatto» e il viaggio entra nel diario." },
    ],
  },
  stats: {
    key: "stats", version: 1,
    steps: [
      { Icon: PieChart, title: "Le tue statistiche", body: "Km percorsi, paesi e città visitati e i tuoi record di viaggio, in un colpo d'occhio." },
      { Icon: Share2, title: "Il recap dell'anno", body: "Genera «Il tuo anno di viaggi» e condividilo come immagine o come stories." },
    ],
  },
};

const PATH_TO_SECTION: Record<string, string> = {
  "/": "home",
  "/miei-viaggi": "trips",
  "/in-programma": "plans",
  "/statistiche": "stats",
};

const flagKey = (s: Section) => `navta.tour.${s.key}.v${s.version}`;

export function AppTour() {
  const location = useLocation();
  const [active, setActive] = useState<Section | null>(null);
  const [i, setI] = useState(0);

  // Il tour aspetta solo che la welcome NON sia visibile ORA. Il vecchio gate
  // (`navta.welcome.dismissed === "1"`) era rotto in entrambe le direzioni:
  // il flag viene scritto SOLO se la welcome è apparsa, quindi chi aveva già
  // viaggi o Drive collegato non avrebbe mai visto NESSUN tour; e l'utente
  // nuovo che la archiviava non vedeva il tour della Home nella prima
  // sessione (l'effect era già girato e non ri-scattava).
  const [welcomeGone, setWelcomeGone] = useState(() => !shouldShowWelcome());
  useEffect(() => {
    const onDismiss = () => setWelcomeGone(true);
    window.addEventListener("navta:welcome-dismissed", onDismiss);
    return () => window.removeEventListener("navta:welcome-dismissed", onDismiss);
  }, []);

  // Quale sezione mostrare, in base alla rotta (e appena la welcome se ne va).
  useEffect(() => {
    if (!welcomeGone) return;
    const key = PATH_TO_SECTION[location.pathname];
    const section = key ? SECTIONS[key] : undefined;
    if (!section) return;
    if (localStorage.getItem(flagKey(section)) === "1") return;
    setActive(section);
    setI(0);
  }, [location.pathname, welcomeGone]);

  // Scroll-lock iOS-proof mentre la scheda è aperta (stesso pattern di diario/
  // pianifica): body fixed + posizione ripristinata alla chiusura.
  useEffect(() => {
    if (!active) return;
    const html = document.documentElement, body = document.body;
    const scrollY = window.scrollY;
    const prev = { htmlO: html.style.overflow, pos: body.style.position, top: body.style.top, w: body.style.width };
    html.style.overflow = "hidden";
    body.style.position = "fixed"; body.style.top = `-${scrollY}px`; body.style.left = "0"; body.style.right = "0"; body.style.width = "100%";
    return () => {
      html.style.overflow = prev.htmlO;
      body.style.position = prev.pos; body.style.top = prev.top; body.style.left = ""; body.style.right = ""; body.style.width = prev.w;
      window.scrollTo(0, scrollY);
    };
  }, [active]);

  // Esc = salta questa sezione (la marca come vista: non riappare). Il listener
  // va su window, NON come onKeyDown sul div del portale: quel div non ha mai il
  // focus, quindi la pressione reale (target = body) non lo raggiungerebbe mai —
  // stesso pattern di TripDiary/TripPlanner.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { localStorage.setItem(flagKey(active), "1"); setActive(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  const reduce = useMemo(
    () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  if (!active) return null;
  const step = active.steps[i];
  const last = i === active.steps.length - 1;

  const done = () => { localStorage.setItem(flagKey(active), "1"); setActive(null); };
  const next = () => { if (last) done(); else setI(n => n + 1); };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Tutorial — ${step.title}`}
      style={{
        position: "fixed", inset: 0, zIndex: 250, background: "rgba(2,8,20,0.74)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        animation: reduce ? undefined : "navtaTourIn 160ms ease-out",
      }}>
      <style>{"@keyframes navtaTourIn{from{opacity:0}to{opacity:1}}"}</style>
      <div style={{
        position: "relative", width: "100%", maxWidth: 320, background: "#0b1a33",
        border: "0.5px solid #2a3f5f", borderRadius: 16, padding: "22px 20px 16px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)", color: "#f0f4ff",
      }}>
        <button type="button" onClick={done} aria-label="Salta il tutorial"
          style={{ position: "absolute", top: 12, right: 12, width: 28, height: 28, borderRadius: 8, background: "transparent", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <X style={{ width: 16, height: 16 }} />
        </button>

        <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(96,165,250,0.14)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
          <step.Icon style={{ width: 23, height: 23, color: "#60a5fa" }} />
        </div>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 7 }}>{step.title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: "rgba(255,255,255,0.62)" }}>{step.body}</div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {active.steps.map((_, idx) => (
              <span key={idx} style={{ width: 6, height: 6, borderRadius: 999, background: idx === i ? "#60a5fa" : "rgba(255,255,255,0.22)" }} />
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!last && (
              <button type="button" onClick={done} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 12, cursor: "pointer" }}>Salta</button>
            )}
            <button type="button" onClick={next} autoFocus
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#60a5fa", border: "none", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 700, color: "#04203f", cursor: "pointer" }}>
              {last ? "Ho capito" : "Avanti"}{!last && <ArrowRight style={{ width: 14, height: 14 }} />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
