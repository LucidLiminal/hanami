# Inventario del port de Biblioteca de Mihon

## Pantallas y subpantallas originales
1. Biblioteca por categorías y pestañas.
2. Barra normal: búsqueda, filtros, actualizar biblioteca/categoría y obra aleatoria.
3. Barra de selección múltiple.
4. Panel de ajustes: Filtro, Orden y Visualización.
5. Gestión de categorías: crear, renombrar, eliminar y reordenar.
6. Diálogo para cambiar categorías.
7. Diálogo de eliminación de biblioteca/capítulos descargados.
8. Acciones de descarga de capítulos.
9. Acceso a migración y búsqueda global.
10. Estados vacío, sin resultados y actualización.

## Funciones portadas a Hanami Web
- Categorías, pestañas, conteos y categoría predeterminada.
- Búsqueda instantánea; filtros incluir/excluir para descargado, no leído, iniciado, marcado, completado e intervalo personalizado.
- Orden alfabético, capítulos totales, última lectura, última actualización, no leídos, último capítulo, fecha de consulta, fecha añadida y aleatorio; ascendente/descendente.
- Cuadrícula compacta, cómoda, solo portada y lista; columnas configurables.
- Badges de descargas, no leídos, idioma y local; botón continuar.
- Actualizar toda la biblioteca o categoría activa; obra aleatoria.
- Selección, selección por rango con Shift, seleccionar todo e invertir.
- Cambiar categoría, marcar leído/no leído, marcar/desmarcar, descargas web, migrar y eliminar.
- Gestión completa de categorías y persistencia en localStorage.

## Adaptaciones web
Las descargas se guardan como estado offline/PWA, no como archivos administrados por Android. Tracking externo no se muestra hasta que exista un proveedor web conectado. WorkManager, notificaciones Android y ReaderActivity se sustituyen por ejecución bajo demanda, estado visual y el lector web de Hanami.
