import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Compass } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { useT } from "@/lib/settings";

const NotFound = () => {
  const t = useT();
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: rotta inesistente:", location.pathname);
  }, [location.pathname]);

  // Prima era in inglese, su bg-muted piatto e senza header: l'unica UI fuori
  // dalla palette navy e dall'italiano. Ora in stile con il resto dell'app.
  return (
    <main className="min-h-screen flex flex-col" style={{ background: "#060e1e" }}>
      <AppHeader/>
      <div className="flex-1 flex items-center justify-center px-4">
        <div style={{ maxWidth: 340, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(96,165,250,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Compass style={{ width: 26, height: 26, color: "#60a5fa" }}/>
          </div>
          <div className="font-mono" style={{ fontSize: 40, fontWeight: 800, color: "#f0f4ff", lineHeight: 1 }}>404</div>
          <div className="font-display" style={{ fontSize: 16, fontWeight: 700, color: "#f0f4ff", marginTop: 10 }}>{t("Pagina non trovata")}</div>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.5, margin: "6px 0 18px" }}>
            Questa rotta non esiste. Torna alla home e riparti dal globo.
          </p>
          <Link to="/"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, padding: "10px 22px", borderRadius: 999, background: "#60a5fa", color: "#0a1628", textDecoration: "none" }}>
            Torna alla home
          </Link>
        </div>
      </div>
    </main>
  );
};

export default NotFound;
