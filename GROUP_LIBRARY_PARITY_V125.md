# Hanami v125 — biblioteca de grupo como extensión de Biblioteca

## Resumen

Las bibliotecas compartidas dejan de mantener controles paralelos. Pestañas,
categorías, selección contextual, navegación por teclado, swipe y pull-to-
refresh reutilizan ahora los contratos de la Biblioteca personal.

## Cambios

- `group-library-categories` usa exactamente la estructura visual y accesible
  de `lib-tabs`.
- La categoría inicial es **Predeterminada**; ya no existe la pestaña artificial
  **Todas**.
- Crear, renombrar, eliminar y reordenar categorías reutiliza las subpantallas
  de `categories.js`.
- La asignación múltiple reutiliza la misma subpantalla triestado de categorías.
- Eliminado `library-group-entry-more`.
- Una pulsación prolongada sobre una recomendación inicia selección.
- La selección usa `selection-topbar` y `selection-bottombar` compartidas.
- Seleccionar todo, invertir, asignar categorías, eliminar, Escape y Atrás
  siguen el mismo ciclo que la Biblioteca personal.
- Las pestañas compartidas admiten teclado, swipe horizontal y pull-to-refresh.
- La migración v125 añade reordenación persistente de categorías de grupo.

## Supabase

Usar la migración completa:

```text
supabase/hanami-library-parity-v125.sql
```

## Validación

- Regresión: `tests/group-library-parity-v125.test.mjs`.
- Prueba móvil: `tests/group-library-parity-mobile-v125.e2e.mjs`.
- Chromium móvil: 390 × 844.
- Versión: `5.8.58`.
- Caché: `hanami-group-library-parity-v125`.
