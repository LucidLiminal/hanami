# HNM-024 — Pulsación prolongada móvil

Hanami `5.24.0` · rama `main` · PWA `hanami-crimson-knot-v150`.

## Incidencia

Al mantener pulsada una tarjeta interactiva en móvil, el navegador podía
interceptar el gesto. En especial, una portada de la biblioteca podía abrir el
menú nativo para copiar, descargar, compartir o abrir la imagen en Chrome.
También podía iniciarse la selección de texto o el arrastre de la imagen.

## Corrección

- Se incorporó `mobile-interaction-guard.js`, un manejador en fase de captura
  que, con entrada táctil, cancela `contextmenu`, `selectstart` y `dragstart`
  solo sobre superficies interactivas de Hanami.
- Se cubren botones, enlaces, controles con roles y las tarjetas de Biblioteca,
  Actualizaciones, Historial, Explorar, Migración y salas de lectura.
- `mobile-interaction-guard.css` aplica `-webkit-touch-callout: none`,
  `user-select: none` y `-webkit-user-drag: none` a esas superficies y sus
  imágenes.
- Los campos `input`, `textarea`, `select`, contenido editable y elementos con
  `data-allow-native-press` quedan excluidos, por lo que mantienen el
  comportamiento nativo necesario para editar.
- El guard no cancela `pointerdown`; por tanto, la selección de Biblioteca a
  los 500 ms, las etiquetas de toolbar y las acciones de página del lector
  conservan sus propios gestos.
- Los recursos nuevos se incluyen en el precache del Service Worker.

## Validación

- `node tests/mobile-native-longpress-hnm024.test.mjs`: PASS.
- `npm run test:e2e:mobile-native-longpress-hnm024`: PASS en Chromium móvil
  390 × 844. Verifica menú contextual, selección, arrastre, exclusión de
  campos editables y selección propia de Biblioteca después de 500 ms.
- `npm run test:e2e:global-search-toolbar-hnm023`: PASS.
- `npm run test:e2e:reader-actions-hnm020`: 22 escenarios PASS.
- `npm test`: 127 comprobaciones PASS.

## Compatibilidad y despliegue

No requiere migraciones SQL, cambios de versión ni borrar datos del navegador.
Los controles editables y las acciones nativas necesarias conservan una
exclusión explícita para futuras pantallas.