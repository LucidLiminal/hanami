# HNM-028 — Backdrop de modal sin activación subyacente

Hanami `5.24.0` · rama `main` · PWA `hanami-crimson-knot-v150`.

## Incidencia

Al tocar fuera de un modal, el cierre podía producirse durante `pointerdown`.
En determinados navegadores táctiles, `pointerup` y `click` se resolvían ya
contra el control que había debajo del modal y activaban una acción accidental.

## Corrección

- El backdrop de un `<dialog>` reserva la secuencia completa del puntero que
  inició su cierre.
- El modal se cierra en la liberación del mismo puntero, no durante su
  `pointerdown`; así conserva la capa superior durante la interacción.
- `pointerup` y el posible `click` de liberación se cancelan en captura antes
  de alcanzar el control subyacente.
- La protección queda acotada al `pointerId` y al modal activo; los clics
  posteriores siguen comportándose normalmente. Un `pointercancel` limpia la
  reserva sin cerrar el modal.

## Validación

- `node tests/modal-backdrop-target-guard-hnm028.test.mjs`: PASS. Verifica la
  reserva, la liberación, la cancelación y la intercepción del clic.
- `npm run test:e2e:modal-backdrop-target-guard-hnm028`: PASS en Chromium móvil
  390 × 844. Reproduce una secuencia donde el cierre deja el control inferior
  como destino de `pointerup` y `click`; comprueba que el modal se cierra sin
  activar la pestaña Explorar subyacente.
- `npm test`: 131 comprobaciones PASS.

## Compatibilidad y despliegue

No requiere migraciones SQL, cambios de datos locales ni restablecer la
instalación PWA. Escape, Atrás, los botones internos de cierre y el cierre de
menús no modales conservan sus flujos existentes.
