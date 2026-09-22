# Descargas reales y lectura offline — v94

## Referencia revisada

Se revisaron `DownloadQueueScreen`, `DownloadQueueViewModel`, `DownloadManager`,
`Downloader`, `DownloadStore`, `DownloadCache`, `DownloadHolder`,
`DownloadDropdownMenu` y `DownloadPageLoader` de Mihon. Hanami sustituye los
archivos Android por IndexedDB y CacheStorage.

## Inventario del port

### Sub-screens

- Cola de descargas, accesible desde Actualizaciones y Más.
- Ficha de obra, con descarga individual, inmediata y por lote.
- Lector offline-first.
- Datos y almacenamiento, conectado a la cuota del origen web.

### Bars

- App bar de la cola con Atrás, Ordenar y overflow.
- Barra contextual de capítulos con Descargar/Eliminar.
- FAB Pausar/Reanudar sincronizado con la cola persistente.

### `itemOverflow`

- Sin descargar: encolar.
- En cola o descargando: descargar ahora o cancelar.
- Descargado: eliminar archivos.
- Error: reintentar.
- Cola: ordenar, invertir y vaciar trabajos pendientes.

### Diálogos

- Eliminar descargas seleccionadas.
- Vaciar la cola.
- Eliminar todas las descargas desde Más.

### Acciones

- Obtener páginas reales desde el adaptador.
- Descargar imágenes con tres workers por capítulo.
- Guardar trabajos y manifiestos en IndexedDB.
- Guardar imágenes en `hanami-chapter-pages-v1`.
- Validar HTTP y MIME cuando la respuesta no es opaca.
- Progreso real por páginas.
- Pausar, reanudar, cancelar, reintentar y eliminar.
- Recuperar trabajos interrumpidos después de recargar.
- Sincronizar Biblioteca, Actualizaciones, ficha y Más.
- Solicitar almacenamiento persistente con `navigator.storage.persist()`.
- Conservar biblioteca, historial y progreso al borrar archivos.

### Animaciones y efectos

- Transiciones de fila, progreso, menús y FAB.
- Actualización reactiva mediante `hanami-download-change`, sin progreso
  simulado por temporizadores.
- Respeto de `prefers-reduced-motion`.

### Gestos

- Pulsación corta para encolar o abrir el overflow.
- Pulsación prolongada para priorizar “Descargar ahora”.
- Arrastre/reordenación visual existente en Más.
- Back, Escape y Atrás consumen una sola sub-screen con `HanamiScreens`.

## Arquitectura

- `public/download-manager.js`: cola, IndexedDB, caché, cancelación y recovery.
- `public/sw.js`: página descargada primero y caché persistente entre versiones.
- `public/app.js` y `public/library.js`: lector offline-first.
- `public/manga-detail.js`: descarga real sin temporizador ficticio.
- `public/updates-tab.js` y `public/more-tab.js`: cola común.

## Diferencias deliberadas respecto a Android

- No se crean carpetas de capítulos ni CBZ: los datos viven en el origen HTTPS.
- Background Sync depende del navegador; si la PWA se suspende, la cola se
  recupera al volver a abrirla.
- Las respuestas cross-origin pueden ser opacas; el navegador valida su uso al
  mostrarlas.