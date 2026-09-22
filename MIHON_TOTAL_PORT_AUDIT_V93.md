# Auditoría total Mihon → Hanami

**Base auditada:** Hanami `5.8.26` / caché `hanami-explore-history-incognito-v93`  
**Referencia:** `mihon-main.zip` adjunto, revisión del 15-09-2026  
**Alcance:** estructura, pantallas, subpantallas, barras, `itemOverflow`, diálogos, acciones, animaciones, efectos, gestos, persistencia y servicios necesarios para una paridad funcional web.

## 1. Conclusión ejecutiva

Hanami ya reproduce la **arquitectura visible principal** de Mihon: cinco destinos, Biblioteca, Actualizaciones, Historial, Explorar, Más, ficha de obra, lector, seguimiento, migración y máquina de estados. La paridad no es todavía total.

La cobertura es **alta en estructura y navegación**, **media en comportamiento local** y **baja en servicios que requieren trabajo persistente, almacenamiento de archivos o integraciones reales**. No conviene declarar completado el port mientras sigan pendientes estos cinco bloques:

1. **Descargas reales y lectura offline.** Actualmente varios flujos cambian metadatos a “descargado” tras un temporizador, pero no descargan ni verifican páginas.
2. **Ajustes efectivos.** La mayoría de los controles añadidos en MoreTab solo se guardan en `localStorage`; sus claves no son leídas por los módulos que deberían aplicar el cambio.
3. **Actualización/background web.** No hay equivalente completo de WorkManager, cola persistente, Background Sync, Periodic Sync o notificaciones web.
4. **Migración masiva robusta.** Falta el motor de progreso, cancelación, reintento, salto, búsqueda manual por elemento y confirmación de salida de Mihon.
5. **Paridad profunda del lector, fuentes y trackers.** Faltan filtros/paginación de fuentes, acciones avanzadas del lector y autenticación/sincronización real de la mayoría de trackers.

### Estado cualitativo por área

| Área | Estado | Observación |
|---|---:|---|
| Shell, tabs y Back | 🟢 Alto | Cinco destinos y `HanamiScreens`; falta NavigationRail y algunos badges/deep links. |
| Biblioteca | 🟢/🟡 | Flujo principal sólido; quedan swipes de capítulo, descargas reales y un residuo interno de `all`. |
| Actualizaciones | 🟡 | UI completa; actualización y descargas son principalmente foreground/local. |
| Historial | 🟢 | Flujo muy próximo a Mihon tras v93. |
| Explorar/Fuentes | 🟡 | Buena estructura; falta paginación y filtros estructurados por fuente. |
| Extensiones | 🟢/🟡 | Buen reemplazo web con Worker; faltan preferencias dinámicas y ciclo robusto de actualización. |
| Migración | 🟡 | Individual buena; masiva incompleta. |
| Ficha de obra | 🟡/🟢 | Muchas acciones; faltan portada completa y swipe configurables. |
| Lector | 🟡/🟢 | Modos y gestos principales; faltan E‑Ink, acciones de imagen y preferencias completas. |
| MoreTab | 🟡 | Raíz y destinos presentes; Ajustes es mayoritariamente superficial. |
| Descargas/offline | 🔴 | Estado visual, no motor de archivos. |
| Tracking | 🔴/🟡 | Modelo local completo; solo AniList tiene búsqueda de red y no hay OAuth real. |
| Sistema/background | 🔴 | Onboarding, update screen, crash UI, web notifications y tareas periódicas pendientes. |

**Leyenda:** 🟢 portado o equivalente web funcional · 🟡 parcial · 🔴 pendiente aplicable · ⚫ no aplicable por arquitectura web.

---

## 2. Superficies globales

### Portado

- NavigationBar con **Biblioteca, Actualizar, Historial, Explorar y Más**.
- Reselección específica de pestañas: Actualizar → Descargas, Historial → última lectura, Explorar → búsqueda global, Más → Ajustes.
- Máquina de estados `HanamiScreens.push/replace/back/current/is/markClosed/register/snapshot`.
- Cierre de diálogos y overlays mediante toque exterior, Escape y browser Back.
- Sustitución de NavigationBar por barras contextuales durante selección.
- PWA instalable, iconos `any`/`maskable`, estado standalone e instalación guiada para iOS.
- Diseño mobile-first y adaptación básica a escritorio.

### Parcial o pendiente

