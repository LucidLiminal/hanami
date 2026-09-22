# Port funcional de Explorar

Referencia de comportamiento: sección Browse/Explore del código adjunto de Mihon, especialmente `SourcesViewModel`, `SourcesScreen`, `ExtensionsViewModel`, `ExtensionsScreen`, `MigrateSourceViewModel` y `MigrateSourceScreen`.

## Adaptación web

- **Fuentes:** recientes, ancladas, agrupación por idioma/otros, anclar, abrir recientes, filtrar y búsqueda global concurrente.
- **Extensiones:** instaladas y disponibles por idioma, búsqueda, información, filtros, listado compacto/detallado y adjuntar/desadjuntar. En Hanami “instalar” no descarga APK: activa un adaptador JS ya incluido.
- **Migrar:** conteos por fuente, orden alfabético/conteo, dirección ascendente/descendente, listado de objetos, selección múltiple, fuente destino, búsqueda de coincidencias y registro de migraciones.

La persistencia usa `localStorage`; el catálogo ejecutable sigue limitado a adaptadores JS/TS incorporados en el despliegue. No se ejecuta código Android ni APK.
