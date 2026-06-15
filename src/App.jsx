import React, { useState, useCallback, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { findBarrio, zoneForBarrio } from "./barrios.js";
import { savePhoto, loadPhoto, deletePhoto, deletePhotosFor, photoKey } from "./photos.js";
import { buildShopsCSV, buildSaboresCSV, downloadFile, parseImport } from "./csv.js";

// ---- Paleta (gelato + Valencia) ----
const C = {
  bg: "#FDF3EE",
  card: "#FFFBF7",
  ink: "#3A2418",
  inkSoft: "#7A6557",
  line: "#EAD9CC",
  raspberry: "#C84B6E",
  pistachio: "#7BA05B",
  saffron: "#E8943A",
  grape: "#8B5E8C",
  teal: "#4FA3A5",
  cream: "#F2E4C9",
};

const BARRIO_COLOR = {
  "Ciutat Vella": C.raspberry,
  "Ruzafa": C.pistachio,
  "l'Eixample": C.saffron,
  "Extramurs": C.grape,
  "Algirós / Playa": C.teal,
};

const CRITERIA = [
  { key: "sabor", label: "Sabor" },
  { key: "textura", label: "Textura" },
  { key: "variedad", label: "Variedad" },
  { key: "precio", label: "Precio / calidad" },
  { key: "ambiente", label: "Ambiente" },
];

// Coords aproximadas por barrio. Cada pin es arrastrable: la primera vez que
// pases por la heladería, mueve el pin a su sitio real y se guarda.
const SEED = [
  { id: "la-romana", name: "Gelateria La Romana dal 1947", barrio: "l'Eixample", g: 4.7, spec: "Pistacho y nata; institución italiana", coords: [39.4690, -0.3691] },
  { id: "valentino", name: "Valentino Gelato", barrio: "Extramurs", g: 4.6, spec: "Favorito local, conos sin gluten", coords: [39.4685, -0.3870] },
  { id: "artesana", name: "ArteSana Gelat", barrio: "Algirós / Playa", g: 5.0, spec: "Todo sin gluten y vegano · cierra L y M", coords: [39.4795, -0.3460] },
  { id: "puro", name: "PURO Heladería y Café", barrio: "Ciutat Vella", g: 4.9, spec: "Dulce de leche argentino, junto a la Catedral", coords: [39.4759, -0.3746] },
  { id: "gelat-mercat", name: "Heladería Gelat del Mercat", barrio: "Ruzafa", g: 5.0, spec: "Caseros, horchata artesana · Mercado de Ruzafa", coords: [39.4635, -0.3742] },
  { id: "pistacchieria", name: "La Pistacchieria", barrio: "Ciutat Vella", g: 4.7, spec: "Pistacho en varias versiones", coords: [39.4732, -0.3770] },
  { id: "pamuri", name: "P´amuRi Gelateria Siciliana", barrio: "Algirós / Playa", g: 4.8, spec: "Gelato siciliano 100% artesanal", coords: [39.4770, -0.3265] },
  { id: "antigua-lecheria", name: "Antigua Lechería", barrio: "Ruzafa", g: 4.7, spec: "Crema de la abuela; café muy bueno", coords: [39.4626, -0.3737] },
  { id: "pico-masia", name: "Gelateria Picó Masiá", barrio: "Extramurs", g: 4.5, spec: "Producto fresco, terraza agradable", coords: [39.4670, -0.3850] },
  { id: "llinares", name: "Llinares", barrio: "Ciutat Vella", g: 4.2, spec: "Clásico junto a Plaça de la Reina", coords: [39.4744, -0.3753] },
  { id: "glasol", name: "Glasol", barrio: "l'Eixample", g: 4.2, spec: "Muy popular; horchata granizada", coords: [39.4720, -0.3680] },
];

const VALENCIA_CENTER = [39.4699, -0.3763];

const STORAGE_KEY = "vlc-helado-tracker-v1";
const blankTasting = () => ({
  tasted: false,
  scores: { sabor: 5, textura: 5, variedad: 5, precio: 5, ambiente: 5 },
  sabores: [],
  notes: "",
});

const newSaborId = () => "s-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---- Almacenamiento del navegador (PWA) ----
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const tastings = { ...(parsed.tastings || {}) };
      // Migración: campo antiguo "fav" (string) → primer sabor con nota = scores.sabor
      for (const id in tastings) {
        const t = { ...tastings[id] };
        if (!Array.isArray(t.sabores)) t.sabores = [];
        if (t.fav && typeof t.fav === "string" && t.fav.trim() && t.sabores.length === 0) {
          t.sabores.push({
            id: newSaborId(),
            name: t.fav.trim(),
            sabor: t.scores?.sabor ?? 7,
            textura: t.scores?.textura ?? 7,
          });
        }
        delete t.fav;
        tastings[id] = t;
      }
      return { tastings: {}, custom: [], coordsOverride: {}, ...parsed, tastings };
    }
  } catch (e) {
    console.error("No se pudo leer el almacenamiento:", e);
  }
  return { tastings: {}, custom: [], coordsOverride: {} };
}

