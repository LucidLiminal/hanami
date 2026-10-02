# Música del lector — v139

Versión de aplicación: `5.13.0`. Caché PWA:
`hanami-crimson-knot-v139`.

## Cambiar una canción fijada

Cada tarjeta expandida de `.reader-music-pin` incorpora un botón con el
icono de intercambio dentro de `.reader-music-pin-actions`.

- Abre la pantalla independiente
  `.reader-music-services.reader-music-picker`.
- El selector indica que se está cambiando una pista y conserva el
  identificador, la página y la coordenada exacta del marcador.
- Al elegir la nueva canción se actualizan la tarjeta, los metadatos del
  marcador, la instancia activa y la cola de lectura actual. La pista nueva
  pasa a reproducirse y la anterior deja de ocupar esa cola.
- Las listas personales y los archivos de la biblioteca no se borran ni se
  modifican al reemplazar una pista del marcador.
- Un marcador compartido solo puede sustituirse por una pista pública de
  SoundCloud, ya que los archivos locales no se publican en el grupo.

El botón queda deshabilitado para una pista compartida de otro miembro. La
persona autora conserva la edición; esta restricción coincide con la función
de actualización del grupo, que no permite reescribir el marcador de otro
autor.

## Reposicionar un pin verticalmente

Las tarjetas editables se pueden arrastrar hacia arriba o abajo, tanto
plegadas como desplegadas.

- El gesto vertical se convierte en una coordenada `y` normalizada dentro de
  la página (de `0` a `1`); la coordenada horizontal no cambia.
- Durante el gesto la tarjeta sigue al puntero. Al soltarla, el anclaje se
  redibuja en la nueva altura y se conserva en el navegador.
- Si la pista pertenece al grupo, el cambio se publica como una revisión
  nueva del mismo pin. Los demás miembros reciben la nueva coordenada al
  sincronizar.
- La cola activa de lectura se vuelve a ordenar según la nueva posición sin
  interrumpir la canción que ya está autorizada y reproduciéndose.
- Los pins compartidos de solo lectura no muestran cursor de arrastre ni
  aceptan el gesto.

Las portadas no inician un arrastre nativo del navegador, de modo que el gesto
de mover es fiable en pantalla táctil y con ratón. Los clics normales sobre
play/pausa, cambiar, eliminar y desplegar se conservan.

## Validación

- `npm test`: suite completa de regresión, incluida la comprobación unitaria
  de v139 para el botón, el reemplazo y la cola sincronizada.
- `npm run test:e2e:reader-v139`: selección desde la tarjeta, actualización
  de la cola, movimientos hacia arriba y abajo, persistencia en la operación
  de grupo, permisos de solo lectura y regresiones de reproducción local y
  SoundCloud.
- Revisión visual en 320, 390 y 1280 px para el botón adicional, el selector
  contextual y las tarjetas de solo lectura.

## Despliegue

No hay una migración SQL nueva. Despliega el proyecto y recarga o reabre la
PWA para instalar la caché v139. Las instalaciones que ya aplicaron
`supabase/hanami-group-reader-music-v137.sql` conservan el mismo esquema y
sus marcadores existentes.