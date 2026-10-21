# HNM-017-main · Biblioteca desde la navegación principal

Proyecto: **Hanami 5.23.0 (v149)**, rama `main`. No requiere migraciones SQL
ni cambios de configuración.

## Problema reproducido

En una ficha o subpantalla de Biblioteca visible con `nav-rail`, el botón
activo de Biblioteca de `main-nav` seguía estando disponible. El controlador
global trataba cualquier pulsación de una Biblioteca ya activa como un reselect
de raíz y abría el diálogo de Ajustes, aunque la persona aún no estuviera en
`libraryRoot`.

## Corrección

- El reselect de Biblioteca distingue la raíz de una pantalla hija mediante el
  estado de `HanamiScreens` y `nav-child`.
- Si existe una pantalla hija, el mismo botón llama a
  `showTab('library', 'push')`, restaura la superficie de Biblioteca, cancela
  la ficha pendiente y renderiza `libraryRoot`.
- El diálogo de Ajustes continúa abriéndose únicamente al volver a pulsar
  Biblioteca desde la raíz.
- La ruta conserva el historial de pantallas y no afecta los reselects de
  Explorar, Actualizaciones, Historial o Más.

## Archivos modificados

- `public/app.js`
- `tests/library-main-nav-root-hnm017.test.mjs`
- `tests/reader-page-actions-hnm020.e2e.mjs`
- `package.json`
- Este documento.

## Validación

- `npm run test:e2e:library-nav-hnm017` crea una ficha de Biblioteca real,
  activa `nav-rail` y verifica que el primer toque vuelve a `libraryRoot` sin
  abrir el modal; el segundo toque desde la raíz abre Ajustes.
- `npm test`: **123 comprobaciones PASS**, incluida una regresión estática para
  la bifurcación entre hijo y raíz.
- `npm run test:e2e:reader-actions-hnm020`: **21 escenarios PASS** en Chromium,
  incluidos HNM-017 y las regresiones del lector existentes.

La validación local no sustituye las pruebas en dispositivos físicos ni el
despliegue en producción.