import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/settings";
// SOLO i tipi: `import type` sparisce alla compilazione — maplibre-gl resta
// caricato dinamicamente (loadMapLibre) e fuori dal bundle iniziale.
import type { Map as MapLibreMap, Marker as MapLibreMarker, GeoJSONSource, StyleSpecification } from "maplibre-gl";
import { loadMapLibre } from "@/lib/maplibre";
import { createPortal } from "react-dom";
import { Trip, formatTripDate } from "@/lib/storage";
import { buildFlightPath, buildFlightLegs, tripTotalKm, buildPerTripRouteCoords, easeInOutCubic, pointAlongPath, tracciatoProgressivo, FlightLeg } from "@/lib/flyover";
import { unwrapNear } from "@/lib/lonWrap";
import { codecCostruzione, formatoRegistrabile, kmContatiPerTratta, misureVideo, nomeFileVideo } from "@/lib/voloVideo";
import { riquadriDelVolo } from "@/lib/riquadriVolo";
import type { Camera } from "@/lib/copioneVolo";
import type { Box, Riquadro, RiquadroFisso } from "@/lib/etichetteMappa";
import fixWebmDuration from "fix-webm-duration";
import { compagniDeiViaggi, viaggiCon } from "@/lib/compagni";
import { saveReliefImage } from "@/lib/photoStorage";
import { buildPosterSvg, loadCountryRings, routeBounds, unwrapSegments } from "@/lib/posterSvg";
import { loadCoste } from "@/lib/worldAtlas";
import { STAMPA, BORDI_STAMPA, VELOCITA_MARKER, DECOLLO_MS, FINALE_VIDEO_MS, TITOLO_MS, ATTESA_DECOLLO_MS, ATTESA_TAPPA_MS, AVVICINAMENTO_ZOOM, FONT_NOMI, stileBottoneVolo } from "./flyover/constants";
import { buildSatelliteStyle, buildSatelliteStylePiatto, buildConstellationStyle, type MapStyleMode } from "./flyover/mapStyles";
import { TRANSPORT_MAP, loadModeIcon, createFinalPinImageData } from "./flyover/mapImages";
import { drawBrandSignatureCanvas, disegnaIcona, disegnaContatore, disegnaTitolo } from "./flyover/canvasDraw";
import { buildFlyoverRouteCoords, formatKm, attesa } from "./flyover/util";
import type { NomiMappa } from "./flyover/tipi";
import { OverlayNomi } from "./flyover/OverlayNomi";
import { HudVolo } from "./flyover/HudVolo";
import { CreazioneVideo } from "./flyover/CreazioneVideo";
import { SchedaPoster } from "./flyover/SchedaPoster";
import { ChipCompagni } from "./flyover/ChipCompagni";
import { BarraAzioni } from "./flyover/BarraAzioni";
import { stampaMappaVita } from "./flyover/stampa";
import { componiPoster } from "./flyover/poster";
import { disponiNomiVita, fotografaRiquadro, type BordoNomi } from "./flyover/nomiVita";
import { creaVideo } from "./flyover/creaVideo";
import { aggiungiCosteVita, aggiungiStrati, type DatiStrati } from "./flyover/stratiMappa";
import { cameraPoster as cameraPosterDi, flyToOverview as voloPanoramica } from "./flyover/camera";
import { TitoloFirmaVita } from "./flyover/TitoloFirmaVita";
import { lineaFatta, preparaTracciatoFatto, tagliaTraccia, attendiMappaPronta, chiudiTracciatoFatto, gesti, modoDi, visibile } from "./flyover/mapOps";
import { X, Loader2, RotateCcw, Film, Home } from "lucide-react";
import { canShareFile, downloadBlob, shareOrDownload } from "@/lib/share";
import { leggiTitoloVita, salvaTitoloVita, TITOLO_VITA } from "@/lib/titoloVita";

interface Props {
  trips: Trip[];
  onClose: () => void;
  /**
   * "Mappa della vita": mostra TUTTI i viaggi come costellazione unica, con una
   * polilinea SEPARATA per viaggio (nessuna tratta di collegamento tra viaggi) e
   * titolo/statistiche dedicati (viaggi · paesi · km invece di km · tappe).
   */
  lifeMap?: boolean;
}

/**
 * Poster statico del viaggio in 3D: mappa satellitare inclinata con il tracciato
 * (giallo) e le tappe a puntine con i nomi città, inquadrata sull'intero
 * percorso. Sopra: dati del viaggio (con bandiere dei paesi a ventaglio) e le
 * foto a ventaglio. L'utente può zoomare/spostare, poi "Salva" (lo snapshot
 * diventa il foglio sul biglietto in "I miei viaggi") o "Condividi" (immagine).
 *
 * IL VOLO (tornato il 2026-10-06, richiesto da Stefano): sul viaggio singolo
 * e sull'anno, all'apertura la camera VOLA tratta per tratta — icona del mezzo
 * lungo il tracciato, contatore dei km — e atterra su questo poster. Il volo si
 * registra in un video (.webm, o .mp4 su Safari) da scaricare a fine corsa.
 * La Mappa della vita resta statica. Il volo era stato tolto il 2026-07-23
 * (tag `flyover-animato-v1`): qui è ripreso dentro il poster di oggi, non
 * ripristinato al posto suo.
 */
