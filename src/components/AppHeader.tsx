// [FROZEN] — Non modificare senza esplicita richiesta
import { useRef } from "react";
import { useT } from "@/lib/settings";
import { Link } from "react-router-dom";
import { Plane, PieChart, Settings, Plus, Menu, Upload, CalendarClock, HelpCircle, Sun } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

interface Props {
  onTripsClick?: () => void;
}

export function AppHeader({ onTripsClick }: Props) {
  const t = useT();
  // Scegliendo «Rivedi il tutorial», il menu NON deve ridarsi il focus alla
  // chiusura: il suo ripristino (che arriva a fine animazione) vincerebbe sul
  // focus della scheda del tour, e l'Invio successivo riaprirebbe il menu
  // sopra il tutorial — misurato dal vivo. Per i link normali il ripristino
  // resta: si sta navigando, è il comportamento giusto.
  const zittisciRitornoFocus = useRef(false);
  return (
    <header className="border-b border-border bg-background/80 backdrop-blur-xl sticky top-0 z-20">
      <div className="container mx-auto px-6 py-3 flex items-center justify-between">

        {/* Logo — click to go home */}
        <Link to="/" className="flex items-center gap-3" style={{textDecoration:"none"}}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "#60a5fa" }}>
            <svg width="26" height="26" viewBox="0 0 30 30" fill="none" aria-hidden="true">
              <circle cx="15" cy="15" r="11" stroke="#020d1a" strokeWidth="1.6"/>
              <ellipse cx="15" cy="15" rx="11" ry="4.8" stroke="#020d1a" strokeWidth="1.2"/>
              <ellipse cx="15" cy="15" rx="6.5" ry="11" stroke="#020d1a" strokeWidth="1.2"/>
              <polygon points="15,5.5 13.5,13 15,11.5 16.5,13" fill="#ffffff"/>
              <polygon points="15,24.5 13.5,17 15,18.5 16.5,17" fill="#ffffff" opacity="0.35"/>
              <polygon points="24.5,15 17,13.5 18.5,15 17,16.5" fill="#fbbf24"/>
              <polygon points="5.5,15 13,13.5 11.5,15 13,16.5" fill="#fbbf24" opacity="0.35"/>
            </svg>
          </div>
          <h1 className="text-[20px] font-extrabold leading-none tracking-[0.2em]">
            <span style={{ color: "#60a5fa" }}>NAV</span>
            <span style={{ color: "#fbbf24" }}>·</span>
            <span>TA</span>
          </h1>
        </Link>

        {/* Nav unica ovunque (desktop = mobile): un solo bottone hamburger che
            apre il menu. Prima su desktop c'era una riga di link sempre visibili;
            ora l'esperienza è identica su ogni schermo (scelta "tutto uguale a
            mobile"). */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="btn-ghost p-2" aria-label={t("Menu")}>
              <Menu className="w-5 h-5"/>
            </button>
          </DropdownMenuTrigger>
          {/* Ordine per SEZIONI (scelta di Stefano, 2026-08-16): dove vai →
              cosa aggiungi → configurazione. Prima Impostazioni stava in mezzo
              alla navigazione, sopra il separatore: la voce che si apre una
              volta ogni tanto precedeva l'azione principale dell'app. */}
          <DropdownMenuContent align="end"
            onCloseAutoFocus={(e) => {
              if (zittisciRitornoFocus.current) { zittisciRitornoFocus.current = false; e.preventDefault(); }
            }}>
            <DropdownMenuLabel style={{ fontSize: 11, letterSpacing: "0.08em", color: "rgba(255,255,255,0.45)", paddingBottom: 2 }}>
              {t("I tuoi viaggi")}
            </DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link to="/miei-viaggi" className="flex items-center gap-2 cursor-pointer">
                <Plane className="w-4 h-4 text-primary"/> {t("I miei viaggi")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/in-programma" className="flex items-center gap-2 cursor-pointer">
                <CalendarClock className="w-4 h-4 text-primary"/> {t("In programma")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/statistiche" className="flex items-center gap-2 cursor-pointer">
                <PieChart className="w-4 h-4 text-primary"/> {t("Statistiche")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator/>
            <DropdownMenuLabel style={{ fontSize: 11, letterSpacing: "0.08em", color: "rgba(255,255,255,0.45)", paddingBottom: 2 }}>
              {t("Aggiungi")}
            </DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link to="/nuovo-viaggio" className="flex items-center gap-2 cursor-pointer font-semibold" style={{ color: "#60a5fa" }}>
                <Plus className="w-4 h-4"/> {t("Nuovo viaggio")}
              </Link>
            </DropdownMenuItem>
            {/* La gita SOTTO il viaggio: il viaggio è l'azione principale (blu,
                in grassetto), la gita la scorciatoia per quando non dormi
                fuori. Porta allo stesso form con `?gita=1`, che chiede una data
                sola — la gita resta un viaggio con partenza uguale al ritorno,
                nessun tipo nuovo nel dato. */}
            <DropdownMenuItem asChild>
              <Link to="/nuovo-viaggio?gita=1" className="flex items-center gap-2 cursor-pointer" style={{ color: "#fbbf24" }}>
                <Sun className="w-4 h-4"/> {t("Nuova gita")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/importa-gpx" className="flex items-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4 text-primary"/> {t("Importa da GPX")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator/>
            {/* Rivedi il tutorial: un evento window, non una rotta — lo
                raccoglie AppTour (che è montato una volta sola in main) e
                riapre tutti i capitoli in fila. Il menu Radix si chiude da
                solo su onSelect, quindi la scheda appare sopra la pagina
                corrente, qualunque essa sia. */}
            <DropdownMenuItem
              className="flex items-center gap-2 cursor-pointer"
              onSelect={() => {
                zittisciRitornoFocus.current = true;
                window.dispatchEvent(new Event("navta:tour-replay"));
              }}>
              <HelpCircle className="w-4 h-4 text-muted-foreground"/> {t("Rivedi il tutorial")}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/impostazioni" className="flex items-center gap-2 cursor-pointer">
                <Settings className="w-4 h-4 text-muted-foreground"/> {t("Impostazioni")}
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

      </div>
    </header>
  );
}
