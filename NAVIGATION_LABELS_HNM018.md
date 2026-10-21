# HNM-018-main · Etiquetas de las barras de navegación

Proyecto: **Hanami 5.23.0 (v149)**, rama `main`. Esta entrega conserva las
correcciones anteriores y no requiere migraciones SQL ni cambios de
configuración.

## Problema reproducido

La navegación principal y los controles normales del lector renderizaban sus
etiquetas de texto de forma permanente. A diferencia de
`selection-bottombar`, no tenían una presentación icon-first ni estaban
incluidos en el reconocedor compartido de pulsación prolongada.

Además, la animación de entrada de la pestaña activa podía volver a forzar
visible el texto de la navegación principal.

## Corrección

- La navegación principal y `reader-navigation` pasan a ocultar visualmente
  sus etiquetas en reposo, sin eliminar el texto accesible para lectores de
  pantalla.
- `selection-toolbar.js` incorpora ambos conjuntos de botones al mismo
  reconocedor que ya usan las barras contextuales y las acciones de página:
  `500 ms` para mostrar `show-action-label`, `2400 ms` de duración y
  cancelación al mover más de `12 px`, cancelar el puntero, usar varios
  punteros o perder el foco.
- El clic sintetizado al soltar una pulsación larga se consume; por tanto no
  cambia de pestaña ni activa una opción del lector. Los toques cortos y el
  teclado conservan sus acciones.
- La regla de la animación de pestaña activa ya no puede reabrir una etiqueta
  si el botón no tiene `show-action-label`. La navegación lateral conserva sus
  separaciones cuando una etiqueta se revela.
- Las acciones de página del lector siguen usando su selector dedicado; los
  botones de confirmación inline no entran en el gesto de etiquetas.

## Archivos modificados

- `public/selection-toolbar.js`
- `public/styles.css`
- `tests/reader-page-actions-hnm020.test.mjs`
- `tests/reader-page-actions-hnm020.e2e.mjs`
- `package.json`

## Validación

- `npm test`: **122 comprobaciones PASS**, incluida la prueba determinista
  compartida para los cinco tipos de botones, incluidos navegación principal y
  `reader-navigation`.
- `npm run test:e2e:navigation-labels-hnm018` verifica en Chromium con entrada
  táctil real que las etiquetas empiezan ocultas, se revelan tras la espera y
  que soltar no navega ni modifica el ajuste de recorte.
- `npm run test:e2e:reader-actions-hnm020`: **20 escenarios PASS** en Chromium.
  Conserva la regresión completa del lector y sus acciones integradas, además
  de los dos escenarios de HNM-018.

La validación local no sustituye las pruebas en dispositivos físicos o el
despliegue en producción.