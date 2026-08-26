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
  "gita": "day trip",
  "in giornata": "same day",
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
  "La mappa della mia vita": "The map of my life",
  "Diario": "Diary",
  "Apri il biglietto di {viaggio}": "Open the ticket for {viaggio}",
  "Rivivi il {anno} in 3D": "Relive {anno} in 3D",
  "Recap del {anno}": "{anno} recap",

  // ── In programma / card del piano ─────────────────────────────────────────
  "{quanti} in programma": "{quanti} planned",
  "{quante} gita in giornata": "{quante} day trip",
  "{quante} gite in giornata": "{quante} day trips",
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

  // ── Statistiche · numeri grossi ed elenco paesi ───────────────────────────
  "paesi visitati": "countries visited",
  "del mondo visto": "of the world seen",
  "Elenco dei paesi": "Countries list",
  "Nessun paese ancora. Aggiungi il tuo primo viaggio per popolare le statistiche.":
    "No countries yet. Add your first trip to fill in the stats.",
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
  "{quante} città": "{quante} cities",

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

  // ── Tutorial (AppTour) ────────────────────────────────────────────────────
  "Benvenuto in NAV·TA": "Welcome to NAV·TA",
  "La tua Home": "Your home",
  "Ruota il mondo": "Spin the world",
  "Trascina il globo per girarlo. I tuoi viaggi appaiono come archi luminosi tra le città.":
    "Drag the globe to spin it. Your trips show up as glowing arcs between cities.",
  "Il tuo atlante di viaggio: segna dove sei stato e guardalo prendere forma sul globo.":
    "Your travel atlas: record where you have been and watch it take shape on the globe.",
  "I viaggi ti seguono": "Your trips follow you",
  "Accedi con Google dalle Impostazioni: i viaggi si salvano nel cloud e li ritrovi su ogni dispositivo.":
    "Sign in with Google from Settings: your trips are saved to the cloud and you find them on every device.",
  "Ogni viaggio è un biglietto. Aggiungine uno con tappe, mezzi e date dal pulsante «Nuovo viaggio» nel menu.":
    "Every trip is a ticket. Add one with stops, transport and dates from «New trip» in the menu.",
  "Diario e ricordi": "Diary and memories",
  "Apri un biglietto per scrivere il diario giorno per giorno e rivedere il rilievo 3D del percorso.":
    "Open a ticket to write the diary day by day and see the 3D relief of the route.",
  "La mappa della vita": "The map of your life",
  "Con l'icona del globo in alto trasformi tutti i viaggi in un'unica costellazione, pronta da stampare.":
    "The globe icon at the top turns every trip into a single constellation, ready to print.",
  "I viaggi che devi ancora fare. Programma destinazione, tappe e date del tuo prossimo itinerario.":
    "The trips you have not taken yet. Plan the destination, stops and dates of your next itinerary.",
  "Cose da fare": "Things to do",
  "Segna cosa resta da organizzare e se hai già prenotato. Al ritorno tocca «Segna come fatto» e il viaggio entra nel diario.":
    "Note what is left to sort out and whether you have booked. When you get back, tap «Mark as done» and the trip joins your diary.",
  "Le tue statistiche": "Your stats",
  "Km percorsi, paesi e città visitati e i tuoi record di viaggio, in un colpo d'occhio.":
    "Distance travelled, countries and cities visited and your travel records, at a glance.",
  "Come e quando viaggi": "How and when you travel",
  "Le tue forme di viaggio — in giornata, tappa fissa, itineranti — e i mesi in cui parti di più, anno per anno.":
    "Your travel shapes — day trips, one base, roaming — and the months you leave most, year by year.",
  "Il recap dell'anno": "The year recap",
  "Genera «Il tuo anno di viaggi» e condividilo come immagine o come stories.":
    "Generate «Your year in trips» and share it as an image or as stories.",
  "L'itinerario prende forma": "The itinerary takes shape",
  "Aggiungi le tappe col loro mezzo: il percorso si disegna da solo, coi km veri strada per strada. Trascina una tappa per riordinarla.":
    "Add the stops with their transport: the route draws itself, with the real distance road by road. Drag a stop to reorder it.",
  "Dormi sempre nello stesso posto?": "Sleeping in the same place every night?",
  "Tocca la tenda su una tappa per segnarla come base: le tappe dopo diventano gite che tornano lì, e il disegno mostra le notti.":
    "Tap the tent on a stop to mark it as your base: the stops after it become day trips that return there, and the drawing shows the nights.",
  "Tutorial — {titolo}": "Tutorial — {titolo}",
  "{capitolo} · {n} di {tot}": "{capitolo} · {n} of {tot}",
  "Salta il tutorial": "Skip the tutorial",
  "Salta": "Skip",
  "Avanti": "Next",
  "Ho capito": "Got it",

  // ── Diario, pannello del piano, ricerca tappe, poster ─────────────────────
  "Scrivi il racconto giorno per giorno · si salva da solo": "Write the story day by day · saves itself",
  "Chiudi il diario": "Close the diary",
  "Cosa hai fatto questo giorno?": "What did you do that day?",
  "Cose da organizzare · si salva da solo": "Things to sort out · saves itself",
  "aggiungi cosa da fare": "add something to do",
  "Chiudi la pianificazione": "Close the planning",
  "Rimuovi la tappa {tappa}": "Remove the stop {tappa}",
  "Voce da organizzare": "Thing to sort out",
  "Rimuovi voce": "Remove item",
  "Cerca città, lago, monumento…": "Search city, lake, landmark…",
  "Scegli la tappa sul globo": "Pick the stop on the globe",
  "Chiudi ricerca tappa": "Close stop search",

  "Il tuo racconto, giorno per giorno": "Your story, day by day",
  "Cosa c'è da fare?": "What needs doing?",

  "Da organizzare": "To sort out",
  "IL TUO ANNO DI VIAGGI": "YOUR YEAR IN TRIPS",

  "Condividi": "Share",
  "Come ti sei mosso": "How you got around",
  "I tuoi record": "Your records",
  "Il tuo paese dell'anno": "Your country of the year",
  "Il momento dell'anno": "The moment of the year",

  // ── Avvisi, conferme, errori (toast e window.confirm) ─────────────────────
  // Il collaudo `npm run lingua` NON li vede: non li fa scattare. Sono
  // rimasti in italiano per due giri, trovati leggendo il codice.
  "Aggiungi almeno una città all'itinerario": "Add at least one city to the itinerary",
  "Il ritorno non può essere prima della partenza": "The return cannot be before the departure",
  "Indica da dove parti: tocca la casa nell'itinerario": "Say where you are leaving from: tap the house in the itinerary",
  "Viaggio salvato!": "Trip saved!",
  "Viaggio aggiornato!": "Trip updated!",
  "Spazio del browser esaurito: il viaggio NON è stato salvato.": "The browser is out of space: the trip was NOT saved.",
  "Hai modifiche non salvate. Uscire senza salvare?": "You have unsaved changes. Leave without saving?",
  "Segnare «{viaggio}» come fatto? Verrà spostato nei tuoi viaggi.": "Mark «{viaggio}» as done? It will move to your travels.",
  "Spostato nei tuoi viaggi ✓ Completa itinerario e dettagli.": "Moved to your travels ✓ Fill in the itinerary and details.",
  "Eliminare il viaggio in programma «{viaggio}»?": "Delete the planned trip «{viaggio}»?",
  "Piano eliminato": "Plan deleted",

  // Etichette invisibili che il collaudo non vedeva: una perché vive solo
  // nella vista a GRIGLIA (mai visitata), l'altra perché "Rivivi" non era
  // fra le parole-spia. Due buchi diversi, stessa lezione.

  "Valutazione: {stelle} su 5": "Rating: {stelle} out of 5",
  "Nessuna valutazione": "No rating",
  "Rivivi in 3D": "Relive in 3D",
  "Elimina": "Delete",
  "Elimina piano": "Delete plan",
  "Valutazione": "Rating",
  "Motivo": "Reason",
  "Annulla": "Cancel",
  "Annulla (Ctrl/⌘+Z)": "Undo (Ctrl/⌘+Z)",
  "Zoom avanti": "Zoom in",
  "Zoom indietro": "Zoom out",

  "L'ultima tela non si può eliminare": "The last canvas cannot be deleted",
  "Elimina la tela selezionata": "Delete the selected canvas",

  // ── La coda: schermate secondarie che il collaudo dal vivo non visita ─────
  // Trovate da `npm run lingua:statico`, che legge i sorgenti invece di
  // aspettare che qualcuno apra la schermata giusta.
  "Mappa dei continenti visitati": "Map of the continents visited",
  "Caricamento mappa…": "Loading map…",
  "Troppe richieste al servizio dei confini.": "Too many requests to the borders service.",
  "Aspetta qualche minuto.": "Wait a few minutes.",
  "Sei senza connessione.": "You are offline.",
  "I confini si scaricano quando torni online.": "Borders download when you are back online.",
  "Mappa non disponibile per questo paese.": "No map available for this country.",
  "Chiudi la scelta sul globo": "Close the globe picker",
  "Scegli la tappa": "Pick the stop",
  "Nome della tappa": "Stop name",
  "Da dove parti?": "Where do you set off from?",
  "Ogni viaggio parte da casa: da qui nascono le linee del globo e i tuoi poster.":
    "Every trip starts from home: that is where the globe lines and your posters come from.",
  "La tua città…": "Your city…",
  "Cerca la tua città di partenza": "Search for your starting city",
  "Città trovate": "Cities found",
  "più o meno": "roughly",
  "il giro del mondo": "around the world",
  "Vedi il rilievo 3D del viaggio": "See the 3D relief of the trip",
  "Rilievo 3D del viaggio": "3D relief of the trip",
  "Il diario di bordo è ancora vuoto.": "The logbook is still empty.",
  "IL MOMENTO": "THE MOMENT",
  "Leggi o scrivi il diario": "Read or write the diary",
  "Scegli il mezzo": "Pick the transport",
  "· già usato": "· already used",
  "Leggo il percorso…": "Reading the route…",
  "Città di partenza": "Starting city",
  "Città di arrivo": "Arrival city",
  "Titolo del viaggio": "Trip title",
  "Partenza": "Start",
  "Arrivo": "Arrival",
  "Titolo": "Title",
  "Nuovo viaggio in programma": "New planned trip",
  "Cambia destinazione": "Change destination",
  "Dove vuoi andare?": "Where do you want to go?",
  "Nessun viaggio in programma.": "No planned trips.",
  "Programma la tua prossima avventura e segna le cose da fare.":
    "Plan your next adventure and note the things to do.",
  "Pagina non trovata": "Page not found",
  "Data futura: è un viaggio in programma?": "Future date: is this a planned trip?",
  "Esiste già un viaggio simile": "A similar trip already exists",
  "Ripristina il layout iniziale": "Reset the initial layout",
  "Qui ritagli la mappa dei tuoi viaggi in un quadro a più tele — ma non c'è ancora nessun viaggio da disegnare.":
    "Here you crop the map of your trips into a multi-canvas picture — but there is no trip to draw yet.",

  "Non l'hai mai indicata, così": "You have never set it, so",
  "non compare sul globo né sui poster: senza un punto di partenza non si può disegnare la linea.":
    "does not show on the globe or on the posters: without a starting point the line cannot be drawn.",
  "non compaiono sul globo né sui poster: senza un punto di partenza non si può disegnare la linea.":
    "do not show on the globe or on the posters: without a starting point the line cannot be drawn.",

  // Etichette di UNA parola: la rete statica non le guardava (pretendeva due
  // parole per non inciampare nei nomi propri). Sei erano rimaste italiane.
  "Riprova": "Retry",
  "Mezzo": "Transport",
  "Itinerario": "Itinerary",
  "Tela": "Canvas",

  // Trovate dal controllo STRUTTURALE (che non indovina): entrambe le reti
  // euristiche le dichiaravano inesistenti. "Mappa del mondo" e' sfuggita perche'
  // «del» non era fra i miei articoli italiani; le stories perche' non
  // contengono nessuna parola-spia.
  "Mappa del mondo": "World map",
  "Chiudi mappa del paese": "Close country map",
  "del paese visitato": "of the country visited",
  "{quante} regione su {tutte}": "{quante} region out of {tutte}",
  "{quante} regioni su {tutte}": "{quante} regions out of {tutte}",
  "Ripercorriamolo insieme →": "Let us retrace it together →",
  "Hai percorso": "You travelled",
  "Sei stato in": "You have been to",
  "Alla prossima avventura ✦": "Until the next adventure ✦",

  // ── Trovate dal controllo STRUTTURALE (non indovina la lingua: cerca i
  //    letterali). Fra queste, due avevano GIÀ la chiave nel dizionario e
  //    non il t(): «Benvenuto su NAV·TA» e «Nessun risultato.» ────────────
  "Slide precedente": "Previous slide",
  "Slide successiva": "Next slide",
  "Distanze": "Distances",
  "chilometri percorsi in totale": "distance travelled in total",
  "intorno al mondo": "around the world",
  "alla luna": "to the moon",
  "Temperatura in gradi": "Temperature in degrees",
  "Chiudi anteprima rilievo": "Close relief preview",
  "diario di bordo": "logbook",
  "Durata": "Duration",
  "Ritorno": "Return",
  "rilevo i luoghi…": "detecting places…",
  "Data inizio": "Start date",
  "Data fine": "End date",
  "Titolo (opzionale)": "Title (optional)",
  "Editor quadro": "Picture editor",
  "Ripeti (Ctrl/⌘+Shift+Z)": "Redo (Ctrl/⌘+Shift+Z)",
  "Formato": "Format",
  "Colore": "Colour",


  "{mese}: nessun giorno di viaggio, {gite}": "{mese}: no travel days, {gite}",
  "{mese}: {quanti} giorno di viaggio, {gite}": "{mese}: {quanti} travel day, {gite}",
  "{mese}: {quanti} giorni di viaggio, {gite}": "{mese}: {quanti} travel days, {gite}",
  "{quante} gita": "{quante} day trip",
  "{quante} gite": "{quante} day trips",
  "una gita": "a day trip",

  "{mese} — {quante} gita": "{mese} — {quante} day trip",
  "{mese} — {quante} gite": "{mese} — {quante} day trips",
  "Gite in questo mese": "Day trips this month",


  // ── Le 60 scritte che nessuna delle due reti vedeva ───────────────────────
  // Trovate quando la rete strutturale ha smesso di leggere UNA RIGA ALLA
  // VOLTA (e2e/lingua-statico.mjs): il testo JSX scritto su una riga tutta
  // sua non ha né `>` né `<` su quella riga, quindi era invisibile. La rete
  // viva non le vedeva per un motivo diverso e complementare: stanno in stati
  // che il seed non produce mai — schermata vuota, offline, errore di mappa,
  // il cancello di benvenuto che il seed congeda.
  "Il salvataggio nel cloud non è ancora configurato in questa versione dell'app. I viaggi restano su questo dispositivo.": "Cloud saving isn't set up in this version of the app. Your trips stay on this device.",
  "Disconnetti": "Disconnect",
  "Sincronizzazione…": "Syncing…",
  "Sincronizzato · {quando}": "Synced · {quando}",
  "Connesso": "Connected",
  "I viaggi si salvano nel cloud a ogni modifica, e tornano su ogni dispositivo dove entri con lo stesso account. Le foto restano sul dispositivo.": "Your trips are saved to the cloud on every change, and come back on any device where you sign in with the same account. Photos stay on the device.",
  "Accedi con Google": "Sign in with Google",
  "Non è stato possibile caricare la mappa. Controlla la connessione e riprova più tardi.": "The map could not be loaded. Check your connection and try again later.",
  "Ruota il globo e tocca un punto": "Spin the globe and tap a spot",
  "Scegli un altro punto": "Pick another spot",
  "Aggiungi tappa": "Add stop",
  "MANCA UNA COSA": "ONE THING MISSING",
  "Sei senza connessione: per cercare la tua città serve la rete.": "You're offline: searching for your city needs a connection.",
  "Nessuna città trovata. Prova con un nome più semplice.": "No city found. Try a simpler name.",
  "Continua per ora": "Continue for now",
  "I viaggi già salvati senza partenza la erediteranno, e torneranno sulle mappe.": "Trips already saved without a starting point will inherit it, and come back on the maps.",
  "Si cambia quando vuoi dalle impostazioni.": "You can change it any time in settings.",
  "Viaggio concluso — aprilo e segnalo come fatto": "Trip over — open it and mark it as done",
  "Modifica": "Edit",
  "Inizia a scrivere": "Start writing",
  "Altri giorni (fuori dalle date attuali del viaggio)": "Other days (outside the trip's current dates)",
  "Caricamento della mappa…": "Loading the map…",
  "Impossibile caricare la mappa.": "The map could not be loaded.",
  "Questo viaggio non ha punti sufficienti per la mappa 3D (manca la posizione di casa o della destinazione).": "This trip doesn't have enough points for the 3D map (the home or destination position is missing).",
  "Ritaglia quadro": "Crop picture",
  "Periodo": "Dates",
  "Recupero regione, meteo e altitudine delle tappe…": "Fetching region, weather and altitude for the stops…",
  "Segna come fatto": "Mark as done",
  "Tocca + o premi Invio per aggiungere": "Tap + or press Enter to add",
  "Il tuo atlante personale di viaggio.": "Your personal travel atlas.",
  "Ogni meta, una stella.": "Every destination, a star.",
  "Entra come ospite": "Continue as guest",
  "🔒 I viaggi si salvano nel cloud, legati al tuo account: solo tu puoi vederli.": "🔒 Your trips are saved to the cloud, tied to your account: only you can see them.",
  "Da ospite puoi collegarti quando vuoi dalle Impostazioni.": "As a guest you can connect any time from Settings.",
  "Trascina per ruotare": "Drag to spin",
  "Indietro": "Back",
  "Prima imposta la tua città di casa": "Set your home city first",
  "Aggiungi al programma": "Add to plans",
  "Questa rotta non esiste. Torna alla home e riparti dal globo.": "This route doesn't exist. Go back home and start again from the globe.",
  "Torna alla home": "Back home",
  "Programmalo": "Plan it",
  "Salva lo stesso": "Save anyway",
  "Apri quello": "Open that one",
  "Esporta": "Export",
  "Carico la mappa del mondo…": "Loading the world map…",


  // ── Le scritte INTERROTTE da un'espressione ───────────────────────────────
  // «Mostro i primi {MAX_DAYS} giorni — il viaggio ne ha {totalDays}.»: una
  // frase sola, spezzata in tre pezzi dalle graffe. La rete trattava la graffa
  // come un muro e non vedeva né il prima né il dopo; ora la svuota.
  "＋ altro {quanti} giorno →": "＋ {quanti} more day →",
  "＋ altri {quanti} giorni →": "＋ {quanti} more days →",
  "📖 Diario — {viaggio}": "📖 Diary — {viaggio}",
  "Mostro i primi {quanti} giorni — il viaggio ne ha {totali}.": "Showing the first {quanti} days — the trip has {totali}.",
  "Giorni scritti oltre il {quanti}° (dentro le date del viaggio)": "Days written beyond day {quanti} (inside the trip's dates)",
  "🧭 Pianifica — {viaggio}": "🧭 Planning — {viaggio}",
  "{quanti} punti": "{quanti} points",
  "quota max {quanto} m": "max altitude {quanto} m",
  "Esiste già un viaggio a {citta}": "There's already a trip to {citta}",
  "Vuoi aprirlo invece di crearne un altro?": "Do you want to open it instead of creating another one?",
  "fatte": "done",
  "PNG {w}×{h}px, pronto per la stampa. SVG vettoriale per Illustrator.": "PNG {w}×{h}px, ready to print. Vector SVG for Illustrator.",
  "Nel {anno} hai fatto solo gite in giornata: sono contate a parte e non entrano nel recap.": "In {anno} you only took day trips: they're counted separately and don't go into the recap.",
  "Vai al {anno}": "Go to {anno}",
  "posizione agganciata ({lat}, {lon})": "position locked ({lat}, {lon})",
  "destinazione": "destination",


  // ⚠️ Queste quattro stanno dentro una FUNZIONE, non in un tag: la rete
  // strutturale guarda testo JSX, attributi e toast, quindi non le vedeva —
  // e la rete viva nemmeno, perché nel seed non c'è mai stata una
  // sincronizzazione. In inglese si leggeva «Synced · 2 minuti fa».
  "pochi secondi fa": "a few seconds ago",
  "{quanti} secondi fa": "{quanti} seconds ago",
  "{quanti} minuto fa": "{quanti} minute ago",
  "{quanti} minuti fa": "{quanti} minutes ago",


  // ── Mezzi e continenti: l'italiano È l'identificatore ─────────────────────
  // ⚠️ Queste stringhe NON si traducono nel codice: restano in chiaro come
  // chiavi, perché la logica ci si appoggia — `visitedContinents.has("Europa")`,
  // `TRANSPORT[m].label`. Si traducono solo dove si mostrano. Tradurre il
  // valore romperebbe l'appartenenza all'insieme e i confronti.
  "Aereo": "Plane",
  "In aereo": "By plane",
  "Treno": "Train",
  "In treno": "By train",
  "Auto": "Car",
  "In auto": "By car",
  "Nave": "Ship",
  "In nave": "By ship",
  "A piedi": "On foot",
  "Piedi": "Foot",
  "Bici": "Bike",
  "In bici": "By bike",
  "Moto": "Motorbike",
  "In moto": "By motorbike",
  "Bus": "Bus",
  "In bus": "By bus",
  "Antartide": "Antarctica",
  "Europa": "Europe",
  "Africa": "Africa",
  "Asia": "Asia",
  "Oceania": "Oceania",
  "Nord America": "North America",
  "Sud America": "South America",


  // ── Le scritte fuori dal JSX: componenti ──────────────────────────────────
  "Viaggio": "Trip",
  "Temperatura {gradi}: tocca per correggerla": "Temperature {gradi}: tap to correct it",
  "Comprimi le note": "Collapse the notes",
  "Espandi le note": "Expand the notes",
  "Mostra tutto": "Show all",
  "Diario · {quanti} giorno": "Diary · {quanti} day",
  "Diario · {quanti} giorni": "Diary · {quanti} days",
  "Rilievo 3D di {viaggio}": "3D relief of {viaggio}",
  "{quanti}g": "{quanti}d",
  "{quanti} giorno scritto": "{quanti} day written",
  "{quanti} giorni scritti": "{quanti} days written",
  "Rimuovi il momento del viaggio": "Remove the moment of the trip",
  "Segna come il momento del viaggio": "Mark as the moment of the trip",
  "Il momento del viaggio (tocca per rimuovere)": "The moment of the trip (tap to remove)",
  "Diario — {viaggio}": "Diary — {viaggio}",
  "Leggi": "Read",
  "Scrivi": "Write",
  "Esporto…": "Exporting…",
  "Esporta SVG": "Export SVG",
  "Salvo…": "Saving…",
  "Salva": "Save",
  "Non memorabile": "Forgettable",
  "Nella media": "Average",
  "Bello": "Nice",
  "Fantastico": "Great",
  "Indimenticabile": "Unforgettable",
  "☀ in giornata": "☀ day trip",
  "🌙 base": "🌙 base",
  "Itinerario con base a {base}: {quante} gita": "Itinerary based in {base}: {quante} day trip",
  "Itinerario con base a {base}: {quante} gite": "Itinerary based in {base}: {quante} day trips",
  "Cambia mezzo · ~{quanto}": "Change transport · ~{quanto}",
  "Cambia mezzo": "Change transport",
  "✓ Fine: torna alla vista con la base": "✓ Done: back to the view with the base",
  "Riordina o cambia mezzo": "Reorder or change transport",
  "Prenota volo": "Book the flight",
  "Prenota alloggio": "Book the place to stay",
  "Documenti / passaporto": "Documents / passport",
  "Pianifica — {viaggio}": "Planning — {viaggio}",
  "Segna da fare": "Mark as to do",
  "Segna fatto": "Mark as done",
  "Rimuovi {chi}": "Remove {chi}",
  "Accesso non riuscito. Riprova, o entra come ospite.": "Sign-in failed. Try again, or continue as a guest.",
  "Mappa di {paese}": "Map of {paese}",
  "Nessuna suddivisione disponibile": "No subdivisions available",
  "Mostra tutto ({quanti})": "Show all ({quanti})",
  "giorno in viaggio": "day travelling",


  // ── Le scritte fuori dal JSX: pagine, poster su canvas, errori ────────────
  // ⚠️ Il poster del recap è disegnato su CANVAS: la rete viva legge
  // `document.body.innerText` e su un canvas non c'è niente da leggere. Quelle
  // scritte le può vedere solo la rete strutturale. Limite dichiarato.
  "Accesso annullato.": "Sign-in cancelled.",
  "Accesso non riuscito.": "Sign-in failed.",
  "L'archivio ha superato il tetto di un documento nel cloud. I dati sul dispositivo sono al sicuro.": "The archive has outgrown the size limit of a single cloud document. The data on this device is safe.",
  "Sincronizzazione non riuscita: si riprova da sola.": "Sync failed: it will try again by itself.",
  "File GPX non valido": "Invalid GPX file",
  "Libera spazio eliminando qualche viaggio; se il cloud è attivo i dati restano lì.": "Free up space by deleting a trip or two; if the cloud is on, your data stays there.",
  "Il GPX non contiene un percorso (servono almeno 2 punti).": "The GPX has no route in it (at least 2 points are needed).",
  "Creo…": "Creating…",
  "Crea viaggio": "Create trip",
  "A3 verticale": "A3 portrait",
  "A2 verticale": "A2 portrait",
  "Quadrato": "Square",
  "Orizzontale": "Landscape",
  "Notte": "Night",
  "Oro": "Gold",
  "Blu": "Blue",
  "Carta": "Paper",
  "Modalità: Inquadra (trascina = pan del contenuto)": "Mode: Frame (drag = pan the content)",
  "Modalità: Disponi (trascina = sposta la tela)": "Mode: Arrange (drag = move the canvas)",
  "Inquadra": "Frame",
  "Disponi": "Arrange",
  "Creazione…": "Creating…",
  "Trascina dentro una tela per inquadrare · rotellina, pizzico o ＋− per lo zoom · «Disponi» per spostare e ridimensionare": "Drag inside a canvas to frame it · wheel, pinch or ＋− to zoom · «Arrange» to move and resize",
  "Trascina una tela per spostarla · angoli per ridimensionare · rotellina, pizzico o ＋− per lo zoom · «Inquadra» per il pan del contenuto": "Drag a canvas to move it · corners to resize · wheel, pinch or ＋− to zoom · «Frame» to pan the content",
  "percorsi in totale": "travelled in total",
  "COME TI SEI MOSSO": "HOW YOU GOT AROUND",
  "paese dell'anno": "country of the year",
  "★ IL MOMENTO DELL'ANNO": "★ THE MOMENT OF THE YEAR",
  "{quanti} mese in viaggio": "{quanti} month travelling",
  "{quanti} mesi in viaggio": "{quanti} months travelling",
  "Nel {anno} ci sono solo gite in giornata: sono contate a parte e non entrano nel recap. Serve un viaggio con almeno una notte fuori.": "In {anno} there are only day trips: they're counted separately and don't go into the recap. A trip needs at least one night away.",
  "tuo archivio": "your archive",
  "Ancora nessun viaggio: il recap si popola man mano che aggiungi i tuoi viaggi.": "No trips yet: the recap fills up as you add them.",

  "giorni": "days",

  // ── Le due schede di «I miei viaggi» ──────────────────────────────────────
  "Viaggi": "Trips",
  "Gite": "Day trips",
  "Cosa vuoi vedere": "What do you want to see",
  "Nessuna gita in giornata, per ora.": "No day trips yet.",
  "Parti e torni lo stesso giorno. Contate a parte: fuori da statistiche, record e recap, ma sul globo ci sono.":
    "You leave and come back the same day. Counted separately: outside stats, records and the recap — but they are on the globe.",


  // ── «Nuova gita»: lo stesso form con una data sola ────────────────────────
  "Nuova gita": "New day trip",
  "Nome della gita": "Day trip name",
  "Giorno": "Day",
  "Parti e torni lo stesso giorno.": "You leave and come back the same day.",
  "Salva gita": "Save day trip",
  "Es. Domenica al lago…": "E.g. Sunday by the lake…",


  // ── Mappa della vita: le due prove sulla forma, e i compagni ──────────────
  "Tratte da casa": "Legs from home",
  "Tratto sottile": "Thin stroke",

} as const;