- **NavigationRail/tablet de Mihon:** Hanami mantiene esencialmente la barra inferior; falta rail lateral y layouts de dos paneles.
- **Badges globales:** falta badge real de nuevas actualizaciones en Actualizar y de extensiones pendientes en el item Explorar. El badge de extensiones existe dentro de su toolbar.
- **Transición entre tabs:** hay animación CSS del icono/ripple, pero no el `materialFadeThrough` completo del contenido de Mihon.
- **Back raíz:** revisar que desde cualquier tab raíz el Back vuelva primero a Biblioteca antes de abandonar la PWA, reproduciendo `HomeScreen`.
- **Deep links:** faltan rutas web para abrir búsqueda global, una obra, un capítulo, Extensiones, Descargas y Ajustes directamente.
- **Restauración tras recarga:** la pila se serializa en sesión, pero los handlers runtime no sobreviven por sí solos; hace falta reconstrucción determinista por URL/route.
- **SnackbarHost global:** cada módulo mantiene toasts/snackbars propios; falta un host único con cola y accesibilidad `aria-live`.
- **Insets/teclado/viewport:** falta una capa común para safe areas, teclado virtual, notch y `visualViewport`.
- **Accesibilidad:** ARIA parcial; faltan focus traps uniformes, retorno de foco al cerrar overlays, navegación completa por teclado y auditoría WCAG automatizada.

---

## 3. Biblioteca

### Sub-screens portadas

- Biblioteca por categorías.
- Búsqueda de Biblioteca.
- `LibrarySettingsDialog`: Filtro, Orden y Visualización.
- Gestión de categorías y selección de categorías.
- Ficha de obra desde Biblioteca.
- Configuración y flujo de migración.
- Lector y continuación exacta.

### Barras y acciones portadas

- `LibraryToolbar`: título, Buscar, Filtrar y Más.
- Overflow de toolbar: actualizar categoría, actualizar biblioteca y obra aleatoria.
- Selection AppBar: cerrar, contador, seleccionar todo e invertir.
- Bottom action menu: categorías, leído, no leído, descarga y Más.
- `itemOverflow` de selección para Migrar y Borrar.
- Cuadrícula compacta, cómoda, solo portada y lista; columnas inmediatas.
- Badges de no leídos, descargas, idioma y local.
- Continuar solo cuando existen capítulos pendientes.
- Pulsación prolongada y selección por rango.
- Swipe horizontal entre categorías y pull-to-refresh.

### Pendiente o defectuoso

- **Residuo de `all`:** el DOM ya no crea `data-lib-tab="all"`, pero el gesto horizontal todavía construye `['all', ...categorías]`. Debe eliminarse para evitar un paso fantasma y estados transitorios.
- **Descarga real:** las acciones cambian contadores/estado, no garantizan páginas disponibles offline.
- **Swipe de capítulos configurable:** Mihon permite ToggleRead, ToggleBookmark, Download o Disabled por cada lado; Hanami no lo porta en la lista de capítulos.
- **Preferencias de comportamiento:** ocultar capítulos faltantes, marcar duplicados leídos y acciones de swipe no están conectadas.
- **Actualización en background:** la actualización global solo funciona con la aplicación abierta.
- **Estados de error por obra:** faltan resultados detallados por fuente, retry individual y resumen final.
- **Orden aleatorio:** se recalcula durante cada comparación; debe usar una semilla/lista barajada estable.
- **Tablet:** falta grid adaptativo + ficha en panel secundario.
- **Caché de portadas:** no existe una política offline/evicción específica.

---

## 4. Actualizaciones

### Portado

- Lista cronológica agrupada por fecha.
- Toolbar: Filtrar, Próximas y Actualizar.
- `UpdatesFilterDialog` con estados tri-state y categorías.
- Selección mediante pulsación prolongada, AppBar contextual y bottom actions.
- Abrir detalle desde portada y lector desde fila.
- Sub-screen **Próximas**.
- Sub-screen **Descargas** al reseleccionar Actualizar.
- `itemOverflow` por estado de descarga y overflow de cola.
- Confirmación de eliminar descargas.
- Pull-to-refresh, spinner, snackbar, fast-scroll y `prefers-reduced-motion`.

### Pendiente

