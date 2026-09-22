# Hanami v79 — Pestañas reales de categorías

- Se eliminó la pestaña sintética **Todo** y su atributo `data-lib-tab="all"`.
- `lib-tabs` muestra exclusivamente las categorías reales, incluida **Predeterminada**.
- **Predeterminada** pasa a ser la categoría inicial de la Biblioteca.
- El estado persistido `all` de versiones anteriores se migra automáticamente a `default`.
- Si la categoría activa dejó de existir, la Biblioteca vuelve de forma segura a **Predeterminada**.
- Actualizar categoría y abrir una obra aleatoria respetan la categoría activa; la actualización global sigue actuando sobre toda la Biblioteca.
