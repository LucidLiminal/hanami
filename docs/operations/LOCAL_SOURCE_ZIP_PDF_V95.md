# Fuente Local ZIP/CBZ/PDF — v95

## Sub-screens

- **Local**, nueva fuente integrada en Explorar → Fuentes.
- **Browse Local**, con series importadas y búsqueda por título.
- **Ficha local**, capítulos y acciones habituales de Biblioteca.
- **Gestor de series locales**, para revisar y eliminar contenido importado.
- **Lector local**, compatible con imágenes y PDF.

## Bars

- Toolbar normal de BrowseSource con título `Local`, Atrás, modo de
  visualización y overflow.
- Bloque de acciones local: **Importar ZIP**, **Gestionar** y **Formato**.
- Toolbar, navegación por capítulos, slider y bottom bar del lector.

## `itemOverflow`

El overflow de la fuente Local contiene:

- Anclar o desanclar.
- Abrir recientes.
- Importar ZIP.
- Gestionar series.
- Ayuda de formato.

No muestra “Abrir sitio web” porque Local no tiene una web remota.

## Diálogos

- Selector de `.zip` o `.cbz`.
- Progreso y errores de importación con `aria-live`.
- Ayuda con la estructura aceptada.
- Gestor de series.
- Confirmación destructiva antes de eliminar una serie y sus archivos.

## Acciones

- Importar una o varias series desde un único archivo.
- Reconocer el prefijo opcional `local/`.
- Reconocer `Serie/Capítulo/imágenes`.
- Reconocer un ZIP/CBZ por capítulo e ignorar sus carpetas internas.
- Reconocer `Serie/capítulo_n.pdf`.
- Exigir un solo PDF cuando el capítulo usa PDF.
- Usar `cover.jpg` o la primera imagen disponible como portada.
- Orden natural de series, capítulos y páginas.
- Buscar y ordenar por recientes.
- Guardar series, capítulos y blobs en IndexedDB.
- Reemplazar de forma estable una serie con el mismo título al reimportarla.
- Crear URLs Blob únicamente al visualizar los archivos.
- Leer sin red desde Explorar, Biblioteca e Historial.
- Eliminar los blobs y revocar sus URLs al borrar una serie.

## Animaciones y efectos

- Conserva las transiciones de Browse, ficha y lector de Hanami.
- El selector muestra progreso real por serie procesada.
- Las listas se actualizan mediante `hanami-local-source-change`.
- Los PDF usan una superficie clara dentro del lector nocturno.

## Gestos

- Tap para abrir serie y capítulo.
- Long press y selección contextual de capítulos.
- Swipe entre capítulos y navegación continua del lector.
- Pinch, doble toque, zonas táctiles y slider.
- Back, Escape y toque exterior cierran una sola superficie.

## Persistencia

La fuente usa la base IndexedDB `hanami-local-source` con tres stores:

- `series`
- `chapters`
- `files`

Las series locales son contenido offline nativo del navegador. No necesitan
duplicarse en el caché de descargas. Al añadir una serie a Biblioteca, sus
capítulos continúan resolviéndose desde IndexedDB.

## Límites

- Formatos de importación: ZIP y CBZ.
- Páginas: AVIF, GIF, JPEG, PNG y WebP.
- PDF: un archivo por capítulo.
- ZIP admite entradas almacenadas o Deflate.
- No se ejecuta código del archivo importado.