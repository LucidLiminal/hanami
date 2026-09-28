# Hanami v122 — selector compacto y cabecera de sala

## Resumen

El selector de bibliotecas queda reducido a una barra horizontal de iconos
circulares. La información de la sala activa pasa a encabezar su propia
estantería y las acciones de actualización y recomendación se integran en los
patrones normales de Biblioteca.

## Cambios

- `library-room-switcher` contiene únicamente la navegación horizontal:
  - biblioteca personal;
  - grupos accesibles;
  - acción final para añadir una sala.
- Se eliminan del selector los nombres, contadores y el bloque de sala activa.
- El `aside` de sala activa se mueve a la cabecera de
  `library-group-shelf`, con nombre, cita y avatares.
- Se conserva la advertencia:
  “Recomendaciones y progreso independientes de tu biblioteca personal.”
- Desaparecen los botones **Actualizar** y **Recomendar lectura** de la
  cabecera.
- **Recomendar lectura** pasa a ser la primera tarjeta `lib-item`, con una
  portada `lib-cover` y el símbolo `+`.
- **Más opciones → Actualizar biblioteca** actualiza la sala activa cuando se
  está viendo una biblioteca compartida.

## Validación

- Regresión: `tests/library-room-switcher-v122.test.mjs`.
- Prueba móvil: `tests/library-room-header-mobile-v122.e2e.mjs`.
- Chromium móvil: 390 × 844.
- Versión: `5.8.55`.
- Caché del Service Worker: `hanami-library-room-header-v122`.