- **Actualización real programada:** no hay Periodic Background Sync ni alternativa por push/servidor.
- **Badge de nuevas actualizaciones:** falta en NavigationBar y debe derivarse de capítulos realmente nuevos.
- **Detección de novedades:** depende de capítulos ya cargados/refresh foreground; falta comparación transaccional y deduplicación.
- **Notificaciones web:** permiso, agrupación, acciones, deep link a capítulo y ocultación de contenido.
- **Descargas:** el estado pasa a completo tras ~350 ms sin almacenar páginas; es un simulador.
- **Cola persistente:** no hay reanudación real tras cerrar/reabrir, concurrencia por fuente, retry/backoff ni errores HTTP por página.
- **Próximas:** la predicción existe como metadato local; falta cálculo fiable basado en historial de releases y actualización background.
- **Scanlators excluidos:** la opción visual no tiene datos/efecto completo con Olympus.

---

## 5. Historial

### Portado

- Historial agrupado por fecha, búsqueda y estados vacíos.
- Toolbar normal y SearchToolbar.
- Abrir ficha desde portada y reanudar desde fila.
- Añadir obra no favorita a Biblioteca.
- Detección de duplicados, categorías y migración.
- `HistoryDeleteDialog` y `HistoryDeleteAllDialog`.
- Reseleccionar Historial reanuda la última lectura.
- Historial de obras leídas desde Explorar mediante registros `favorite:false`.
- Modo incógnito bloquea entradas y timestamps nuevos sin perder progreso de reanudación.
- Sin `itemOverflow`, correctamente: Mihon tampoco lo usa aquí.

### Pendiente

- Separar a medio plazo el historial en un store propio en vez de mezclar registros no favoritos con `hanami-library`; el parche actual es compatible pero aumenta acoplamiento.
- Historial por capítulo/evento, no solo última posición por obra, si se quiere igualar la base de datos de Mihon con mayor fidelidad.
- Acción “eliminar esta entrada” frente a “eliminar todo de esta obra”: actualmente convergen en gran parte del modelo.
- Restauración y merge de historial durante backups con resolución de conflictos.

---

## 6. Explorar

### 6.1 Fuentes

**Portado**

- SourcesScreen agrupada por recientes, ancladas, idioma y otros.
- SourcesFilterScreen como subpantalla.
- BrowseSourceScreen con Popular, Recientes y búsqueda.
- Modos cómoda, compacta y lista.
- GlobalSearchScreen con progreso por fuente y resultados agrupados.
- MissingSourceScreen y SourcePreferencesScreen vacía cuando no hay preferencias.
- Overflow de modo de visualización y overflow de fuente.
- SourceOptionsDialog por pulsación prolongada.

**Pendiente**

- **Paginación/infinite scroll:** las llamadas de Browse consumen esencialmente una página; falta `page=N`, loading footer, retry y append deduplicado.
- **Filtros estructurados por fuente:** géneros, estado, orden, tipo y filtros encadenados. Olympus usa solo búsqueda textual.
- **Estado de consulta por tab:** preservar query, página, scroll y filtro al volver desde detalle.
- **Cancelación de requests:** usar `AbortController` al cambiar búsqueda/fuente.
- **Concurrencia y rate limiting:** cola por host, backoff y caché de respuestas.
- **Abrir web:** actualmente depende de URL genérica/adaptador; falta URL exacta de obra/capítulo y manejo de popup bloqueado.
- **Long press de resultado:** verificar consistencia entre añadir/quitar Biblioteca y abrir detalle; algunos paths usan acciones diferentes.

### 6.2 Extensiones

**Portado/adaptado**

- ExtensionsScreen, búsqueda, grupos, filtros, detalles y preferencias por fuente.
- Repositorios GitHub con contrato `hanami-extension-store/v1`.
- Descarga a IndexedDB y ejecución en Web Worker.
- Lista de hosts declarados, bloqueo de imports remotos y runtime `vercel-js`.
- Habilitar/deshabilitar fuentes, actualizar, desinstalar, cancelar y limpiar caché.
- Modo incógnito por extensión.
- ExtensionStoresScreen con añadir, copiar, abrir, refrescar y eliminar.
- Rechazo de APK/Mihon/packageName.

**Pendiente**

- **Preferencias dinámicas de extensión:** schema de preferencias, tipos, validación, persistencia y envío al Worker.
- **Actualizaciones robustas:** comparación semver, changelog, rollback, integridad/hash y migración de datos por versión.
- **Firma/confianza:** firma del índice o checksum del bundle; actualmente confiar en GitHub/HTTPS no prueba autoría.
- **Ciclo de Worker:** timeouts, cancelación, límites de memoria, worker crash/restart y telemetría local de errores.
- **Cookies/sesiones por extensión:** aislamiento real por adaptador y limpieza selectiva.
- **Avisos de contenido:** preferencias globales y aplicación a instaladas están incompletas.
- **Pull-to-refresh real y estados por repositorio:** progreso, fallo parcial y último refresh.
- **Permisos de red:** UI para revisar cambios de hosts antes de actualizar una extensión ya confiada.

