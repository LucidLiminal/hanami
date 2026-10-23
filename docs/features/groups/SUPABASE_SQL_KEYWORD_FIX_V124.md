# Hanami v124 — corrección de migración Supabase

## Corrección

La migración administrativa v123 utilizaba `position` como nombre de columna
en la firma de retorno de `list_group_library_categories`. PostgreSQL interpreta
esa palabra como reservada en ese contexto y detenía la ejecución.

La migración completa corregida es:

```text
supabase/hanami-group-administration-v124.sql
```

Usa **v124 en lugar de v123**. La columna se expone ahora como `sort_order`;
el cliente conserva compatibilidad con ambas claves.

## Validación

- Migración analizada en dialecto PostgreSQL.
- Regresión: `tests/supabase-sql-keyword-v124.test.mjs`.
- Versión: `5.8.57`.
- Caché: `hanami-supabase-sql-keyword-v124`.
