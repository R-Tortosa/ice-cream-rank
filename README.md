# Ranking de heladerías de València — PWA

App web instalable para catar, puntuar y ordenar heladerías de Valencia.
React + Vite + Leaflet. Todos los datos viven en el navegador
(`localStorage` para puntuaciones y `IndexedDB` para fotos), así que funciona
sin cuenta ni servidor y mantiene modo offline tras la primera visita.

**En producción:** https://r-tortosa.github.io/ice-cream-rank/

## Qué hace

- **Catas**: cada heladería se puntúa con 5 sliders (sabor, textura, variedad,
  precio, ambiente). La media manda en el ranking general.
- **Sabores con ranking paralelo**: dentro de cada heladería puedes añadir
  los sabores que pruebes, cada uno con sus sliders de sabor y textura.
  Una vista dedicada los ordena globalmente.
- **Vista mapa**: marcadores tipo "scoop" por barrio sobre OpenStreetMap.
  Toca un pin para puntuar, arrástralo para corregir su ubicación.
- **Añadir desde el mapa**: pulsa "Añadir aquí" y toca el punto del local.
  El barrio se autodetecta usando el GeoJSON oficial del Ajuntament de
  València (88 barrios, point-in-polygon en cliente, sin red).
- **Fotos**: una principal por heladería + una por sabor. Se redimensionan
  a 1280 px y se recodifican como JPEG q=0.8 en cliente (esto borra el EXIF
  y el GPS de origen). Guardadas en IndexedDB.
- **Export/Import CSV**: backup en dos CSV (`heladerias-YYYY-MM-DD.csv` y
  `sabores-…`). Las fotos no caben en CSV, por diseño.
- **PWA real**: instalable, con service worker generado por Workbox
  (precache + runtime caching para tiles de OSM y para imágenes).

## Probarla en local

```bash
npm install
npm run dev       # http://localhost:5173
```

Para probar el service worker (modo offline real), hace falta build + preview:

```bash
npm run build
npm run preview   # http://localhost:4173
```

## Despliegue

GitHub Pages con GitHub Actions (`.github/workflows/deploy.yml`).
Cada push a `main` redespliega solo. La URL queda en
`https://<usuario>.github.io/<repo>/`.

Si forkeas o cambias el nombre del repo, edita la constante `BASE` en
`vite.config.js`.

## Estructura

```
index.html                        punto de entrada
src/main.jsx                      arranque React + registro SW + CSS Leaflet
src/App.jsx                       UI, estado, persistencia
src/barrios.js                    detección barrio+distrito (point-in-polygon)
src/barrios.geo.json              GeoJSON de los 88 barrios (CC-BY Ajuntament)
src/photos.js                     compresión + IndexedDB para fotos
src/csv.js                        export/import CSV
public/icon-192.png               iconos PWA
public/icon-512.png
scripts/process-barrios.mjs       regenera src/barrios.geo.json desde la fuente
vite.config.js                    Vite + vite-plugin-pwa (Workbox)
.github/workflows/deploy.yml      build + deploy a GitHub Pages
```

## Limitaciones honestas

- Los datos están **por dispositivo y navegador**. No hay sincronización
  entre móviles. Si limpias datos del navegador o cambias de móvil,
  empiezas de cero (a menos que hayas exportado el CSV).
- Las fotos viven en IndexedDB y **no se incluyen en el CSV**. Para un
  backup completo con fotos haría falta backend (Supabase/Firebase) o
  un ZIP con JSON+blobs.
- Las coords del SEED son aproximadas por barrio. La primera vez que
  pases por una heladería, arrastra el pin para fijar la ubicación real.
- En iOS Safari instalado, si la PWA queda inactiva semanas, el sistema
  puede vaciar su almacenamiento. Sin backend no hay garantía 100 %.

## Stack

- React 18, Vite 5
- Leaflet 1.9 + react-leaflet 4
- vite-plugin-pwa + Workbox (SW autoUpdate, precache, runtime cache de tiles)
- idb-keyval para IndexedDB

## Atribución

- Tiles del mapa © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
- Polígonos de barrios: [Ajuntament de València](https://opendata.vlci.valencia.es/dataset/barris-barrios),
  licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.es).
  Procesados con `scripts/process-barrios.mjs` (recorte de propiedades y
  redondeo de coords a 5 decimales).