function Scoop({ color, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.2c-3.3 0-6 2.5-6 5.6 0 .5.06.9.16 1.3H17.8c.1-.4.16-.8.16-1.3 0-3.1-2.6-5.6-6-5.6Z" fill={color} />
      <path d="M6.3 10.6 12 21.8l5.7-11.2H6.3Z" fill={color} opacity="0.55" />
    </svg>
  );
}

function overall(scores) {
  const v = CRITERIA.map((c) => Number(scores[c.key]) || 0);
  return v.reduce((a, b) => a + b, 0) / v.length;
}

// ---- Icono "scoop" en el mapa (SVG en divIcon, sin imágenes externas) ----
function scoopIcon(color, highlight = false) {
  const stroke = highlight ? "#3A2418" : "#fff";
  const sw = highlight ? 1.2 : 0.9;
  return L.divIcon({
    className: "scoop-pin",
    html: `<svg width="34" height="34" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2.2c-3.3 0-6 2.5-6 5.6 0 .5.06.9.16 1.3H17.8c.1-.4.16-.8.16-1.3 0-3.1-2.6-5.6-6-5.6Z" fill="${color}" stroke="${stroke}" stroke-width="${sw}"/>
      <path d="M6.3 10.6 12 21.8l5.7-11.2H6.3Z" fill="${color}" opacity="0.85" stroke="${stroke}" stroke-width="${sw * 0.6}"/>
    </svg>`,
    iconSize: [34, 34],
    iconAnchor: [17, 32],
    popupAnchor: [0, -28],
  });
}

function MapClickHandler({ enabled, onPick }) {
  useMapEvents({
    click(e) {
      if (enabled) onPick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

// Hook: carga el Blob desde IndexedDB y devuelve un Object URL.
// `version` permite forzar recarga tras guardar/borrar.
function usePhoto(key, version) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    let createdUrl = null;
    (async () => {
      const blob = await loadPhoto(key);
      if (!alive) return;
      if (blob) {
        createdUrl = URL.createObjectURL(blob);
        setUrl(createdUrl);
      } else {
        setUrl(null);
      }
    })();
    return () => {
      alive = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [key, version]);
  return url;
}

function Lightbox({ url, onClose, onReplace, onDelete }) {
  return (
    <div onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16,
      }}>
      <img src={url} alt="" onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "100%", maxHeight: "75vh", objectFit: "contain", borderRadius: 8 }} />
      <div onClick={(e) => e.stopPropagation()}
        style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap", justifyContent: "center" }}>
        <button onClick={onReplace}
          style={{ background: "#FFFBF7", color: "#3A2418", border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 700, cursor: "pointer" }}>
          Cambiar
        </button>
        <button onClick={onDelete}
          style={{ background: "#C84B6E", color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 700, cursor: "pointer" }}>
          Eliminar
        </button>
        <button onClick={onClose}
          style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 10, padding: "9px 16px", fontWeight: 700, cursor: "pointer" }}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

