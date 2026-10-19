# Validación de v149

Hanami `5.23.0` · PWA `hanami-crimson-knot-v149`.

## Alcance

La cola de música se descarta al cerrar el lector y antes de pasar a otro capítulo. El reproductor, sus herramientas y el selector de música se cierran; no se eliminan canciones importadas, favoritos ni listas personales.

## Pruebas ejecutadas

- `npm test`: 121 líneas `PASS`.
- Sintaxis: `node --check public/reader.js`, `public/reader-music.js` y la nueva prueba E2E.
- `tests/reader-music-session-v149.e2e.mjs`: cierre del lector, sustitución directa de capítulo y transición en modo continuo, comprobando cola, reproducción, panel, fuente de audio y estado persistido.
- `tests/reader-music-v141.e2e.mjs`: cuatro escenarios ya existentes de SoundCloud, reproducción nativa, listas, pines y finales automáticos.
- `tests/navigation-back-v147.e2e.mjs`: 60 escenarios de historial en móvil y escritorio, incluidos saltos que abandonan lector y reproductor.

## Integridad de alcance

- No se añadieron dependencias ni se modificó la configuración de extensiones u Olympus.
- La caché PWA cambia a `hanami-crimson-knot-v149` para que Vercel instale los módulos nuevos al desplegar el proyecto completo.
- Las migraciones y archivos SQL se mantienen sin cambios frente a v148.

Detalles funcionales: `READER_MUSIC_SESSION_V149.md`.
