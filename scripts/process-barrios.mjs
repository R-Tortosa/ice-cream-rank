// One-off: reduce el GeoJSON oficial de barrios de València a lo justo:
// - solo propiedades { n: nombre, d: distrito, b: codbarrio }
// - coordenadas redondeadas a 5 decimales (~1 m)
// Salida: src/barrios.geo.json
import fs from "node:fs";

const raw = JSON.parse(fs.readFileSync("barrios_raw.geojson", "utf8"));

const round = (n) => Math.round(n * 1e5) / 1e5;
const mapCoords = (c) =>
  typeof c[0] === "number" ? [round(c[0]), round(c[1])] : c.map(mapCoords);

const out = {
  type: "FeatureCollection",
  features: raw.features.map((f) => ({
    type: "Feature",
    properties: {
      n: f.properties.nombre,
      d: Number(f.properties.coddistrit),
      b: Number(f.properties.codbarrio),
    },
    geometry: {
      type: f.geometry.type,
      coordinates: mapCoords(f.geometry.coordinates),
    },
  })),
};

const path = "src/barrios.geo.json";
fs.writeFileSync(path, JSON.stringify(out));
console.log("OK →", path, "·", (fs.statSync(path).size / 1024).toFixed(1), "KB");

const geomTypes = new Set(raw.features.map((f) => f.geometry.type));
console.log("Geometry types:", [...geomTypes]);
console.log("Features:", out.features.length);
