# MigrateMangaDialog port — v75

## Problema

El diálogo de `MigrateSearchScreen` mostraba una comparación fija y una única acción. No portaba el estado, los flags aplicables ni la diferencia entre copiar y migrar de Mihon.

## Port

- Título **Qué incluir**.
- Flags persistentes:
  - Capítulos.
  - Categorías.
  - Portada personalizada, solo cuando existe.
  - Notas, solo cuando existen.
  - Eliminar descargas, solo cuando existen.
- Acciones **Mostrar obra**, **Copiar** y **Migrar**.
- Estado de carga bloqueante durante la operación.
- Reintento visible si falla la carga del destino.

## Semántica

- **Copiar** añade la obra de destino y conserva la obra original.
- **Migrar** sustituye la obra original y conserva su fecha de incorporación.
- El destino se actualiza desde la fuente antes de aplicar la operación.
- Capítulos leídos y favoritos se emparejan por número.
- La posición de lectura se remapea al capítulo equivalente.
- El seguimiento se asocia al destino, igual que en el caso de uso de Mihon.
- Categorías, notas, portada personalizada y eliminación de descargas dependen de sus flags.
- Se admite migrar hacia la fuente original, incluso hacia un resultado diferente de la misma fuente.