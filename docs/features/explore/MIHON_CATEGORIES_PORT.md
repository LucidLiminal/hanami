# Port funcional de Categorías de Mihon

## Funciones
1. Crear, renombrar, eliminar y reordenar categorías.
2. Validar nombres obligatorios y duplicados.
3. Categoría Predeterminada cuando una obra no tiene otra asignación.
4. Categoría predeterminada configurable al añadir.
5. Selección múltiple de categorías por obra.
6. Asignación masiva triestado: común, mezclada o ausente.
7. Pestañas con contadores y navegación horizontal en Biblioteca.
8. Ajustes para pestañas, contadores y visualización por categoría.
9. Conservación de categorías al migrar una obra.
10. Participación en Actualizaciones inteligentes mediante inclusión/exclusión.

## Pantallas y subpantallas
- Pantalla Editar categorías con FAB.
- Estado vacío.
- Diálogo Añadir categoría.
- Diálogo Renombrar categoría.
- Confirmación Eliminar categoría.
- Reordenación mediante arrastre y alternativa de teclado.
- Diálogo Mover a categoría de una obra.
- Diálogo triestado para selección masiva.
- Ajustes de categoría predeterminada, pestañas y contadores.
- Pestañas/pager de `libraryRoot`.
- Entrada desde `mihon-detail`: pulsación larga del corazón y Más → Editar categorías.
- Incorporación desde Fuentes con selector/default.
- Categorías incluidas/excluidas en Actualizaciones inteligentes.
- Conservación en Migrar.

Los flujos y gestos siguen Mihon. La apariencia mantiene colores, textura, tipografía y geometría de Hanami.

## Corrección v34
La selección masiva diferencia ahora entre estados binarios y mixtos. Una categoría asignada a todas las obras pasa directamente de incluida a excluida al tocarla, y la nueva asignación se persiste antes de actualizar la interfaz.

## Corrección v35
Las reasignaciones iniciadas desde `mihon-detail` modifican ahora el mismo objeto de la colección que se persiste. Después del guardado se emite la sincronización central de categorías para que `libraryRoot`, pestañas y contadores se actualicen sin recargar.