function PhotoSlot({ photoKey: key, variant = "shop", color }) {
  const [version, setVersion] = useState(0);
  const url = usePhoto(key, version);
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      await savePhoto(key, file);
      setVersion((v) => v + 1);
    } catch (err) {
      console.error("Foto no guardada:", err);
      alert("No se pudo guardar la foto.");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    await deletePhoto(key);
    setOpen(false);
    setVersion((v) => v + 1);
  };

  const isShop = variant === "shop";
  const size = isShop ? null : 44;

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onPick} style={{ display: "none" }} />
      {url ? (
        <button onClick={() => setOpen(true)}
          style={{
            background: "transparent", border: "none", padding: 0, cursor: "pointer",
            width: isShop ? "100%" : size, height: isShop ? 180 : size,
            borderRadius: isShop ? 12 : 8, overflow: "hidden", display: "block",
          }}>
          <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </button>
      ) : (
        <button onClick={() => inputRef.current?.click()} disabled={busy}
          style={{
            width: isShop ? "100%" : size, height: isShop ? 88 : size,
            background: "transparent", border: `1.5px dashed ${color || "#EAD9CC"}`,
            borderRadius: isShop ? 12 : 8, color: color || "#7A6557", cursor: "pointer",
            fontSize: isShop ? 14 : 18, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
          {busy ? "Guardando…" : isShop ? "📷 Añadir foto" : "📷"}
        </button>
      )}
      {open && url && (
        <Lightbox url={url} onClose={() => setOpen(false)} onDelete={onDelete} onReplace={() => inputRef.current?.click()} />
      )}
    </>
  );
}

