# Explore App Bar v85

## Cambio

- Se retiraron de la pestaña **Explorar** la cabecera de marca «Hanami» y el hero decorativo.
- La raíz de Explorar ahora empieza con una `destination-appbar`, igual que **Actualizaciones**.
- La toolbar conserva el título **Explorar** mientras cambia sus acciones según la subpestaña:
  - **Fuentes:** búsqueda global y filtros.
  - **Extensiones:** contador de actualizaciones, búsqueda, actualización y overflow.
  - **Migrar:** ayuda y controles de ordenación.
- Las pestañas **Fuentes**, **Extensiones** y **Migrar** se sitúan inmediatamente debajo de la toolbar.
- Las pantallas hijas y la exploración de una fuente ocultan este chrome y mantienen el historial centralizado de `HanamiScreens`.
- Se mantuvo la identidad nocturna, grunge y personal de Hanami, usando la composición de **Actualizaciones** como referencia visual interna.

## Regresión

`tests/explore-appbar-v85.test.mjs` comprueba la nueva jerarquía, las acciones contextuales, la retirada de las toolbars duplicadas y la ocultación del hero/cabecera en Explorar.
