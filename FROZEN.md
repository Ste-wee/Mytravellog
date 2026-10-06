# NAV·TA — File Frozen

## Stato: FROZEN ✅
Data freeze: 2026-06-29

Tutti i file sorgente sono congelati allo stato attuale.
Modifiche future devono essere esplicite e motivate.

## File principali

### Pages
- `src/pages/Index.tsx` — Home: globo, stelle, summary cards, sidebar viaggi
- `src/pages/Stats.tsx` — Statistiche: mappa, highlights, distanze
- `src/pages/Settings.tsx` — Impostazioni: distanza, rotazione, città residenza
- `src/pages/NuovoViaggio.tsx` — Form nuovo viaggio: layout D, itinerario animato
- `src/pages/ModificaViaggio.tsx` — Form modifica viaggio: identico a NuovoViaggio con prefill

### Components
- `src/components/AppHeader.tsx` — Header condiviso (FROZEN)
- `src/components/WorldMap.tsx` — Globo MapLibre 3D (FROZEN)
- `src/components/StarField.tsx` — Campo stelle (FROZEN)
- `src/components/StatsSection.tsx` — Sezione statistiche (FROZEN)
- `src/components/ContinentsMap.tsx` — Mappa SVG continenti (FROZEN)
- `src/components/TravelHighlights.tsx` — Card highlights viaggi (FROZEN)
- `src/components/TripCard.tsx` — Card singolo viaggio (FROZEN)

### Lib
- `src/lib/storage.ts` — Trip type, addTrip, updateTrip, loadTrips (FROZEN)
- `src/lib/settings.tsx` — SettingsProvider, useSettings, HomeCity (FROZEN)
- `src/lib/geo.ts` — searchPlaces, fetchElevation, distanceKm, countryFlag (FROZEN)

### Config
- `src/main.tsx` — HashRouter, routes (FROZEN)
- `src/index.css` — Global styles (FROZEN)

## Regole
- NON modificare i file frozen senza esplicita richiesta
- NON toccare layout, altezze, proporzioni
- Per nuove feature: creare nuovi file, non modificare quelli esistenti
- Per bug critici: modifica minima e mirata

## Aggiornamento freeze

### Nuovi file frozen
- `src/pages/MieiViaggi.tsx` — pagina dedicata lista viaggi con TripCardTicket
- `src/components/TripCardTicket.tsx` — card stile biglietto aereo
- `src/pages/Stats.tsx` — già frozen
- `src/pages/Settings.tsx` — già frozen
