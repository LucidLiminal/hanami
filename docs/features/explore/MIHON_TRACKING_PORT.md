# Port funcional de Seguimiento de Mihon

## Funciones auditadas
1. Flecha circular si no hay vínculos; marca de verificación y número cuando existen.
2. Toque corto abre Seguimiento; Mihon no asigna pulsación larga al botón.
3. Si no hay servicios conectados, abre Ajustes de seguimiento.
4. Vínculos independientes por obra y servicio.
5. Actualización del progreso al terminar un capítulo.
6. Actualización manual de todos los vínculos.
7. Abrir el registro remoto, copiar enlace, privacidad y eliminación.

## Pantallas y subpantallas portadas
- Ajustes de seguimiento y lista de servicios.
- Conectar y cerrar sesión local del navegador.
- Pantalla principal de vínculos por obra.
- Buscar obra en el servicio, con búsqueda pública real de AniList y vínculo manual de reserva.
- Selección y confirmación del resultado.
- Selector de estado.
- Selector de capítulo leído.
- Selector de puntuación.
- Selector y borrado de fechas de inicio y finalización.
- Menú de cada vínculo: abrir, copiar, privado/público y eliminar.
- Confirmación de eliminación local/remota.
- Ajustes de actualización automática y comportamiento al marcar como leído.

Por seguridad, Hanami no copia secretos ni credenciales de Mihon. Las sesiones del port son locales al navegador; AniList ofrece búsqueda pública mediante la única función Vercel del proyecto. Para mutaciones remotas reales cada servicio requiere sus propias credenciales OAuth. La arquitectura sigue siendo un solo proyecto Vercel.
