# Arrastre de pins musicales — v141

Versión de aplicación: `5.15.0`. Caché PWA:
`hanami-crimson-knot-v141`.

## Corrección del arrastre táctil

En algunos móviles, iniciar el arrastre desde el botón de un pin plegado podía
terminar en `pointercancel`. La tarjeta mostraba el movimiento durante un
instante y luego recuperaba su posición original porque la cancelación anulaba
la coordenada final.

v141 conserva el último punto entregado por el gesto y lo confirma si ya hubo
movimiento, incluso si el navegador termina la secuencia con una cancelación o
pierde la captura. Además, los controles del pin desactivan el gesto de
panorama nativo durante esa interacción, para que el lector no compita con el
arrastre.

## Comportamiento

- Arrastrar un pin editable hacia arriba o hacia abajo guarda una nueva
  coordenada de fijación.
- Un gesto de arrastre sobre el botón plegado no abre la tarjeta ni ejecuta
  accidentalmente su acción de tocar.
- Un toque sin movimiento sigue abriendo o cerrando el pin normalmente.
- La canción, la cola de lectura y la sincronización de grupo no se recrean:
  solo cambia la posición del mismo pin.

Los pins compartidos de otros lectores siguen bloqueados para edición.

## Validación

- `npm test`: regresión completa, incluida la comprobación estática de la
  captura de la última coordenada y de `touch-action`.
- `npm run test:e2e:reader-v141`: Chromium con una cancelación táctil real
  después de arrastrar el botón de un pin plegado, seguido de los casos
  existentes de arrastre con ratón hacia abajo y hacia arriba, cambio de
  canción y cola.

## Despliegue

No hay migración SQL nueva. Despliega el proyecto y recarga o reabre la PWA
para recibir la caché v141.
