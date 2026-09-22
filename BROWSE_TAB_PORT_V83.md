# Hanami v83 — Port de BrowseTab

Referencia auditada: `BrowseTab.kt` y los 48 componentes de `presentation/browse` y `ui/browse` de Mihon, incluidos Sources, Extensions, BrowseSource, GlobalSearch y Migration.

## Mapa completo del port

### Pantalla principal y tabs
- **BrowseTab / TabbedScreen equivalente**, representado por la pestaña principal **Explorar** de Hanami.
- Pager con tres tabs persistentes:
  1. **Fuentes** (`sourcesTab`).
  2. **Extensiones** (`extensionsTab`).
  3. **Migrar** (`migrateSourceTab`).
- Navegación por toque y gesto horizontal entre las tres pestañas.
- Reseleccionar Explorar abre **GlobalSearchScreen**, como `BrowseTab.onReselect`.
- `HanamiBrowseTab.showExtension()` permite cambiar programáticamente a Extensiones.
- AnimatedVector de Browse adaptado a la animación SVG/CSS de la NavigationBar de Hanami.

## Fuentes

### Pantallas y sub-screens
- **SourcesScreen**: fuentes habilitadas agrupadas por uso reciente, ancladas e idioma.
- **SourcesFilterScreen equivalente**: filtro por fuentes ancladas, idiomas y fuentes habilitadas.
- **BrowseSourceScreen**: listado Popular, Recientes y búsqueda propia de la fuente.
- **GlobalSearchScreen**: búsqueda paralela en todas las fuentes habilitadas.
- **MangaScreen equivalente**: detalle desde cualquier resultado.
- **Reader equivalente**: apertura de capítulos desde detalle.
- **SourcePreferencesScreen equivalente**: preferencias disponibles del adaptador web.
- Estado de fuente ausente, carga, error y lista vacía.

### Bars
- Toolbar de Fuentes: Búsqueda global y Filtro.
- `BrowseSourceToolbar`:
  - Atrás.
  - Título y datos de fuente.
  - Búsqueda editable.
  - Modo de visualización.
  - Más opciones.
  - Añadir obra actual a Biblioteca.
- Barra de acciones Popular, Buscar y Recientes.
- NavigationBar principal oculta en subpantallas.

### itemOverflow
- Selector de visualización de BrowseSource:
  - Cuadrícula cómoda.
  - Cuadrícula compacta.
  - Lista.
- Overflow de BrowseSource:
  - Abrir en vista web.
  - Ajustes de la fuente.
- Ambos son menús anclados, no diálogos, y se integran en `HanamiOverlays`.

### Diálogos
- **SourceOptionsDialog**, abierto por pulsación prolongada:
  - Anclar/desanclar.
  - Abrir recientes.
  - Abrir web.
  - Deshabilitar.
- **SourceFilterDialog** para filtros propios del catálogo cuando el adaptador los expone.
- **RemoveMangaDialog** al retirar una obra.
- **DuplicateMangaDialog**, **ChangeCategoryDialog** y **MigrateMangaDialog** mediante los sistemas ya portados.
- Avisos de contenido y errores de fuente cuando corresponda.

## GlobalSearchScreen
- Subpantalla real registrada con `HanamiScreens.push('global-search')`; ya no es un diálogo.
- SearchToolbar con Atrás, campo editable y ejecutar búsqueda.
- Chips horizontales:
  - Todas las fuentes.
  - Solo ancladas.
  - Solo fuentes con resultados.
- Progreso lineal por fuentes completadas.
- Estados independientes de cargando, éxito, vacío y error por fuente.
- Resultados agrupados por fuente en una única fila horizontal.
- Tocar el nombre abre BrowseSourceScreen con esa fuente.
- Tocar o mantener pulsada una obra abre su detalle.

## Extensiones

### Pantallas y sub-screens
- **ExtensionsScreen** agrupada por actualizaciones, problemas, instaladas, disponibles e idioma.
- **ExtensionFilterScreen**.
- **ExtensionDetailsScreen**.
- **SourcePreferencesScreen** por cada fuente del adaptador.
- **ExtensionStoresScreen** y repositorios web compatibles.
- WebView externo seguro para sitio/repositorio.

### Bars, overflow y acciones
- SearchToolbar de Extensiones con búsqueda por nombre, idioma, descripción y fuentes.
- Badge de actualizaciones pendientes.
- Actualizar catálogo y pull-to-refresh.
- itemOverflow superior:
  - Filtrar idiomas/estado.
  - Cambiar lista detallada.
  - Repositorios.
  - Actualizar todas.
- Instalar/adjuntar, actualizar, cancelar operación y desinstalar.
- Habilitar/deshabilitar todas las fuentes de una extensión.
- Modo incógnito por extensión.
- Limpiar caché/cookies y abrir upstream.

### Diálogos
- Confirmación de desinstalación.
- Extensión no cargada.
- Confianza de extensión.
- Información y detalles de la extensión.
- Gestión de repositorios.
- En web no se ejecutan APK: las extensiones son adaptadores JavaScript/TypeScript incluidos en el despliegue.

## Migrar

### Pantallas y sub-screens
- **MigrateSourceScreen**: fuentes presentes en Biblioteca con contador de obras.
- **MigrateMangaScreen**: obras pertenecientes a una fuente.
- **MigrateSearchScreen** y **MigrateSourceSearchScreen**.
- **MigrateMangaDialog** para revisar y confirmar.
- Flujo avanzado ya portado: `MigrationConfigScreen → MigrateSearchScreen` o `migration-list`.

### Bars y acciones
- Toolbar Migrar con guía de ayuda.
- Header sticky con orden alfabético/por cantidad y dirección ascendente/descendente.
- Pulsación prolongada de fuente: copiar identificador.
- Selección individual y múltiple de obras.
- Buscar coincidencias y conservar categorías, progreso, historial, notas y metadatos.
- Navegación y cierre final conforme a la máquina de estados centralizada.

## Animaciones y efectos
- Animación del item Explorar de la NavigationBar.
- Transición entre tabs y gesto horizontal tipo pager.
- Ripple de navegación ya existente.
- Aparición de grupos y resultados globales.
- Barra de progreso de búsqueda global.
- Filas horizontales con `scroll-snap`.
- Estados de instalación/actualización y pull-to-refresh de extensiones.
- Entrada de itemOverflow, badges, estados activos y snackbars/toasts.
- Compatibilidad con `prefers-reduced-motion`.

## Gestos y navegación
- Swipe horizontal para cambiar Fuentes ↔ Extensiones ↔ Migrar.
- Toque en fuente: abrir Popular; toque en Recientes: abrir Latest.
- Pulsación prolongada en fuente: SourceOptionsDialog.
- Toque en obra: detalle; pulsación prolongada en resultados: detalle sin abandonar la búsqueda incorrectamente.
- Pull-to-refresh en Extensiones.
- Reselección de Explorar: GlobalSearchScreen.
- Escape, botón Atrás, browser Back y gesto móvil realizan exactamente una transición.
- Toque exterior cierra dialogs e itemOverflow.

## Adaptaciones web deliberadas
- No se portan APK, PackageInstaller, JVM, Activities ni WebView Android.
- Instalar significa habilitar un adaptador JavaScript/TypeScript incluido en el proyecto desplegable.
- Las páginas públicas y APIs de las fuentes se consumen mediante rutas Vercel controladas.
- Se mantienen bloqueadas las solicitudes de rastreo indicadas en la arquitectura del proyecto.
- Mihon define estructura, estados, posición y comportamiento; la identidad visual sigue siendo Hanami.
