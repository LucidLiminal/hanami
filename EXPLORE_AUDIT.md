# Auditoría de paridad — Mihon Explore → Hanami Web

La revisión comparó el port con las pantallas y view models de Mihon para Sources, Global Search, Extensions, Extension Details, Extension Filters y Migration.

## Omisiones corregidas después de v18

### Fuentes
- Menú contextual equivalente al toque prolongado: anclar, recientes, web y deshabilitar.
- Separación entre extensión instalada y fuente habilitada.
- Filtro con interruptores individuales por fuente.
- Búsqueda global con filtro “todas/ancladas”.
- Cabeceras de resultados navegables.
- Apertura real de resultados globales.
- Eliminación de duplicados entre “Usado recientemente” y “Ancladas”, siguiendo la prioridad de Mihon.

### Extensiones
- Actualización del catálogo.
- Grupos para actualizaciones pendientes y extensiones no cargadas.
- Contador de actualizaciones y “Actualizar todas”.
- Estados Pendiente/Adjuntando/Actualizando, cancelar y confirmación de desinstalación.
- Búsqueda por términos separados por comas y por nombres de fuentes.
- Repositorios/listado de extensiones.
- Detalles con fuentes de la extensión, habilitar/deshabilitar todas, modo incógnito, limpieza de caché y apertura del repositorio.

### Migrar
- Guía de migración.
- Seleccionar todo y limpiar selección.
- Contador reactivo de selección.
- Exclusión de fuentes destino deshabilitadas.
- Obras ordenadas alfabéticamente antes de buscar coincidencias.

## Diferencias intencionadas

Las acciones exclusivas de Android (APK, PackageInstaller, Shizuku, permisos del sistema, WebView Android, confianza de firmas y app-info del paquete) no pueden portarse literalmente a Vercel. Se sustituyen por estados y acciones equivalentes para adaptadores JS incluidos en Hanami. Ningún botón pretende instalar o ejecutar APK.
