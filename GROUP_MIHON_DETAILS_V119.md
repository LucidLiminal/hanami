# v119 — ficha Mihon Details para la biblioteca del grupo

## Corrección

Las recomendaciones de la biblioteca compartida ya no utilizan la ruta de ficha canónica de Explorar.

Al pulsar **Ver obra** o **Leer**, Hanami abre una pantalla dedicada:

```text
group-manga-detail
```

Esta pantalla:

- obtiene metadatos y capítulos mediante el adaptador de la fuente;
- monta directamente `HanamiMangaDetail`;
- conserva las barras, acciones, capítulos y estados de Mihon Details;
- usa `HanamiScreens.push()` y una restauración tipada;
- vuelve a la sala consumiendo una sola transición;
- abre `HanamiReader` desde sus capítulos;
- mantiene el contexto del grupo para comentarios y progreso;
- no pasa por `HanamiAppOpenDeepManga` ni por la ficha canónica de Explorar.

## Navegación

```text
Grupos
└── Sala
    └── Biblioteca compartida
        └── Mihon Details
            └── Reader
```

La ficha puede restaurarse después de una recarga mediante `groupId` y `entryId`.

## Validación

- Regresión: `tests/group-mihon-details-v119.test.mjs`
- Prueba móvil: `tests/group-mihon-details-mobile-v119.e2e.mjs`
- Viewport: 390 × 844
- Versión: `5.8.52`
- Caché: `hanami-group-mihon-details-v119`