### 6.3 Migración

**Portado**

- MigrateSourceScreen y MigrateMangaScreen.
- MigrationConfigScreen con selección, habilitadas/ancladas y reorder.
- MigrationConfigSheet con flags aplicables.
- MigrateSearchScreen, query editable, progreso y grupos horizontales.
- MigrateMangaDialog con Mostrar obra, Copiar y Migrar.
- Migración a la misma fuente.
- Cierre final hacia detalle de Biblioteca y limpieza del stack.

**Pendiente crítico**

- **MigrationListScreen completo:** progreso `terminadas/total`, resultado por obra y estado searching/not-found/success.
- **Overflow por obra:** Buscar manualmente, Saltar, Migrar ahora y Copiar ahora.
- **Búsqueda profunda y priorización por capítulos:** los switches existen parcialmente pero no un motor equivalente a `SmartSourceSearchEngine`.
- **Ocultar sin coincidencia/sin updates:** comportamiento completo en la lista.
- **Confirmación masiva:** Copy/Migrate con total y omitidas.
- **MigrationProgressDialog:** barra animada, progreso real y cancelación.
- **MigrationExitDialog:** Back durante el lote debe confirmar detener búsqueda/migración.
- **Cancelación:** `AbortController`, cancelación por obra y liberación de tareas.
- **Concurrencia limitada:** Mihon usa semáforo por fuentes; Hanami procesa varios paths de forma secuencial o sin política explícita.
- **Retry y transacción:** rollback si falla la escritura intermedia; informe final por obra.
- **Verificación de datos:** pruebas funcionales de categorías, notas, tracking, capítulos, historial, favoritos y descargas, no solo presencia de flags.

---

## 7. Ficha de obra y capítulos

### Portado

- Toolbar normal y toolbar de selección.
- Cabecera con portada, título, autores, estado, fuente, descripción y géneros.
- Acciones Biblioteca, actualización inteligente, seguimiento y WebView.
- Overflow: actualizar, categorías, migrar, compartir, notas y diagnóstico.
- Filtro/orden/visualización de capítulos.
- Indicadores leído, bookmark, progreso y descarga.
- Pulsación prolongada, selección, seleccionar todo e invertir.
- Bottom action menu: bookmark, leído/no leído, anteriores leídos, descargar y eliminar.
- FAB Empezar/Reanudar.
- Notas y tracking.

### Pendiente

- **MangaCoverDialog:** vista de portada completa con zoom, cerrar, compartir, guardar y overflow Editar/Eliminar.
- **Swipe de capítulo:** acciones configurables a izquierda/derecha y feedback visual por umbral.
- **ScanlatorFilterDialog real:** ahora se usa `prompt()` y ocultación DOM; debe ser un diálogo multi-select persistente.
- **Set as default** de ChapterSettingsDialog y aplicación opcional a toda la Biblioteca.
- **MissingChapterCount** y ocultación configurable con datos fiables.
- **DownloadDropdownMenu real:** selección de próximos N/unread con estimación y estado de almacenamiento.
- **WebView:** hoy suele ser iframe/modal o ventana; falta sub-screen navegable con toolbar, progreso, reload, abrir externo y cookies aisladas.
- **Compartir fallback:** `navigator.share` no siempre existe; falta copiar enlace y feedback.
- **Errores parciales:** detalles cargados pero capítulos fallidos, retry independiente y skeletons.
- **Markdown de notas/descripción:** Mihon tiene `MarkdownRender`; Hanami usa principalmente texto plano.
- **Adaptive/two-pane:** falta ficha y capítulos distribuidos como tablet.

---

## 8. Lector

### Portado

- Webtoon/continuo y modos paginados LTR/RTL/vertical.
- Flujo continuo bidireccional, carga y descarte de capítulos lejanos.
- Slider por capítulo y restauración exacta.
- Top bar, bottom navigator, título → detalle, ajustes y acciones de página.
- Tap zones, inversión, doble toque, pinch zoom y long tap.
- Fullscreen, wake lock, número de página y transiciones.
- Escala, crop, dual page, padding/gap.
- Brillo, escala de grises, invertir y tinte.
- Marcador y navegación de capítulo.

