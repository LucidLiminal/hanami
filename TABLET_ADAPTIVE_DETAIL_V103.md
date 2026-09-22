# Tablet: grid adaptativo y ficha en dos paneles — v103

## Referencias de Mihon portadas

- `DisplayExtensions.kt`: activación automática de UI tablet desde 720 dp; tolerancia para landscape desde 600 dp.
- `LazyLibraryGrid.kt`: `GridCells.Adaptive(128.dp)` cuando el usuario no fija columnas.
- `MangaScreen.kt` + `TwoPanelBox.kt`: ficha/acciones/descripción en el panel inicial, capítulos en el panel final y ancho de ficha limitado a 450 dp.
- `AdaptiveSheet.kt`: sheets móviles convertidas en superficies centradas en tablet.

## Pantallas y sub-screens

- **Biblioteca:** todas las categorías reales usan grid adaptativo; los modos Lista y columnas manuales conservan su contrato.
- **Detalle desde Biblioteca:** toolbar común sobre ambos paneles; ficha, portada, acciones, notas, descripción y géneros en el panel informativo; cabecera, filtros y lista de capítulos en el panel de lectura.
- **Detalle desde Explorar y resultados de migración:** reutilizan `HanamiMangaDetail`, por lo que reciben el mismo comportamiento sin duplicar navegación.
- **Móvil:** por debajo del umbral vuelve a una única columna apilada, sin cambiar estado ni reconstruir la pantalla.

## Barras, itemOverflow y diálogos

- La toolbar normal y la contextual de capítulos abarcan ambos paneles.
- `Más` y `Descargar` continúan siendo itemOverflow anclados; no se convierten en diálogos.
- Ajustes de capítulos y los diálogos globales se centran en tablet; en móvil mantienen el sheet inferior.
- La acción flotante Empezar/Reanudar permanece asociada al panel de capítulos.

## Acciones y estados

- Añadir/quitar de Biblioteca, intervalo, tracking, WebView, notas, categorías, migración, compartir, descargas y selección múltiple funcionan sobre el mismo estado compartido.
- Los filtros y la ordenación solo rerenderizan capítulos y no desmontan la ficha.
- Cada panel tiene scroll independiente y `overscroll-behavior: contain` para evitar arrastrar accidentalmente el otro panel.

## Animaciones, efectos y gestos

- Se conservan entrada de detalle, feedback de selección, swipe configurable de capítulos, long press, pull/scroll y estados descargado/leído.
- El cambio de breakpoint es CSS y no añade una transición geométrica que pueda desplazar el objetivo táctil.
- Back, Escape y browser Back siguen realizando una sola transición mediante `HanamiScreens`; cambiar orientación no añade historial.
- El estilo visual continúa siendo Hanami: textura nocturna, borde púrpura, acento ácido y panel informativo grunge.

## Validación

- Regresión estática para estructura, breakpoints, grid, scroll y sheets.
- E2E en Chromium 1024×768: al menos seis columnas automáticas, ficha limitada a 450 px, paneles contiguos, toolbar común, scroll independiente y sheet centrado.
- El mismo E2E reduce a 390×844 y verifica el regreso a layout móvil apilado.
