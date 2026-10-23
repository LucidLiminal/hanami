# Restauración tras recarga — port de estado guardado de Mihon (v110)

## Referencia portada
Mihon combina `TabNavigator.saveableState`, `rememberSaveable`, ScreenModels y el back stack de Voyager. Hanami conserva su equivalente web en `sessionStorage`, History API, almacenamiento local/IndexedDB y un registro estable de reconstructores por tipo de pantalla. Los callbacks runtime ya no son necesarios después de recargar.

## Máquina de restauración
- `HanamiScreens.registerType(type, restorer)` registra reconstructores deterministas.
- `HanamiScreens.restoreCurrent()` recorre padres desde la raíz hasta la pantalla actual y reconstruye cada superficie en orden.
- `needsRestore()` distingue una recarga real de una navegación inicial o deep link nuevo.
- La restauración usa los mismos IDs y sustituye el estado del historial; no duplica pantallas.
- Si una pantalla ya no existe o no puede recuperarse, se conserva el último ancestro válido y el registro inválido se cierra.
- `updateData()` actualiza datos seguros de la pantalla sin añadir entradas.

## Sub-screens restauradas
### Raíz y Biblioteca
- Biblioteca, Actualizar, Historial, Explorar/Fuentes/Extensiones/Migrar y Más.
- Ficha de obra de Biblioteca.
- Búsqueda de Biblioteca con consulta y toolbar activa.
- Categoría, filtros, orden y visualización permanecen mediante las preferencias existentes.
- El lector reabre el capítulo exacto y recupera posición de página/progreso.

### Explorar
- Fuente abierta y modo Popular/Recientes/Búsqueda.
- Ficha de obra de una fuente.
- Resultado candidato de migración.
- Búsqueda global y consulta escrita.
- Información de extensión.
- Filtros de Fuentes y Extensiones.
- Selección de obras de una fuente para migrar.
- Repositorios de extensiones.
- Preferencias de una fuente.
- Estado de fuente ausente, con salida a Extensiones.

### Migración
- `MigrationConfigScreen` con obras y fuentes seleccionadas persistidas.
- `MigrateSearchScreen` con consulta y destinos.
- Lista de migración por lotes.
- La pantalla candidata y el detalle mantienen su padre correcto.

### Actualizar
- Próximas actualizaciones.
- Errores por obra.
- Cola de descargas abierta desde Actualizar.
- Filtros y estados de background continúan usando almacenamiento persistente.

### Más
- Descargas, actualización en background, categorías, estadísticas, datos, ajustes, instalación PWA, soporte, acerca de y ayuda.
- Subajustes de Apariencia, Biblioteca, Lector, Descargas, Seguimiento, Explorar, Seguridad y Avanzado.
- Creación de copia de seguridad.

## Barras, acciones y estado visual
- Se reconstruyen la toolbar, app bar, NavigationBar/NavigationRail, pestañas, FAB y acciones correspondientes a cada destino.
- Se conserva la URL canónica de v109 y `aria-current` de la tab propietaria.
- El scroll vertical seguro se guarda por pantalla y se repone después del montaje.
- Búsqueda de Biblioteca, Historial, búsqueda global y consulta de migración conservan texto.
- El lector usa su sistema propio de posición, capítulo y páginas; no usa el scroll global.

## ItemOverflow y diálogos
No se restauran abiertos tras recargar:
- `itemOverflow`, menús contextuales y tooltips.
- Confirmaciones de borrado, migración, desinstalación o restauración.
- Diálogos que contengan decisiones pendientes.
- Selección contextual y pulsaciones prolongadas incompletas.

Se cierran deliberadamente para impedir acciones accidentales o referencias a nodos DOM destruidos. La pantalla propietaria sí se restaura y permite abrirlos de nuevo.

## Archivos y permisos
El selector de un archivo de backup no puede sobrevivir a una recarga por seguridad del navegador. `data-backup-restore` vuelve al último ancestro válido de Datos y almacenamiento; nunca conserva ni simula un `File` sin permiso. Los datos de biblioteca, extensiones locales, portadas, capítulos y descargas permanecen en sus almacenes existentes.

## Animaciones, efectos y gestos
- La rehidratación inicial no reproduce una cadena artificial de animaciones.
- Las transiciones posteriores conservan Fade Through, slides y sheets.
- Movimiento reducido sigue aplicándose.
- Back, Escape y gesto móvil funcionan desde la pila reconstituida.
- Swipe de capítulos, pager, pull-to-refresh y long press vuelven a estar disponibles después del montaje.

## Validación
- Regresión estática `tests/reload-restoration-v110.test.mjs`.
- E2E móvil/tablet con recarga de Ajustes, búsqueda, ficha, lector, migración y subpantallas.
- Verificación de que los overlays transitorios quedan cerrados y Back conserva un solo paso.
