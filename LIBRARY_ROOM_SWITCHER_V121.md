# Hanami v121 — salas dentro de Biblioteca

## Resumen

La navegación de grupos de lectura deja de ser una pestaña principal y pasa a
formar parte de **Biblioteca**. La biblioteca personal y las bibliotecas
compartidas se seleccionan desde una barra horizontal situada bajo la toolbar.

## Cambios

- Eliminada la pestaña principal **Grupos** y reducido el navegador principal a
  cinco destinos.
- Añadida una barra horizontal con:
  - biblioteca personal;
  - salas accesibles representadas por imágenes circulares;
  - acción final **Añadir sala**.
- Un toque activa la sala y sustituye el contenido de `library-pager` por su
  biblioteca compartida independiente.
- La biblioteca compartida conserva recomendaciones, autor de la recomendación
  y progreso de lectura de los miembros.
- Una pulsación prolongada abre los detalles de la sala con banner, cita,
  miembros, cola de sincronización y la acción de invitación para quien
  administra la sala.
- **Añadir sala** abre un diálogo con **Entrar con invitación** y
  **Crear grupo**.
- Las rutas antiguas de `/groups` se redirigen a Biblioteca.
- Se mantiene la máquina centralizada `HanamiScreens` para pantallas,
  retroceso y cierre.

## Persistencia

La sala activa se guarda en el navegador mediante
`hanami-library-room-scope-v1`. Los datos compartidos continúan sincronizándose
con Supabase y la biblioteca personal permanece independiente.

## Validación

- Regresión: `tests/library-room-switcher-v121.test.mjs`.
- Prueba móvil: `tests/library-room-switcher-mobile-v121.e2e.mjs`.
- Chromium móvil: 390 × 844.
- Suite completa: `npm test`.
- Versión: `5.8.54`.
- Caché del Service Worker: `hanami-library-room-switcher-v121`.