export function TripFlyover({ trips, onClose, lifeMap = false }: Props) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mountedRef = useRef(true);
  const allCoordsRef = useRef<[number, number][]>([]);
  // Segmenti del tracciato: uno per viaggio in modalità Mappa della vita (linee
  // separate), un unico segmento concatenato negli altri casi.
  const routeSegsRef = useRef<[number, number][][]>([]);
  const totalKmRef = useRef(0);
  const legsRef = useRef<FlightLeg[]>([]);
  const stopsRef = useRef<{ lat: number; lon: number; label: string }[]>([]);
  const finalPinDataRef = useRef<ImageData | null>(null);
  const switchingRef = useRef(false);

  const [phase, setPhase] = useState<"loading" | "ready" | "error" | "empty">("loading");
  const [poster, setPoster] = useState(false); // overlay del poster pronti (dopo l'inquadratura)
  const [savingRelief, setSavingRelief] = useState(false);
  const [exportingSvg, setExportingSvg] = useState(false);
  // La Mappa della vita parte in Costellazione; dal 2026-10-15 si può passare
  // al Satellite (piatto, vedi buildSatelliteStylePiatto), scelta di Stefano.
  const [styleMode, setStyleMode] = useState<MapStyleMode>(lifeMap ? "constellation" : "satellite");
  /** Lo stile che la mappa ha addosso adesso (lo copia la mappa dei riquadri). */
  const stileRef = useRef<StyleSpecification | null>(null);
  const styleModeRef = useRef<MapStyleMode>(styleMode);
  styleModeRef.current = styleMode;
  /** Mappa della vita: nomi, fili e riquadri della vista di adesso (vedi
   *  calcolaNomi), con le foto dei riquadri. Li ricopia l'immagine condivisa. */
  const [nomi, setNomi] = useState<NomiMappa | null>(null);
  const nomiRef = useRef<NomiMappa | null>(null);
  /** False mentre la mappa si muove: i nomi spariscono e tornano a mappa ferma. */
  const [nomiFermi, setNomiFermi] = useState(true);
  const calcoloNomiRef = useRef(0);
  const mappaRiqRef = useRef<{ map: MapLibreMap; div: HTMLDivElement; stile: StyleSpecification; stella: number } | null>(null);
  const mappaRiqInVoloRef = useRef<{ stile: StyleSpecification; p: Promise<MapLibreMap | null> } | null>(null);
  /** Le foto dei riquadri della vista di adesso, finché arrivano (le aspetta,
   *  poco, l'immagine condivisa). */
  const fotoInCorsoRef = useRef<Promise<void> | null>(null);
  const misuraRef = useRef<CanvasRenderingContext2D | null>(null);
  /** Le coste della Mappa della vita (caricate una volta, vedi COSTE_E1). */
  const costeRef = useRef<GeoJSON.Feature<GeoJSON.MultiLineString> | null>(null);
  /** Il titolo della Mappa della vita (scelta di Stefano, 2026-10-16: «solo il
   *  titolo», in alto a destra), salvato su questo dispositivo. */
  const [titoloVita, setTitoloVita] = useState(() => (lifeMap ? leggiTitoloVita() : ""));
  const titoloVitaRef = useRef(titoloVita);
  titoloVitaRef.current = titoloVita;
  const [scriviTitolo, setScriviTitolo] = useState(false);
  /** «Per la stampa» in corso: la percentuale, o null. */
  const [stampa, setStampa] = useState<number | null>(null);
  const stampaRef = useRef(false);
  /** La stampa non è riuscita: lo dice il bottone per qualche secondo. */
  const [stampaFallita, setStampaFallita] = useState(false);
  /**
   * ANTEPRIMA DI STAMPA (Stefano, 2026-10-19: «come mai la stampa viene
   * diversa da quello che vedo?»). La stampa rifaceva la disposizione su un
   * foglio 4:3 con nomi e riquadri più grandi, e i gruppi cambiavano. Ora
   * «Per la stampa» apre un'anteprima: la mappa diventa un riquadro 4:3, nomi
   * e riquadri si calcolano in misure di STAMPA (foglio 1200×900, mostrato
   * rimpicciolito), e «Scarica» disegna QUELLA mappa con più pixel. Quello che
   * vedi è quello che stampi.
   */
  const [anteprima, setAnteprima] = useState(false);
  const fogliettoRef = useRef(false);
  fogliettoRef.current = anteprima;
  /** Il riquadro 4:3 della mappa dentro la scheda, in anteprima. */
  const [cornice, setCornice] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  /**
   * I riquadri regolati A MANO in anteprima (scelta B di Stefano, 2026-10-19:
   * «dammi la possibilità di regolare grandezza, altezza e larghezza dei
   * quadrati»): per chiave del gruppo, in px di foglio. Valgono per QUESTA
   * inquadratura: spostando o avvicinando la mappa si azzerano (i riquadri si
   * rifanno per la vista nuova). Li usa anche la stampa.
   */
  const [fissi, setFissi] = useState<Record<string, RiquadroFisso>>({});
  const fissiRef = useRef<Record<string, RiquadroFisso>>({});
  fissiRef.current = fissi;
  const fissiCameraRef = useRef<{ lng: number; lat: number; zoom: number } | null>(null);
  /** Il riquadro scelto (le maniglie) e quello che si sta trascinando, dal vivo. */
  const [scelto, setScelto] = useState<string | null>(null);
  const [trascina, setTrascina] = useState<{ chiave: string; box: Box } | null>(null);
  /** Il compagno selezionato, o null per tutti. Filtra la costellazione. */
  /**
   * ⚠️ BANCO DI PROVA (2026-08-27, da smontare quando Stefano sceglie): le due
   * varianti di stella sopravvissute al confronto a cinque — «soffusa» (alone
   * stretto) e «secca» (solo il nucleo). Si ricorda fra un'apertura e l'altra
   * per poterle confrontare con calma, come il vecchio banco del tratto.
   */
  const [stellaSecca, setStellaSecca] = useState(() => {
    try { return localStorage.getItem("navta.prova.stelle.secche") === "1"; } catch { return false; }
  });
  const cambiaStella = (v: boolean) => {
    setStellaSecca(v);
    try { localStorage.setItem("navta.prova.stelle.secche", v ? "1" : "0"); } catch { /* quota piena: pazienza */ }
  };
  /**
   * Mappa della vita: i comandi SI TOLGONO QUANDO GUARDI (idea di Stefano,
   * 2026-08-27, per fare lo screenshot pulito della mappa). Dopo 3s senza
   * tocchi né mouse sfumano tutti — X, interruttore, nomi, azioni — e
   * qualunque tocco o movimento li riporta. Da nascosti non sono cliccabili:
   * il primo tocco SVEGLIA, non preme un bottone invisibile.
   */
  const [comandiVisibili, setComandiVisibili] = useState(true);
  useEffect(() => {
    if (!lifeMap) return;
    let timer: number | undefined;
    const sveglia = () => {
      setComandiVisibili(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setComandiVisibili(false), 3000);
    };
    sveglia();
    const eventi = ["pointerdown", "pointermove", "wheel", "keydown", "touchstart"] as const;
    eventi.forEach(e => window.addEventListener(e, sveglia, { passive: true }));
    return () => { window.clearTimeout(timer); eventi.forEach(e => window.removeEventListener(e, sveglia)); };
  }, [lifeMap]);
  /** Lo stile del riposo, spalmato su ogni blocco di comandi (vuoto fuori dalla
   *  Mappa della vita: gli altri poster tengono i comandi sempre accesi). */
  // ⚠️ durante «Per la stampa» (fino a un minuto e più) restano ACCESI: a
  // riposo sfumava anche la percentuale e sembrava ferma (visto dal vivo)
  const comandiAccesi = comandiVisibili || stampa !== null;
  const velo = lifeMap ? {
    opacity: comandiAccesi ? 1 : 0,
    pointerEvents: (comandiAccesi ? "auto" : "none") as "auto" | "none",
    transition: "opacity 400ms ease",
  } : {};
  const [soloCon, setSoloCon] = useState<string | null>(null);
  /**
   * Le persone con cui hai viaggiato, in ordine di quante volte.
   *
   * ⚠️ Il confronto è senza maiuscole ma l'etichetta mostra la PRIMA forma
   * incontrata: «giulia» e «Giulia» sono la stessa persona e un chip solo, non
   * due. È lo stesso criterio del filtro che già esisteva sul biglietto.
   */
  const compagni = useMemo(() => compagniDeiViaggi(trips), [trips]);

  /**
   * L'insieme che la mappa disegna DAVVERO: filtrato per compagno.
   *
   * ⚠️ Da qui in giù nel componente si usa `viaggi`, non `trips`: se il filtro
   * valesse solo per le linee, titolo, km e conteggi resterebbero quelli di
   * tutti — la stessa mezza-verità che sulle gite aveva fatto dire a Stefano
   * «qualcosa non torna».
   */
  const viaggi = useMemo(() => viaggiCon(trips, soloCon), [trips, soloCon]);
  const [switching, setSwitching] = useState(false);

  // ── Lo stato del VOLO (solo fuori dalla Mappa della vita) ──────────────────
  const animato = !lifeMap;
  type StatoVolo = "spento" | "inVolo" | "pausa" | "finito";
  const [volo, setVolo] = useState<StatoVolo>("spento");
  const inVolo = volo === "inVolo" || volo === "pausa";
  /** Ogni volo ha il suo numero: cambiarlo ferma i loop del volo precedente. */
  const voloIdRef = useRef(0);
  const inPausaRef = useRef(false);
  const rafVoloRef = useRef<number | null>(null);
  const libRef = useRef<Awaited<ReturnType<typeof loadMapLibre>> | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const markerVesteRef = useRef<{ color: string; img: HTMLImageElement | null }>({ color: "#60a5fa", img: null });
  const iconeModiRef = useRef<Record<string, HTMLImageElement>>({});
  const kmFattiRef = useRef(0);
  const contatoreRef = useRef<HTMLSpanElement>(null);
  /** Il formato del video, deciso una volta: null = questo browser non registra. */
  const formato = useMemo(() => (animato ? formatoRegistrabile() : null), [animato]);
  const registratoreRef = useRef<MediaRecorder | null>(null);
  const pezziRef = useRef<Blob[]>([]);
  const rafVideoRef = useRef<number | null>(null);
  const staccaRenderRef = useRef<(() => void) | null>(null);
  const finaleVideoRef = useRef<HTMLCanvasElement | null>(null);
  const finaleT0Ref = useRef(0);
  /** Il cronometro della registrazione, AL NETTO delle pause (che il
   *  registratore non registra): serve a scrivere la durata nel .webm. */
  const regInizioRef = useRef(0);
  const regPausaDaRef = useRef<number | null>(null);
  const regPausaTotRef = useRef(0);
  /** Fino a quando (performance.now) il titolo d'apertura sta a schermo e nel video. */
  const titoloFinoRef = useRef(0);
  const [titoloVisibile, setTitoloVisibile] = useState(false);
  /**
   * All'atterraggio il VIDEO si ferma sull'ultimo fotogramma del volo, mentre a
   * schermo la mappa si allarga dal vivo: nell'allargamento i riquadri a bassa
   * quota non sono ancora caricati e mezzo fotogramma era blu vuoto (prima,
   * scie). Quando la mappa è pronta il poster entra in dissolvenza: un taglio
   * pulito dall'arrivo al poster intero.
   */
  const congelaVideoRef = useRef(false);
  /** Lo scaricamento in anticipo dei riquadri del volo (si interrompe a fine volo). */
  const precaricoRef = useRef<AbortController | null>(null);
  /** «Crea video»: avanzamento (0-100, null = fermo), annulla, anteprima. */
  const [creazione, setCreazione] = useState<number | null>(null);
  const creazioneRef = useRef(false);
  const annullaVideoRef = useRef(false);
  const anteprimaRef = useRef<HTMLCanvasElement | null>(null);
  /** Questo browser sa fare un video? (costruito, o almeno registrato dal vivo) */
  const [sa, setSa] = useState<"costruito" | "dal-vivo" | null>(null);
  /** L'icona nel fotogramma congelato: pixel fissi, non riproiettati sulla mappa che si muove. */
  const markerFissoRef = useRef<{ x: number; y: number; t0: number; color: string; img: HTMLImageElement | null } | null>(null);
  const videoUrlRef = useRef<string | null>(null);
  const [video, setVideo] = useState<{ url: string; blob: Blob } | null>(null);

  const tripsCount = viaggi.length;
  const legs = legsRef.current;
  // date_end può essere null (viaggio di un giorno): senza il check esplicito
  // il confronto era falso e si finiva in formatTripDate(null) → la didascalia
  // diceva "12 lug 2026 → Invalid Date" su card, JPEG e SVG.
  const dateRangeLabel = tripsCount === 1
    ? (viaggi[0].date_end == null || viaggi[0].trip_date === viaggi[0].date_end
      ? formatTripDate(viaggi[0].trip_date)
      : `${formatTripDate(viaggi[0].trip_date)} → ${formatTripDate(viaggi[0].date_end)}`)
    : null;

  // Codici bandiera dei paesi TOCCATI (destinazione + tappe), in ordine di
  // percorso, deduplicati per nome (IT/Italia non si ripete) tenendo il codice.
  const flagCodes = useMemo(() => {
    const seen = new Set<string>();
    const codes: string[] = [];
    const add = (name?: string, code?: string) => {
      const key = (name || code || "").trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      if (code) codes.push(code.toLowerCase());
    };
    for (const t of viaggi) {
      for (const w of t.waypoints ?? []) add(w.country, w.country_code);
      add(t.country, t.country_code);
    }
    return codes.slice(0, 5);
  }, [viaggi]);

  // Titolo del poster: dedicato per la Mappa della vita, altrimenti nome del
  // viaggio (singolo) o conteggio (recap multi-viaggio).
  const posterTitle = lifeMap
    ? "La mappa della mia vita"
    : (tripsCount > 1 ? `${tripsCount} viaggi rivissuti` : viaggi[0].title);

  // Metriche mostrate su card/pillole: gli altri poster km · tappe come prima.
  // La Mappa della vita NON mostra statistiche (la mappa parla da sé): niente
  // pillole né riga stats, resta solo titolo + bandiere. Letta al momento della
  // resa/cattura (i ref sono già popolati quando il poster è visibile).
  const statMetrics = (): { v: string; l: string }[] => lifeMap
    ? []
    : [
        { v: formatKm(totalKmRef.current), l: "km" },
        // Tradotta e al singolare quando serve: era «tappe» fisso, quindi
        // «1 TAPPE» in italiano e «TAPPE» in inglese (trovato dalla rete della
        // lingua appena ha cominciato a guardare il poster di un viaggio).
        { v: String(legsRef.current.length), l: t(legsRef.current.length === 1 ? "tappa" : "tappe") },
      ];
  const statLine = (): string => statMetrics().map(m => `${m.v} ${m.l}`).join("  ·  ");

  // Esc chiude il poster (oltre a click fuori / X) — ma non mentre si scrive:
  // dentro la casella del titolo Esc annulla la scrittura (prima chiudeva
  // TUTTA la Mappa della vita, trovato dalla prova dal vivo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const dove = e.target as HTMLElement | null;
      if (dove && (dove.tagName === "INPUT" || dove.tagName === "TEXTAREA")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** L'inquadratura del poster (flyover/camera.ts) sul tracciato di adesso. */
  const cameraPoster = (map: MapLibreMap, pitch = 45) => cameraPosterDi(map, allCoordsRef.current, pitch);
  const flyToOverview = (map: MapLibreMap, pitch = 45) => voloPanoramica(map, allCoordsRef.current, pitch);

  /** Gli strati sopra lo stile (flyover/stratiMappa.ts), coi dati di adesso. */
  const datiStrati = (): DatiStrati => ({
    lifeMap, stellaSecca, coste: costeRef.current, stops: stopsRef.current,
    segmenti: routeSegsRef.current, finalPin: finalPinDataRef.current,
  });
  const aggiungiCoste = (map: MapLibreMap, mode: MapStyleMode) => aggiungiCosteVita(map, mode, datiStrati());
  // si scaricano al PRIMO passaggio al Satellite: in Costellazione non servono
  // (prima partivano a ogni apertura, anche sul telefono)
  const costeInArrivoRef = useRef(false);
  useEffect(() => {
    if (!lifeMap || styleMode !== "satellite" || costeRef.current || costeInArrivoRef.current) return;
    costeInArrivoRef.current = true;
    loadCoste("50m").then(c => {
      costeRef.current = c;
      if (!mountedRef.current || styleModeRef.current !== "satellite") return;
      const m = mapRef.current;
      if (m) { try { aggiungiCoste(m, "satellite"); } catch { /* stile in cambio: le aggiunge addOverlayLayers */ } }
      // anche alla mappa nascosta dei riquadri, e le foto si rifanno: senza,
      // i riquadri restavano senza coste finché non si spostava la mappa
      const riq = mappaRiqRef.current?.map;
      if (riq) { try { aggiungiCoste(riq, "satellite"); } catch { /* non ancora pronta */ } }
      if (m) void calcolaNomi(m);
    }).catch(() => { /* senza rete: il Satellite resta senza coste */ })
      .finally(() => { costeInArrivoRef.current = false; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifeMap, styleMode]);

  const addOverlayLayers = (map: MapLibreMap, mode: MapStyleMode) => aggiungiStrati(map, mode, datiStrati());

  /** Cambia vista (satellite / linee / costellazione): sostituisce lo stile,
   *  ri-aggiunge gli overlay col look giusto e rianima l'inquadratura. Satellite
   *  e Linee inclinate (pitch 45); Costellazione piatta dall'alto (master di
   *  stampa, niente prospettiva). */
  const applyStyle = async (mode: MapStyleMode) => {
    const map = mapRef.current;
    if (!map || switchingRef.current) return;
    switchingRef.current = true;
    setSwitching(true);
    try {
      const style = mode === "satellite"
        ? await (lifeMap ? buildSatelliteStylePiatto() : buildSatelliteStyle())
        : buildConstellationStyle();
      if (!mapRef.current) return;
      stileRef.current = style;
      map.setStyle(style, { diff: false });
      await new Promise<void>(res => {
        let done = false;
        const fin = () => { if (done) return; done = true; res(); };
        map.once("style.load", fin);
        setTimeout(fin, 2500); // salvagente se l'evento non scatta
      });
      if (!mapRef.current || !mountedRef.current) return;
      addOverlayLayers(map, mode);
      // la Mappa della vita resta piatta anche in Satellite (vedi buildSatelliteStylePiatto)
      await flyToOverview(map, mode === "constellation" || lifeMap ? 0 : 45);
    } catch { /* se il cambio stile fallisce, resta la vista precedente */ }
    finally {
      switchingRef.current = false;
      if (mountedRef.current) setSwitching(false);
    }
  };

  const selectStyle = (mode: MapStyleMode) => {
    // a metà stampa si mescolerebbero due stili (foto satellitari con le stelle)
    if (stampaRef.current) return;
    if (switchingRef.current || mode === styleMode) return;
    setStyleMode(mode);
    applyStyle(mode);
  };

  /** Il POSTER su un canvas (flyover/poster.ts), coi valori di adesso. */
  const composePoster = (mapCanvas: HTMLCanvasElement, flagImgs: HTMLImageElement[], logoImg: HTMLImageElement | null, dpr?: number) => componiPoster({
    lifeMap, nomi: nomiRef.current, modoAttuale: styleModeRef.current, modoVista: styleMode,
    titoloVita: titoloVitaRef.current, posterTitle, dateRangeLabel,
    metriche: statMetrics, rigaStat: statLine, misuraTesto,
  }, mapCanvas, flagImgs, logoImg, dpr);

  /** Logo di marca per la firma sullo snapshot. Stessa origine (public/) →
   *  non "sporca" il canvas, toBlob resta possibile. Caricato una volta sola. */
  const brandLogoRef = useRef<HTMLImageElement | null>(null);
  const loadBrandLogo = (): Promise<HTMLImageElement | null> => new Promise(res => {
    const cached = brandLogoRef.current;
    if (cached && cached.complete && cached.naturalWidth > 0) { res(cached); return; }
    const img = new Image();
    img.onload = () => { brandLogoRef.current = img; res(img); };
    img.onerror = () => res(null);
    setTimeout(() => res(img.complete && img.naturalWidth > 0 ? img : null), 2500);
    img.src = `${import.meta.env.BASE_URL}logo-orsi.png`;
  });

  /** Carica le bandiere dei paesi con crossOrigin (per non "sporcare" il canvas
   *  e permettere toBlob): se una non arriva CORS-clean viene semplicemente
   *  saltata, così il salvataggio non fallisce mai. */
  const loadFlagImages = (): Promise<HTMLImageElement[]> => Promise.all(
    flagCodes.map(code => new Promise<HTMLImageElement | null>(res => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      let done = false;
      const finish = (ok: boolean) => { if (done) return; done = true; res(ok ? img : null); };
      img.onload = () => finish(true);
      img.onerror = () => finish(false);
      setTimeout(() => finish(img.complete && img.naturalWidth > 0), 2500);
      img.src = `https://flagcdn.com/w80/${code}.png`;
    }))
  ).then(arr => arr.filter((x): x is HTMLImageElement => !!x));

  /** Una copia del canvas della mappa, presa DENTRO l'evento "render" (il buffer
   *  WebGL non è preservato: fuori da quel frame drawImage leggerebbe nero).
   *  La usano lo snapshot del poster e il finale del video. */
  const catturaCanvasMappa = (): Promise<HTMLCanvasElement | null> => {
    const map = mapRef.current;
    const mapCanvas = containerRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
    if (!mapCanvas) return Promise.resolve(null);
    return new Promise<HTMLCanvasElement>(res => {
      const grab = () => {
        const c = document.createElement("canvas");
        c.width = mapCanvas.width; c.height = mapCanvas.height;
        c.getContext("2d")!.drawImage(mapCanvas, 0, 0);
        return c;
      };
      if (!map) { res(grab()); return; }
      let done = false;
      const fin = (c: HTMLCanvasElement) => { if (done) return; done = true; res(c); };
      map.once("render", () => fin(grab()));
      map.triggerRepaint();
      setTimeout(() => fin(grab()), 400); // salvagente: copia best-effort
    });
  };

  /** Cattura il poster come JPEG. Forza un render fresco e copia il canvas
   *  in modo SINCRONO dentro l'evento "render": il buffer WebGL non è
   *  preservato (vedi nota alle MapOptions), quindi fuori da quel frame
   *  drawImage leggerebbe nero. */
  const captureSnapshotBlob = async (): Promise<Blob | null> => {
    try {
      const mapCanvas = containerRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
      if (!mapCanvas) return null;
      const [flagImgs, logoImg] = await Promise.all([loadFlagImages(), loadBrandLogo()]);
      // Assicura i font della card (typewriter) prima di disegnarli su canvas:
      // senza, il primo snapshot userebbe un fallback monospazio.
      try {
        if (document.fonts?.load) {
          await Promise.all([
            document.fonts.load('600 24px "Cormorant Garamond"'),
            document.fonts.load('italic 12px "Noto Serif"'),
          ]);
        }
      } catch { /* font non disponibili: si usa il fallback */ }
      // Mappa della vita: le foto dei riquadri ancora in arrivo si aspettano un
      // poco, non di più — ⚠️ oltre ~5 s dal tocco il telefono rifiuta in
      // silenzio la condivisione. Quelle che mancano escono con le sole stelle.
      const fotoInCorso = fotoInCorsoRef.current;
      if (lifeMap && fotoInCorso) await Promise.race([fotoInCorso, new Promise(r => setTimeout(r, 2000))]);
      // Copia il canvas DENTRO il gestore dell'evento "render", in modo
      // sincrono: il backbuffer WebGL (non preservato) è garantito pieno solo
      // lì. Prima la copia avveniva dopo l'await — sul percorso felice reggeva
      // (un solo salto di microtask, prima del compositing), ma il salvagente
      // a tempo scattava in un macrotask a buffer ormai svuotato → poster nero
      // salvato in silenzio (es. app mandata in background subito dopo "Salva").
      const snapshot = await catturaCanvasMappa();
      if (!snapshot) return null;
      const posterCanvas = composePoster(snapshot, flagImgs, logoImg,
        mapCanvas.width / (mapCanvas.clientWidth || mapCanvas.width));
      return await new Promise(res => posterCanvas.toBlob(res, "image/jpeg", 0.9));
    } catch {
      return null;
    }
  };

  // "Salva": cattura la vista corrente (dopo eventuali zoom/spostamenti) come
  // rilievo del viaggio → foglio sul biglietto in "I miei viaggi". Poi chiude.
  const handleSaveRelief = async () => {
    if (savingRelief) return;
    setSavingRelief(true);
    const blob = await captureSnapshotBlob();
    if (blob && viaggi.length === 1) {
      try { await saveReliefImage(viaggi[0].id, blob); } catch { /* IndexedDB non disponibile: non bloccare la chiusura */ }
    }
    onClose();
  };

  // "Condividi": condivide l'immagine del poster (o la scarica se il browser non supporta la condivisione file).
  const handleSharePoster = async () => {
    const blob = await captureSnapshotBlob();
    if (!blob) return;
    const name = lifeMap ? "mappa-della-vita" : (tripsCount === 1 ? viaggi[0].title : "viaggio").replace(/[^\w.-]+/g, "_").slice(0, 40) || "viaggio";
    const file = new File([blob], `${name}-3d.jpg`, { type: "image/jpeg" });
    await shareOrDownload(file, lifeMap ? (titoloVita.trim() || posterTitle) : (tripsCount > 1 ? "Il mio viaggio in 3D" : viaggi[0].title));
  };

  /** «Per la stampa» (flyover/stampa.ts): il file dell'anteprima, 7680×5760. */
  const handleStampa = () => stampaMappaVita({
    lib: libRef.current, map: mapRef.current, stile: stileRef.current,
    modo: styleModeRef.current, stellaSecca, inCorso: stampaRef,
    anteprima: () => fogliettoRef.current, vivo: () => mountedRef.current,
    fissi: () => fissiRef.current, titolo: () => titoloVitaRef.current,
    costeRef, setStampa, setStampaFallita, addOverlayLayers, disponiVita, loadBrandLogo,
  });

  // "Esporta SVG" (solo Costellazione): master VETTORIALE a livelli per la stampa
  // (resina + LED). Confini dal world-atlas ritagliati sul riquadro; tracciato e
  // stelle da dati nostri (precisi); nodi-stella marcati come punti-LED.
  const handleExportSvg = async () => {
    if (exportingSvg) return;
    setExportingSvg(true);
    try {
      const route = allCoordsRef.current;
      const stops = stopsRef.current;
      let rings: [number, number][][] = [];
      try {
        rings = await loadCountryRings(routeBounds(route.length ? route : stops.map(s => [s.lon, s.lat] as [number, number])), "50m");
      } catch { /* confini non disponibili: esporta comunque rotta+stelle */ }
      // Mappa della vita: SVG "nudo" (nessuna caption) → niente titolo/date/stat.
      const title = lifeMap ? "" : (tripsCount > 1 ? `${tripsCount} viaggi` : viaggi[0].title);
      const stats = statLine();
      const svg = buildPosterSvg({ routeSegments: routeSegsRef.current, stops, borders: rings, title, dateLabel: lifeMap ? null : dateRangeLabel, stats, hideLabels: false, nomiOvunque: lifeMap, titoloAngolo: lifeMap ? titoloVita : undefined, misuraTesto });
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const base = lifeMap ? "mappa-della-vita" : (tripsCount === 1 ? viaggi[0].title : "viaggio").replace(/[^\w.-]+/g, "_").slice(0, 40) || "viaggio";
      downloadBlob(blob, `${base}-costellazione.svg`);
    } catch { /* export fallito: non bloccare */ }
    finally {
      if (mountedRef.current) setExportingSvg(false);
    }
  };

  // ══ IL VOLO ════════════════════════════════════════════════════════════
  // Ripreso dal tag `flyover-animato-v1` dentro il poster di oggi. Le regole
  // pure stanno in lib/voloVideo (provate); qui la regia.

  /** Ferma l'animazione del volo in corso (camera + marker + contatore). */
  const fermaAnimazione = () => {
    if (rafVoloRef.current != null) { cancelAnimationFrame(rafVoloRef.current); rafVoloRef.current = null; }
    markerRef.current?.remove();
    markerRef.current = null;
    precaricoRef.current?.abort();
    precaricoRef.current = null;
  };

  /**
   * Scarica in anticipo i riquadri satellite che la camera vedrà, sezione per
   * sezione (0 = decollo, poi una per tratta), così quando ci arriva la mappa
   * è già nitida. Li consegna la cache del browser (o del service worker) alla
   * richiesta di MapLibre. `pronta(i)` si risolve quando le sezioni 0..i sono
   * scaricate; chi la usa mette sempre un tetto all'attesa.
   */
  const avviaPrecarico = (map: MapLibreMap, tratte: FlightLeg[]) => {
    const src = map.getSource("satellite") as { tiles?: string[] } | undefined;
    const modello = src?.tiles?.[0];
    if (!modello) return null;
    const c = map.getCenter();
    const sezioni = [
      { da: { lon: c.lng, lat: c.lat, zoom: map.getZoom() },
        a: { lon: tratte[0].from.lon, lat: tratte[0].from.lat, zoom: tratte[0].camera.zoom } },
      ...tratte.map((tr, i) => ({
        da: { lon: tr.from.lon, lat: tr.from.lat, zoom: (i === 0 ? tr : tratte[i - 1]).camera.zoom },
        a: { lon: tr.to.lon, lat: tr.to.lat, zoom: tr.camera.zoom },
      })),
    ];
    const el = map.getContainer();
    const liste = riquadriDelVolo(sezioni, { w: el.clientWidth, h: el.clientHeight });
    const ctrl = new AbortController();
    precaricoRef.current = ctrl;
    const coda = liste.flatMap((l, s) => l.map(k => ({ k, s })));
    const mancanti = liste.map(l => l.length);
    const attese: (() => void)[][] = liste.map(() => []);
    const pronte = (i: number) => mancanti.slice(0, i + 1).every(n => n === 0);
    const avvisa = () => attese.forEach((a, i) => { if (pronte(i)) { a.forEach(f => f()); a.length = 0; } });
    let prossimo = 0;
    const lavora = async () => {
      while (prossimo < coda.length && !ctrl.signal.aborted) {
        const { k, s } = coda[prossimo++];
        const [z, x, y] = k.split("/");
        try {
          const r = await fetch(modello.replace("{z}", z).replace("{x}", x).replace("{y}", y), { signal: ctrl.signal });
          await r.blob();
        } catch { /* un riquadro perso: lo chiederà MapLibre */ }
        mancanti[s]--;
        avvisa();
      }
    };
    for (let i = 0; i < 6; i++) void lavora();
    return {
      pronta: (i: number) => new Promise<void>(res => {
        if (pronte(Math.min(i, liste.length - 1))) res(); else attese[Math.min(i, liste.length - 1)].push(res);
      }),
    };
  };

  const testoContatore = () => `${formatKm(kmFattiRef.current)} / ${formatKm(totalKmRef.current)} km`;
  const aggiornaContatore = () => { if (contatoreRef.current) contatoreRef.current.textContent = testoContatore(); };

  /** Colore e icona del marker per la tratta che comincia. Stessa simbologia di
   *  biglietto e medaglione finale (@/lib/transport); il rientro a casa è grigio. */
  const vestiMarker = (el: HTMLDivElement, modo: string) => {
    const color = modo === "casa" ? "#64748b" : (TRANSPORT_MAP[modo]?.color ?? "#60a5fa");
    const icona = iconeModiRef.current[modo] ?? null;
    el.style.backgroundColor = color;
    const img = el.firstElementChild as HTMLImageElement | null;
    if (img) {
      if (icona) { img.src = icona.src; img.style.display = ""; } else img.style.display = "none";
    }
    markerVesteRef.current = { color, img: icona };
  };

  /**
   * Muove la camera verso un punto pilotandola A MANO, frame per frame (jumpTo):
   * il flyTo nativo non avanza in modo geograficamente lineare e il marker
   * resterebbe indietro (misurato a suo tempo: camera al 97% del tragitto,
   * marker al 50% — vedi tag). Camera e marker leggono lo STESSO `t`.
   *
   * ⚠️ La PAUSA ferma il tempo invece di interrompere: il loop resta vivo senza
   * avanzare e alla ripresa riparte da dov'era. Nel tag la tratta ricominciava
   * da capo e l'icona saltava indietro.
   */
  const animaCamera = (
    map: MapLibreMap, id: number,
    verso: { lon: number; lat: number; zoom: number; pitch: number; bearing: number },
    durataMs: number, suFrame?: (t: number, rawT: number) => void,
  ): Promise<boolean> => new Promise(resolve => {
    const c0 = map.getCenter(), z0 = map.getZoom(), p0 = map.getPitch(), b0 = map.getBearing();
    // la strada CORTA anche oltre l'antimeridiano (Tokyo → Los Angeles sul Pacifico)
    const lon1 = unwrapNear(verso.lon, c0.lng);
    let inizio = performance.now();
    let pausaDa: number | null = null;
    const tick = () => {
      if (!mountedRef.current || voloIdRef.current !== id) { resolve(false); return; }
      const ora = performance.now();
      if (inPausaRef.current) {
        if (pausaDa == null) pausaDa = ora;
        rafVoloRef.current = requestAnimationFrame(tick);
        return;
      }
      if (pausaDa != null) { inizio += ora - pausaDa; pausaDa = null; }
      const rawT = Math.min(1, (ora - inizio) / Math.max(1, durataMs));
      const t = easeInOutCubic(rawT);
      map.jumpTo({
        center: [c0.lng + (lon1 - c0.lng) * t, c0.lat + (verso.lat - c0.lat) * t],
        zoom: z0 + (verso.zoom - z0) * t,
        pitch: p0 + (verso.pitch - p0) * t,
        bearing: b0 + (verso.bearing - b0) * t,
      });
      suFrame?.(t, rawT);
      if (rawT < 1) rafVoloRef.current = requestAnimationFrame(tick);
      else { rafVoloRef.current = null; resolve(true); }
    };
    rafVoloRef.current = requestAnimationFrame(tick);
  });

  /**
   * La registrazione. Il canvas WebGL non conserva il buffer, quindi una copia
   * si prende DENTRO ogni evento "render" (come lo snapshot del poster); un loop
   * a parte la ricompone sul canvas del video insieme a marker e contatore, che
   * sono elementi HTML e non finirebbero mai nel canvas della mappa.
   */
  const avviaRegistrazione = (map: MapLibreMap) => {
    if (!formato) return;
    try {
      const mapCanvas = map.getCanvas();
      const { w, h } = misureVideo(mapCanvas.width, mapCanvas.height);
      const video = document.createElement("canvas");
      video.width = w; video.height = h;
      const ultimo = document.createElement("canvas");
      ultimo.width = w; ultimo.height = h;
      const ctxUltimo = ultimo.getContext("2d")!;
      // ⚠️ SFONDO PIENO prima di ogni copia. Il canvas della mappa ha zone
      // TRASPARENTI — riquadri satellite ancora in caricamento quando la camera
      // si allarga, scritte in dissolvenza, lo spazio attorno al globo — e
      // copiato sopra il fotogramma prima lasciava SCIE: puntine impilate in
      // fila, «Slovenia Slovenia», linee doppie (viste nel file video, mai a
      // schermo, dove sotto c'è lo sfondo del riquadro). È la stessa famiglia
      // del difetto che rendeva il video di LUGLIO una mappa congelata piena di
      // icone ripetute (rifatto girare dal tag per confrontarlo).
      const SFONDO = "#060e1e";
      congelaVideoRef.current = false;
      markerFissoRef.current = null;
      const copia = () => {
        // All'atterraggio il video resta sull'ultimo fotogramma del volo mentre la
        // mappa si allarga e carica (vedi `congelaVideoRef`).
        if (congelaVideoRef.current) return;
        try {
          ctxUltimo.fillStyle = SFONDO;
          ctxUltimo.fillRect(0, 0, w, h);
          ctxUltimo.drawImage(mapCanvas, 0, 0, w, h);
        } catch { /* frame perso */ }
      };
      map.on("render", copia);
      staccaRenderRef.current = () => map.off("render", copia);
      finaleVideoRef.current = null;
      const ctx = video.getContext("2d")!;
      const k = w / (mapCanvas.clientWidth || w);     // px del video per px CSS
      const titoloVideo = posterTitle;
      const dateVideo = dateRangeLabel;
      const disegna = () => {
        rafVideoRef.current = requestAnimationFrame(disegna);
        // anche qui: il poster del finale ha lo spazio attorno al globo trasparente
        ctx.fillStyle = SFONDO;
        ctx.fillRect(0, 0, w, h);
        const finale = finaleVideoRef.current;
        if (finale) {
          // ⚠️ Il finale NON dev'essere un fermo-immagine. Con una scena immobile
          // il codificatore di Chrome smette di aggiornare alcuni blocchi e si
          // trascina pezzi del fotogramma prima (visto: un «863» del contatore
          // incollato accanto alla scheda per tutto il finale, in riproduzione
          // normale — la composizione del finale era pulita). Quindi: dissolvenza
          // dall'ultimo fotogramma del volo, poi un avvicinamento lentissimo
          // (3% in tutto il finale) che fa cambiare ogni fotogramma.
          const dt = performance.now() - finaleT0Ref.current;
          const s = 1 + 0.03 * Math.min(1, dt / FINALE_VIDEO_MS);
          ctx.drawImage(finale, -(s - 1) * w / 2, -(s - 1) * h / 2, w * s, h * s);
          if (dt < 700) {
            ctx.globalAlpha = 1 - dt / 700;
            ctx.drawImage(ultimo, 0, 0);
            ctx.globalAlpha = 1;
          }
          return;
        }
        const fisso = congelaVideoRef.current ? markerFissoRef.current : null;
        if (fisso) {
          // L'ARRIVO: il fotogramma fermo si avvicina piano verso la meta, così
          // è un momento voluto e non un video che si è bloccato.
          const s = 1 + 0.05 * Math.min(1, (performance.now() - fisso.t0) / 3000);
          ctx.save();
          ctx.translate(fisso.x * k, fisso.y * k);
          ctx.scale(s, s);
          ctx.translate(-fisso.x * k, -fisso.y * k);
          ctx.drawImage(ultimo, 0, 0);
          ctx.restore();
        } else {
          ctx.drawImage(ultimo, 0, 0);
        }
        const m = markerRef.current;
        if (fisso || m) {
          const p = fisso ?? map.project(m!.getLngLat());
          disegnaIcona(ctx, p.x * k, p.y * k, k, fisso ?? markerVesteRef.current);
        }
        disegnaContatore(ctx, testoContatore(), w, k);
        // Il titolo d'apertura (lo stesso riquadro che c'è a schermo), che sfuma.
        const restoTitolo = titoloFinoRef.current - performance.now();
        if (restoTitolo > 0) disegnaTitolo(ctx, Math.min(1, restoTitolo / 500), titoloVideo, dateVideo, w, h, k);
      };
      disegna();
      const rec = new MediaRecorder(video.captureStream(30), { mimeType: formato.mime, videoBitsPerSecond: 4_000_000 });
      pezziRef.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) pezziRef.current.push(e.data); };
      rec.start(1000);
      registratoreRef.current = rec;
      regInizioRef.current = performance.now();
      regPausaDaRef.current = null;
      regPausaTotRef.current = 0;
    } catch {
      // niente registrazione su questo dispositivo: il volo si vede lo stesso
      fermaRegistrazione(false);
    }
  };

  /** Chiude la registrazione: `tieni` decide se ne nasce un video (Salta lo butta). */
  const fermaRegistrazione = (tieni: boolean) => {
    if (rafVideoRef.current != null) { cancelAnimationFrame(rafVideoRef.current); rafVideoRef.current = null; }
    staccaRenderRef.current?.();
    staccaRenderRef.current = null;
    const rec = registratoreRef.current;
    registratoreRef.current = null;
    if (!rec) return;
    const ora = performance.now();
    const inPausa = regPausaDaRef.current != null ? ora - regPausaDaRef.current : 0;
    const durataMs = ora - regInizioRef.current - regPausaTotRef.current - inPausa;
    rec.onstop = async () => {
      if (!tieni || !mountedRef.current || !formato) return;
      let blob = new Blob(pezziRef.current, { type: formato.mime.split(";")[0] });
      if (blob.size === 0) return;
      // ⚠️ I .webm di Chrome escono SENZA durata nell'intestazione: lettori e
      // gallerie li mostrano a 0:00 e non lasciano scorrere avanti e indietro
      // (misurato sul primo video: `duration` = Infinity). Si riscrive la
      // durata dopo la registrazione. L'mp4 di Safari non ne ha bisogno.
      if (formato.estensione === "webm") {
        try { blob = await fixWebmDuration(blob, durataMs, { logger: false }); } catch { /* resta senza durata */ }
      }
      if (!mountedRef.current) return;
      const url = URL.createObjectURL(blob);
      videoUrlRef.current = url;
      setVideo({ url, blob });
    };
    try { if (rec.state !== "inactive") rec.stop(); } catch { /* già fermo */ }
  };

  /** Butta il video del volo precedente (prima di un nuovo volo, o chiudendo). */
  const buttaVideo = () => {
    if (videoUrlRef.current) { URL.revokeObjectURL(videoUrlRef.current); videoUrlRef.current = null; }
    setVideo(null);
  };

  /** Il volo intero: decollo → tratte → atterraggio sul poster → finale del video. */
  /** Il volo, con la rete sotto: se qualcosa va in errore a metà (un'icona,
   *  il marker, la mappa) si atterra comunque sul poster come con «Salta» —
   *  senza, il volo restava appeso: niente poster e comandi che non servono. */
  /** `registra`: il volo si registra MENTRE si vola. Solo come ripiego di «Crea
   *  video» dove il browser non sa costruire il video (vedi costruisciVideo):
   *  la registrazione dal vivo dimezzava la fluidità del volo sui telefoni. */
  const avviaVolo = (map: MapLibreMap, registra = false) => {
    voloVero(map, registra).catch(() => { if (mountedRef.current) salta(); });
  };

  const voloVero = async (map: MapLibreMap, registra: boolean) => {
    const lib = libRef.current;
    const tratte = legsRef.current;
    if (!lib || !tratte.length) return;
    const id = ++voloIdRef.current;
    const vivo = () => mountedRef.current && voloIdRef.current === id;
    fermaAnimazione();
    fermaRegistrazione(false);
    // il video già fatto resta (è dello stesso viaggio): si butta solo per rifarlo
    if (registra) buttaVideo();
    setPoster(false);
    inPausaRef.current = false;
    kmFattiRef.current = 0;
    setVolo("inVolo");
    gesti(map, false);

    // Le icone dei mezzi, rasterizzate una volta (servono al DOM e al video).
    const modi = new Set(tratte.map(modoDi));
    await Promise.all([...modi].filter(m => !iconeModiRef.current[m]).map(async m => {
      const Icon = m === "casa" ? Home : TRANSPORT_MAP[m]?.Icon;
      if (!Icon) return;
      try { iconeModiRef.current[m] = await loadModeIcon(Icon, "#ffffff"); } catch { /* senza icona: solo il colore */ }
    }));
    if (!vivo()) return;

    const el = document.createElement("div");
    el.style.cssText = "width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;"
      + "border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.55);";
    const img = document.createElement("img");
    img.alt = ""; img.style.cssText = "width:16px;height:16px;";
    el.appendChild(img);
    vestiMarker(el, modoDi(tratte[0]));
    const marker = new lib.Marker({ element: el }).setLngLat([tratte[0].from.lon, tratte[0].from.lat]).addTo(map);
    markerRef.current = marker;
    aggiornaContatore();
    preparaTracciatoFatto(map);
    // La linea intera parte SUBITO, così la mappa la prepara durante l'apertura:
    // in volo cambia solo il taglio.
    const traccia = tracciatoProgressivo(tratte.map(tr => tr.pathCoords));
    (map.getSource("flyover-traccia") as GeoJSONSource | undefined)?.setData(lineaFatta(traccia.percorso));
    const precarico = avviaPrecarico(map, tratte);
    // Il titolo d'apertura: a schermo e nel video sulla vista d'apertura e
    // dentro il decollo, poi sfuma.
    titoloFinoRef.current = Infinity;
    setTitoloVisibile(true);
    if (registra) avviaRegistrazione(map);

    // 0. Sulla vista d'apertura, col titolo, finché arrivano i riquadri del
    //    decollo e della prima tratta (con un tetto).
    if (precarico) {
      const z0 = map.getZoom();
      let t0 = performance.now();
      let prima = t0;
      const avvicina = () => {
        if (!vivo()) return;
        const ora = performance.now();
        if (inPausaRef.current) t0 += ora - prima;    // in pausa si ferma anche questo
        prima = ora;
        // ease-out: parte e rallenta; il decollo riparte da fermo (easeInOutCubic)
        const k = Math.min(1, (ora - t0) / ATTESA_DECOLLO_MS);
        map.jumpTo({ zoom: z0 + AVVICINAMENTO_ZOOM * Math.sin(k * Math.PI / 2) });
        rafVoloRef.current = requestAnimationFrame(avvicina);
      };
      rafVoloRef.current = requestAnimationFrame(avvicina);
      await Promise.race([precarico.pronta(1), attesa(ATTESA_DECOLLO_MS)]);
      // ⚠️ PRIMA vivo(), poi il raf: con Salta + Rivivi durante l'attesa il raf
      // è già del volo NUOVO, e cancellarlo lo lasciava appeso a metà.
      if (!vivo()) return;
      if (rafVoloRef.current != null) { cancelAnimationFrame(rafVoloRef.current); rafVoloRef.current = null; }
    }
    titoloFinoRef.current = performance.now() + TITOLO_MS;
    setTimeout(() => { if (vivo()) setTitoloVisibile(false); }, TITOLO_MS - 500);

    // 1. Decollo: dalla vista larga d'apertura alla partenza, con la camera
    //    già alla quota della prima tratta (sennò zoom e traslazione insieme).
    const c = tratte[0].camera;
    if (!await animaCamera(map, id, { lon: tratte[0].from.lon, lat: tratte[0].from.lat, zoom: c.zoom, pitch: c.pitch, bearing: c.bearing }, DECOLLO_MS)) return;

    // 2. Le tratte. Il contatore aggiunge solo i km contati (lib/voloVideo).
    const kmTratte = kmContatiPerTratta(tratte);
    let primaKm = 0;
    for (let i = 0; i < tratte.length; i++) {
      const tr = tratte[i];
      // Sulla tappa, un attimo, se i riquadri della prossima tratta non sono arrivati.
      if (i > 0 && precarico) {
        await Promise.race([precarico.pronta(i + 1), attesa(ATTESA_TAPPA_MS)]);
        if (!vivo()) return;
      }
      vestiMarker(el, modoDi(tr));
      const ok = await animaCamera(map, id,
        { lon: tr.to.lon, lat: tr.to.lat, zoom: tr.camera.zoom, pitch: tr.camera.pitch, bearing: tr.camera.bearing },
        tr.camera.durationMs,
        (t, rawT) => {
          const tm = easeInOutCubic(Math.min(1, rawT * VELOCITA_MARKER));
          marker.setLngLat(pointAlongPath(tr.pathCoords, tm));
          // la linea finisce sotto l'icona: stesso `tm` del marker (solo stile:
          // niente ricalcolo nel processo della mappa, vedi tracciatoProgressivo)
          tagliaTraccia(map, traccia.progresso(i, tm));
          kmFattiRef.current = primaKm + kmTratte[i] * t;
          aggiornaContatore();
        });
      if (!ok) return;
      primaKm += kmTratte[i];
    }

    // 3. Atterraggio. Il VIDEO si ferma qui, sull'ultimo fotogramma del volo con
    //    l'icona sulla meta (posizione fissata in pixel: la mappa sotto si sta
    //    per muovere). A schermo invece: via il marker, il contatore sul numero
    //    del poster, il percorso torna intero, la camera si allarga.
    const pFisso = map.project(marker.getLngLat());
    markerFissoRef.current = { x: pFisso.x, y: pFisso.y, t0: performance.now(), ...markerVesteRef.current };
    kmFattiRef.current = totalKmRef.current;
    congelaVideoRef.current = true;
    fermaAnimazione();
    chiudiTracciatoFatto(map);
    aggiornaContatore();
    await flyToOverview(map, 45);
    if (!vivo()) return;
    gesti(map, true);
    setPoster(true);
    setVolo("finito");

    // 4. Il finale del video: quando la mappa ha finito di caricare, la STESSA
    //    composizione dell'immagine condivisa (scheda + firma) entra in
    //    dissolvenza sull'ultimo fotogramma del volo; poi si chiude il file.
    if (registratoreRef.current) {
      await attendiMappaPronta(map, 1500);
      if (!vivo()) return;
      try {
        const [flagImgs, logoImg] = await Promise.all([loadFlagImages(), loadBrandLogo()]);
        const snap = await catturaCanvasMappa();
        const mc = map.getCanvas();
        if (snap && vivo()) {
          finaleVideoRef.current = composePoster(snap, flagImgs, logoImg, mc.width / (mc.clientWidth || mc.width));
          finaleT0Ref.current = performance.now();
        }
      } catch { /* finale senza scheda: resta l'ultimo frame */ }
      await attesa(FINALE_VIDEO_MS);
      if (!vivo()) return;
      fermaRegistrazione(true);
    }
  };

  const pausa = () => {
    inPausaRef.current = true;
    setVolo("pausa");
    try {
      if (registratoreRef.current?.state === "recording") {
        registratoreRef.current.pause();
        regPausaDaRef.current = performance.now();
      }
    } catch { /* niente pausa: pazienza */ }
  };
  const riprendi = () => {
    inPausaRef.current = false;
    setVolo("inVolo");
    try {
      if (registratoreRef.current?.state === "paused") {
        registratoreRef.current.resume();
        if (regPausaDaRef.current != null) regPausaTotRef.current += performance.now() - regPausaDaRef.current;
        regPausaDaRef.current = null;
      }
    } catch { /* idem */ }
  };

  /** Salta: dritti al poster. Un video a metà non serve: si butta. */
  const salta = async () => {
    const map = mapRef.current;
    if (!map) return;
    voloIdRef.current++;              // ferma il volo in corso (i suoi loop lo vedono)
    inPausaRef.current = false;
    fermaAnimazione();
    fermaRegistrazione(false);
    try { chiudiTracciatoFatto(map); } catch { /* stile cambiato: niente da ripristinare */ }
    setTitoloVisibile(false);
    titoloFinoRef.current = 0;        // in attesa sulla vista d'apertura era «per sempre»
    gesti(map, true);
    setVolo("finito");
    await flyToOverview(map, 45);
    if (mountedRef.current) setPoster(true);
  };

  const scaricaVideo = async () => {
    if (!video) return;
    const tipo = video.blob.type || "video/mp4";
    const nome = nomeFileVideo(posterTitle, { mime: tipo, estensione: tipo.includes("mp4") ? "mp4" : "webm" });
    const file = new File([video.blob], nome, { type: tipo });
    await shareOrDownload(file, tripsCount > 1 ? "Il mio viaggio in 3D" : posterTitle);
  };

  /** «Crea video» (flyover/creaVideo.ts): il volo fotogramma per fotogramma, in mp4. */
  const costruisciVideo = () => creaVideo({
    map: mapRef.current, tratte: legsRef.current, formato, posterTitle, dateRangeLabel,
    kmTotali: () => totalKmRef.current, vivo: () => mountedRef.current, anteprima: () => anteprimaRef.current,
    inCorso: creazioneRef, annulla: annullaVideoRef, iconeModi: iconeModiRef, videoUrlRef,
    avviaVolo, buttaVideo, setCreazione, cameraPoster, loadFlagImages, loadBrandLogo, catturaCanvasMappa, composePoster, setVideo,
  });

  /** La mappa NASCOSTA che fotografa i riquadri: una sola, riusata per tutti
   *  (un contesto WebGL in più, non uno per riquadro), rifatta se cambia stile. */
  const mappaPerRiquadri = (stile: StyleSpecification): Promise<MapLibreMap | null> => {
    const lib = libRef.current;
    if (!lib) return Promise.resolve(null);
    const c = mappaRiqRef.current;
    if (c && c.stile === stile) return Promise.resolve(c.map);
    // ⚠️ una già in costruzione per questo stile: si aspetta QUELLA. Prima un
    // secondo calcolo (mappa spostata durante il caricamento) ne faceva
    // un'altra, e la prima restava viva per sempre, col suo contesto WebGL
    const inVolo = mappaRiqInVoloRef.current;
    if (inVolo && inVolo.stile === stile) return inVolo.p;
    if (c) { try { c.map.remove(); } catch { /* già via */ } c.div.remove(); mappaRiqRef.current = null; }
    const p = (async () => {
      const div = document.createElement("div");
      div.style.cssText = "position:fixed;left:-10000px;top:0;width:200px;height:150px;pointer-events:none;";
      document.body.appendChild(div);
      const m = new lib.Map({ container: div, style: JSON.parse(JSON.stringify(stile)), interactive: false, attributionControl: false, fadeDuration: 0 });
      await new Promise<void>(r => { m.once("load", () => r()); setTimeout(r, 6000); });
      // nel frattempo la Mappa della vita può essersi chiusa (la pulizia non
      // l'ha vista: non era ancora in mappaRiqRef) o aver cambiato stile
      if (!mountedRef.current || stileRef.current !== stile || mappaRiqInVoloRef.current !== voce) {
        try { m.remove(); } catch { /* già via */ }
        div.remove();
        return null;
      }
      addOverlayLayers(m, styleModeRef.current);
      const misura = m.getLayer("flyover-stops") ? m.getLayoutProperty("flyover-stops", "icon-size") : 1;
      mappaRiqRef.current = { map: m, div, stile, stella: typeof misura === "number" ? misura : 1 };
      return m;
    })();
    const voce = { stile, p };
    mappaRiqInVoloRef.current = voce;
    void p.finally(() => { if (mappaRiqInVoloRef.current === voce) mappaRiqInVoloRef.current = null; });
    return p;
  };

  /** Larghezza di un testo in un font (canvas fuori schermo, riusato). */
  const misuraTesto = (testo: string, font: string) => {
    if (!misuraRef.current) misuraRef.current = document.createElement("canvas").getContext("2d");
    const c = misuraRef.current;
    if (!c) return testo.length * 12;
    c.font = font;
    return c.measureText(testo).width;
  };

  /** Nomi, fili e riquadri della Mappa della vita (flyover/nomiVita.ts), coi
   *  dati di adesso: le tappe, le linee, il titolo. */
  const disponiVita = (map: MapLibreMap, W: number, H: number, bordo: BordoNomi) =>
    disponiNomiVita({ stops: stopsRef.current, segmenti: routeSegsRef.current, titolo: titoloVitaRef.current, misuraTesto }, map, W, H, bordo);

  /**
   * Trascinare un riquadro in anteprima: `modo` «sposta», o i lati/angoli da
   * tirare (n, s, e, w e le coppie). Tirando un bordo il CONTENUTO resta
   * fermo e si scopre più mappa da quel lato; spostandolo, il contenuto va
   * con lui. Al rilascio il riquadro diventa «fisso» e tutto si ricalcola.
   */
  const iniziaTrascina = (r: Riquadro, modo: string, e: React.PointerEvent) => {
    const sc = nomiRef.current?.scala;
    if (!fogliettoRef.current || !sc) return;
    e.preventDefault(); e.stopPropagation();
    setScelto(r.chiave);
    const x0 = e.clientX, y0 = e.clientY;
    const b0 = { ...r.posto }, c0 = { ...r.centroPosto };
    let box = b0;
    const MIN = { w: 60, h: 40 };
    const muovi = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / sc, dy = (ev.clientY - y0) / sc;
      let { x, y, w, h } = b0;
      if (modo === "sposta") { x += dx; y += dy; }
      else {
        if (modo.includes("e")) w = Math.max(MIN.w, b0.w + dx);
        if (modo.includes("s")) h = Math.max(MIN.h, b0.h + dy);
        if (modo.includes("w")) { w = Math.max(MIN.w, b0.w - dx); x = b0.x + b0.w - w; }
        if (modo.includes("n")) { h = Math.max(MIN.h, b0.h - dy); y = b0.y + b0.h - h; }
      }
      // sempre dentro il foglio
      w = Math.min(w, STAMPA.w); h = Math.min(h, STAMPA.h);
      x = Math.max(0, Math.min(STAMPA.w - w, x)); y = Math.max(0, Math.min(STAMPA.h - h, y));
      box = { x, y, w, h };
      setTrascina({ chiave: r.chiave, box });
    };
    const fine = () => {
      window.removeEventListener("pointermove", muovi);
      window.removeEventListener("pointerup", fine);
      setTrascina(null);
      if (box === b0) return;   // solo un clic: il riquadro è scelto, niente di più
      const centro = modo === "sposta" ? { x: c0.x + box.x - b0.x, y: c0.y + box.y - b0.y } : c0;
      const m = mapRef.current;
      if (m) { const c = m.getCenter(); fissiCameraRef.current = { lng: c.lng, lat: c.lat, zoom: m.getZoom() }; }
      fissiRef.current = { ...fissiRef.current, [r.chiave]: { posto: box, centro } };
      setFissi(fissiRef.current);
      if (m) void calcolaNomi(m);
    };
    window.addEventListener("pointermove", muovi);
    window.addEventListener("pointerup", fine);
  };
  const rimettiRiquadri = () => {
    fissiRef.current = {}; fissiCameraRef.current = null;
    setFissi({}); setScelto(null);
    const m = mapRef.current;
    if (m) void calcolaNomi(m);
  };

  /** Ricalcola nomi, fili e riquadri per la vista di adesso. */
  const calcolaNomi = async (map: MapLibreMap) => {
    const id = ++calcoloNomiRef.current;
    const el = map.getContainer();
    const W = el.clientWidth, H = el.clientHeight;
    if (!W || !H) return;
    try {
      await Promise.all([
        document.fonts?.load(`italic ${FONT_NOMI.px}px "Noto Serif"`),
        document.fonts?.load(`${TITOLO_VITA.peso} ${TITOLO_VITA.px}px "Cormorant Garamond"`),
      ]);
    } catch { /* si misura col ripiego */ }
    if (calcoloNomiRef.current !== id) return;
    // in anteprima di stampa: il foglio 1200×900 coi bordi e le misure della stampa
    const foglio = fogliettoRef.current;
    const scala = foglio ? W / STAMPA.w : 1;
    const Wf = foglio ? STAMPA.w : W, Hf = foglio ? STAMPA.h : H;
    const corpo = foglio ? STAMPA.corpoNomi : FONT_NOMI.px;
    // spostata o avvicinata la mappa, i riquadri regolati a mano si rifanno
    const cam = fissiCameraRef.current, c0 = map.getCenter();
    if (cam && (Math.abs(cam.lng - c0.lng) > 1e-7 || Math.abs(cam.lat - c0.lat) > 1e-7 || Math.abs(cam.zoom - map.getZoom()) > 1e-6)) {
      fissiCameraRef.current = null; fissiRef.current = {}; setFissi({}); setScelto(null);
    }
    const { d } = foglio
      ? disponiVita(map, Wf, Hf, { ...BORDI_STAMPA, fattore: 1 / scala, fissi: fissiRef.current })
      : disponiVita(map, W, H, { margine: 8, firma: 18 });
    const foto: Record<number, HTMLCanvasElement> = {};
    const url: Record<number, string> = {};
    // i nomi tornano SUBITO; le foto dei riquadri arrivano una alla volta
    // (ciascuna aspetta i suoi riquadri della mappa, anche qualche secondo)
    const mostra = () => {
      nomiRef.current = { d, foto: { ...foto }, url: { ...url }, w: Wf, h: Hf, scala, corpo };
      setNomi(nomiRef.current);
    };
    mostra();
    setNomiFermi(true);
    const stile = stileRef.current;
    if (!d.riquadri.length || !stile) { fotoInCorsoRef.current = null; return; }
    const fotografa = async () => {
      const m = await mappaPerRiquadri(stile);
      for (const r of d.riquadri) {
        if (calcoloNomiRef.current !== id || !mountedRef.current || !m) return;
        const c = await fotografaRiquadro(map, m, r, mappaRiqRef.current, 12000, scala);
        if (calcoloNomiRef.current !== id || !mountedRef.current) return;
        if (c) { foto[r.numero] = c; url[r.numero] = c.toDataURL("image/png"); mostra(); }
      }
    };
    const p = fotografa();
    fotoInCorsoRef.current = p;
    await p;
    if (fotoInCorsoRef.current === p) fotoInCorsoRef.current = null;
  };

  // Anteprima di stampa: il riquadro 4:3 più grande che sta nella scheda
  useEffect(() => {
    if (!anteprima) { setCornice(null); setFissi({}); fissiRef.current = {}; fissiCameraRef.current = null; setScelto(null); return; }
    const misura = () => {
      const scheda = containerRef.current?.parentElement;
      if (!scheda) return;
      const W = scheda.clientWidth, H = scheda.clientHeight;
      let h = H, w = Math.round((H * STAMPA.w) / STAMPA.h);
      if (w > W) { w = W; h = Math.round((W * STAMPA.h) / STAMPA.w); }
      setCornice({ x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h });
    };
    misura();
    window.addEventListener("resize", misura);
    return () => window.removeEventListener("resize", misura);
  }, [anteprima]);
  useEffect(() => {
    if (!scelto) return;
    const fuori = (e: PointerEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.("[data-riquadro]")) setScelto(null);
    };
    window.addEventListener("pointerdown", fuori, true);
    return () => window.removeEventListener("pointerdown", fuori, true);
  }, [scelto]);
  // la mappa prende la misura della cornice (o torna a tutta la scheda): il suo
  // evento «resize» ricalcola nomi e riquadri, sul foglio giusto
  useEffect(() => { try { mapRef.current?.resize(); } catch { /* mappa non pronta */ } }, [cornice]);

  // Il titolo cambia: nomi e riquadri gli rigirano intorno (al primo giro no,
  // ci pensa l'inquadratura iniziale col suo moveend).
  const primoTitoloRef = useRef(true);
  useEffect(() => {
    if (primoTitoloRef.current) { primoTitoloRef.current = false; return; }
    const m = mapRef.current;
    if (lifeMap && m && mountedRef.current) void calcolaNomi(m);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titoloVita]);

  // Che video sa fare questo browser: costruito (WebCodecs + H.264), o almeno
  // registrato dal vivo (MediaRecorder). Si chiede una volta, all'apertura.
  useEffect(() => {
    if (!animato) return;
    let vivo = true;
    void codecCostruzione(720, 1280).then(c => {
      if (vivo) setSa(c ? "costruito" : formato ? "dal-vivo" : null);
    });
    return () => { vivo = false; };
  }, [animato, formato]);

  // Chiudendo: si ferma tutto e si libera il video (la mappa la toglie l'altro effetto).
  useEffect(() => () => {
    voloIdRef.current++;
    if (rafVoloRef.current != null) cancelAnimationFrame(rafVoloRef.current);
    if (rafVideoRef.current != null) cancelAnimationFrame(rafVideoRef.current);
    try { registratoreRef.current?.stop(); } catch { /* già fermo */ }
    registratoreRef.current = null;
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // `cancelled` locale (non un ref condiviso): in StrictMode ogni effetto è
    // montato/smontato/rimontato una volta; con un ref condiviso l'init async
    // del primo montaggio creerebbe comunque una seconda mappa orfana. Vedi
    // storia in git (fix leak WebGL).
    let cancelled = false;

    const stops = buildFlightPath(viaggi);
    const legsLocal = buildFlightLegs(stops);
    legsRef.current = legsLocal;
    // Mappa della vita: la CASA non è una stella. Ogni viaggio la spingeva nel
    // path una volta, e la costellazione aveva un faro di N stelle sovrapposte
    // su Milano — più luminoso di qualunque posto visitato. Senza le tratte da
    // casa (buildPerTripRouteCoords) sarebbe rimasto lì, acceso e scollegato.
    stopsRef.current = stops.filter(s => !(lifeMap && s.casa))
      .map(s => ({ lat: s.lat, lon: s.lon, label: s.label }));
    // Mappa della vita: stelle DEDUPLICATE per coordinata. Una base coi
    // rientri finisce nel path 3-4 volte (base, gita, base, gita, base) e le
    // stelle sovrapposte si sommavano in una macchia; stessa dedup che già
    // fa l'editor del quadro per gli stessi motivi (aloni e punti-LED doppi).
    if (lifeMap) {
      const visti = new Set<string>();
      stopsRef.current = stopsRef.current.filter(s => {
        const k = `${s.lon.toFixed(5)},${s.lat.toFixed(5)}`;
        if (visti.has(k)) return false;
        visti.add(k); return true;
      });
    }
    // Km percorsi: stessa fonte UNICA di Home/Statistiche/card (tripTotalKm =
    // stradali reali dove c'è route_geometry, linea d'aria altrimenti).
    totalKmRef.current = viaggi.reduce((sum, t) => sum + tripTotalKm(t), 0);
    // Mappa della vita: un segmento per viaggio (linee separate). Altri poster:
    // un unico segmento concatenato. allCoordsRef resta l'unione di tutti i punti
    // (per fitBounds e per il riquadro dell'export SVG).
    // `unwrapSegments`: tratte srotolate in un'UNICA catena — ogni segmento
    // riparte vicino alla fine del precedente, così anche nella Mappa della
    // vita due viaggi ai lati opposti dell'antimeridiano restano nella stessa
    // finestra di 360° (prima: fitBounds inquadrava il mondo intero). Le
    // longitudini possono uscire da ±180 — MapLibre le avvolge da sé.
    const perTrip = lifeMap ? buildPerTripRouteCoords(viaggi) : [buildFlyoverRouteCoords(stops, legsLocal)];
    // ⚠️ L'inquadratura non può guardare solo le linee: senza le tratte da
    // casa un viaggio a meta singola è SOLO una stella, e fitBounds l'avrebbe
    // tagliata fuori. Le stelle entrano come punti-segmento nella STESSA
    // catena di srotolamento delle linee: srotolarle a parte le metterebbe in
    // un'altra finestra di 360° e riaprirebbe il bug dell'antimeridiano.
    const stelle: [number, number][][] = lifeMap
      ? stopsRef.current.map(s => [[s.lon, s.lat] as [number, number]])
      : [];
    const unwrapped = unwrapSegments([...perTrip, ...stelle]);
    const segs = unwrapped.slice(0, perTrip.length);
    routeSegsRef.current = segs;
    allCoordsRef.current = unwrapped.flat();

    if (legsLocal.length === 0) {
      setPhase("empty");
      return;
    }

    let map: MapLibreMap | undefined;

    const init = async () => {
      try {
        const maplibregl = await loadMapLibre();
        if (cancelled) return;
        libRef.current = maplibregl;

        // Medaglione del mezzo sulla tappa finale: rasterizza l'icona del mezzo
        // dell'ultima tratta (stessa simbologia delle card) nel pin finale.
        // Se manca il mezzo o l'icona non carica, la tappa finale usa il pin normale.
        const finalMode = legsLocal[legsLocal.length - 1]?.to.transportMode;
        const tstyle = finalMode ? TRANSPORT_MAP[finalMode] : null;
        if (tstyle && !finalPinDataRef.current) {
          try {
            const iconImg = await loadModeIcon(tstyle.Icon, "#ffffff");
            if (cancelled) return;
            finalPinDataRef.current = createFinalPinImageData(iconImg, tstyle.color);
          } catch { /* nessun medaglione: pin normale */ }
        }

        // CSS di MapLibre: bundlato globalmente (import in main.tsx) — la vecchia
        // iniezione del link dal CDN jsdelivr è stata rimossa (ridondante, e
        // offline riagganciava un CDN irraggiungibile).

        // Font serif per la didascalia della vista Costellazione (titolo/numeri
        // Cormorant Garamond + date Noto Serif corsivo). Caricati anche per lo
        // snapshot: la didascalia è ridisegnata su canvas in composePoster.
        if (!document.getElementById("flyover-fonts")) {
          const f = document.createElement("link");
          f.id = "flyover-fonts"; f.rel = "stylesheet";
          f.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;1,500&family=Noto+Serif:ital@0;1&display=swap";
          document.head.appendChild(f);
        }

        // Mappa della vita: parte direttamente in Costellazione (nessun Satellite).
        const style = lifeMap ? buildConstellationStyle() : await buildSatelliteStyle();
        if (cancelled) return;
        stileRef.current = style;

        if (!containerRef.current || cancelled) return;
        map = new maplibregl.Map({
          container: containerRef.current,
          style,
          center: [stops[0].lon, stops[0].lat],
          zoom: 2,
          attributionControl: false,
          // NB: qui c'era `preserveDrawingBuffer: true` "per lo snapshot", ma in
          // MapLibre 5 l'opzione top-level NON esiste più (andrebbe dentro
          // canvasContextAttributes) ed era IGNORATA: il buffer non è mai stato
          // preservato. Lo snapshot funziona comunque perché captureSnapshotBlob
          // cattura il canvas nello stesso frame dell'evento "render".
        });
        if (cancelled) { map.remove(); return; }
        mapRef.current = map;

        map.on("load", async () => {
          if (cancelled || !mountedRef.current) return;

          addOverlayLayers(map, lifeMap ? "constellation" : "satellite");

          setPhase("ready");
          // guardato da `cancelled`: smontando entro 100ms dal load il timer
          // chiamerebbe resize() su una mappa già rimossa (TypeError).
          setTimeout(() => { if (!cancelled && mapRef.current) mapRef.current.resize(); }, 100);

          // Viaggio singolo e anno: si DECOLLA (scelta di Stefano: parte da
          // solo, «Salta» per il poster subito). Si aspetta il resize qui sopra,
          // sennò il video nascerebbe con le misure del canvas di prima.
          if (animato) {
            await attesa(150);
            if (cancelled || !mountedRef.current) return;
            avviaVolo(map);
            return;
          }

          // Mappa della vita: i NOMI (vedi calcolaNomi) spariscono mentre la
          // mappa si muove e si ricalcolano a mappa ferma — dopo ogni spostamento,
          // zoom, cambio di stile o di misura.
          if (lifeMap) {
            const m = map;
            // la Mappa della vita resta piatta e dritta, come la stampa: i
            // riquadri ingrandiscono la zona contando su una mappa senza
            // rotazione né inclinazione (con due dita la si girava)
            try { m.dragRotate.disable(); m.touchZoomRotate.disableRotation(); m.touchPitch.disable(); m.keyboard.disableRotation(); } catch { /* gesto assente */ }
            let attesaNomi: number | undefined;
            const aMappaFerma = () => {
              window.clearTimeout(attesaNomi);
              attesaNomi = window.setTimeout(() => { if (!cancelled && mountedRef.current) void calcolaNomi(m); }, 150);
            };
            m.on("movestart", () => { calcoloNomiRef.current++; setNomiFermi(false); });
            m.on("moveend", aMappaFerma);
            m.on("resize", aMappaFerma);
          }

          // Mappa della vita: nessun volo, inquadra subito il poster
          // sull'intero percorso, poi mostra gli overlay. Costellazione
          // piatta dall'alto (pitch 0), come il master di stampa.
          await flyToOverview(map, lifeMap ? 0 : 45);
          if (cancelled || !mountedRef.current) return;
          setPoster(true);
        });
      } catch {
        if (!cancelled && mountedRef.current) setPhase("error");
      }
    };

    // Il seguito di init() e' una catena di await su rete (import dinamico,
    // stile della mappa): senza raccogliere il rifiuto, un telefono offline
    // sputa un "Failed to fetch" non gestito in console. Il globo non si
    // disegna comunque -- ma in silenzio, e senza sporcare gli errori veri.
    init().catch(() => { /* rete gia' giu': nessun globo, nessun rumore */ });

    return () => {
      cancelled = true;
      mountedRef.current = false;
      precaricoRef.current?.abort();
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      // la mappa nascosta dei riquadri e i nomi della vista di prima
      calcoloNomiRef.current++;
      const riq = mappaRiqRef.current;
      if (riq) { try { riq.map.remove(); } catch { /* già via */ } riq.div.remove(); mappaRiqRef.current = null; }
      mappaRiqInVoloRef.current = null; // quella in costruzione si butta da sé (vedi mappaPerRiquadri)
      fotoInCorsoRef.current = null;
      nomiRef.current = null;
      setNomi(null);
    };
  // ⚠️ Dipendenza NON vuota: la mappa si ricostruisce quando cambia il filtro
  // per compagno. Ricostruire è il prezzo giusto qui — l'effetto è già scritto
  // per essere montato più volte (StrictMode), la pulizia fa `map.remove()` e
  // la riga in cima rimette `mountedRef` a true. L'alternativa (aggiornare
  // sorgente e vernice a mano) reggerebbe le linee ma non i limiti della vista
  // né i conteggi.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viaggi, stellaSecca]);

  // Portal su document.body: senza, il modale (position:fixed) verrebbe confinato
  // al primo antenato con `transform` (es. il wrapper .animate-fade-up della card
  // in MieiViaggi) e clippato dentro la card invece che sul viewport.
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "relative", width: "100%", height: "100%", maxWidth: 880, maxHeight: 600,
          background: "#060e1e", border: "0.5px solid #1a2d4a", borderRadius: 16,
          overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          animation: "flyoverModalIn 0.28s cubic-bezier(0.22,1,0.36,1) both",
        }}>
        <div ref={containerRef} style={anteprima && cornice
          ? { position: "absolute", left: cornice.x, top: cornice.y, width: cornice.w, height: cornice.h, outline: "1px dashed rgba(251,191,36,0.7)" }
          : { position: "absolute", inset: 0 }} />

        {/* Mappa della vita: nomi, fili e riquadri (lib/etichetteMappa).
            Sopra la mappa e sotto i comandi; spariscono mentre la mappa si
            muove (la disposizione vale per una vista ferma). */}
        {lifeMap && poster && nomi && (
          <OverlayNomi nomi={nomi} anteprima={anteprima} cornice={cornice} nomiFermi={nomiFermi}
            styleMode={styleMode} scelto={scelto} trascina={trascina} onTrascina={iniziaTrascina} />
        )}

        {/* Mappa della vita: il TITOLO in alto a destra (lib/titoloVita), che
            resta anche a riposo e coi comandi accesi si tocca per scriverlo, e
            «By 🐻» in basso a destra, che coi comandi accesi lascia il posto ai
            bottoni (scelte di Stefano, 2026-10-16). Le stesse misure
            dell'immagine condivisa: a riposo lo schermo È il poster. */}
        {lifeMap && phase === "ready" && (
          <TitoloFirmaVita titoloVita={titoloVita}
            onTitolo={v => { salvaTitoloVita(v); setTitoloVita(v); }}
            scriviTitolo={scriviTitolo} setScriviTitolo={setScriviTitolo}
            cornice={anteprima && cornice ? cornice : null}
            larghezza={nomi?.w ?? containerRef.current?.clientWidth ?? 0}
            altezza={nomi?.h ?? containerRef.current?.clientHeight ?? 0}
            comandiVisibili={comandiVisibili} velo={velo} misuraTesto={misuraTesto} />
        )}

        {/* Chiudi in alto a sinistra (la card dati sta in alto a destra). */}
        <button onClick={onClose} aria-label={t("Chiudi")}
          style={{
            position: "absolute", top: 16, left: 16, width: 34, height: 34, borderRadius: 10, zIndex: 30,
            background: "rgba(10,22,40,0.8)", border: "0.5px solid #1a2d4a", cursor: "pointer",
            color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center",
            ...velo,
          }}>
          <X className="w-4 h-4" />
        </button>

        {/* ⚠️ BANCO DI PROVA stelle (da smontare quando Stefano sceglie):
            l'interruttore fra «soffusa» (alone stretto) e «secca» (solo
            nucleo). Stesso posto e stessa forma del banco del tratto. */}
        {phase === "ready" && lifeMap && (
          <div style={{ position: "absolute", left: 16, top: 60, zIndex: 26, ...velo }}>
            <button type="button" aria-pressed={stellaSecca} onClick={() => cambiaStella(!stellaSecca)}
              style={{
                display: "flex", alignItems: "center", gap: 7, fontSize: 11, cursor: "pointer",
                padding: "5px 10px", borderRadius: 999, fontFamily: "inherit",
                background: "rgba(10,22,40,0.75)", border: "0.5px solid rgba(255,255,255,0.2)",
                color: stellaSecca ? "#93c5fd" : "rgba(255,255,255,0.45)",
              }}>
              <span aria-hidden style={{
                width: 20, height: 11, borderRadius: 999, flexShrink: 0, position: "relative",
                background: stellaSecca ? "rgba(96,165,250,0.5)" : "rgba(255,255,255,0.15)",
              }}>
                <span style={{
                  position: "absolute", top: 1.5, left: stellaSecca ? 10.5 : 1.5,
                  width: 8, height: 8, borderRadius: "50%", background: stellaSecca ? "#93c5fd" : "rgba(255,255,255,0.5)",
                  transition: "left 140ms ease",
                }}/>
              </span>
              {t("Punti secchi")}
            </button>
          </div>
        )}

        {/* IL VOLO: in alto il contatore dei km, in basso Pausa/Riprendi e Salta.
            Il contatore si aggiorna dal loop via ref (60 volte al secondo:
            niente stato React, che ridisegnerebbe tutto il componente). */}
        {phase === "ready" && inVolo && (
          <HudVolo contatoreRef={contatoreRef} contatore={testoContatore()} titoloVisibile={titoloVisibile}
            posterTitle={posterTitle} dateRangeLabel={dateRangeLabel} volo={volo}
            onPausa={pausa} onRiprendi={riprendi} onSalta={salta} />
        )}

        {/* Toggle vista: satellite · costellazione (master di stampa). Anche
            sulla Mappa della vita dal 2026-10-15 (lì il Satellite è piatto e
            sparisce a riposo come gli altri comandi). Nascosto durante il volo
            (che è in Satellite: cambiare stile a metà azzererebbe tracciato e
            marker). */}
        {phase === "ready" && !inVolo && (
          <div style={{
            position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 30,
            display: "flex", gap: 2, padding: 3, borderRadius: 999,
            background: "rgba(10,22,40,0.8)", border: "0.5px solid #1a2d4a", backdropFilter: "blur(2px)",
            ...velo,
          }}>
            {([["satellite", "Satellite"], ["constellation", "Costellazione"]] as const).map(([mode, label]) => {
              const active = styleMode === mode;
              return (
                <button key={mode} onClick={() => selectStyle(mode)} disabled={switching || stampa !== null}
                  aria-pressed={active}
                  style={{
                    padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: "none",
                    whiteSpace: "nowrap",
                    cursor: switching ? "default" : "pointer",
                    background: active ? "rgba(96,165,250,0.18)" : "transparent",
                    color: active ? "#60a5fa" : "rgba(255,255,255,0.6)",
                  }}>
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {phase === "loading" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)", fontSize: 13, gap: 8 }}>
            <Loader2 className="w-4 h-4 animate-spin" /> {t("Caricamento della mappa…")}
          </div>
        )}

        {phase === "error" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
            {t("Impossibile caricare la mappa.")}
          </div>
        )}

        {phase === "empty" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)", fontSize: 13, textAlign: "center", padding: 24 }}>
            {t("Questo viaggio non ha punti sufficienti per la mappa 3D (manca la posizione di casa o della destinazione).")}
          </div>
        )}

        {/* «Crea video» al lavoro: sotto la mappa salta da un fotogramma
            all'altro, quindi la si copre; si vede invece il video che nasce. */}
        {creazione !== null && (
          <CreazioneVideo creazione={creazione} anteprimaRef={anteprimaRef} onAnnulla={() => { annullaVideoRef.current = true; }} />
        )}

        {poster && (
          <>
            {/* Dati viaggio, in alto a destra. Due stili di card:
                - satellite: vetro navy (font di marca + numeri mono),
                - costellazione: DIDASCALIA senza riquadro, serif elegante
                  (Cormorant) monocromatica, come la caption di una stampa celeste.
                Sulla "Mappa della vita" NON si mostra alcuna caption (mappa nuda,
                scelta utente): titolo/bandiere/date/stat tutti omessi. */}
            {!lifeMap && (
              <SchedaPoster styleMode={styleMode} posterTitle={posterTitle} flagCodes={flagCodes}
                dateRangeLabel={dateRangeLabel} metriche={statMetrics()} />
            )}

            {/* Azioni: Salva (solo single-trip, → biglietto) + Condividi (immagine)
                + Esporta SVG (solo Costellazione: master vettoriale per stampa). */}
            {/* CON CHI — la costellazione dei viaggi fatti con una persona.
                ⚠️ Il filtro esisteva GIÀ (chip del compagno sul biglietto) e non
                si trovava: 2,1 schermate di scorrimento, e per vedere «tutti i
                viaggi con Giulia» bisognava prima TROVARE un viaggio con
                Giulia — circolare. Qui sei già davanti alla mappa e la filtri
                mentre la guardi. Il chip sul biglietto resta come scorciatoia.
                La riga scorre di lato: con dieci persone non deve mangiare la
                mappa su un telefono. */}
            {lifeMap && compagni.length > 0 && (
              <ChipCompagni compagni={compagni} soloCon={soloCon} setSoloCon={setSoloCon} totale={trips.length} velo={velo} />
            )}

            {/* Il volo appena fatto: il video (se questo browser sa registrarlo)
                e «Rivivi». Riga propria SOPRA le azioni: a 390px quattro bottoni
                in fila non ci stanno. «Rivivi» solo in Satellite, perché il volo
                è in Satellite. */}
            {animato && (video || styleMode === "satellite") && (
              <div style={{ position: "absolute", right: 16, bottom: 66, zIndex: 26, display: "flex", gap: 10 }}>
                {video ? (
                  <button type="button" onClick={scaricaVideo} style={stileBottoneVolo}>
                    <Film className="w-3.5 h-3.5" /> {t("Scarica video")}
                  </button>
                ) : sa && styleMode === "satellite" && (
                  <button type="button" onClick={() => { void costruisciVideo(); }} style={stileBottoneVolo}>
                    <Film className="w-3.5 h-3.5" /> {t("Crea video")}
                  </button>
                )}
                {styleMode === "satellite" && (
                  <button type="button" onClick={() => { if (mapRef.current) avviaVolo(mapRef.current); }} style={stileBottoneVolo}>
                    <RotateCcw className="w-3.5 h-3.5" /> {t("Rivivi")}
                  </button>
                )}
              </div>
            )}

            <BarraAzioni lifeMap={lifeMap} tripsCount={tripsCount} styleMode={styleMode} velo={velo}
              anteprima={anteprima} setAnteprima={setAnteprima} regolati={Object.keys(fissi).length > 0} onRimetti={rimettiRiquadri}
              stampa={stampa} stampaFallita={stampaFallita} onStampa={handleStampa}
              exportingSvg={exportingSvg} onEsportaSvg={handleExportSvg}
              savingRelief={savingRelief} onSalva={handleSaveRelief} onCondividi={handleSharePoster} />
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
