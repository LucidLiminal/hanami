# Scroll al entrar en pantallas — HNM-022

Hanami `5.24.0` · build `v150` · rama `main`.

## Incidencia

Al abrir una pantalla o subpantalla, el documento conservaba la posición de
scroll de la vista anterior. La nueva superficie podía aparecer desplazada,
incluso cerca de su final.

## Corrección

- `screen-history.js` guarda la posición de la superficie saliente antes de
  crear, reemplazar o abandonar una pantalla.
- Toda pantalla navegable creada con `push` o `replace` se desplaza a `0` en el
  siguiente frame de renderizado.
- Atrás y Adelante restauran la posición registrada de la pantalla de origen.
- Las capas cuyo tipo empieza por `reader` quedan excluidas: el lector y sus
  herramientas mantienen su propio propietario de scroll.

## Validación

- `npm test`: 125 comprobaciones PASS.
- `npm run test:e2e:screen-scroll-hnm022`: PASS en Chromium móvil 390 × 844.
  Desde Más desplazado, Ajustes y su subpantalla Acerca de abren arriba; Atrás
  recupera la posición previa.
- `npm run test:e2e:reader-actions-hnm020`: 22 escenarios PASS.
- `npm run test:e2e:group-admin-screen`: PASS.

No requiere migraciones SQL ni borrar datos del navegador.