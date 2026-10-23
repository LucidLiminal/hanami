# Normalización de títulos v69

Los títulos son contenido, no etiquetas de procedencia.

- El parser de Olympus elimina envoltorios malformados `content=`.
- Elimina sufijos como `| Olympus Scanlation`, `| Olympus` y equivalentes con guion.
- La API aplica la regla usando el nombre de cualquier fuente, no solo Olympus.
- Los registros existentes de Biblioteca se reparan y persisten al cargar.
- La procedencia permanece en `sourceId` y metadatos dedicados, nunca en el título visible.
