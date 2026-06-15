// Almacén de fotos en IndexedDB (vía idb-keyval).
// Las fotos llegan como File, las redimensionamos a 1280px máx, las recodificamos
// como JPEG q=0.8 (esto también borra el EXIF, incluida la geolocalización).
// Devolvemos Object URLs para mostrarlas y nos ocupamos de revocarlas en el hook
// React (ver usePhoto).
import { get, set, del, keys } from "idb-keyval";

const MAX_SIDE = 1280;
const JPEG_QUALITY = 0.8;

async function fileToImage(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fallback */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // El URL se revoca al destruir la Image en el GC; revocamos pronto:
    URL.revokeObjectURL(url);
  }
}

export async function compressImage(file) {
  if (!file) return null;
  const img = await fileToImage(file);
  const w = img.width || img.naturalWidth;
  const h = img.height || img.naturalHeight;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const tw = Math.round(w * scale);
  const th = Math.round(h * scale);

  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, tw, th);
  if (img.close) img.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob falló"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

export const photoKey = {
  shop: (id) => `shop:${id}`,
  sabor: (id) => `sabor:${id}`,
};

export async function savePhoto(key, file) {
  const blob = await compressImage(file);
  await set(key, blob);
  return blob;
}

export async function loadPhoto(key) {
  return (await get(key)) || null;
}

export async function deletePhoto(key) {
  await del(key);
}

// Borrar todas las fotos asociadas a un id de heladería (la principal + sabores).
export async function deletePhotosFor(shopId, saborIds = []) {
  await del(photoKey.shop(shopId));
  await Promise.all(saborIds.map((sid) => del(photoKey.sabor(sid))));
}

export async function clearAllPhotos() {
  const all = await keys();
  await Promise.all(all.map((k) => del(k)));
}
