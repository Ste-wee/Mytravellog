/**
 * Quali riquadri satellite vedrà la camera del volo, tratta per tratta.
 *
 * Il volo sa in anticipo dove andrà (vola dritto da una tappa all'altra, con
 * zoom e inclinazione noti): scaricando i riquadri PRIMA che la camera ci
 * arrivi, la mappa non resta sgranata o a chiazze mentre scorre — difetto visto
 * nel video registrato dal sito pubblicato, assente in locale. Aspettare che la
 * mappa «abbia caricato» invece non funziona: con la camera in movimento c'è
 * SEMPRE qualche riquadro in arrivo (misurato: 97-100% dei fotogrammi).
 */

/** Una sezione del volo: dal punto/zoom di partenza a quello di arrivo. */
export interface SezioneVolo {
  da: { lon: number; lat: number; zoom: number };
  a: { lon: number; lat: number; zoom: number };
}

const LATO = 512;            // i riquadri raster MapLibre sono da 512 px
const CAMPIONI = 12;         // posizioni della camera controllate per sezione

/** Longitudine portata accanto a `vicino` (la strada corta oltre il 180°). */
function accanto(lon: number, vicino: number): number {
  let l = lon;
  while (l - vicino > 180) l -= 360;
  while (vicino - l > 180) l += 360;
  return l;
}

function pixelMondo(lon: number, lat: number, z: number): [number, number] {
  const n = LATO * 2 ** z;
  const la = Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180;
  const x = (lon + 180) / 360 * n;
  const y = (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n;
  return [x, y];
}

/**
 * I riquadri ("z/x/y") di ogni sezione, nell'ordine in cui serviranno. Un
 * riquadro compare solo nella PRIMA sezione che lo usa.
 *
 * La vista è inclinata a nord (pitch 50, bearing 0): dal centro si vede poco
 * verso sud e molto verso nord, dove però MapLibre usa uno zoom più basso.
 * Per questo: allo zoom pieno una finestra asimmetrica attorno al centro, e
 * allo zoom inferiore una finestra più ampia verso l'orizzonte.
 */
export function riquadriDelVolo(sezioni: SezioneVolo[], vista: { w: number; h: number }): string[][] {
  const visti = new Set<string>();
  return sezioni.map(({ da, a }) => {
    const lista: string[] = [];
    const aLon = accanto(a.lon, da.lon);
    for (let i = 0; i <= CAMPIONI; i++) {
      const t = i / CAMPIONI;
      const lon = da.lon + (aLon - da.lon) * t;
      const lat = da.lat + (a.lat - da.lat) * t;
      const zoom = da.zoom + (a.zoom - da.zoom) * t;
      const zPieno = Math.max(0, Math.round(zoom));
      // [zoom, quanto a ovest/est, quanto a sud, quanto a nord] in px dello schermo
      const finestre: [number, number, number, number][] = [
        [zPieno, vista.w * 0.8, vista.h * 0.7, vista.h * 1.0],
        [zPieno - 1, vista.w * 1.5, vista.h * 0.3, vista.h * 2.5],
        [zPieno - 2, vista.w * 2.5, 0, vista.h * 4],
      ];
      for (const [z, ovest, sud, nord] of finestre) {
        if (z < 0) continue;
        // px dello schermo → px del mondo allo zoom del riquadro
        const k = 2 ** (z - zoom);
        const [cx, cy] = pixelMondo(lon, lat, z);
        const n = 2 ** z;
        const x0 = Math.floor((cx - ovest * k) / LATO), x1 = Math.floor((cx + ovest * k) / LATO);
        const y0 = Math.max(0, Math.floor((cy - nord * k) / LATO));
        const y1 = Math.min(n - 1, Math.floor((cy + sud * k) / LATO));
        for (let x = x0; x <= x1; x++) {
          for (let y = y0; y <= y1; y++) {
            const chiave = `${z}/${((x % n) + n) % n}/${y}`;
            if (visti.has(chiave)) continue;
            visti.add(chiave);
            lista.push(chiave);
          }
        }
      }
    }
    // prima i riquadri allo zoom pieno (quelli nitidi davanti alla camera):
    // gli altri sono l'orizzonte, e se mancano MapLibre li copre col genitore
    return lista.sort((p, q) => Number(q.split("/")[0]) - Number(p.split("/")[0]));
  });
}
