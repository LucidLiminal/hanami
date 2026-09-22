# Hanami v82 — Sincronización entre lector, Biblioteca e Historial

## Bug
HistoryTab leía una instantánea de `hanami-library`, pero los guardados realizados por el lector no notificaban a la pestaña. Dentro de la misma ventana, `localStorage` tampoco emite el evento `storage`, por lo que una pantalla de Historial ya montada permanecía desactualizada.

Además, HistoryTab dependía exclusivamente de `lastRead` o `readingProgress`. Algunas rutas conservan la actividad más reciente en `_chapterMeta[chapterUrl].lastReadAt`, así que esas lecturas podían quedar fuera del historial.

## Corrección
- Cada `save()` de Biblioteca emite `hanami-library-change` con la lista actualizada.
- HistoryTab escucha `hanami-library-change` y vuelve a renderizarse en el siguiente frame cuando está activo.
- También escucha `storage` para sincronizar cambios realizados desde otra pestaña del navegador.
- La fecha efectiva se obtiene del valor más reciente entre:
  - `manga.lastRead`.
  - `manga.readingProgress.updatedAt`.
  - `_chapterMeta[*].lastReadAt` o `readAt`.
- El capítulo mostrado se reconstruye desde el metadato con actividad más reciente cuando falta el progreso principal.
- Al borrar una entrada se eliminan también los timestamps históricos de `_chapterMeta`, sin alterar el estado leído/no leído.
- La actualización se limita a HistoryTab activo y se agrupa con `requestAnimationFrame` para evitar renderizados innecesarios durante el scroll del lector.

## Resultado
Leer otro capítulo, cambiar la posición o completar una obra actualiza inmediatamente su título, capítulo, hora y posición dentro de HistoryTab al cerrar el lector, sin recargar la aplicación.
