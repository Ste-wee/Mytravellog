/**
 * Firma "By 🐻" a FINE PAGINA (non fissa): scorre col contenuto e compare in
 * fondo, come la firma sul retro di una stampa — non copre mai le card.
 *
 * Montata globale in main.tsx DOPO <Routes>, quindi in flusso normale finisce
 * in coda al documento su ogni pagina scrollabile. Sulle viste a schermo intero
 * (editor quadro, poster/flyover) resta sotto e non si vede: lì la firma arriva
 * comunque dall'export. Il logo è servito da public/ via BASE_URL (funziona
 * anche sotto /Mytravellog/ su Pages).
 */
import { useLocation } from "react-router-dom";
/**
 * Dove montare la firma: ovunque TRANNE la Home.
 *
 * In Home il badge costava esattamente lo scroll della pagina — 916px di
 * contenuto su 844 di schermo, e quei 72px sono suoi: padding 18+24 più i 30
 * del logo. Senza, la Home entra al pixel nello schermo e smette di
 * rimbalzare. Il marchio lì non sparisce comunque: NAV·TA col suo logo è
 * nell'header, quindi la firma era la seconda della stessa schermata.
 *
 * La conoscenza delle rotte sta QUI e non dentro BrandBadge: la firma resta un
 * componente puro, montabile ovunque anche fuori da un Router.
 */
export function BrandBadgeSlot() {
  const { pathname } = useLocation();
  return pathname === "/" ? null : <BrandBadge />;
}

export function BrandBadge() {
  return (
    <div
      aria-hidden
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        padding: "18px 0 24px", opacity: 0.5,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.55)", letterSpacing: "0.03em" }}>By</span>
      <img
        src={`${import.meta.env.BASE_URL}logo-orsi.png`}
        alt=""
        width={30}
        height={30}
        style={{ display: "block" }}
      />
    </div>
  );
}
