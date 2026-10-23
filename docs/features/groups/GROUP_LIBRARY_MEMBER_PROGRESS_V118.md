# v118 — biblioteca compartida y progreso por miembro

## Problema corregido

La pestaña **Grupos** ya no se limita a mostrar miembros y comentarios. Cada sala dispone de una biblioteca propia, independiente de la Biblioteca personal.

## Biblioteca del grupo

Cada sala puede:

- recibir recomendaciones desde la Biblioteca personal de un miembro;
- conservar fuente, URL canónica, portada, géneros y descripción;
- mostrar quién recomendó la obra;
- mostrar el motivo de la recomendación;
- abrir la ficha mediante el flujo normal de Hanami;
- iniciar la lectura con la máquina de estados existente;
- exportar e importar la estantería junto con la sala.

Las obras no se añaden automáticamente a la Biblioteca personal de los demás miembros.

Las series de la fuente Local solo se pueden abrir en dispositivos que posean esa serie local.

## Comentarios compartidos

Al abrir una obra desde la biblioteca del grupo:

1. Se activa el contexto de esa sala.
2. Se descargan sus comentarios autorizados.
3. La ficha y el lector usan la fuente y URL canónicas compartidas.
4. Los comentarios se resuelven por grupo, obra, capítulo y página.
5. Los comentarios recibidos aparecen sobre las imágenes mediante la capa implementada en v115.

## Progreso por miembro

El lector emite `hanami-reader-progress` con:

- obra y fuente;
- capítulo;
- página actual;
- cantidad de páginas;
- estado completado;
- fecha de actualización.

La biblioteca del grupo muestra para cada miembro:

- último capítulo;
- página actual;
- capítulo completado o en curso;
- última actualización.

El progreso se guarda localmente primero y se sincroniza con Supabase cuando hay sesión y conexión.

## Supabase

Después del SQL de v117 debe ejecutarse:

```text
supabase/hanami-group-library-v118.sql
```

Crea:

- `group_library_entries`;
- `group_reading_progress`;
- políticas RLS basadas en membresía;
- RPC `list_group_library`;
- RPC `recommend_group_manga`.

## Validación

- Regresión: `tests/group-library-member-progress-v118.test.mjs`
- Prueba móvil: `tests/group-library-mobile-v118.e2e.mjs`
- Viewport: 390 × 844
- Versión: `5.8.51`
- Caché: `hanami-group-library-member-progress-v118`