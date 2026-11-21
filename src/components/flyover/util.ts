/** Piccole utilità del viaggio in 3D. Spostate da TripFlyover.tsx. */
import type { FlightLeg } from "@/lib/flyover";
import { fmtNumber } from "@/lib/settings";

/** Coordinate [lon,lat] dell'intera rotta, tratto stradale reale quando disponibile. */
export function buildFlyoverRouteCoords(stops: { lat: number; lon: number }[], legs: FlightLeg[]): [number, number][] {
  const coords: [number, number][] = [[stops[0].lon, stops[0].lat]];
  for (const leg of legs) coords.push(...leg.pathCoords.slice(1));
  return coords;
}

/** Formatta un numero di km con separatore delle migliaia in stile italiano.
 *  Passa da fmtNumber (grouping "always"): toLocaleString("it-IT") da solo non
 *  raggruppa i numeri a 4 cifre, e i totali stanno quasi sempre lì. */
export function formatKm(km: number): string {
  return fmtNumber(Math.round(km));
}

export const attesa = (ms: number) => new Promise<void>(res => setTimeout(res, ms));
