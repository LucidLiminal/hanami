# Hanami v123 — administración completa de grupos

## Resumen

Las salas remotas incorporan salida voluntaria, edición sincronizada,
moderación de miembros y organización administrativa de su biblioteca.

## Funciones

- Los miembros pueden abandonar una sala desde sus detalles.
- La persona propietaria puede cambiar:
  - nombre;
  - cita;
  - imagen del banner mediante URL o archivo.
- Las imágenes se guardan en el bucket público `group-covers` y la nueva URL se
  sincroniza con todos los miembros.
- La persona propietaria puede:
  - silenciar o rehabilitar miembros;
  - asignar o retirar el rol de moderación;
  - banear y expulsar miembros.
- Una persona silenciada conserva acceso de lectura, pero no puede publicar
  comentarios ni recomendaciones.
- Una persona baneada pierde el acceso y no puede reutilizar una invitación.
- La biblioteca compartida incorpora categorías propias e independientes.
- La persona propietaria puede crear, renombrar y eliminar categorías, asignar
  recomendaciones a ellas y eliminar cualquier recomendación.
- Quien recomendó una obra también puede retirarla.

## Supabase

Ejecutar después de las migraciones v117, v118 y v120:

```text
supabase/hanami-group-administration-v123.sql
```

La migración añade estados de membresía, RPC administrativas, categorías de
biblioteca, relaciones entre categorías y recomendaciones, y el bucket
`group-covers`.

## Validación

- Regresión: `tests/group-administration-v123.test.mjs`.
- Prueba móvil: `tests/group-administration-mobile-v123.e2e.mjs`.
- Chromium móvil: 390 × 844.
- Versión: `5.8.56`.
- Caché: `hanami-group-administration-v123`.
