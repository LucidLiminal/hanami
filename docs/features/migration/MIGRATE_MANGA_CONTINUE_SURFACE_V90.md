# Migrate manga: Continuar visible — v90

## Problema

El botón **Continuar** de `migrate-manga-screen` sí abría el estado
`migration-config`, pero la pantalla se renderizaba dentro de `#libraryRoot`
mientras `#browseChild` seguía visible por encima. Para el usuario parecía que
el botón no hacía nada.

## Corrección

- Se añadió una transición explícita a la superficie de migración antes de renderizar `MigrationConfigScreen`.
- La transición oculta las superficies de Explorar, incluida `#browseChild`, y muestra `#library`.
- La misma preparación se reutiliza en `MigrateSearchScreen` y en la migración por lotes.
- El histórico centralizado no se elimina: **Atrás** desde la configuración restaura exactamente `migrate-manga-screen`.

## Regresión

`tests/migrate-manga-continue-surface-v90.test.mjs` comprueba el enlace del botón, el cambio de superficie, el estado `migration-config` y el restaurador de `migrate-manga`.

## Validación móvil

El flujo completo se comprobó en Chromium con emulación táctil de **390 × 844 px**: selección, **Continuar**, apertura de `MigrationConfigScreen` y retorno único a `migrate-manga-screen`.
