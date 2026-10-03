# Estabilidad de capas del lector — v143

Versión de aplicación: `5.17.0`. Caché PWA:
`hanami-crimson-knot-v143`.

## Corrección

v142 resolvió el desfase de coordenadas al recargar, pero su implementación
observaba cambios de geometría demasiado amplios dentro del lector. Eso podía
competir con la creación normal de las capas de comentarios y con las tarjetas
laterales de música en algunas sesiones de lectura.

v143 reduce el trabajo al evento que realmente necesita corrección: la carga
de la imagen de la página. Al terminar de cargar, espera a que el lector
elimine su tamaño temporal y vuelve a convertir las coordenadas guardadas
contra el rectángulo definitivo. El redimensionamiento habitual del navegador
sigue usando el renderizado existente del lector.

## Resultado

- Los comentarios existentes vuelven a mostrarse y se mantienen en su punto
  correcto tras recargar.
- Las tarjetas y pins de música conservan su renderizado independiente.
- Comentarios y música pueden mostrarse juntos sin ocultarse ni reemplazarse.
- No se modifica ninguna coordenada persistida, canción, lista, comentario ni
  sincronización de grupo.

## Validación

- `npm test`: regresión completa, incluida una comprobación de que el
  reanclaje no instala observadores globales de geometría.
- `npm run test:e2e:reader-v143`: primero crea, mueve y recarga un comentario
  con una imagen retrasada; después verifica la interfaz completa de tarjetas
  de música, cambio de canción y arrastre de pins.
- Las regresiones móviles de creación y movimiento de comentarios y de
  conservación de posición de lectura también se ejecutaron de forma
  independiente.

## Despliegue

No hay migración SQL nueva. Despliega el proyecto y recarga o reabre la PWA
para recibir la caché v143.
