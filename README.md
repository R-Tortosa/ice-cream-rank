# Ranking de heladerías de València — PWA

App web instalable para catar, puntuar y ordenar heladerías de Valencia.
Hecha con React + Vite. Los datos se guardan en el navegador (`localStorage`),
así que funciona sin cuenta ni servidor y sigue offline tras la primera visita.

## Probarla en local

```bash
npm install
npm run dev       # abre http://localhost:5173
```

## Construir para producción

```bash
npm run build     # genera la carpeta dist/
npm run preview   # sirve dist/ en local para comprobar la PWA
```

Importante: una PWA solo se instala servida por **HTTPS** (o `localhost`).
`npm run dev` ya vale para probar la instalación en local.

## Desplegar e instalar en el móvil

1. Sube la carpeta `dist/` a cualquier hosting estático con HTTPS
   (Netlify, Vercel, GitHub Pages, Cloudflare Pages…).
2. Abre la URL en el móvil → menú del navegador → **"Añadir a pantalla de inicio"**.
3. Quedará como una app independiente, con su icono y modo offline.

Si despliegas en un subdirectorio (p. ej. `usuario.github.io/heladerias/`),
cambia `base` en `vite.config.js` a `"/heladerias/"` y `start_url`/`scope`
en `public/manifest.webmanifest` a `"/heladerias/"`.

## Estructura

```
index.html                  punto de entrada
src/App.jsx                 toda la app (UI + lógica + datos sembrados)
src/main.jsx                arranque de React
public/manifest.webmanifest metadatos de la PWA (nombre, iconos, colores)
public/sw.js                service worker (offline, stale-while-revalidate)
public/icon-192.png         iconos de la app
public/icon-512.png
vite.config.js              configuración de Vite
```

## Notas para llevarlo más lejos

- El service worker actual es mínimo. Para offline a prueba de balas con
  versiones controladas, conviene cambiar a `vite-plugin-pwa` (Workbox).
- Los datos viven en este dispositivo. Si quieres sincronizar entre móviles
  haría falta un backend o un servicio tipo Supabase/Firebase.
- Para empaquetarlo como `.apk` real, se puede envolver con Capacitor o
  PWABuilder partiendo de este mismo proyecto.

---

## Prompt para pegar en Claude Code

> Tengo un proyecto React + Vite que ya es una PWA funcional (un tracker para
> puntuar heladerías de Valencia; los datos se guardan en localStorage).
> Compila con `npm install && npm run build`. Quiero que me ayudes a:
> 1) revisarlo y confirmar que la instalación PWA funciona (manifest + sw.js);
> 2) migrar el service worker a `vite-plugin-pwa` (Workbox) para offline robusto;
> 3) prepararlo para desplegar en [Netlify / Vercel / GitHub Pages] y darme los pasos.
> Empieza leyendo `src/App.jsx`, `public/manifest.webmanifest` y `vite.config.js`.
