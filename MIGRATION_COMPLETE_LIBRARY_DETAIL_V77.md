# Migration completion destination — v77

## Comportamiento

Al terminar **Copiar** o **Migrar**:

1. Se cierra el diálogo mediante el historial de overlays.
2. La pantalla `migrate-search` se reemplaza por `library-detail`.
3. Se abre el detalle de la obra de destino desde el estado actualizado de Biblioteca.
4. El nuevo detalle conserva como padre la raíz `LibraryTab`.

No se añade una pantalla de fuente ni se conserva una pantalla de migración debajo del detalle.

## Atrás

El botón del detalle, Escape, el gesto móvil y browser Back realizan una sola transición hacia `LibraryTab`. Las pantallas `migration-config` y `migrate-search` ya no forman parte de la ruta activa.