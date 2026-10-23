# Migrate result horizontal row — v73

## Cambio

Los candidatos de cada fuente en `migrate-result-grid` se muestran ahora en una única fila con desplazamiento horizontal.

- Flujo de columnas horizontal.
- Sin salto a una segunda fila.
- Scroll táctil y contención horizontal.
- Ajuste suave de cada tarjeta mediante `scroll-snap`.
- Anchura adaptativa para móvil sin perder la identidad visual de Hanami.

## Regresión

`tests/migrate-result-horizontal-v73.test.mjs` verifica la estructura CSS y la prueba móvil confirma que todas las tarjetas comparten la misma coordenada vertical y que la fila desborda horizontalmente.