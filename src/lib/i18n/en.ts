/**
 * Il dizionario inglese. **La chiave è l'italiano** (vedi lib/i18n/index.ts).
 *
 * ⚠️ Ogni `t("…")` nel codice deve trovare la sua chiave qui, o **il typecheck
 * fallisce**: è questa la rete che rende impossibile dimenticare una
 * traduzione. Aggiungere una scritta all'app vuol dire aggiungerla anche qui.
 *
 * Ordinato per schermata, non alfabeticamente: si aggiunge una riga vicino alle
 * sue sorelle, e si rilegge una schermata intera per controllare che il tono
 * regga (le traduzioni giuste una per una possono stonare messe in fila).
 */
export const en = {
  // ── Navigazione (AppHeader) ────────────────────────────────────────────────
  "Menu": "Menu",
  "I tuoi viaggi": "Your travels",
  "I miei viaggi": "My travels",
  "In programma": "Planned",
  "Statistiche": "Stats",
  "Aggiungi": "Add",
  "Nuovo viaggio": "New trip",
  "Importa da GPX": "Import from GPX",
  "Rivedi il tutorial": "Replay the tutorial",
  "Impostazioni": "Settings",

  // ── Home ──────────────────────────────────────────────────────────────────
  "Benvenuto su NAV·TA": "Welcome to NAV·TA",
  "Aggiungi il tuo primo viaggio e guarda il globo prendere vita.":
    "Add your first trip and watch the globe come alive.",
  "Aggiungi il primo viaggio": "Add your first trip",
  "viaggio": "trip",
  "viaggi": "trips",
  "paese": "country",
  "paesi": "countries",
  "città": "cities",
  "percorsi": "travelled",
  "Le tue statistiche: {voce}. Mostra sul globo i paesi che hai visitato":
    "Your stats: {voce}. Show the countries you have visited on the globe",
  "Le tue statistiche: {voce}. Torna ai pallini dei viaggi sul globo":
    "Your stats: {voce}. Back to the trip dots on the globe",
  "e inoltre": "plus",
  "gita": "day trip",
  "gite": "day trips",
  "in giornata": "same day",
  "gita in giornata": "day trip",
  "gite in giornata": "day trips",
  "Chiudi scheda viaggio": "Close trip card",
  "Chiudi scheda città": "Close city card",
  "Aggiungi come viaggio": "Add as a trip",

  // ── I miei viaggi ─────────────────────────────────────────────────────────
  "I viaggi che devi ancora fare: itinerario e cose da organizzare. Al ritorno diventano ricordi nel diario.":
    "The trips you have not taken yet: itinerary and things to sort out. When you get back they become memories in your diary.",
  "in programma": "planned",
  "Cerca città, paese, titolo…": "Search city, country, title…",
  "Cancella la ricerca": "Clear the search",
  "Tutti": "All",
  "Lista": "List",
  "Griglia": "Grid",
  "Nessun risultato.": "No results.",
  "Nessun viaggio ancora": "No trips yet",
  "Aggiungi il tuo primo viaggio: comparirà qui, sul globo e nelle statistiche.":
    "Add your first trip: it will show up here, on the globe and in the stats.",
  "Gite in giornata": "Day trips",
  "Parti e torni lo stesso giorno: contate a parte, fuori da statistiche e recap.":
    "You leave and come back the same day: counted separately, outside stats and recap.",
  "La mappa della mia vita": "The map of my life",
  "Diario": "Diary",
  "Programma": "Plan",
  "Apri il biglietto di {viaggio}": "Open the ticket for {viaggio}",
  "Rivivi il {anno} in 3D": "Relive {anno} in 3D",
  "Recap del {anno}": "{anno} recap",

  // ── In programma / card del piano ─────────────────────────────────────────
  "{quanti} in programma": "{quanti} planned",
  "{quante} gita in giornata": "{quante} day trip",
  "{quante} gite in giornata": "{quante} day trips",
  "IN PROGRAMMA": "PLANNED",
  "DA ORGANIZZARE": "TO SORT OUT",
  "Prenotato": "Booked",
  "Da prenotare": "To book",
  "tra {quanti} giorni": "in {quanti} days",
  "domani": "tomorrow",
  "oggi": "today",
  "in corso": "under way",
  "sei tornato?": "are you back?",
  "data non valida": "invalid date",
  "Programma un viaggio": "Plan a trip",

  // ── Statistiche ───────────────────────────────────────────────────────────
  "Ancora nessuna statistica": "No stats yet",
  "Le statistiche si costruiscono da sole man mano che aggiungi i tuoi viaggi.":
    "The stats build themselves as you add your trips.",
  "Per ora hai solo una gita in giornata: sono contate a parte e non entrano nelle statistiche. Aggiungi un viaggio con almeno una notte fuori.":
    "So far you only have one day trip: those are counted separately and stay out of the stats. Add a trip with at least one night away.",
  "Per ora hai solo gite in giornata: sono contate a parte e non entrano nelle statistiche. Aggiungi un viaggio con almeno una notte fuori.":
    "So far you only have day trips: those are counted separately and stay out of the stats. Add a trip with at least one night away.",
  "Il tuo anno di viaggi": "Your year in trips",
  "Apri il recap annuale, bello e condivisibile": "Open the yearly recap, pretty and shareable",
  "Come viaggi": "How you travel",
  "Ogni viaggio in una casella sola: {quanti}.": "Every trip in a single box: {quanti}.",
  "Tappa fissa": "One base",
  "Itineranti": "Roaming",
  "un posto, più notti": "one place, several nights",
  "un posto, più notti · {quante} con gite": "one place, several nights · {quante} with day trips",
  "{quante} tappa in media": "{quante} stop on average",
  "{quante} tappe in media": "{quante} stops on average",
  "{quante} gita in giornata, contate a parte: parti e torni lo stesso giorno.":
    "{quante} day trip, counted separately: you leave and come back the same day.",
  "{quante} gite in giornata, contate a parte: parti e torni lo stesso giorno.":
    "{quante} day trips, counted separately: you leave and come back the same day.",

  // ── Statistiche · numeri grossi ed elenco paesi ───────────────────────────
  "paesi visitati": "countries visited",
  "del mondo visto": "of the world seen",
  "Elenco dei paesi": "Countries list",
  "Nessun paese ancora. Aggiungi il tuo primo viaggio per popolare le statistiche.":
    "No countries yet. Add your first trip to fill in the stats.",
  "Mostra tutti": "Show all",
  "Mostra meno": "Show less",
  "Viaggi in {paese}": "Trips to {paese}",

  // ── Statistiche · Highlights ──────────────────────────────────────────────
  "Highlights di viaggio": "Travel highlights",
  "Altitudine più alta": "Highest altitude",
  "Più distante da casa": "Farthest from home",
  "Il posto più caldo": "The hottest place",
  "Il posto più freddo": "The coldest place",
  "Scorri a sinistra": "Scroll left",
  "Scorri a destra": "Scroll right",

  // ── Statistiche · Quando viaggi ───────────────────────────────────────────
  "Quando viaggi": "When you travel",
  "I giorni di viaggio mese per mese, tutti gli anni insieme.":
    "Your travel days month by month, all years together.",
  "giorni in viaggio": "days travelling",
  "giorni senza viaggiare": "days without travelling",
  "{quanti} giorni": "{quanti} days",
  "{mese}: {quanti} giorno di viaggio in tutto": "{mese}: {quanti} travel day in total",
  "{mese}: {quanti} giorni di viaggio in tutto": "{mese}: {quanti} travel days in total",
  "{mese} — {quanti} giorno": "{mese} — {quanti} day",
  "{mese} — {quanti} giorni": "{mese} — {quanti} days",
  "Chiudi": "Close",
  "Il tuo {anno}: {viaggi}, {giorni}. Apri il recap dell'anno":
    "Your {anno}: {viaggi}, {giorni}. Open the year recap",
  "{quanti} viaggio": "{quanti} trip",
  "{quanti} viaggi": "{quanti} trips",
  "{quanti} giorno": "{quanti} day",

  "gita in giornata, contate a parte: parti e torni lo stesso giorno.": "day trip, counted separately: you leave and come back the same day.",
  "gite in giornata, contate a parte: parti e torni lo stesso giorno.": "day trips, counted separately: you leave and come back the same day.",

  // ── Impostazioni ──────────────────────────────────────────────────────────
  "Misure": "Units",
  "Unità di misura": "Units of measure",
  "Come mostrare distanze, altitudini e temperature": "How to show distances, altitudes and temperatures",
  "Distanze e altitudini": "Distances and altitudes",
  "Metrico": "Metric",
  "Imperiale": "Imperial",
  "Temperatura": "Temperature",
  "Celsius": "Celsius",
  "Fahrenheit": "Fahrenheit",
  "Città di residenza": "Home city",
  "Usata per calcolare le distanze e precompilare il punto di partenza":
    "Used to work out distances and to pre-fill your starting point",
  "Cerca la tua città…": "Search for your city…",
  "Rimuovi la città di residenza": "Remove the home city",
  "Lingua": "Language",
  "Interfaccia, date e numeri": "Interface, dates and numbers",
  "Italiano": "Italiano",
  "English": "English",
  "Sistema": "System",
  "automatica": "automatic",
  "I nomi dei viaggi già salvati restano come li hai censiti: sono dati, non scritte dell'app.":
    "The names of trips you have already saved stay as you recorded them: they are data, not app text.",
  "Globo": "Globe",
  "Rotazione automatica": "Auto-rotation",
  "Il globo ruota da solo all'avvio": "The globe spins by itself on startup",
  "Attiva": "On",
  "Disattiva": "Off",
  "Dimensione marker": "Marker size",
  "Quanto grandi sono i punti dei viaggi sul globo": "How big the trip dots are on the globe",
  "Piccoli": "Small",
  "Standard": "Standard",
  "Grandi": "Large",
  "Al momento è attiva una dimensione personalizzata: scegli un preset per sostituirla.":
    "A custom size is active right now: pick a preset to replace it.",
  "Account e backup": "Account and backup",
  "Backup nel cloud": "Cloud backup",
  "Accedi con Google per salvare i viaggi nel cloud, in automatico, e ritrovarli su ogni dispositivo (facoltativo: l'app funziona anche come ospite)":
    "Sign in with Google to save your trips to the cloud automatically and find them on every device (optional: the app works as a guest too)",
  // ── Biglietto, diario, mappe, form, GPX, recap, quadro ────────────────────
  "Azioni viaggio": "Trip actions",
  "Apri il diario del viaggio": "Open the trip diary",
  "Apri il diario ({quanti} giorno scritto)": "Open the diary ({quanti} day written)",
  "Apri il diario ({quanti} giorni scritti)": "Open the diary ({quanti} days written)",
  "Apri il diario — {giorno}": "Open the diary — {giorno}",
  "Vedi la mappa dei viaggi con {persona}": "See the map of trips with {persona}",
  "Mostra tutti i {quanti} anni": "Show all {quanti} years",
  "Tocca 🏠 per cambiare città di partenza": "Tap 🏠 to change your starting city",
  "+ Aggiungi tappa": "+ Add stop",
  "Cambia la città di partenza": "Change the starting city",
  "NOME DEL VIAGGIO (opzionale)": "TRIP NAME (optional)",
  "COMPAGNI DI VIAGGIO (opzionale)": "TRAVEL COMPANIONS (optional)",
  "Salva viaggio": "Save trip",
  "Es. Viaggio di nozze…": "E.g. Honeymoon…",
  "Valutazione del viaggio": "Trip rating",
  "Aggiungi un nome…": "Add a name…",
  "Aggiungi il compagno": "Add the companion",
  "Scegli un file GPX": "Choose a GPX file",
  "Condividi il recap": "Share the recap",
  "Riproduci come stories": "Play as stories",
  "Torna a I miei viaggi": "Back to My travels",
  "Aggiungi una tela": "Add a canvas",

  "{quanti} paese": "{quanti} country",
  "{quanti} paesi": "{quanti} countries",
  "{quanti} città": "{quanti} cities",
  "{quanti} percorsi": "{quanti} travelled",
  "e inoltre {gite}": "plus {gite}",
  "{quante} città": "{quante} cities",
  "Carica una traccia .gpx (bici, moto, trekking…): il viaggio userà il percorso GPS reale. Puoi rifinire tutto dopo.": "Upload a .gpx track (bike, motorbike, hiking…): the trip will use the real GPS route. You can fine-tune everything afterwards.",

  "🔒 Solo tu puoi leggerli: nel database ogni archivio è legato al suo account, e nessun altro account può aprirlo.":
    "🔒 Only you can read them: in the database each archive is tied to its own account, and no other account can open it.",
  "Carica una traccia .gpx (bici, moto, trekking…): il viaggio userà il percorso GPS reale. Partenza e arrivo li rilevo io, poi puoi rifinire tutto.":
    "Upload a .gpx track (bike, motorbike, hiking…): the trip will use the real GPS route. I work out the start and finish, then you can fine-tune everything.",

  "Nome del viaggio": "Trip name",
  "Compagni di viaggio": "Travel companions",
  "(opzionale)": "(optional)",
  "Salvataggio…": "Saving…",
  "Tocca 🏠 per la partenza · la base raccoglie le sue gite": "Tap 🏠 for the start · the base gathers its day trips",
  "Tocca 🏠 per la partenza · trascina le tappe per riordinarle": "Tap 🏠 for the start · drag the stops to reorder them",

  "Seleziona una destinazione": "Pick a destination",
  "{quante} stella su 5": "{quante} star out of 5",
  "{quante} stelle su 5": "{quante} stars out of 5",

} as const;
