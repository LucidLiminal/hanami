# v116 — Grupos de lectura y comentarios preparados para sincronización

## Nueva pestaña principal

Se añadió **Grupos** como sexto destino de navegación principal y de `NavigationRail`.

La dirección visual parte del prototipo `hanami-editorial.zip`:

- composición editorial neo-noir;
- sala activa con presencia y frase compartida;
- tarjetas de habitaciones con fotografía nocturna;
- jerarquía tipográfica brutalista;
- paleta original de Hanami;
- adaptación específica para móvil y tablet.

La pestaña permite:

- crear salas locales;
- activar una sala;
- editar el perfil local;
- abrir una subpantalla de sala mediante `HanamiScreens.push()`;
- copiar el código de invitación;
- unirse mediante código;
- exportar e importar una sala con sus comentarios.

## Comentarios v2

Los comentarios dejan de utilizar `localStorage` como almacenamiento principal.

Nueva base:

```text
IndexedDB: hanami-reader-comments-v2
├── comments
└── syncQueue
```

Cada comentario incluye:

- `authorId`;
- `groupId`;
- `pageKey`;
- `revision`;
- `syncState`;
- coordenadas, tamaño, texto y adjunto;
- fechas de creación, modificación o eliminación.

Cada creación, modificación o eliminación genera una operación pendiente en `syncQueue`. La interfaz continúa siendo local-first y no espera a un servidor.

## Migración

Al iniciar:

1. Se abre IndexedDB.
2. Se leen los comentarios v2.
3. Se migra automáticamente `hanami-reader-comments-v1`.
4. Los comentarios migrados se asignan a `local-room`.
5. Solo después de persistirlos se elimina la clave heredada.

## Intercambio portátil

Una sala puede exportarse como:

```text
hanami-<nombre-de-sala>.json
```

El archivo contiene la definición del grupo y sus comentarios. La importación fusiona por `id` y `revision`, preparando los registros importados para una sincronización remota posterior.

## Límites

v116 todavía no conecta un backend multiusuario. Los códigos de invitación y la presencia son locales. IndexedDB, identidades, grupos, revisiones y cola offline constituyen la base que utilizará el futuro adaptador remoto.

## Validación

- Regresión: `tests/reading-groups-offline-sync-v116.test.mjs`
- Prueba móvil: `tests/reading-groups-mobile-v116.e2e.mjs`
- Viewport móvil: 390 × 844
- Caché: `hanami-reading-groups-offline-sync-v116`
- Versión: `5.8.49`