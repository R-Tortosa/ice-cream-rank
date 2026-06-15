// Export/import sencillo en CSV. Las fotos NO van aquí (binarios no caben en CSV).
// El round-trip de datos numéricos y de texto sí es completo.

function esc(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const toCSV = (rows) => rows.map((r) => r.map(esc).join(",")).join("\n");

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; continue; }
        inQ = false; continue;
      }
      cur += c; continue;
    }
    if (c === '"') { inQ = true; continue; }
    if (c === ",") { row.push(cur); cur = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      // ignora líneas vacías
      if (!(row.length === 1 && row[0] === "")) rows.push(row);
      row = [];
      continue;
    }
    cur += c;
  }
  if (cur !== "" || row.length > 0) {
    row.push(cur);
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
  }
  return rows;
}

const SHOP_HEADER = ["id","name","barrio","custom","lat","lng","g_rating","tasted","score_overall","sabor","textura","variedad","precio","ambiente","notes"];
const SABOR_HEADER = ["sabor_id","shop_id","shop_name","sabor_name","sabor","textura","score_overall"];

function avg(...nums) {
  return nums.reduce((a, b) => a + Number(b || 0), 0) / nums.length;
}

export function buildShopsCSV(allShops, data, getCoords) {
  const rows = [SHOP_HEADER];
  for (const s of allShops) {
    const t = data.tastings[s.id] || {};
    const sc = t.scores || {};
    const [lat, lng] = getCoords(s);
    const overall = t.tasted
      ? avg(sc.sabor, sc.textura, sc.variedad, sc.precio, sc.ambiente).toFixed(2)
      : "";
    rows.push([
      s.id, s.name, s.barrio,
      s.id.startsWith("custom-") ? "Y" : "N",
      lat, lng, s.g ?? "",
      t.tasted ? "Y" : "N",
      overall,
      sc.sabor ?? "", sc.textura ?? "", sc.variedad ?? "", sc.precio ?? "", sc.ambiente ?? "",
      t.notes || "",
    ]);
  }
  return toCSV(rows);
}

export function buildSaboresCSV(allShops, data) {
  const rows = [SABOR_HEADER];
  for (const s of allShops) {
    const t = data.tastings[s.id];
    if (!t || !t.sabores) continue;
    for (const sab of t.sabores) {
      if (!sab.name || !sab.name.trim()) continue;
      rows.push([
        sab.id, s.id, s.name, sab.name,
        sab.sabor, sab.textura,
        avg(sab.sabor, sab.textura).toFixed(2),
      ]);
    }
  }
  return toCSV(rows);
}

export function downloadFile(filename, text, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Detecta el tipo de CSV (shops | sabores | desconocido) por la cabecera.
function csvKind(headerRow) {
  const h = headerRow.map((x) => x.trim());
  if (h.includes("shop_id") && h.includes("sabor_name")) return "sabores";
  if (h.includes("lat") && h.includes("lng") && h.includes("custom")) return "shops";
  return null;
}

export function parseImport(text, { newSaborId, blankTasting }) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error("CSV vacío o sin datos.");
  const kind = csvKind(rows[0]);
  if (!kind) throw new Error("Cabecera CSV no reconocida.");
  const idx = Object.fromEntries(rows[0].map((h, i) => [h.trim(), i]));

  if (kind === "shops") {
    const customs = [];
    const tastings = {};
    const coordsOverride = {};
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const id = row[idx.id];
      if (!id) continue;
      const lat = num(row[idx.lat]);
      const lng = num(row[idx.lng]);
      const isCustom = row[idx.custom] === "Y";
      if (isCustom) {
        customs.push({
          id,
          name: row[idx.name],
          barrio: row[idx.barrio],
          g: num(row[idx.g_rating]),
          spec: "Añadida por ti",
          coords: lat != null && lng != null ? [lat, lng] : [39.4699, -0.3763],
        });
      } else if (lat != null && lng != null) {
        coordsOverride[id] = [lat, lng];
      }
      const t = blankTasting();
      t.tasted = row[idx.tasted] === "Y";
      t.scores = {
        sabor: num(row[idx.sabor]) ?? t.scores.sabor,
        textura: num(row[idx.textura]) ?? t.scores.textura,
        variedad: num(row[idx.variedad]) ?? t.scores.variedad,
        precio: num(row[idx.precio]) ?? t.scores.precio,
        ambiente: num(row[idx.ambiente]) ?? t.scores.ambiente,
      };
      t.notes = row[idx.notes] || "";
      tastings[id] = t;
    }
    return { kind, customs, tastings, coordsOverride };
  }

  // sabores
  const byShop = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const shopId = row[idx.shop_id];
    const name = row[idx.sabor_name];
    if (!shopId || !name) continue;
    (byShop[shopId] ||= []).push({
      id: row[idx.sabor_id] || newSaborId(),
      name,
      sabor: num(row[idx.sabor]) ?? 5,
      textura: num(row[idx.textura]) ?? 5,
    });
  }
  return { kind, sabores: byShop };
}
