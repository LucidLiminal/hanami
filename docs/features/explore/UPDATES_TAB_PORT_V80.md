# Hanami v80 — Port de UpdatesTab

Referencia auditada: `UpdatesTab.kt`, `UpdatesScreen.kt`, `UpdatesUiItem.kt`, `UpdatesFilterDialog.kt`, `UpdatesDeleteConfirmationDialog.kt`, `UpdatesViewModel.kt`, `ChapterDownloadIndicator.kt`, `MangaBottomActionMenu.kt`, `UpcomingScreen.kt`, `DownloadQueueScreen.kt` y `PullRefresh.kt` de Mihon.

## Mapa completo del port

### Pantalla principal
- **UpdatesTab / UpdateScreen**: lista cronológica de capítulos recientes agrupada por fecha.
- Estado de carga, estado vacío y texto de última actualización.
- Fila compacta de 56 px con portada cuadrada, título, capítulo y estado de descarga.
- Marcadores visuales para no leído, favorito, progreso parcial, leído y seleccionado.
- Lista de desplazamiento rápido y acción flotante para volver arriba.

### Sub-screens
- **MangaScreen equivalente**: tocar la portada abre el detalle de la obra mediante `HanamiLibrary.open` y la máquina de estados.
- **Reader equivalente**: tocar la fila abre el capítulo mediante `HanamiLibrary.read`.
- **UpcomingScreen / Próximas**: calendario predictivo agrupado por fecha, filtro de categorías y acceso al detalle.
- **DownloadQueueScreen / Descargas**: se abre al volver a pulsar UpdatesTab; muestra cola, estados, pausa/reanudación, orden y limpieza.
- Todas las subpantallas usan `HanamiScreens.push`; Atrás restaura exactamente el nivel anterior.

### Barras
- **NavigationBar principal**: conserva el item Actualizar y su animación ya portada.
- **UpdatesAppBar**: título, Filtrar, Próximas y Actualizar; el filtro activo cambia de color.
- **Selection AppBar**: cerrar selección, contador, Seleccionar todo e Invertir selección.
- **MangaBottomActionMenu equivalente**: barra inferior contextual; oculta la navegación principal durante selección.
- **Child AppBar** para Próximas y Descargas con botón Atrás.
- **SnackbarHost equivalente** para actualización iniciada o ya en curso.

### Diálogos
- **UpdatesFilterDialog** tabulado:
  - Filtro: Descargado, No leído, Iniciado y Marcado como estados Incluir/Excluir/Cualquiera.
  - Switch para ocultar scanlators excluidos.
  - Categorías: inclusión, exclusión o estado neutro por categoría.
- **UpdatesDeleteConfirmationDialog** para eliminar descargas seleccionadas.
- Confirmación separada para vaciar la cola de descargas.
- Toque exterior, Escape y browser/mobile Back cierran una sola capa mediante `HanamiOverlays`.

### itemOverflow
- Estado **en cola/descargando**: Descargar ahora y Cancelar.
- Estado **descargado**: Eliminar descarga.
- Menú de Descargas: ordenar por fecha, ordenar por título, invertir orden y vaciar cola.
- Son menús anclados, no diálogos, y permanecen dentro del viewport móvil.

### Acciones
- Actualizar toda la biblioteca y registrar la hora.
- Abrir Próximas.
- Abrir detalle desde portada y lector desde fila.
- Seleccionar con pulsación prolongada; añadir/quitar elementos con toque.
- Seleccionar todo, invertir y cancelar selección.
- Marcar o quitar favorito según el estado conjunto.
- Marcar leído o no leído y recalcular contadores de la obra.
- Descargar, descargar ahora, cancelar, reintentar implícitamente y eliminar descarga.
- Pausar/reanudar, ordenar, invertir y limpiar la cola.

### Animaciones y efectos
- Animación del icono de navegación ya existente.
- Indicador giratorio de pull-to-refresh y botón Actualizar.
- Entrada del itemOverflow.
- Transición de fondo/estado de filas y selección.
- Snackbar temporal.
- Progreso y estados visuales de descarga.
- Respeto de `prefers-reduced-motion`.

### Gestos y navegación
- Pulsación simple en fila: abrir lector.
- Pulsación simple en portada: abrir detalle.
- Pulsación prolongada: activar selección con vibración háptica.
- Toques posteriores: ampliar o reducir selección.
- Pull-to-refresh desde el inicio, deshabilitado en modo selección.
- Escape, Atrás del navegador y gesto móvil: cancelar selección o retroceder exactamente una pantalla.
- Reseleccionar UpdatesTab: abrir la cola de descargas, como Mihon.

### Adaptaciones web deliberadas
- No se portan `ReaderActivity`, WorkManager, notificaciones Android ni widgets: se usan lector web, estado local y Service Worker.
- Los estados de descarga son web/offline y se conservan en `_chapterMeta`.
- El filtro de scanlators se conserva en UI/estado para paridad, aunque Olympus no expone actualmente scanlators excluidos.
- La identidad visual continúa siendo Hanami; Mihon solo define estructura, estados, colocación y comportamiento.
