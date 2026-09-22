# Estados de error por obra — v101

## Resultado

Las actualizaciones de Biblioteca ya no silencian los errores ni los reducen a un contador global. Cada obra produce un resultado persistente con fuente, tipo, mensaje y acciones de recuperación.

El informe se comparte entre actualización foreground, Service Worker, Más y Actualizaciones.

## Referencias de Mihon

- `LibraryUpdateJob.kt`: `failedUpdates`, `skippedUpdates`, aislamiento de fallos y concurrencia.
- `LibraryUpdateNotifier.kt`: notificación de errores y progreso final.
- `writeErrorFile()`: agrupación del informe por mensaje, fuente y obra.
- `UpdatesViewModel.kt`: protección contra ejecuciones duplicadas.
- `NotificationReceiver.kt`: cancelar trabajo y abrir el destino correspondiente.
- `action_retry` y `library_errors_help`: acción de reintento y ayuda diagnóstica.

Mihon genera un archivo de errores desde una notificación. Hanami conserva esa información en IndexedDB/localStorage y añade una pantalla interactiva adecuada para web.

## Sub-screens

- Actualizaciones.
- Actualizaciones → Errores de actualización.
- Más → Actualización en segundo plano.
- Biblioteca durante actualización de categoría.
- Biblioteca durante actualización global.
- Informe vacío después de limpiar o resolver errores.
- Ficha de la obra afectada, accesible desde el informe.

`updates-errors` se registra en `HanamiScreens`. Atrás vuelve a Actualizaciones con una única transición.

## Bars

### Toolbar de Actualizaciones

- Aparece una acción `!` con badge cuando existen errores pendientes.
- Mantiene Filtrar, Próximas y Actualizar.

### App bar de Errores

- Atrás.
- `itemOverflow` Más.

### App bar de background

- Actualizar cuando está inactiva.
- Cancelar cuando existe una ejecución.
- Más opciones con acciones sobre el informe.

### Navbar

- El badge de capítulos nuevos continúa separado del badge de errores.
- No se altera la navegación principal ni la selección contextual.

## `itemOverflow`

### Errores de Actualizaciones

- Reintentar todo.
- Copiar informe.
- Limpiar errores.

### Background

- Reintentar errores.
- Copiar informe.
- Sincronizar programación.
- Borrar registro.

Los menús usan el sistema de overlays existente y se cierran mediante exterior, Escape o Back.

## Diálogos

No se introduce una confirmación innecesaria para reintentar. Las acciones no destructivas se ejecutan directamente.

Se mantienen:

- Diálogo de categorías de actualización.
- Restricciones inteligentes.
- Permiso explícito de notificaciones.
- Diálogos existentes de filtros y descargas.

Limpiar elimina únicamente el informe, nunca Biblioteca, capítulos, progreso o descargas.

## Modelo de resultado

Cada fallo contiene:

- `id` de obra.
- Título visible.
- `sourceId`.
- Mensaje original.
- Tipo normalizado.

Tipos:

- `network`: conexión, fetch u offline.
- `rate-limit`: HTTP 429 o límite de solicitudes.
- `anti-bot`: CAPTCHA, Cloudflare o protección equivalente.
- `source`: fuente ausente o HTTP 404 relacionado.
- `server`: HTTP 5xx.
- `unknown`: error no clasificable sin inventar una causa.

Las omisiones se guardan por separado con un motivo: categoría, preferencias inteligentes, restricciones del dispositivo o runtime foreground requerido.

## Acciones

### Actualización normal

- Cada obra se procesa de forma aislada.
- Un error no cancela las demás.
- Se conservan éxitos parciales.
- Se calculan capítulos nuevos.
- Se genera resumen final con procesadas, correctas, errores, omitidas y capítulos nuevos.
- El toast ya no afirma éxito total cuando hubo fallos.

### Reintento individual

- Reenvía únicamente el ID de la obra fallida.
- Conserva la Biblioteca más reciente mediante un nuevo snapshot antes de reintentar.
- Reutiliza Service Worker, restricciones, metadata y detección de capítulos.

### Reintento masivo

- Construye una cola solo con los IDs fallidos.
- No vuelve a consultar obras que ya terminaron correctamente.
- Sustituye el informe anterior por el resultado del reintento.

### Cancelar

- El worker deja de tomar nuevas obras de la cola.
- Las peticiones ya iniciadas pueden finalizar.
- El resultado queda como `cancelled` y no reemplaza la Biblioteca con un snapshot parcial.

### Copiar informe

Genera JSON con timestamp, estado, origen de ejecución, progreso, capítulos nuevos, fallos y omisiones. Es adecuado para diagnóstico sin incluir páginas ni credenciales.

### Abrir obra

El título del error abre la ficha correspondiente desde Biblioteca usando su ID estable.

## Agrupación y resumen

- Primer nivel: fuente.
- Segundo nivel: obras fallidas.
- Cada grupo muestra número de errores y omisiones.
- Cada fila muestra título, clase y mensaje.
- El resumen superior muestra total procesado, errores, omitidas y capítulos nuevos.
- Estado vacío explícito cuando no quedan errores.

## Background y persistencia

- `background-updates.js` mantiene el informe en `hanami-background-status`.
- El Service Worker escribe resultados en `hanami-background-v1`.
- Al reabrir la PWA se aplica el último resultado no consumido.
- `postMessage` actualiza la pantalla en vivo.
- Los informes foreground usan el mismo contrato mediante `recordForeground()`.
- Los fallos del worker incluyen la misma clasificación que los foreground.

## Animaciones y efectos

- Badge rojo en la toolbar al existir fallos.
- Bordes y mensajes rojos para error; verde ácido para acciones de recuperación.
- Spinner durante actualización y estado de cancelación.
- La pantalla conserva la animación lateral de las subpantallas.
- El informe se refresca al finalizar un reintento.
- `prefers-reduced-motion` mantiene la reducción de movimiento existente.

## Gestos y navegación

- Tap en `!` abre el informe.
- Tap en una obra abre su ficha.
- Tap en ↻ reintenta esa obra.
- Tap en Reintentar todos reconstruye la cola fallida.
- Exterior, Escape y Back cierran el overflow.
- Back desde el informe ejecuta exactamente una transición.
- Los reintentos no crean pantallas adicionales ni alteran el historial centralizado.

## Archivos modificados

- `public/library.js`
- `public/background-updates.js`
- `public/sw.js`
- `public/updates-tab.js`
- `public/more-tab.js`
- `public/updates-tab.css`
- `package.json`
- `tests/per-manga-update-errors-v101.test.mjs`
- `tests/per-manga-update-errors-v101.mobile.e2e.mjs`
- Ajuste compatible de `tests/navigation.test.mjs`.

## Validación

- `node --check` en todos los JavaScript modificados.
- Regresión específica v101 superada.
- Suite completa `npm test` superada.
- E2E móvil Chromium/Playwright 390 × 844: fallo HTTP 503 clasificado, agrupación por fuente, resumen, reintento individual, reintento masivo y limpieza.
- ZIP final verificado mediante `unzip -t`.
