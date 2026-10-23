# HNM-017-main · Raíz de pestaña desde la navegación principal

Proyecto: **Hanami 5.23.0 (v149)**, rama `main`. No requiere migraciones SQL
ni cambios de configuración.

## Problema reproducido

En una ficha o subpantalla visible con `nav-rail`, el botón de la pestaña
activa de `main-nav` seguía estando disponible. El controlador global ejecutaba
directamente el reselect propio de la pestaña, aunque la persona aún no
estuviera en su raíz:

- Biblioteca abría Ajustes en vez de `libraryRoot`.
- Actualizar abría Descargas.
- Explorar abría la búsqueda global.
- Más abría Ajustes.
- Historial intentaba reanudar la última lectura.

## Corrección

- El controlador obtiene una vez la pestaña, la pantalla actual y el estado
  `nav-child`.
- Si la pestaña activa tiene una pantalla hija, llama primero a
  `showTab(tab, 'push')`; restaura la superficie raíz correcta antes de ejecutar
  cualquier reselect específico.
- Biblioteca por tanto cancela la ficha pendiente y renderiza `libraryRoot`.
  Los comportamientos de reselect de raíz siguen disponibles solo después de
  volver a tocar la pestaña ya restaurada.
- La ruta conserva el historial de pantallas y cubre Biblioteca, Actualizar,
  Historial, Explorar y Más de forma uniforme.

## Archivos modificados

- `public/app.js`
- `tests/library-main-nav-root-hnm017.test.mjs`
- `tests/reader-page-actions-hnm020.e2e.mjs`
- `package.json`
- Este documento.

## Validación

- `npm run test:e2e:library-nav-hnm017` crea una ficha real de Biblioteca,
  activa `nav-rail` y verifica que el primer toque vuelve a `libraryRoot` sin
  abrir el modal; el segundo toque desde la raíz abre Ajustes. También simula
  una pantalla hija para Actualizar, Historial, Explorar y Más y verifica que
  las cuatro vuelven a su superficie raíz.
- `npm test`: **123 comprobaciones PASS**, incluida una regresión estática para
  la bifurcación entre hijo y raíz.
- `npm run test:e2e:reader-actions-hnm020`: **22 escenarios PASS** en Chromium,
  incluidos los dos escenarios HNM-017 y las regresiones del lector existentes.

La validación local no sustituye las pruebas en dispositivos físicos ni el
despliegue en producción.