### Pendiente

- **E‑Ink:** flash de página, duración, intervalo y color de flash.
- **Volume keys:** avanzar/retroceder e inversión cuando el navegador permita eventos de teclado equivalentes.
- **ReaderPageActionsDialog completo:** compartir imagen, copiar, guardar, usar como portada y abrir original con manejo de permisos/descarga.
- **Guardar imagen/CBZ:** descarga real mediante File System Access o Blob, nombres seguros y progreso.
- **Split tall images** y preprocesado configurable.
- **Rotate to fit** y dual-page invert completos por orientación.
- **Navigate pan** cuando hay zoom.
- **Webtoon hide threshold**, side padding y “disable zoom out” conectados a comportamiento.
- **Skipping:** saltar capítulos leídos, filtrados y duplicados; transición siempre visible opcional.
- **Capítulos faltantes/errores:** transition views, retry individual y placeholders de páginas fallidas.
- **Configuración global vs por obra:** reset de viewer flags y herencia de defaults.
- **Read duration:** `hanami-read-duration` se muestra en Estadísticas pero no existe escritor; debe medirse con visibilidad/foco y modo incógnito.
- **Memoria:** presupuesto explícito de imágenes/Blob URLs, revoke y límites por dispositivo.
- **Accesibilidad:** teclado, screen reader, reduced motion, alto contraste y foco de barras.

---

## 9. MoreTab

### Portado

- MoreScreen con Solo descargados, Modo incógnito e Instalar Hanami.
- Sub-screens: Descargas, Categorías, Estadísticas, Datos y almacenamiento, Ajustes, Apoyar, Acerca y Ayuda.
- Reselección → Ajustes.
- Categorías reordenables y diálogos CRUD.
- Estadísticas básicas.
- PWA install flow Android/desktop/iOS.

### Pendiente principal: Ajustes efectivos

La pantalla crea claves como `hanami-reduce-motion`, `hanami-high-contrast`, `hanami-reader-keep-awake`, `hanami-download-wifi`, `hanami-tracking-auto` y otras. En v93 esas claves aparecen solo en `more-tab.js`; no son consumidas por Reader, Downloads, Tracking, Browse o CSS. Por tanto, la mayor parte de Ajustes es todavía una **maqueta persistente**, no un port funcional.

| SettingsScreen de Mihon | Hanami v93 | Trabajo necesario |
|---|---|---|
| Apariencia | 🔴/🟡 | Tema, pure black, idioma, fecha, relativo, imágenes, tablet mode; aplicar reduce motion/high contrast. |
| Biblioteca | 🟡 | Categorías y smart updates existen; faltan intervalos/restricciones completos, refresh metadata, badge y swipes. |
| Lector | 🟡 | Reader tiene muchas opciones internas; falta sincronizarlas con Settings y cubrir E‑Ink/navegación/actions. |
| Descargas | 🔴 | Solo toggles sin motor; faltan Wi‑Fi, concurrencia, CBZ, split tall, borrado y download ahead. |
| Seguimiento | 🔴/🟡 | UI local; faltan OAuth, credenciales seguras y sincronización remota real. |
| Explorar | 🟡 | Repositorios existen; faltan content warnings globales y preferencias reales. |
| Datos y almacenamiento | 🟢/🟡 | Backup/restore/export y uso presentes; falta política completa de versión/conflictos e integración con descargas reales. |
| Seguridad | 🔴/⚫ | Biometrics Android no aplica; sí faltan WebAuthn/PIN opcional, privacidad, bloqueo, contenido de notificación y permisos. |
| Avanzado | 🔴/🟡 | Limpiar caché parcial; faltan debug info, logs, onboarding, clear database, cookies, UA, red y reset flags. |
| Acerca de/licencias | 🟡 | Acerca de existe; faltan licencias open source, changelog y comprobación de actualización web. |

### Otras brechas de More

- DownloadQueue de More usa `downloadCount` por obra, mientras Updates usa `_chapterMeta`; hay dos modelos divergentes.
- Estadísticas: duración de lectura no se escribe; locales y completadas dependen de metadatos no siempre normalizados.
- SupportUs es contenido Hanami deliberado, no paridad con Patreon/OpenCollective/Discord de Mihon.
- Falta NewUpdateScreen/changelog después de desplegar una versión.
- Falta OnboardingScreen para primera ejecución y permisos web.

---

## 10. Descargas, offline y almacenamiento

