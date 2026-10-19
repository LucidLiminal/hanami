# Sesión musical del lector — v149

Hanami `5.23.0` · PWA `hanami-crimson-knot-v149`.

La música de lectura queda delimitada por el lector y por el capítulo actual:

- Al cerrar el lector, se detiene la reproducción nativa o externa, se vacía la cola y se cierra el panel completo, sus herramientas y el selector de música.
- Al cargar otro capítulo en el mismo lector o al entrar en el siguiente/anterior capítulo en modo continuo, se aplica el mismo reinicio antes de mostrar el nuevo capítulo.
- El reinicio invalida cargas asíncronas pendientes, por lo que una respuesta tardía no puede volver a iniciar la reproducción.
- Se limpian también el estado persistido de la cola, la pista actual, el progreso y los metadatos de Media Session.
- La biblioteca musical importada, favoritos y listas personales no se eliminan: solo se descarta la cola temporal de lectura.

Cobertura: `tests/reader-music-session-v149.test.mjs` y `tests/reader-music-session-v149.e2e.mjs`.
