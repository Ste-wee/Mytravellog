import { useRef, useState } from "react";
import { useT, fmtNumber } from "@/lib/settings";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, Loader2, MapPin } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { addTrip, todayLocalISO } from "@/lib/storage";
import { parseGpx, downsample, summarizeGpx, reverseGeocode, buildTrackPreviewSvg } from "@/lib/gpx";
import { distanceKm } from "@/lib/geo";

import { TRANSPORT, TransportMode } from "@/lib/transport";

// Alias locale storico: il tipo vive ora in @/lib/transport.
type Mode = TransportMode;
// Etichette dalla fonte unica (@/lib/transport); l'ORDINE resta quello di
// questa pagina: chi importa una traccia GPX di solito ha pedalato o guidato.
const MODES: { v: Mode; l: string }[] =
  (["bici", "moto", "car", "bus", "walk", "train", "ship", "plane"] as Mode[])
    .map(v => ({ v, l: TRANSPORT[v].label }));

const field: React.CSSProperties = {
  width: "100%", background: "#0a1628", border: "0.5px solid #1a2d4a", borderRadius: 8,
  padding: "9px 12px", color: "#f0f4ff", fontSize: 14,
};
const label: React.CSSProperties = { fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4, display: "block" };

const ImportaGpx = () => {
  const t = useT();
  const navigate = useNavigate();
  const [coords, setCoords] = useState<[number, number][]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [creating, setCreating] = useState(false);

  const [title, setTitle] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [mode, setMode] = useState<Mode>("bici");
  const [startCity, setStartCity] = useState(""); const [startCountry, setStartCountry] = useState(""); const [startCode, setStartCode] = useState("");
  const [endCity, setEndCity] = useState(""); const [endCountry, setEndCountry] = useState(""); const [endCode, setEndCode] = useState("");
  const [lengthKm, setLengthKm] = useState(0);
  const [maxEle, setMaxEle] = useState<number | null>(null);
  const [endEle, setEndEle] = useState<number | null>(null);
  const genRef = useRef(0); // generazione del file corrente (invalida le catene vecchie)

  const handleFile = async (file: File) => {
    // Token di generazione: la catena di geocoding dura >1s (policy Nominatim);
    // cambiando file a metà, quella VECCHIA risolveva dopo e sovrascriveva
    // città/titolo del file nuovo.
    const gen = ++genRef.current;
    setError(null); setParsing(true); setCoords([]);
    // Reset dei campi geografici del file precedente: senza, con Nominatim giù
    // il catch era silenzioso e il form mostrava ancora "Roma→Napoli" sulla
    // traccia nuova — e canCreate era vero, si salvava coi luoghi sbagliati.
    setStartCity(""); setStartCountry(""); setStartCode("");
    setEndCity(""); setEndCountry(""); setEndCode("");
    setTitle("");
    try {
      const text = await file.text();
      const data = parseGpx(text);
      if (gen !== genRef.current) return; // è già stato caricato un altro file
      if (data.coords.length < 2) { setError("Il GPX non contiene un percorso (servono almeno 2 punti)."); setParsing(false); return; }
      const s = summarizeGpx(data);
      const geo = downsample(data.coords);
      setCoords(geo);
      setFileName(file.name);
      setLengthKm(Math.round(s.lengthKm));
      setMaxEle(s.maxEle); setEndEle(s.endEle);
      setDateStart(s.dateStart || todayLocalISO());
      setDateEnd(s.dateEnd || "");
      setParsing(false);

      // Reverse-geocoding di partenza e arrivo, sequenziale (policy Nominatim ~1/s).
      setGeocoding(true);
      try {
        const a = await reverseGeocode(s.start[1], s.start[0]);
        if (gen !== genRef.current) return;
        setStartCity(a.city); setStartCountry(a.country); setStartCode(a.country_code);
        await new Promise(r => setTimeout(r, 1100));
        const b = await reverseGeocode(s.end[1], s.end[0]);
        if (gen !== genRef.current) return;
        setEndCity(b.city); setEndCountry(b.country); setEndCode(b.country_code);
        setTitle(b.city ? (a.city && a.city !== b.city ? `${a.city} → ${b.city}` : b.city) : "");
      } catch { /* rete/geocoding ko: l'utente compila a mano */ }
      finally { if (gen === genRef.current) setGeocoding(false); }
    } catch (e) {
      if (gen !== genRef.current) return;
      setError(e instanceof Error ? e.message : "Impossibile leggere il GPX.");
      setParsing(false);
    }
  };

  const canCreate = coords.length >= 2 && !!endCity && !!dateStart && !creating;

  const handleCreate = () => {
    if (!canCreate) return;
    setCreating(true);
    const start = coords[0], end = coords[coords.length - 1];
    const t = addTrip({
      title: title.trim() || endCity,
      country: endCountry, city: endCity, country_code: endCode,
      trip_date: dateStart, date_end: dateEnd || null,
      rating: null, notes: null, transport_mode: mode, waypoints: [],
      latitude: end[1], longitude: end[0],
      home_latitude: start[1], home_longitude: start[0], home_label: startCity || "Partenza",
      route_geometry: coords, // traccia GPS reale
      temperature_c: null, altitude_m: endEle, max_altitude_m: maxEle, max_altitude_city: maxEle != null ? endCity : null,
      distance_from_home_km: distanceKm(start[1], start[0], end[1], end[0]), max_distance_from_home_km: null, max_distance_city: null,
      hottest_temp_c: null, hottest_city: null, coldest_temp_c: null, coldest_city: null,
      region: null, region_details: null,
    });
    navigate("/modifica-viaggio/" + t.id);
  };

  return (
    <main>
      <AppHeader />
      <div className="container mx-auto px-6 pt-8 pb-2" style={{ maxWidth: 720 }}>
        <button onClick={() => navigate(-1)} className="flex items-center gap-2" style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginBottom: 16, background: "none", border: "none", cursor: "pointer" }}>
          <ArrowLeft className="w-4 h-4" /> {t("Indietro")}
        </button>
        <h1 className="font-display" style={{ fontSize: 22, fontWeight: 700, color: "#f0f4ff", marginBottom: 6 }}>{t("Importa da GPX")}</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 20 }}>
          {t("Carica una traccia .gpx (bici, moto, trekking…): il viaggio userà il percorso GPS reale. Partenza e arrivo li rilevo io, poi puoi rifinire tutto.")}
        </p>

        <label style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
          border: "1.5px dashed #1a2d4a", borderRadius: 12, padding: "28px 16px", cursor: "pointer",
          background: "rgba(96,165,250,0.04)", marginBottom: 20,
        }}>
          <Upload className="w-6 h-6" style={{ color: "#60a5fa" }} />
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>{fileName || t("Scegli un file GPX")}</span>
          {parsing && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", gap: 6 }}><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("Leggo il percorso…")}</span>}
          <input type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ""; }} />
        </label>

        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "0.5px solid rgba(239,68,68,0.4)", borderRadius: 8, padding: "10px 12px", color: "#f87171", fontSize: 13, marginBottom: 20 }}>{error}</div>
        )}

        {coords.length >= 2 && (
          <>
            <div style={{ borderRadius: 12, overflow: "hidden", border: "0.5px solid #1a2d4a", marginBottom: 8 }}
              dangerouslySetInnerHTML={{ __html: buildTrackPreviewSvg(coords) }} />
            <div style={{ display: "flex", gap: 14, fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 20, flexWrap: "wrap" }}>
              <span>{fmtNumber(lengthKm)} km</span>
              <span>{t("{quanti} punti", { quanti: coords.length })}</span>
              {maxEle != null && <span>{t("quota max {quanto} m", { quanto: maxEle })}</span>}
              {geocoding && <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Loader2 className="w-3 h-3 animate-spin" /> {t("rilevo i luoghi…")}</span>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={label}><MapPin className="inline w-3 h-3" style={{ color: "#34d399" }} /> {t("Partenza")}</label>
                <input style={field} value={startCity} onChange={e => setStartCity(e.target.value)} placeholder={t("Città di partenza")} />
              </div>
              <div>
                <label style={label}><MapPin className="inline w-3 h-3" style={{ color: "#f472b6" }} /> {t("Arrivo")}</label>
                <input style={field} value={endCity} onChange={e => setEndCity(e.target.value)} placeholder={t("Città di arrivo")} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={label}>{t("Titolo")}</label>
              <input style={field} value={title} onChange={e => setTitle(e.target.value)} placeholder={t("Titolo del viaggio")} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
              <div><label style={label}>{t("Data inizio")}</label><input type="date" style={field} value={dateStart} onChange={e => setDateStart(e.target.value)} /></div>
              <div><label style={label}>{t("Data fine")}</label><input type="date" style={field} value={dateEnd} onChange={e => setDateEnd(e.target.value)} /></div>
              <div><label style={label}>{t("Mezzo")}</label>
                <select style={field} value={mode} onChange={e => setMode(e.target.value as Mode)}>
                  {MODES.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
              </div>
            </div>

            <button onClick={handleCreate} disabled={!canCreate}
              style={{
                width: "100%", padding: "12px", borderRadius: 999, fontSize: 14, fontWeight: 600,
                background: canCreate ? "#60a5fa" : "rgba(96,165,250,0.3)", color: "#0a1628", border: "none",
                cursor: canCreate ? "pointer" : "default",
              }}>
              {creating ? "Creo…" : "Crea viaggio"}
            </button>
          </>
        )}
      </div>
    </main>
  );
};

export default ImportaGpx;
