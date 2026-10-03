# Música compartida del lector — v140

Versión de aplicación: `5.14.0`. Caché PWA:
`hanami-crimson-knot-v140`.

## Corrección de pins que quedaban en “Pendiente”

La cola de música compartida se detenía si una pista incluía metadatos que el
RPC de Supabase rechaza. El caso más frecuente era una carátula remota que no
pertenecía al CDN de SoundCloud: una operación fallida dejaba sus propias
pistas y las posteriores en estado **Pendiente**, aunque las pistas anteriores
ya se hubieran publicado.

v140 corrige el flujo en tres capas:

- Los metadatos enviados al grupo ahora respetan el contrato del RPC. Si una
  carátula no procede de `i*.sndcdn.com`, se omite solo para la copia
  compartida; la carátula original sigue disponible localmente.
- La bandeja de salida normaliza también las operaciones que ya estaban
  guardadas en el navegador. Al actualizar, los pins pendientes heredados se
  reparan automáticamente antes del siguiente envío.
- Una operación no compatible se marca como local y deja de bloquear las
  siguientes. Las pistas compatibles posteriores continúan compartiéndose.

Se corrigió además la comprobación del identificador de grupo al convertir las
filas recibidas desde Supabase.

## Resultado esperado

Tras desplegar v140 y recargar o reabrir la PWA:

1. Las pistas pendientes compatibles se envían en orden.
2. Los demás miembros del grupo reciben todos los pins disponibles de las
   páginas sincronizadas.
3. Si una pista concreta no puede compartirse, deja de mostrarse como
   **Pendiente** y se conserva como una pista personal; no detiene al resto.

No se cambian archivos locales, listas personales ni posiciones de los pins.

## Validación

- `npm test`: regresión completa.
- `npm run test:e2e:reader-v140`: prueba una operación pendiente heredada con
  carátula no compatible, tres pins creados en rápida sucesión —uno con esa
  carátula— y un segundo miembro que recibe las tres pistas.
- Las rutas simuladas del RPC validan la misma restricción de carátulas que la
  migración de Supabase.

## Despliegue

No hay migración SQL nueva. Despliega el proyecto y recarga o reabre la PWA
para activar la caché v140; la bandeja de salida existente se corrige en el
siguiente intento de sincronización.