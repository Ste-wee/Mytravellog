# NAV·TA

Diario di viaggio interattivo: tieni traccia dei posti visitati su un globo 3D, con statistiche su distanze, altitudini e continenti esplorati.

## Feature principali

- **Globo 3D** (MapLibre GL) con i viaggi geolocalizzati e stelle di sfondo
- **Diario viaggi** con tappe multiple, mezzo di trasporto per tratta (aereo, treno, auto, nave, a piedi) e note
- **Statistiche**: distanza totale percorsa, altitudine più alta, punto più lontano da casa
- **Mappa continenti** per vedere a colpo d'occhio dove sei già stato
- **Card viaggio** in stile biglietto aereo, con ricerca e raggruppamento per anno
- **Impostazioni personalizzabili**: unità di distanza, città di residenza, lingua

## Stack tecnico

- [Vite](https://vitejs.dev/) + [React](https://react.dev/) + TypeScript
- [shadcn/ui](https://ui.shadcn.com/) + Tailwind CSS
- [MapLibre GL](https://maplibre.org/) per il globo 3D, [Leaflet](https://leafletjs.com/) per le mappe di dettaglio
- [Supabase](https://supabase.com/) come backend
- [Vitest](https://vitest.dev/) + Testing Library per i test (244 test)

## Avvio locale

```bash
npm install
npm run dev
```

## Test

```bash
npm test          # esegue tutta la suite una volta
npm run test:watch # modalità watch
```

## Build

```bash
npm run build
```

## Stato del progetto

Il layout e i componenti principali sono **congelati** (vedi [FROZEN.md](FROZEN.md)): eventuali modifiche a quei file richiedono una richiesta esplicita. Le nuove feature vanno implementate in file nuovi.
