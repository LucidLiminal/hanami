# HNM-027 — Primer toque tras la selección de Biblioteca

Hanami `5.24.0` · rama `main` · PWA `hanami-crimson-knot-v150`.

## Incidencia

Después de mantener pulsada una obra durante 500 ms para activar la selección,
el primer toque sobre una tarjeta de Biblioteca podía ignorarse. Los toques
posteriores sí alternaban su estado.

## Causa

La pulsación prolongada usaba un booleano global para suprimir el clic generado
al soltar. Al volver a renderizar la cuadrícula, la tarjeta original se
reemplazaba y ese clic de liberación podía no llegar al controlador delegado.
El booleano quedaba activo y consumía el siguiente toque real, incluso si era
sobre otra obra.

## Corrección

- La supresión ahora guarda la tarjeta y el `pointerId` de la pulsación que la
  originó, en vez de aplicar a cualquier tarjeta de Biblioteca.
- Al soltar el mismo puntero, una limpieza diferida conserva la oportunidad de
  absorber solo el clic de liberación y elimina el estado antes de una nueva
  interacción física.
- El controlador delegado solo descarta un clic si procede de la misma tarjeta
  de la pulsación prolongada. El primer toque sobre cualquier otra obra queda
  disponible para seleccionar o deseleccionar de inmediato.

## Validación

- `node tests/library-selection-first-tap-hnm027.test.mjs`: PASS. Comprueba el
  alcance por tarjeta/puntero de la supresión y que ya no existe el booleano
  global que descartaba cualquier clic.
- `npm run test:e2e:library-selection-first-tap-hnm027`: PASS en Chromium móvil
  390 × 844. Simula la liberación tras el renderizado de la tarjeta, verifica
  que no abre la obra y confirma que el primer toque siguiente selecciona y el
  posterior deselecciona.
- `npm test`: 130 comprobaciones PASS.

## Compatibilidad y despliegue

No requiere migraciones SQL, cambios de datos locales ni restablecer la
instalación PWA. Mantiene la selección por rango y la pulsación prolongada de
500 ms existentes.
