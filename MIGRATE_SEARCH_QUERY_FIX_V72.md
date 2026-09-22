# MigrateSearch query fix — v72

## Problema

La búsqueda de `MigrateSearchScreen` enviaba correctamente `q`, pero el adaptador Olympus intentaba usar parámetros de búsqueda que la página `/series` no admite. Olympus devolvía entonces la página completa del catálogo y Hanami la interpretaba como resultados de la consulta.

## Solución

- El adaptador Olympus usa ahora el mismo catálogo público del buscador oficial: `GET /api/series/list`.
- La consulta se normaliza sin distinguir mayúsculas, signos ni acentos.
- Los resultados se filtran y ordenan antes de devolverse a `MigrateSearchScreen`.
- Se conservan la paginación de 20 resultados, las portadas y las rutas canónicas de cómic/novela.
- No se realizan solicitudes a endpoints de rastreo.

## Regresión

`tests/migrate-search-query-v72.test.mjs` comprueba que una consulta devuelve solo obras coincidentes, que no cae en el catálogo completo y que genera correctamente las URLs de cómic y novela.