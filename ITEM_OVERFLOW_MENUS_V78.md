# Item overflow menus — v78

## Corrección

La barra inferior de selección de Biblioteca ya no abre diálogos para acciones que en `LibraryBottomActionMenu` son `DropdownMenu`.

### Más

Abre un menú anclado sobre el botón con:

- Migrar.
- Borrar.

### Descargar

También se corrigió como `DownloadDropdownMenu`, con:

- Siguiente capítulo.
- Siguientes 5, 10 o 25.
- Todos los capítulos no leídos.
- Favoritos.

## Comportamiento

- Los menús se posicionan respecto al botón pulsado.
- Toque exterior, Escape y browser/mobile Back los cierran con una sola transición.
- Elegir una opción cierra primero el overflow y después ejecuta la acción.
- **Borrar** continúa abriendo su diálogo de confirmación real; ese diálogo no es un itemOverflow.

## Auditoría

Los menús Más de ficha, seguimiento, notas, extensiones, configuración de migración y toolbar de Biblioteca ya estaban implementados como menús no modales. Los falsos diálogos encontrados estaban en las acciones inferiores **Más** y **Descargar** de Biblioteca.