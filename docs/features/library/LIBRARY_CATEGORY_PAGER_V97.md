# LibraryPager sin categoría sintética `all` — v97

## Resultado

Biblioteca ya no crea una página interna `all`. El pager, los tabs, los gestos,
los contadores y la categoría activa utilizan exactamente la misma lista de
categorías reales: Predeterminada y las categorías creadas por el usuario.

## Sub-screens

- Biblioteca por categoría.
- Estado vacío de una categoría.
- Estado vacío por búsqueda.
- Estado vacío por filtros.
- Búsqueda global desde un resultado vacío.
- Gestión y asignación de categorías.
- Ficha de obra y lector, conservando la categoría activa al volver.

## Bars

- `LibraryToolbar`: Biblioteca, Buscar, Filtrar y Más.
- `LibraryTabs`: fila desplazable formada únicamente por categorías reales.
- Barra contextual de selección.
- Barra inferior con Categorías, Leído, No leído, Descargar y Más.
- Navbar principal sin cambios.

## `itemOverflow`

- Toolbar: actualizar categoría, actualizar biblioteca y obra aleatoria.
- Barra contextual: Migrar y Borrar.
- Descargas: siguiente, próximos 5/10/25, no leídos y favoritos.

Ningún overflow introduce una vista “Todos”.

## Diálogos

- `LibrarySettingsDialog`: filtros, orden y visualización.
- Gestión y asignación de categorías.
- Confirmación de borrado.

Los diálogos operan sobre la categoría activa real. La actualización global
sigue existiendo como acción explícita, no como una categoría.

## Acciones

- Seleccionar una categoría mediante tab.
- Actualizar solo la categoría activa.
- Actualizar toda la biblioteca desde el overflow.
- Buscar, filtrar, ordenar y abrir una obra aleatoria dentro de la categoría.
- Mantener selección contextual al cambiar de categoría, como el estado global
  de selección de Mihon.
- Volver a Predeterminada si la categoría activa deja de existir.
- Reasignar a Predeterminada cualquier obra que pierda todas sus categorías.
- Migrar una instalación antigua cuyo valor guardado fuera `all`.

## Animaciones y efectos

- Entrada lateral según la dirección del cambio de página.
- Centrado automático del tab activo.
- Scroll-snap horizontal en la fila de categorías.
- Indicador y contador del tab activo.
- `prefers-reduced-motion` elimina animación y desplazamiento suave.

## Gestos y accesibilidad

- Swipe izquierda/derecha entre categorías contiguas.
- El gesto funciona aunque la categoría esté vacía.
- Los límites no crean páginas adicionales.
- Pull-to-refresh vertical continúa actualizando la categoría activa.
- Flechas izquierda/derecha, Home y End navegan los tabs.
- Roles `tablist` y `tab`, `aria-selected` y roving `tabindex`.
- Back no consume una transición al cambiar de categoría.

## Correcciones técnicas

- `orderedCategories()` es la única fuente de orden del pager y tabs.
- Ordenar ya no muta accidentalmente `L.categories`.
- `sync()` dejó de disparar un guardado/evento recursivo en cada render.
- Biblioteca ignora su propio evento `library-save`, evitando un segundo render
  que anulaba la animación direccional.
- Los estados vacíos permanecen dentro de `.library-pager`.
- La actualización por categoría usa el proveedor común y funciona también con
  la fuente Local.
## Validación

- `node --check` en todos los JavaScript modificados.
- Suite completa `npm test` superada.
- Regresión específica `library-category-pager-v97.test.mjs` superada.
- E2E móvil 390 × 844 con Chromium/Playwright: migración del estado `all`, swipe,
  teclado, categoría vacía y límites sin página fantasma.
- ZIP final verificado con `unzip -t`.