### Estado actual

- Service Worker precachea el shell y algunos assets.
- Las rutas `/api/` se excluyen expresamente del fetch handler del SW.
- Updates simula una descarga cambiando estado y completándola tras un temporizador.
- More muestra una cola derivada de contadores.
- Data Storage busca entradas de páginas en CacheStorage, pero el SW no crea de forma sistemática ese caché.

### Necesario para paridad web

1. Store IndexedDB único para trabajos, capítulos, páginas, blobs y tamaño.
2. Cola persistente con estados queued/downloading/paused/error/downloaded.
3. Descarga real de cada página mediante API/proxy, validación MIME/tamaño y checksum opcional.
4. Concurrencia configurable por fuente y por página.
5. Retry exponencial, cancelación con `AbortController` y recuperación tras recarga.
6. Lectura offline desde IndexedDB/CacheStorage.
7. Evicción, cuotas con `navigator.storage.estimate()`, persistencia con `navigator.storage.persist()` y errores de espacio.
8. Borrado por capítulo/obra/todo y reconciliación de metadatos.
9. Background Sync cuando esté disponible; fallback foreground explícito.
10. Exportar capítulos como CBZ/ZIP solo si se decide como función web compatible.

---

## 11. Seguimiento

### Portado

- Selector de servicios, cards, búsqueda, estado, capítulo, score, fechas, privacidad y eliminación.
- Búsqueda pública AniList a través de API.
- Long press para copiar título/enlace.
- Actualización local al leer capítulos.

### Pendiente

- OAuth/PKCE real para AniList, MAL, Kitsu, MangaUpdates, Shikimori, Bangumi, MangaBaka y Hikka.
- Tokens en almacenamiento seguro, refresh, expiración, logout remoto y revocación.
- Search/update/delete remotos por proveedor.
- Manejo de escalas de puntuación y estados propios de cada servicio.
- Conflictos, rate limits, retry, offline queue y timestamps de sincronización.
- Servicios mejorados y detección por fuente.
- Las “sesiones conectadas” actuales son nombre/URL local; no prueban autenticación.

---

## 12. Inventario de `itemOverflow`

### Portados

- Biblioteca: overflow de toolbar y overflow contextual Migrar/Borrar.
- Ficha: overflow Actualizar/Categorías/Migrar/Compartir/Notas/Diagnóstico.
- Descargas de ficha: próximos N y no leídos.
- Actualizaciones: overflow de estado de descarga y de cola.
- BrowseSource: display mode y opciones de fuente.
- Extensiones: toolbar, detalles y repositorios.
- MigrationConfig: habilitadas/ancladas.
- More/Descargas: ordenar e invertir/vaciar.
- Tracking card: abrir/copiar/privacidad/eliminar.

### Pendientes o incompletos

- MangaCoverDialog: Editar/Eliminar portada.
- MigrationList por obra: búsqueda manual, saltar, migrar/copiar ahora.
- ReaderPageActions completo.
- Overflow adaptativo común: varios menús usan posiciones/fijos diferentes; unificar collision detection, safe areas, focus, Escape y rol menu.
- Fallback cuando una acción no cabe en AppBar según ancho; actualmente la distribución suele ser fija.

---

## 13. Inventario de diálogos y sheets

### Portados o equivalentes

- LibrarySettingsDialog.
- Cambiar/crear/renombrar/eliminar categorías.
- Eliminar obras/descargas seleccionadas.
- UpdatesFilterDialog y delete confirmations.
- History delete/delete-all/duplicate/category/migration.
- Source options/filter/content warning básico.
- Extension trust/uninstall/repository create-delete.
- MigrationConfigSheet y MigrateMangaDialog.
- Chapter settings/filter/sort/display básico.
- Notas y Tracking dialogs.
- Reader settings y acciones básicas.
- Backup/restore/export/clear cache.
- PWA install iOS/fallback/already-installed.

### Pendientes

- MangaCoverDialog completo.
- ScanlatorFilterDialog real.
- Set chapter settings as default.
- Migration batch confirm/progress/exit.
- Restore backup: informe detallado de validación, errores parciales y conflicto.
- Tracker login/OAuth/reauth real.
- ClearDatabaseScreen con selección segura de tablas web.
- Onboarding permission dialogs.
- Crash report/debug info/worker info.
- New update/changelog.
- Lock/security dialog web si se adopta WebAuthn/PIN.

---

## 14. Inventario de barras

### Portadas

