# Orden aleatorio estable — v102

## Referencia portada de Mihon

Se portó el contrato de `LibraryPreferences.randomSortSeed`, `SetSortModeForCategory` y `LibraryViewModel`: el modo Aleatorio genera una semilla al seleccionarse, conserva esa semilla entre recomposiciones y solo vuelve a barajar cuando el usuario pulsa Aleatorio otra vez. El icono activo es `↻`, equivalente web del icono Refresh de `LibrarySettingsDialog.kt`.

## Superficies y piezas cubiertas

- **Pantalla principal:** Biblioteca y cada pestaña de categoría real, incluida Predeterminada.
- **Subestados:** búsqueda, filtros, categoría vacía, selección múltiple y regreso desde Detalle conservan la misma permutación mientras no cambie la semilla.
- **Diálogo:** Ajustes de Biblioteca → Orden → Aleatorio. No se añadió un diálogo artificial nuevo.
- **Toolbar:** el `itemOverflow` «Abrir manga aleatorio» permanece separado: elige una obra nueva al invocarse y no altera el orden de la cuadrícula.
- **Barras:** toolbar normal, toolbar contextual, pestañas de categorías y navbar no regeneran la semilla.
- **Acciones:** seleccionar Aleatorio crea y persiste una semilla; volver a pulsarlo crea otra; elegir otro criterio recupera la ordenación correspondiente.
- **Efectos/animación:** el cambio usa el rerender normal de la cuadrícula y el icono `↻`; no se fuerza movimiento decorativo que interfiera con selección, accesibilidad o reducción de movimiento.
- **Gestos:** swipe entre categorías, pulsación prolongada, Back, Escape, búsqueda y scroll no vuelven a barajar.

## Implementación

- `public/random-sort.js`: PRNG determinista y Fisher–Yates sin mutar la lista original.
- `hanami-library-random-seed`: semilla persistida en `localStorage`.
- Se eliminó `Math.random()` del comparador, que violaba la transitividad y cambiaba resultados durante un mismo `sort()`.
- La semilla se aplica después de filtros y seguimiento, reproduciendo el barajado de la lista visible de Mihon.

## Regresión y móvil

- La prueba unitaria comprueba determinismo, nueva permutación con otra semilla, integridad del conjunto y separación de «Abrir manga aleatorio».
- La prueba móvil 390×844 comprueba persistencia tras múltiples renders y barajado explícito al pulsar de nuevo Aleatorio.
