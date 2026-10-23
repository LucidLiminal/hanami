# Explorar abre Fuentes en el primer intento — v113

## Bug
Al pulsar la pestaña raíz **Explorar**, `showTab('explore')` intentaba mostrar una sección con ID `explore`. Esa sección no existe: Explorar es el contenedor lógico y su superficie inicial real es `sources`. Por eso todas las subpestañas quedaban ocultas hasta visitar Extensiones o Migrar y volver a Fuentes.

## Corrección
- La navegación calcula una única superficie visible.
- Para cualquier raíz normal usa su propio ID.
- Para la raíz Explorar usa la subpestaña solicitada, o `sources` de forma predeterminada.
- Renderiza Fuentes en la primera pulsación y mantiene activas toolbar, pestañas y acciones correspondientes.
- El mismo arreglo cubre el botón de marca, Back raíz, deep links y restauración tras recarga.

## Validación
- Regresión estática `tests/explore-sources-first-open-v113.test.mjs`.
- E2E móvil que entra desde Biblioteca y comprueba que Fuentes está visible y poblada sin pasar por otra subpestaña.
