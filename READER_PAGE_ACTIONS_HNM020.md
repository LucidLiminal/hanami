# HNM-020-main · Visibilidad y gestos de las acciones del lector

Proyecto: **Hanami 5.23.0 (v149)**. Esta entrega conserva las correcciones
anteriores y no modifica el número de versión ni requiere migraciones SQL.
El código está validado localmente; el despliegue no forma parte de esta entrega.

## Errores reproducidos

1. `readerBottom` conservaba la transformación y opacidad de `bars-off`, por lo
   que las acciones podían abrirse fuera de pantalla e invisibles.
2. El clic exterior se escuchaba en fase de burbujeo, después de que el visor
   programara la navegación o el cambio de visibilidad. Sus manejadores de
   puntero también seguían activos durante las acciones.
3. Las etiquetas dependían de `:active`, no del gesto prolongado compartido por
   `selection-bottombar`.

La prueba inicial de las tres regresiones falló sobre el código anterior.

## Corrección

- El modo `reader-page-actions-active` mantiene visible el pie del lector sin
  modificar el estado anterior de sus barras. Al cerrar se recupera ese estado.
- Las acciones siguen ocupando la navegación existente: seis botones, sin
  diálogo ni overlay, y con `reader-navigator` oculto temporalmente.
- La apertura cancela los toques pendientes, el temporizador de pulsación
  prolongada, los punteros y la información de pinza del lector.
- Los manejadores de toque, deslizamiento, pinza, menú contextual y atajos de
  navegación no actúan mientras está abierta la barra. El desplazamiento nativo
  del visor queda suspendido hasta cerrarla.
- El clic exterior se consume en captura: solo cierra la barra y nunca ejecuta
  además la navegación, el cambio de barras o el control subyacente.
- Los botones del lector utilizan el reconocedor compartido de la selección:
  **500 ms** para mostrar `show-action-label`, **2400 ms** de duración y
  cancelación del reconocimiento al moverse más de **12 px**, cancelar el
  puntero, usar varios punteros o salir de la ventana.
- Soltar una pulsación prolongada no ejecuta su acción. El siguiente toque
  corto y la activación con teclado siguen disponibles; los botones
  deshabilitados y las barras retiradas del DOM no reciben etiquetas tardías.
- Escape, Atrás/Adelante, la confirmación inline de portada y las transiciones
  a comentario o música conservan el lector y su posición.

## Archivos

Código:

- `public/reader.js`
- `public/reader-page-actions.js`
- `public/reader-actions.css`
- `public/selection-toolbar.js`

Regresión y documentación:

- `tests/reader-page-actions-hnm020.test.mjs`
- `tests/reader-page-actions-hnm020.e2e.mjs`
- `tests/reader-page-actions-v136.test.mjs`
- `tests/reader-page-actions-v136.e2e.mjs`
- `package.json`
- `READER_PAGE_ACTIONS_V136.md`
- Este documento.

## Validación

- `npm test`: **122 comprobaciones PASS**; incluye las pruebas deterministas
  del gesto compartido y las regresiones existentes del proyecto.
- `npm run test:e2e:reader-actions-hnm020`: **18 escenarios PASS** en Chromium
  headless, con entrada táctil real mediante CDP, ratón y teclado. El test levanta
  su propio servidor en un puerto libre y no necesita credenciales ni backend.
- `npm run test:e2e:reader-actions`: **PASS** con el servidor local del proyecto
  y fixtures de los servicios externos. Comprueba las seis acciones, PNG del
  portapapeles, compartir/descargar, portada persistente con confirmación,
  coordenadas del comentario, selector musical y conservación de la posición.
- Comprobación de sintaxis de los tres módulos JavaScript modificados: correcta.

La prueba específica cubre barras previamente ocultas, toques en las cinco
zonas del visor, deslizamientos/pinzas en LTR/RTL/vertical, bloqueo y recuperación
del desplazamiento en webtoon/continuo, toques pendientes, controles exteriores,
foco de teclado, Atrás/Adelante, cancelaciones y compatibilidad de la barra de
selección. No sustituye la validación en dispositivos físicos o producción.

Para repetir la prueba integrada v136, iniciar `npm run dev` y ejecutar
`npm run test:e2e:reader-actions` en otra terminal. El puerto predeterminado es
4173; para otro servidor usar `HANAMI_TEST_URL`.
