import React, { Suspense, lazy } from "react";
import { tr } from "@/lib/settings";
import ReactDOM from "react-dom/client";
import { HashRouter, Route, Routes, useParams } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { setStorageErrorHandler, dropBudgetData } from "./lib/storage";
import { Loader2 } from "lucide-react";
import { SettingsProvider } from "./lib/settings";
import { CloudProvider } from "./lib/cloudContext";
import { BrandBadgeSlot } from "./components/BrandBadge";
import { WelcomeGate } from "./components/WelcomeGate";
import { HomeCityGate } from "./components/HomeCityGate";
import { AppTour } from "./components/AppTour";
// Self-hosted (Fontsource), non da un CDN esterno: erano già dichiarati in
// tailwind.config.ts (font-display/font-mono) ma senza i file veri restavano
// solo un'intenzione, con fallback silenzioso al font di sistema — self-
// hosted così restano disponibili anche offline (la PWA lo richiede).
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-600.css";
import "@fontsource/space-grotesk/latin-700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "@fontsource/jetbrains-mono/latin-800.css";
// Prima arrivava dal CDN jsdelivr (link in index.html): cross-origin, quindi
// mai precache-abile — offline il globo perdeva lo stile. Bundlato qui finisce
// negli asset con hash e quindi nel precache del service worker.
import "maplibre-gl/dist/maplibre-gl.css";
import "./index.css";

const Home = lazy(() => import("./pages/Index"));
const Stats = lazy(() => import("./pages/Stats"));
const NuovoViaggio = lazy(() => import("./pages/NuovoViaggio"));
const ModificaViaggio = lazy(() => import("./pages/ModificaViaggio"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const MieiViaggi = lazy(() => import("./pages/MieiViaggi"));
const ImportaGpx = lazy(() => import("./pages/ImportaGpx"));
const Recap = lazy(() => import("./pages/Recap"));
const InProgramma = lazy(() => import("./pages/InProgramma"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Spazio di localStorage esaurito: prima il salvataggio falliva in silenzio e
// l'utente credeva di aver salvato. Un toast persistente lo dice chiaramente e
// suggerisce l'unica via d'uscita utile (liberare spazio / backup su Drive).
setStorageErrorHandler(() => {
  toast.error(tr("Spazio del browser esaurito: il viaggio NON è stato salvato."), {
    description: tr("Libera spazio eliminando qualche viaggio; se il cloud è attivo i dati restano lì."),
    duration: Infinity,
  });
});

// I budget non esistono più (2026-08-16): si cancellano all'avvio. DOPO
// setStorageErrorHandler, non prima: con la memoria del browser piena la
// scrittura fallisce, e prima l'avviso non era ancora installato — la pulizia
// falliva in perfetto silenzio.
try { dropBudgetData(); } catch { /* storage non disponibile: si riprova al prossimo avvio */ }

function RouteFallback() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: "rgba(255,255,255,0.6)" }} />
    </div>
  );
}

// ModificaViaggio inizializza TUTTO lo stato al mount (dal viaggio :id): senza
// key, saltando dalla history di /modifica-viaggio/A direttamente a /B il
// componente restava montato col form di A sotto l'URL di B — e "Salva"
// sovrascriveva B con i dati di A. La key forza il rimontaggio al cambio id.
function ModificaViaggioRoute() {
  const { id } = useParams();
  return <ModificaViaggio key={id} />;
}

// Solo in produzione: in dev il service worker intercetterebbe le richieste
// dei moduli di Vite e romperebbe l'hot reload. Il percorso usa BASE_URL
// perché in produzione l'app vive sotto /Mytravellog/ (vite.config.ts):
// un "/sw.js" fisso andrebbe in 404 sulla radice del dominio.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(() => {
      // installazione PWA non disponibile su questo browser: l'app
      // funziona comunque normalmente, semplicemente senza offline/installabilità.
    });
  });
}

const rootEl = document.getElementById("root")!;
rootEl.style.backgroundColor = "#060e1e";
rootEl.style.minHeight = "100vh";
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <SettingsProvider>
      <CloudProvider>
        <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/statistiche" element={<Stats />} />
              <Route path="/impostazioni" element={<SettingsPage />} />
              <Route path="/nuovo-viaggio" element={<NuovoViaggio />} />
              <Route path="/modifica-viaggio/:id" element={<ModificaViaggioRoute />} />
              <Route path="/miei-viaggi" element={<MieiViaggi />} />
              <Route path="/importa-gpx" element={<ImportaGpx />} />
              <Route path="/recap" element={<Recap />} />
              <Route path="/in-programma" element={<InProgramma />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          <Toaster richColors position="top-right" />
          <BrandBadgeSlot />
          {/* Benvenuto SOLO al primo avvio (dispositivo vergine): overlay sopra
              tutto, si archivia per sempre al primo tap. */}
          <WelcomeGate />
          {/* Città di partenza: obbligatoria, si passa solo indicandola.
              Aspetta che il benvenuto sia archiviato (sta più in alto e lo
              coprirebbe); a chi usa già l'app compare subito, e i viaggi
              rimasti senza partenza ereditano la città appena scelta. */}
          <HomeCityGate />
          {/* Mini tutorial per sezione, prima visita (dopo il benvenuto).
              Montato qui una volta sola: legge la rotta e non tocca le pagine
              (Index/MieiViaggi/Stats sono FROZEN). */}
          <AppTour />
        </HashRouter>
      </CloudProvider>
    </SettingsProvider>
  </React.StrictMode>
);
