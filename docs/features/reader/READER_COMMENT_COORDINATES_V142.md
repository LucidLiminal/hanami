# Coordenadas de comentarios del lector — v142

Versión de aplicación: `5.16.0`. Caché PWA:
`hanami-crimson-knot-v142`.

## Corrección del anclaje tras recargar

Las coordenadas guardadas de un comentario ya eran relativas a la imagen, pero
la tarjeta podía dibujarse mientras esa imagen todavía conservaba un rectángulo
temporal de carga. Cuando el lector terminaba de ajustar la altura real de la
página, el comentario no se recalculaba y podía aparecer desplazado al
recargar o reabrir la lectura.

v142 conserva las coordenadas normalizadas existentes y vuelve a convertirlas
contra el rectángulo final de la imagen. El reanclaje se programa después de
la carga, tras dos fotogramas de composición, y también responde a cambios de
tamaño del lector o de la imagen.

## Comportamiento

- Un comentario creado en una posición concreta reaparece en ese mismo punto
  de la imagen después de recargar.
- Un comentario arrastrado y guardado conserva su nueva posición tras
  recargar.
- Páginas que se descargan y se cargan de nuevo, cambios de orientación,
  redimensionamiento y zoom del lector vuelven a alinear los comentarios.
- No se cambia ningún texto, archivo adjunto, autor ni dato de sincronización;
  solo se vuelve a calcular la posición visual desde `x` e `y` guardados.

## Validación

- `npm test`: regresión completa y comprobación estática del reanclaje.
- `npm run test:e2e:comments-v142`: crea un comentario, lo reposiciona,
  recarga con la imagen retrasada deliberadamente y comprueba que su ancla
  visual coincide con las coordenadas persistidas.
- Se ejecutaron también las regresiones móviles existentes de creación,
  movimiento y conservación de la posición de lectura al publicar un
  comentario.

## Despliegue

No hay migración SQL nueva. Despliega el proyecto y recarga o reabre la PWA
para recibir la caché v142.