- Main NavigationBar.
- Toolbars de las cinco tabs.
- SearchToolbar de Biblioteca, Historial, Fuentes, GlobalSearch y Extensiones.
- Selection AppBars de Biblioteca, Actualizaciones y capítulos.
- Bottom action bars de Biblioteca/capítulos.
- BrowseSourceToolbar.
- MigrationConfig/MigrateSearch bars.
- Child app bars de Próximas, Descargas, categorías, stats, settings, data, soporte, about, help e instalación.
- Reader top/bottom bars y chapter navigator.

### Pendientes

- NavigationRail y two-pane tablet.
- Badges de NavigationBar.
- Collapsing/pinned app bars con scroll behavior uniforme.
- Manga toolbar con alpha/background ligado al scroll exactamente como Mihon.
- Cover dialog actions pill.
- WebView toolbar completa.
- Global snackbar/progress host.
- Safe-area padding común en todas las barras inferiores.

---

## 15. Animaciones y efectos

### Portados

- Animación de items de NavigationBar y ripple.
- Fade/slide de varias subpantallas.
- FABs animados.
- Spinners de refresh.
- Estado de selección, badges, snackbars/toasts y barras de progreso.
- Desplazamiento suave, scroll snap y aparición de overflow.
- Reduced motion en varios módulos.
- Lector: transiciones, zoom, filtros de imagen y ocultación de barras.

### Pendientes

- Material fade-through completo entre tabs.
- Animaciones de AnimatedVector originales recreadas de forma consistente, sin copiar identidad visual.
- Shared element/cover transitions donde sean útiles en web.
- Skeletons/shimmer para details, capítulos, browse y global search.
- Animación de progreso real de migración y descargas.
- Haptics centralizados y desactivables.
- `prefers-reduced-motion` global: hoy algunos módulos lo respetan y otros no.
- High contrast real: la preferencia existe pero no aplica estilos.
- Estados press/hover/focus uniformes y sin layout shift.

---

## 16. Gestos

### Portados

- Long press para selección en Biblioteca, Actualizaciones y capítulos.
- Long press en fuentes/resultados/tracking según contexto.
- Swipe horizontal de tabs Explorar y categorías de Biblioteca.
- Pull-to-refresh en Biblioteca/Actualizaciones/Extensiones.
- Drag-and-drop y arrastre táctil en Categorías y cola de More.
- Reader: tap zones, double tap, pinch, long tap, drag/scroll y slider.
- Browser Back/Escape/gesto del navegador mediante historial central.

### Pendientes

- Swipe start/end configurable en capítulos.
- Gesto de back predictivo/edge con feedback dentro de la PWA, sin duplicar browser Back.
- Reorder con auto-scroll y accesibilidad de teclado.
- Volume-key/keyboard navigation del lector.
- Long press de portada con acciones equivalentes.
- Unificar umbrales, cancelación al mover, vibración y supresión del click sintético.
- Corregir el paso fantasma `all` del swipe de Biblioteca.

---

## 17. Pantallas de sistema aún no portadas

### Aplicables a web

- Onboarding: idioma/tema, almacenamiento persistente, PWA, notificaciones y guía de extensiones.
- NewUpdateScreen/changelog después de un deploy.
- CrashScreen con exportación de diagnóstico y recuperación segura.
- DebugInfoScreen: versión, navegador, SW, IndexedDB, cuota, adaptadores y logs.
- OpenSourceLicensesScreen.
- DeepLinkScreen/router web.
- WebViewScreen navegable.
- ClearDatabaseScreen selectiva.
- AppLanguageScreen/i18n real.
- WorkerInfoScreen adaptado a Web Workers y SW.
- BackupSchemaScreen para diagnóstico de copias.

### No aplicables literalmente; requieren equivalente o exclusión documentada

- APK/PackageInstaller y extensiones Mihon binarias.
- JVM, Kotlin runtime, Activities/Intents Android.
- WorkManager literal: sustituir por Background Sync/Periodic Sync/push/foreground.
- Notificaciones Android: sustituir por Notifications API + SW.
- Biometrics Android: opcionalmente WebAuthn/PIN; no copiar `UnlockActivity`.
- Battery optimization y “Don’t kill my app”: sustituir por explicación de limitaciones web.
- Android WebView data/cookies: usar storage/cookies del origen y Worker/proxy.
- Firebase Crashlytics/Analytics: no incluir por defecto; cualquier telemetría debe ser opt-in y coherente con Hanami.
- Directorios Android/SAF: usar File System Access API con fallback de descarga/subida.
- WebGPU viewer Android específico: solo portar si aporta valor; el lector DOM actual es la base web.

