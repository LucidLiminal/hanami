# Read chapter swipe visibility — v114

## Problema

`.md-chapter.read` reducía la opacidad de toda la fila. Como la acción de swipe vive detrás de esa fila, su texto se transparentaba incluso sin realizar el gesto.

## Corrección

- Se eliminó la opacidad de las filas leídas y de sus estados de selección.
- El estado leído ahora se distingue con colores oscuros y opacos para fondo, título, metadatos e indicador.
- Se conservaron fondos alternos opacos y la selección mantiene el fondo púrpura.
- La acción situada detrás solo aparece cuando la fila se desplaza durante el swipe.

## Regresión

`tests/read-chapter-swipe-visibility-v114.test.mjs` impide reintroducir opacidad en `.md-chapter.read` y comprueba la paleta opaca.