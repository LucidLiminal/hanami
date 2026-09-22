# v115 — comentarios sobre imágenes del lector

## Cambio

- Una pulsación larga sobre una imagen abre la subpantalla **Nuevo comentario** en la coordenada seleccionada.
- Cada comentario admite una nota y una imagen o GIF de hasta 2 MB.
- Los comentarios se dibujan sobre la imagen y conservan su posición mediante coordenadas normalizadas.
- El comentario se puede arrastrar para moverlo y redimensionar desde el tirador inferior derecho.
- Un toque sobre un comentario abre su edición; desde allí puede actualizarse o eliminarse.
- La subpantalla usa `HanamiScreens.push()` y vuelve mediante `HanamiScreens.back()`.
- Escape y el botón Atrás consumen una única transición de la máquina de estados.

## Persistencia

Los comentarios se guardan localmente en `hanami-reader-comments-v1`, separados por fuente, obra, capítulo y página. Los adjuntos se guardan como datos de imagen para que sigan disponibles sin conexión.

> Esta versión implementa la capa de anotaciones local. La sincronización multiusuario entre amigos requerirá un servicio compartido con identidad, permisos y almacenamiento remoto; no se ha simulado con una API insegura.

## Compatibilidad

- Los PDF conservan el menú de acciones de página anterior.
- Las imágenes usan la pulsación larga para crear comentarios.
- El movimiento y el redimensionado detienen los gestos del lector para evitar cambios de página accidentales.
- La nueva interfaz conserva la paleta y el lenguaje visual de Hanami.

## Validación

- Regresión: `tests/reader-image-comments-v115.test.mjs`
- Prueba móvil: `tests/reader-image-comments-mobile-v115.e2e.mjs`
- Viewport móvil: 390 × 844
- Caché del Service Worker: `hanami-reader-image-comments-v115`
- Versión de `package.json`: `5.8.48`