export default function App() {
  const [data, setData] = useState(loadData);
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBarrio, setNewBarrio] = useState("Ciutat Vella");
  const [newCoords, setNewCoords] = useState(null);
  const [detectedBarrio, setDetectedBarrio] = useState(null); // { nombre, distrito, codbarrio } | null
  const [view, setView] = useState("list"); // 'list' | 'map'
  const [pickMode, setPickMode] = useState(false);

  const persist = useCallback((next) => {
    setData(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.error("No se pudo guardar:", e);
    }
  }, []);

  const allShops = [...SEED, ...data.custom];
  const getT = (id) => data.tastings[id] || blankTasting();
  const getCoords = (s) => data.coordsOverride[s.id] || s.coords || VALENCIA_CENTER;

  const updateTasting = (id, patch) => {
    const cur = getT(id);
    persist({ ...data, tastings: { ...data.tastings, [id]: { ...cur, ...patch } } });
  };
  const updateScore = (id, key, val) => {
    const cur = getT(id);
    updateTasting(id, { scores: { ...cur.scores, [key]: Number(val) } });
  };
  const updateCoords = (id, coords) => {
    persist({ ...data, coordsOverride: { ...data.coordsOverride, [id]: coords } });
  };
  const addSabor = (id) => {
    const cur = getT(id);
    const nuevo = { id: newSaborId(), name: "", sabor: 7, textura: 7 };
    updateTasting(id, { sabores: [...(cur.sabores || []), nuevo] });
  };
  const updateSabor = (id, saborId, patch) => {
    const cur = getT(id);
    const next = (cur.sabores || []).map((s) => (s.id === saborId ? { ...s, ...patch } : s));
    updateTasting(id, { sabores: next });
  };
  const removeSabor = (id, saborId) => {
    const cur = getT(id);
    updateTasting(id, { sabores: (cur.sabores || []).filter((s) => s.id !== saborId) });
    deletePhoto(photoKey.sabor(saborId)).catch(() => {});
  };

  const tasted = allShops
    .filter((s) => getT(s.id).tasted)
    .map((s) => ({ ...s, score: overall(getT(s.id).scores) }))
    .sort((a, b) => b.score - a.score);
  const pending = allShops.filter((s) => !getT(s.id).tasted);

  // Ranking paralelo de sabores: cada sabor con nombre y media (sabor+textura)/2
  const saborRanking = allShops.flatMap((s) => {
    const t = getT(s.id);
    return (t.sabores || [])
      .filter((sab) => sab.name && sab.name.trim())
      .map((sab) => ({
        id: sab.id,
        name: sab.name.trim(),
        sabor: sab.sabor,
        textura: sab.textura,
        score: (Number(sab.sabor) + Number(sab.textura)) / 2,
        shopId: s.id,
        shopName: s.name,
        barrio: s.barrio,
      }));
  }).sort((a, b) => b.score - a.score);

  const leader = tasted[0];
  const medals = ["#D9A441", "#B8B8BE", "#C08552"];

  const startAdd = (coords = null) => {
    setAdding(true);
    setNewCoords(coords);
    setPickMode(false);
    if (coords) {
      const info = findBarrio(coords[1], coords[0]); // GeoJSON usa [lng, lat]
      setDetectedBarrio(info);
      const zone = zoneForBarrio(info);
      if (zone) setNewBarrio(zone);
    } else {
      setDetectedBarrio(null);
    }
  };

  const addCustom = () => {
    const name = newName.trim();
    if (!name) return;
    const id = "custom-" + Date.now();
    const coords = newCoords || VALENCIA_CENTER;
    persist({
      ...data,
      custom: [...data.custom, { id, name, barrio: newBarrio, g: null, spec: "Añadida por ti", coords }],
    });
    setNewName("");
    setNewCoords(null);
    setDetectedBarrio(null);
    setAdding(false);
    setOpenId(id);
    setView("list");
  };

  const removeCustom = (id) => {
    const saborIds = ((data.tastings[id] || {}).sabores || []).map((s) => s.id);
    const nextTastings = { ...data.tastings };
    delete nextTastings[id];
    const nextOverride = { ...data.coordsOverride };
    delete nextOverride[id];
    persist({ ...data, custom: data.custom.filter((c) => c.id !== id), tastings: nextTastings, coordsOverride: nextOverride });
    deletePhotosFor(id, saborIds).catch(() => {});
  };

  const resetAll = () => {
    if (confirm("¿Borrar todas las puntuaciones y heladerías añadidas? No se puede deshacer.")) {
      persist({ tastings: {}, custom: [], coordsOverride: {} });
      setOpenId(null);
    }
  };

  const importInputRef = useRef(null);
  const exportCSV = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`heladerias-${stamp}.csv`, buildShopsCSV(allShops, data, getCoords));
    downloadFile(`sabores-${stamp}.csv`, buildSaboresCSV(allShops, data));
  };
  const onImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseImport(text, { newSaborId, blankTasting });
      if (parsed.kind === "shops") {
        const ok = confirm(`Vas a sobrescribir tus heladerías y puntuaciones con ${file.name}. Los sabores y las fotos NO se tocan. ¿Continuar?`);
        if (!ok) return;
        persist({
          ...data,
          custom: parsed.customs,
          tastings: Object.fromEntries(
            Object.entries(parsed.tastings).map(([id, t]) => [id, { ...t, sabores: data.tastings[id]?.sabores || [] }]),
          ),
          coordsOverride: parsed.coordsOverride,
        });
      } else if (parsed.kind === "sabores") {
        const ok = confirm(`Vas a sobrescribir los sabores de las heladerías presentes en ${file.name}. ¿Continuar?`);
        if (!ok) return;
        const nextTastings = { ...data.tastings };
        for (const shopId in parsed.sabores) {
          nextTastings[shopId] = { ...(nextTastings[shopId] || blankTasting()), sabores: parsed.sabores[shopId] };
        }
        persist({ ...data, tastings: nextTastings });
      }
    } catch (err) {
      console.error(err);
      alert("No se pudo importar: " + err.message);
    }
  };

  const chip = (color) => ({
    fontSize: 11, fontWeight: 700, letterSpacing: 0.3, color: "#fff",
    background: color, padding: "2px 9px", borderRadius: 999, whiteSpace: "nowrap",
  });

  const ShopRow = (s, rank) => {
    const t = getT(s.id);
    const color = BARRIO_COLOR[s.barrio] || C.inkSoft;
    const isOpen = openId === s.id;
    const score = t.tasted ? overall(t.scores) : null;
    return (
      <div key={s.id} id={`shop-${s.id}`} style={{ background: C.card, border: `1px solid ${isOpen ? color : C.line}`, borderRadius: 16, marginBottom: 12, overflow: "hidden" }}>
        <button
          onClick={() => setOpenId(isOpen ? null : s.id)}
          style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}
        >
          {rank != null ? (
            <div style={{ width: 30, textAlign: "center", flexShrink: 0 }}>
              <span style={{ fontFamily: "Georgia, serif", fontSize: 20, fontWeight: 700, color: rank <= 3 ? medals[rank - 1] : C.inkSoft }}>{rank}</span>
            </div>
          ) : (
            <div style={{ width: 30, flexShrink: 0, display: "flex", justifyContent: "center" }}><Scoop color={color} /></div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 16, color: C.ink, fontWeight: 600, lineHeight: 1.2 }}>{s.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
              <span style={chip(color)}>{s.barrio}</span>
              {s.g != null && <span style={{ fontSize: 12, color: C.inkSoft }}>Google {s.g}★</span>}
            </div>
          </div>
          {score != null ? (
            <div style={{ flexShrink: 0, textAlign: "right" }}>
              <div style={{ fontFamily: "Georgia, serif", fontSize: 24, fontWeight: 700, color: C.ink, lineHeight: 1 }}>{score.toFixed(1)}</div>
              <div style={{ fontSize: 10, color: C.inkSoft, letterSpacing: 0.5 }}>TU NOTA</div>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: color, fontWeight: 700, flexShrink: 0 }}>Pendiente ›</span>
          )}
        </button>

        {isOpen && (
          <div style={{ padding: "4px 16px 18px", borderTop: `1px solid ${C.line}` }}>
            <p style={{ fontSize: 13, color: C.inkSoft, margin: "12px 0 10px" }}>{s.spec}</p>

            <PhotoSlot photoKey={photoKey.shop(s.id)} variant="shop" color={color} />

            {!t.tasted && (
              <button onClick={() => updateTasting(s.id, { tasted: true })}
                style={{ background: color, color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 700, cursor: "pointer", marginTop: 8 }}>
                Marcar como catada
              </button>
            )}

            {t.tasted && (
              <div style={{ marginTop: 10 }}>
                {CRITERIA.map((c) => (
                  <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0" }}>
                    <label style={{ width: 120, fontSize: 13, color: C.ink }}>{c.label}</label>
                    <input type="range" min="1" max="10" value={t.scores[c.key]}
                      onChange={(e) => updateScore(s.id, c.key, e.target.value)}
                      style={{ flex: 1, accentColor: color }} />
                    <span style={{ width: 24, textAlign: "right", fontWeight: 700, color: C.ink }}>{t.scores[c.key]}</span>
                  </div>
                ))}

                <div style={{ marginTop: 14, padding: "10px 12px", border: `1px solid ${C.line}`, borderRadius: 12, background: C.bg }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, color: C.inkSoft }}>SABORES PROBADOS</div>
                    <button onClick={() => addSabor(s.id)}
                      style={{ background: color, color: "#fff", border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      + Añadir sabor
                    </button>
                  </div>
                  {(t.sabores || []).length === 0 && (
                    <div style={{ fontSize: 12, color: C.inkSoft, padding: "6px 0" }}>
                      Añade aquí cada sabor que pruebes (pistacho, horchata, dulce de leche…). Crearemos un ranking paralelo de sabores.
                    </div>
                  )}
                  {(t.sabores || []).map((sab) => (
                    <div key={sab.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: "8px 10px", marginTop: 8 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input value={sab.name}
                          onChange={(e) => updateSabor(s.id, sab.id, { name: e.target.value })}
                          placeholder="Nombre del sabor"
                          style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13, color: C.ink, background: "#fff" }} />
                        <PhotoSlot photoKey={photoKey.sabor(sab.id)} variant="sabor" color={color} />
                        <button onClick={() => removeSabor(s.id, sab.id)}
                          aria-label="Eliminar sabor"
                          style={{ background: "transparent", border: "none", color: C.raspberry, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "4px 6px" }}>
                          ×
                        </button>
                      </div>
                      {[
                        { key: "sabor", label: "Sabor" },
                        { key: "textura", label: "Textura" },
                      ].map((k) => (
                        <div key={k.key} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                          <label style={{ width: 60, fontSize: 12, color: C.inkSoft }}>{k.label}</label>
                          <input type="range" min="1" max="10" value={sab[k.key]}
                            onChange={(e) => updateSabor(s.id, sab.id, { [k.key]: Number(e.target.value) })}
                            style={{ flex: 1, accentColor: color }} />
                          <span style={{ width: 22, textAlign: "right", fontWeight: 700, color: C.ink, fontSize: 13 }}>{sab[k.key]}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                <textarea value={t.notes} onChange={(e) => updateTasting(s.id, { notes: e.target.value })}
                  placeholder="Notas: ¿volverías? ¿precio? ¿con quién?"
                  rows={2}
                  style={{ width: "100%", boxSizing: "border-box", marginTop: 8, padding: "9px 12px", borderRadius: 10, border: `1px solid ${C.line}`, background: "#fff", color: C.ink, fontSize: 13, resize: "vertical", fontFamily: "inherit" }} />

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                  <button onClick={() => updateTasting(s.id, { tasted: false })}
                    style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 10, padding: "7px 14px", color: C.inkSoft, cursor: "pointer", fontSize: 13 }}>
                    Volver a pendiente
                  </button>
                  {s.id.startsWith("custom-") && (
                    <button onClick={() => removeCustom(s.id)}
                      style={{ background: "transparent", border: "none", color: C.raspberry, cursor: "pointer", fontSize: 13 }}>
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const openedShop = allShops.find((s) => s.id === openId);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif", color: C.ink }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 18px 60px" }}>

        <header style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.raspberry, fontSize: 12, fontWeight: 800, letterSpacing: 1.5 }}>
            <Scoop color={C.pistachio} size={18} /><Scoop color={C.saffron} size={18} /><Scoop color={C.raspberry} size={18} />
            <span style={{ marginLeft: 4 }}>RUTA DEL HELADO · VALÈNCIA</span>
          </div>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 38, lineHeight: 1.05, margin: "10px 0 6px", color: C.ink }}>
            Tu ranking de heladerías
          </h1>
          <p style={{ color: C.inkSoft, fontSize: 15, margin: 0 }}>
            Cata, puntúa y deja que el ranking se ordene solo. Se guarda en tu teléfono automáticamente.
          </p>
        </header>

        {/* Toggle Lista / Mapa */}
        <div style={{ display: "flex", background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 4, marginBottom: 18, width: "fit-content" }}>
          {[
            { key: "list", label: "Lista" },
            { key: "map", label: "Mapa" },
            { key: "sabores", label: "Sabores" },
          ].map((t) => {
            const active = view === t.key;
            return (
              <button key={t.key} onClick={() => setView(t.key)}
                style={{
                  background: active ? C.ink : "transparent", color: active ? "#fff" : C.inkSoft,
                  border: "none", borderRadius: 9, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}>
                {t.label}
              </button>
            );
          })}
        </div>

        {view === "list" && (
          <>
            <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 140px", background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ fontFamily: "Georgia, serif", fontSize: 30, fontWeight: 700 }}>{tasted.length}<span style={{ fontSize: 18, color: C.inkSoft }}>/{allShops.length}</span></div>
                <div style={{ fontSize: 12, color: C.inkSoft, letterSpacing: 0.4 }}>CATADAS</div>
              </div>
              <div style={{ flex: "2 1 220px", background: leader ? C.cream : C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ fontSize: 12, color: C.inkSoft, letterSpacing: 0.4, marginBottom: 2 }}>LÍDER ACTUAL</div>
                {leader ? (
                  <div style={{ fontFamily: "Georgia, serif", fontSize: 18, fontWeight: 700, color: C.ink, lineHeight: 1.15 }}>
                    🏆 {leader.name} <span style={{ color: C.raspberry }}>· {leader.score.toFixed(1)}</span>
                  </div>
                ) : (
                  <div style={{ fontSize: 14, color: C.inkSoft }}>Aún sin catas. Empieza por la que tengas más cerca.</div>
                )}
              </div>
            </div>

            {tasted.length > 0 && (
              <section style={{ marginBottom: 28 }}>
                <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, color: C.ink, margin: "0 0 12px" }}>Ranking</h2>
                {tasted.map((s, i) => ShopRow(s, i + 1))}
              </section>
            )}

            {pending.length > 0 && (
              <section>
                <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, color: C.ink, margin: "0 0 12px" }}>Por catar</h2>
                {pending.map((s) => ShopRow(s, null))}
              </section>
            )}
          </>
        )}

        {view === "map" && (
          <section style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
              <button onClick={() => setPickMode((v) => !v)}
                style={{
                  background: pickMode ? C.raspberry : C.pistachio, color: "#fff", border: "none",
                  borderRadius: 10, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13,
                }}>
                {pickMode ? "Cancelar" : "+ Añadir aquí"}
              </button>
              <span style={{ fontSize: 12, color: C.inkSoft }}>
                {pickMode
                  ? "Toca en el mapa donde está la heladería."
                  : "Toca un pin para puntuar. Arrástralo para corregir su sitio."}
              </span>
            </div>

            <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${C.line}`, height: "55vh", minHeight: 360, cursor: pickMode ? "crosshair" : "" }}>
              <MapContainer center={VALENCIA_CENTER} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  maxZoom={19}
                />
                <MapClickHandler enabled={pickMode} onPick={(c) => startAdd(c)} />
                {allShops.map((s) => {
                  const color = BARRIO_COLOR[s.barrio] || C.inkSoft;
                  const t = getT(s.id);
                  const score = t.tasted ? overall(t.scores) : null;
                  return (
                    <Marker
                      key={s.id}
                      position={getCoords(s)}
                      icon={scoopIcon(color, openId === s.id)}
                      draggable
                      eventHandlers={{
                        dragend: (e) => {
                          const ll = e.target.getLatLng();
                          updateCoords(s.id, [ll.lat, ll.lng]);
                        },
                        click: () => setOpenId(s.id),
                      }}
                    >
                      <Popup>
                        <div style={{ fontFamily: "Georgia, serif", fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 4 }}>{s.name}</div>
                        <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 6 }}>
                          {s.barrio}{score != null && <> · <b style={{ color: C.ink }}>{score.toFixed(1)}</b> tu nota</>}
                        </div>
                        <button onClick={() => { setOpenId(s.id); setView("list"); }}
                          style={{ background: color, color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                          {t.tasted ? "Editar cata" : "Catar"}
                        </button>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            </div>

            {openedShop && (
              <div style={{ marginTop: 14 }}>
                {ShopRow(openedShop, null)}
              </div>
            )}
          </section>
        )}

        {view === "sabores" && (
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, color: C.ink, margin: "0 0 6px" }}>Ranking de sabores</h2>
            <p style={{ fontSize: 13, color: C.inkSoft, margin: "0 0 14px" }}>
              Cada sabor se puntúa por sabor y textura. El ranking ordena por la media de las dos notas.
            </p>

            {saborRanking.length === 0 ? (
              <div style={{ background: C.card, border: `1px dashed ${C.line}`, borderRadius: 14, padding: "20px 16px", color: C.inkSoft, fontSize: 14 }}>
                Aún no has añadido sabores. Abre una heladería catada y añade sabores dentro de la ficha.
              </div>
            ) : (
              saborRanking.map((sab, i) => {
                const color = BARRIO_COLOR[sab.barrio] || C.inkSoft;
                const rank = i + 1;
                return (
                  <button key={sab.id}
                    onClick={() => { setOpenId(sab.shopId); setView("list"); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                      background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, marginBottom: 10,
                      padding: "12px 14px", cursor: "pointer",
                    }}>
                    <div style={{ width: 30, textAlign: "center", flexShrink: 0 }}>
                      <span style={{ fontFamily: "Georgia, serif", fontSize: 20, fontWeight: 700, color: rank <= 3 ? medals[rank - 1] : C.inkSoft }}>{rank}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "Georgia, serif", fontSize: 16, fontWeight: 600, color: C.ink, lineHeight: 1.15 }}>
                        {sab.name}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                        <span style={chip(color)}>{sab.barrio}</span>
                        <span style={{ fontSize: 12, color: C.inkSoft }}>{sab.shopName}</span>
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: "right" }}>
                      <div style={{ fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 700, color: C.ink, lineHeight: 1 }}>{sab.score.toFixed(1)}</div>
                      <div style={{ fontSize: 10, color: C.inkSoft, letterSpacing: 0.5 }}>
                        S{sab.sabor} · T{sab.textura}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </section>
        )}

        <div style={{ marginTop: 22 }}>
          {!adding ? (
            <button onClick={() => startAdd(null)}
              style={{ background: "transparent", border: `1.5px dashed ${C.line}`, color: C.inkSoft, borderRadius: 14, padding: "14px", width: "100%", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
              + Añadir otra heladería
            </button>
          ) : (
            <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre de la heladería" autoFocus
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 14, color: C.ink }} />
              <select value={newBarrio} onChange={(e) => setNewBarrio(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", marginTop: 8, padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 14, color: C.ink, background: "#fff" }}>
                {Object.keys(BARRIO_COLOR).map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              {newCoords && (
                <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 8, lineHeight: 1.5 }}>
                  📍 Ubicación: {newCoords[0].toFixed(4)}, {newCoords[1].toFixed(4)}
                  {detectedBarrio && (
                    <>
                      <br />
                      🏘️ Barrio detectado: <b style={{ color: C.ink }}>{detectedBarrio.nombre}</b>
                      <span style={{ opacity: 0.7 }}> · Distrito {detectedBarrio.distrito}</span>
                      {!zoneForBarrio(detectedBarrio) && (
                        <span style={{ color: C.raspberry }}> · fuera de las zonas habituales, elige una</span>
                      )}
                    </>
                  )}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={addCustom} style={{ background: C.pistachio, color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 700, cursor: "pointer" }}>Añadir</button>
                <button onClick={() => { setAdding(false); setNewName(""); setNewCoords(null); setDetectedBarrio(null); }} style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 16px", color: C.inkSoft, cursor: "pointer" }}>Cancelar</button>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap", justifyContent: "center" }}>
            <button onClick={exportCSV}
              style={{ background: "transparent", border: `1px solid ${C.line}`, color: C.inkSoft, borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontSize: 13 }}>
              ⬇ Exportar CSV
            </button>
            <button onClick={() => importInputRef.current?.click()}
              style={{ background: "transparent", border: `1px solid ${C.line}`, color: C.inkSoft, borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontSize: 13 }}>
              ⬆ Importar CSV
            </button>
            <input ref={importInputRef} type="file" accept=".csv,text/csv" onChange={onImportFile} style={{ display: "none" }} />
          </div>
          <div style={{ textAlign: "center", fontSize: 11, color: C.inkSoft, marginTop: 6 }}>
            Las fotos no se incluyen en el CSV (solo viven en este dispositivo).
          </div>

          <button onClick={resetAll}
            style={{ display: "block", margin: "16px auto 0", background: "transparent", border: "none", color: C.inkSoft, cursor: "pointer", fontSize: 12, textDecoration: "underline" }}>
            Empezar de cero
          </button>

          <footer style={{ marginTop: 28, textAlign: "center", fontSize: 11, color: C.inkSoft, lineHeight: 1.6 }}>
            Mapa &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" style={{ color: C.inkSoft }}>OpenStreetMap</a>{" · "}
            Barrios:{" "}
            <a href="https://opendata.vlci.valencia.es/dataset/barris-barrios" target="_blank" rel="noreferrer" style={{ color: C.inkSoft }}>
              Ajuntament de València
            </a>{" "}
            (<a href="https://creativecommons.org/licenses/by/4.0/deed.es" target="_blank" rel="noreferrer" style={{ color: C.inkSoft }}>CC BY 4.0</a>)
          </footer>
        </div>
      </div>
    </div>
  );
}
