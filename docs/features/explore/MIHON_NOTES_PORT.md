# Port funcional de Notas de Mihon

## Comportamiento verificado en Mihon

- Las notas son privadas y pertenecen a una obra concreta.
- Se abren desde `Más → Notas` en la pantalla de detalles.
- Tienen una pantalla de edición propia y admiten selección de texto.
- No tienen límite de caracteres desde Mihon 0.20.0.
- Se persisten en el modelo de manga y forman parte de las copias/restauraciones.
- Permanecen asociadas aunque la obra no esté en la biblioteca.
- La búsqueda de Biblioteca admite los prefijos `notes:` y `note:` y valores vacíos.
- Mihon no incluye todavía una pantalla global de todas las notas; no se inventó una.

## Pantallas portadas

1. **mihon-detail / Detalles:** la nota guardada se muestra por encima de `.md-description`; tocarla abre el editor. También existe la entrada `Más → Notas` desde Fuentes y Biblioteca.
2. **NotesScreen / Notas:** app bar con atrás, título de la obra, editor multilínea ilimitado, guardado automático y estado de guardado.
3. **Menú de Notas:** copiar todo y eliminar notas con confirmación.
4. **libraryRoot / Biblioteca:** búsqueda `notes:texto`, `note:texto` y `notes:""`; la nota viaja en el registro de biblioteca.
5. **Migrar:** conserva y reasocia la nota a la obra y fuente de destino.
6. **Añadir/quitar de Biblioteca:** importa notas previas; quitar la obra no elimina la nota.
7. **Persistencia:** guardado al escribir, al ocultar la pestaña, al salir y al cerrar; migración automática del almacenamiento provisional anterior.

## Gestos y navegación

- Toque en `Más → Notas` abre la pantalla.
- Botón Atrás, historial del navegador y Escape vuelven a Detalles.
- Deslizar desde el borde izquierdo hacia la derecha vuelve a Detalles.
- Seleccionar, copiar, cortar, pegar, deshacer y rehacer usan los gestos nativos del editor móvil.
- `Ctrl/Cmd + S` fuerza el guardado en escritorio.
