# Hanami v81 — Port de HistoryTab

Referencia auditada: `HistoryTab.kt`, `HistoryScreen.kt`, `HistoryItem.kt`, `HistoryDialogs.kt`, `HistoryViewModel.kt`, `GetNextChapters.kt`, `DuplicateMangaDialog`, `ChangeCategoryDialog`, `MigrateMangaDialog`, `CategoryScreen`, `MangaScreen` y el lector de Mihon.

## Mapa completo del port

### Pantalla principal
- **HistoryTab / HistoryScreen**: historial de lectura agrupado cronológicamente por fecha.
- Estados de carga conceptual, historial vacío y búsqueda sin resultados.
- **FastScrollLazyColumn equivalente** con agrupadores sticky y acción para volver arriba.
- Filas de 96 px con portada tipo libro, título de hasta dos líneas, número de capítulo y hora de lectura.

### Sub-screens
- **MangaScreen equivalente**: tocar la portada abre el detalle mediante `HanamiLibrary.open` y `HanamiScreens`.
- **Reader equivalente**: tocar la fila o reanudar abre el capítulo siguiente/posición disponible mediante `HanamiLibrary.continue`.
- **CategoryScreen**: accesible desde el selector de categorías existente cuando se añade una obra.
- **Flujo de migración**: accesible desde la detección de duplicados mediante `HanamiMigrationConfig` y las pantallas de migración ya portadas.
- Las pantallas de detalle, categorías y migración conservan el historial centralizado de Hanami.

### Barras
- **NavigationBar principal**: conserva Historial y su AnimatedVector equivalente ya portado en CSS/SVG.
- **SearchToolbar**:
  - Estado normal: título Historial, Buscar y Borrar historial.
  - Estado de búsqueda: Atrás, campo editable y Borrar consulta.
  - Escape, browser Back o gesto móvil cierran primero la búsqueda.
- **SnackbarHost equivalente** para historial borrado, errores de reanudación y alta en Biblioteca.
- HistoryTab no utiliza barra contextual ni bottom action bar porque Mihon no implementa selección múltiple en esta pantalla.

### Diálogos
- **HistoryDeleteDialog**:
  - Elimina la entrada seleccionada.
  - Checkbox para eliminar todo el historial de esa obra.
  - Cancelar y Eliminar.
- **HistoryDeleteAllDialog** para limpiar todo el historial.
- **DuplicateMangaDialog** cuando una obra no favorita coincide con otra de la Biblioteca:
  - Abrir duplicado.
  - Añadir igualmente.
  - Migrar.
- **ChangeCategoryDialog** mediante el selector de categorías de Hanami al añadir a Biblioteca.
- **MigrateMangaDialog/flujo equivalente** mediante el sistema de migración ya portado.
- Todos los diálogos cierran con toque exterior, Escape y Back a través de `HanamiOverlays`.

### itemOverflow
- **Ninguno**. El `HistoryScreen` de Mihon no define `DropdownMenu`, `OverflowAction` ni menú contextual.
- Borrar todo es una acción directa del SearchToolbar que abre un diálogo de confirmación.
- Borrar una entrada, añadir a Biblioteca y reanudar son acciones visibles de la fila.

### Acciones
- Buscar por título en tiempo real.
- Entrar/salir de la búsqueda y limpiar la consulta.
- Abrir detalle desde la portada.
- Reanudar desde la fila.
- Volver a pulsar HistoryTab para reanudar la lectura más reciente.
- Mostrar “No hay siguiente capítulo” cuando no existe una lectura reanudable.
- Añadir una obra no favorita a Biblioteca.
- Aplicar categoría predeterminada o solicitar categorías según preferencias.
- Detectar duplicados, abrirlos, añadir igualmente o iniciar migración.
- Eliminar una entrada, todo el historial de una obra o todo el historial global.

### Animaciones y efectos
- Animación del item Historial de la NavigationBar.
- Transición visual al pulsar filas.
- Cabeceras de fecha sticky con desenfoque nocturno.
- Transición de SearchToolbar y foco automático.
- Snackbar temporal.
- Desplazamiento suave para volver arriba.
- Respeto de `prefers-reduced-motion`.

### Gestos y navegación
- Toque en fila: reanudar lectura.
- Toque en portada: abrir detalle sin activar la fila.
- Toque en corazón: añadir a Biblioteca.
- Toque en papelera: abrir HistoryDeleteDialog.
- Reseleccionar HistoryTab: reanudar la última lectura.
- Escape, Atrás del navegador y gesto móvil cierran búsqueda o diálogo antes de abandonar Historial.
- No se añade pulsación prolongada, selección múltiple, swipe ni pull-to-refresh: Mihon no los define para HistoryTab.

### Adaptaciones web deliberadas
- `ReaderActivity` se sustituye por el lector web de Hanami.
- La base SQL de historial se representa con `lastRead`, `readingProgress`, `lastReadChapterUrl` y `lastReadChapterNumber` de la Biblioteca local.
- Hanami conserva una entrada reciente por obra; por ello “eliminar entrada” y “eliminar todo de esta obra” convergen actualmente en la misma limpieza persistente.
- No se portan Activities, JVM, WorkManager ni componentes Android.
- Mihon aporta estructura y comportamiento; colores, tipografía, textura y atmósfera siguen siendo de Hanami.
