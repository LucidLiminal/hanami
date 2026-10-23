# HNM-025 — Estado de capítulos al volver al detalle

Hanami `5.24.0` · rama `main` · PWA `hanami-crimson-knot-v150`.

## Incidencia

Tras terminar un capítulo y cerrar el lector, la ficha de la obra seguía
montada, pero sus filas conservaban el estado de lectura que tenían al abrirse.
El capítulo recién completado no recibía la clase visual de leído y no se
atenuaba hasta una recarga posterior.

## Causa

El lector ya guardaba el progreso y los metadatos de capítulo en Biblioteca,
además de emitir `hanami-library-change`. Sin embargo, `manga-detail.js`
mantenía una copia local de los metadatos de cada fila y no escuchaba ese
evento. Por ello, al volver a la misma ficha, la vista continuaba renderizando
esa copia obsoleta.

## Corrección

- El detalle escucha `hanami-library-change` mientras su propia instancia siga
  montada.
- Para la misma obra y fuente, fusiona los metadatos canónicos de Biblioteca
  en la copia local de cada capítulo.
- Cuando cambia algún estado, persiste la copia de detalle y vuelve a renderizar
  únicamente la lista de capítulos.
- La escucha guarda la identidad del elemento de detalle; una instancia
  desmontada no puede actualizar una ficha posterior que use el mismo
  contenedor.
- No se altera el flujo del lector, la navegación Atrás ni la persistencia de
  progreso existente.

## Validación

- `node tests/detail-read-state-hnm025.test.mjs`: PASS.
- `npm run test:e2e:detail-read-state-hnm025`: PASS en Chromium móvil
  390 × 844. Abre una obra, completa un capítulo y cierra el lector; verifica
  que la misma instancia de detalle permanece montada y la fila cambia de
  `unread` a `read`.
- `npm run test:e2e:reader-actions-hnm020`: 22 escenarios PASS.
- `npm test`: 128 comprobaciones PASS.

## Compatibilidad y despliegue

No requiere migraciones SQL, cambios de versión ni borrar datos del navegador.
La corrección consume el evento de Biblioteca ya existente y conserva la
compatibilidad con capítulos identificados por URL o identidad estable.