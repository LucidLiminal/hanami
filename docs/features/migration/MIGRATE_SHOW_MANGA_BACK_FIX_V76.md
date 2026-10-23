# action_show_manga Back fix — v76

## Causa

`action_show_manga` utilizaba `HanamiOpenSearchManga`, que primero abría la fuente con `openSource()` y después añadía el detalle con `openManga()`. Esto introducía estados ajenos al flujo de migración y el regreso podía terminar en la raíz de Biblioteca.

## Solución

- El candidato se abre directamente como `migration-candidate-detail`.
- Se realiza una única operación `HanamiScreens.push`.
- El padre del detalle continúa siendo `migrate-search`.
- No se añade una pantalla `source` intermedia.
- Al restaurar `migrate-search`, se recupera explícitamente su superficie:
  - Biblioteca visible.
  - Browser de fuente oculto.
  - Barra inferior en estado de pantalla hija.
- Existe además un restaurador por evento para sesiones cuyo handler en memoria no esté disponible.

## Resultado

Desde **Mostrar obra**, Escape, Atrás del detalle, gesto móvil y browser Back ejecutan una sola transición y regresan a `MigrateSearchScreen`.