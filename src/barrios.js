// Detección de barrio + distrito para un punto (lng, lat) usando el GeoJSON
// oficial del Ajuntament de València (CC-BY).  Se reduce a propiedades
// { n: nombre, d: distrito, b: codbarrio } en scripts/process-barrios.mjs.
import data from "./barrios.geo.json";

// Pre-cálculo de bounding box por feature para acelerar.
const FEATURES = data.features.map((f) => {
  const ring = f.geometry.coordinates[0];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { ...f, bbox: [minX, minY, maxX, maxY] };
});

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function titleCase(s) {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => {
      if (w.startsWith("l'") || w.startsWith("d'")) return w[0] + w[1] + w.slice(2, 3).toUpperCase() + w.slice(3);
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

// Busca el barrio que contiene el punto (lng, lat). Devuelve { nombre, distrito, codbarrio } o null.
export function findBarrio(lng, lat) {
  for (const f of FEATURES) {
    const [minX, minY, maxX, maxY] = f.bbox;
    if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue;
    const rings = f.geometry.coordinates;
    if (!pointInRing(lng, lat, rings[0])) continue;
    let inHole = false;
    for (let i = 1; i < rings.length; i++) {
      if (pointInRing(lng, lat, rings[i])) { inHole = true; break; }
    }
    if (!inHole) {
      return { nombre: titleCase(f.properties.n), distrito: f.properties.d, codbarrio: f.properties.b };
    }
  }
  return null;
}

// Mapeo del distrito (y codbarrio cuando hace falta) a las 5 zonas visibles
// de la app. Si la coord cae fuera de estas zonas, devuelve null y la UI
// muestra el barrio real detectado sin auto-seleccionar zona.
export function zoneForBarrio(info) {
  if (!info) return null;
  const { distrito, codbarrio } = info;
  if (distrito === 1) return "Ciutat Vella";
  if (distrito === 2) return codbarrio === 1 ? "Ruzafa" : "l'Eixample";
  if (distrito === 3) return "Extramurs";
  if (distrito === 11 || distrito === 13) return "Algirós / Playa";
  return null;
}