---

## 18. Riesgos técnicos detectados

1. **Pruebas con falsa confianza:** muchas regresiones comprueban presencia de strings, no comportamiento. Los E2E móviles existen, pero no forman parte de `npm test` y el proyecto no declara Playwright.
2. **Dos modelos de descarga:** `downloadCount`, `hanami-dl-*`, `_chapterMeta.downloadState` y `hanami-chapter-downloads` pueden divergir.
3. **Ajustes sin consumidores:** múltiples toggles solo persisten valores.
4. **Historial dentro de Biblioteca:** funcional en v93, pero requiere disciplina para excluir `favorite:false` de todos los queries.
5. **Service Worker network-first:** no versiona API/data ni garantiza offline de capítulos.
6. **LocalStorage monolítico:** riesgo de carreras entre módulos, límites de cuota y escrituras perdidas.
7. **Ausencia de schema migrations:** hay reparaciones puntuales, no un sistema versionado de migración de datos.
8. **Overlays heterogéneos:** menús fijos, diálogos y `prompt()` no comparten focus/placement/accessibility.
9. **Residuo de prueba:** `public/__e2e_v89.html` está dentro del artefacto y debería eliminarse del despliegue.
10. **Trackers simulados:** la UI puede aparentar una conexión que en realidad solo guarda un nombre local.

---

## 19. Orden recomendado para completar el port

### Fase P0 — Integridad y contratos

1. Store transaccional IndexedDB con schema/version migrations.
2. Modelo único para favoritos, historial, capítulos, descargas y progreso.
3. Eliminar `all` interno, archivo E2E público y duplicados de estado.
4. Convertir E2E críticos en suite reproducible declarando Playwright o CDP harness propio.
5. Overlay manager único y auditoría de Back/foco.

### Fase P1 — Descargas/offline

1. Motor de descarga real.
2. Cola persistente y reanudable.
3. Lector offline.
4. Quota/evicción/borrado.
5. Unificar More y Updates sobre la misma cola.

### Fase P2 — Ajustes efectivos

1. Crear un `HanamiPreferences` tipado.
2. Conectar cada setting a su consumidor.
3. Completar Reader, Library, Downloads, Browse y Tracking settings.
4. I18n, appearance, reduced motion y high contrast reales.

### Fase P3 — Fuentes y migración

1. Paginación y filtros de adaptador.
2. Abort/retry/rate limit/cache.
3. MigrationList con progreso, cancelación y acciones por obra.
4. Pruebas transaccionales de todos los metadatos migrados.

### Fase P4 — Lector y detalle

1. Swipe de capítulos.
2. Cover dialog y page actions.
3. E‑Ink/keyboard/skipping/transitions.
4. Gestión de memoria y errores por página.
5. WebView sub-screen.

### Fase P5 — Tracking y background

1. OAuth/PKCE y APIs reales.
2. Sync queue, conflictos y rate limits.
3. Background update/web push/notificaciones.
4. Upcoming y badges derivados de datos reales.

### Fase P6 — Sistema y calidad

1. Onboarding, changelog, crash/debug, deep links y licencias.
2. NavigationRail/two-pane.
3. WCAG, teclado y screen reader.
4. Visual regression a 390 px, tablet y desktop.
5. Performance budgets, storage stress tests y pruebas offline.

---

## 20. Criterio de “port total” recomendado

No considerar completada una parte porque su pantalla exista. Cada feature debe cumplir:

- UI y estados de Mihon adaptados a la identidad Hanami.
- Acción conectada a datos reales, no solo a `localStorage` decorativo.
- Persistencia y migración de schema.
- Loading, vacío, éxito, error, cancelación y retry.
- Back/Escape/toque exterior consumen una sola capa.
- Móvil 390 px, tablet y desktop.
- Teclado, foco, ARIA y reduced motion.
- Regresión unitaria de lógica + E2E funcional, no solo búsqueda de strings.
- Funcionamiento offline cuando la función se presenta como descargada.
- Documentación explícita cuando una capacidad Android se sustituye o se excluye.

Con este criterio, Hanami tiene una base avanzada y coherente, pero aún necesita principalmente **motor de datos/descargas**, **ajustes funcionales**, **migración masiva**, **background web** y **paridad profunda del lector/tracking** antes de poder llamarse port total.
