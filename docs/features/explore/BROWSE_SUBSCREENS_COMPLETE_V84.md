# Hanami v84 — Subpantallas completas de Browse

Esta versión completa el trabajo que v83 dejó pendiente. Las rutas ya no dependen de versiones resumidas en diálogos cuando Mihon define una pantalla navegable.

## Fuentes
- `SourcesScreen` con agrupación, anclado, recientes, idioma, Latest y opciones por pulsación prolongada.
- `SourcesFilterScreen` como subpantalla real:
  - Filtro de ancladas.
  - Activación completa de idiomas, incluido el estado “ningún idioma”.
  - Activación individual de fuentes.
  - Persistencia y restauración con Back.
- `BrowseSourceScreen` con búsqueda, Popular, Recientes, tres modos de visualización y toolbar con overflow.
- `SourcePreferencesScreen` como subpantalla; muestra preferencias del adaptador cuando existen y un estado explícito cuando el adaptador no expone ninguna.
- `MissingSourceScreen` con acceso directo a Extensiones.
- Pulsación prolongada en fuente abre `SourceOptionsDialog`.
- Pulsación prolongada en una obra añade o quita de Biblioteca conservando categorías y metadatos.

## Extensiones
- `ExtensionFilterScreen` como subpantalla real con idiomas y estados Todas/Instaladas/Disponibles.
- `ExtensionDetailsScreen` como subpantalla real:
  - Información, versión, idioma, runtime y estado.
  - Repositorio.
  - itemOverflow para habilitar todo, deshabilitar todo y limpiar caché/cookies.
  - Modo incógnito.
  - Lista de fuentes, activación individual y acceso a preferencias.
  - Instalar/adjuntar o desinstalar.
  - Aviso de contenido cuando el manifiesto lo define.
- `ExtensionStoresScreen` como subpantalla real con registro bundled y referencia upstream.
- Confirmación de desinstalación continúa siendo un diálogo real.
- Los adaptadores con `loadError` conservan estado “No cargada”; Hanami no solicita confianza para binarios porque no instala ni ejecuta APK externos.

## Migración
- `MigrateSourceScreen` conserva contador por fuente, orden alfabético/numérico y dirección.
- Pulsación prolongada copia el ID de fuente.
- `MigrateMangaScreen` es una subpantalla real:
  - Lista de obras de la fuente.
  - Portadas que abren detalle.
  - Selección múltiple.
  - FAB Continuar animado y condicionado a la selección.
  - Back limpia primero la selección; un segundo Back abandona la pantalla.
- Continuar abre el `MigrationConfigScreen` ya portado.
- Desde allí se reutilizan `MigrateSearchScreen`, `MigrateSourceSearchScreen`, `migration-list` y `MigrateMangaDialog`, incluyendo migración a la misma fuente, resultados por fuente, confirmación y cierre correcto del flujo.

## Navegación y overlays
- Todas las rutas usan `HanamiScreens.push` con restauradores específicos.
- NavigationBar se oculta en subpantallas.
- Escape, botón Atrás, browser Back y gesto móvil consumen una transición.
- itemOverflow se cierra antes de ejecutar una acción y no deja overlays huérfanos.
- Los diálogos conservan cierre exterior, Escape y Back mediante `HanamiOverlays`.

## Adaptación web
- No se ejecutan APK, JVM, Android Activities ni PackageInstaller.
- “Instalar” habilita un adaptador JavaScript/TypeScript incluido en el proyecto Vercel.
- Los filtros propios de una fuente solo aparecen cuando el adaptador web los expone; Olympus no declara filtros estructurados adicionales y usa búsqueda textual, Popular y Recientes.
