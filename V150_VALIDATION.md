# Validación de v150

Hanami `5.24.0` · PWA `hanami-crimson-knot-v150-hnm028-r2`.

## Alcance

La administración de una sala de grupo se convierte de modal a pantalla
navegable. Conserva la edición de nombre, cita y portada, incluida la
sincronización remota y el retorno seguro al detalle de sala.

El hotfix HNM-021 unifica la versión pública de **Más**, **Ajustes** y
**Acerca de** con la versión declarada en el paquete.

El hotfix HNM-022 inicia cada pantalla y subpantalla nueva en la parte superior,
sin perder las posiciones guardadas al volver con Atrás o Adelante.

El hotfix HNM-023 reorganiza la barra de búsqueda global en filas explícitas:
Atrás, consulta, progreso y filtros quedan visibles y sin solaparse. La
consulta se ejecuta con Enter o con la acción Buscar del teclado móvil.

El hotfix HNM-024 reserva la pulsación prolongada táctil de los ítems
interactivos para Hanami: bloquea el menú contextual, la selección y el
arrastre nativos, sin afectar los campos editables ni los gestos propios.

El hotfix HNM-025 sincroniza el detalle de una obra ya montado con los cambios
de progreso de Biblioteca. Al cerrar el lector, los capítulos completados se
repintan de inmediato con su estado visual de leídos.

El hotfix HNM-026 prepara el shell estático de Biblioteca en la URL base.
Así, el primer DOM pintable y el estado de navegación de JavaScript coinciden,
sin un destello previo de Explorar.

El hotfix HNM-027 acota la supresión del clic de liberación al puntero y la
tarjeta de la pulsación prolongada. El siguiente toque real de Biblioteca no
se descarta y puede seleccionar o deseleccionar de inmediato.

El hotfix HNM-028 R2 sustituye la protección anterior limitada a `<dialog>`.
Los filtros `.md-settings`, los menús y los diálogos consumen el clic exterior
antes de cerrar, sin cierres en `pointerdown`/`pointerup` ni temporizadores.
La observación de mutaciones se limita a cambios relevantes para las capas.
La incidencia permanece pendiente de confirmación en el dispositivo original.

## Resultados

| Comprobación | Resultado |
| --- | --- |
| `npm test` | 131 PASS |
| `npm run test:e2e:group-admin-screen` | PASS |
| `npm run test:e2e:about-version-hnm021` | PASS |
| `npm run test:e2e:screen-scroll-hnm022` | PASS |
| `npm run test:e2e:global-search-toolbar-hnm023` | PASS |
| `npm run test:e2e:mobile-native-longpress-hnm024` | PASS |
| `npm run test:e2e:detail-read-state-hnm025` | PASS |
| `npm run test:e2e:initial-library-shell-hnm026` | PASS |
| `npm run test:e2e:library-selection-first-tap-hnm027` | PASS |
| `npm run test:e2e:modal-backdrop-target-guard-hnm028` | PASS: Chromium táctil 390 × 844 y escritorio 1280 × 900 |
| `npm run test:e2e:modal-update-hnm028` | PASS: PWA previa, actualización, offline y conservación de cachés de datos válidos |
| `npm run test:e2e:music-session` | PASS |
| 40 cambios de clase ajenos a las capas | 0 barridos completos (40 con el código anterior) |
| `npm run test:e2e:reader-actions-hnm020` | 22 PASS |
| Sintaxis de `reading-groups.js` | PASS |
| Sintaxis de `app-version.js`, `more-tab.js`, `navigation.js`, `screen-history.js`, `app.js`, `deep-links.js`, `mobile-interaction-guard.js` y `manga-detail.js` | PASS |
| Validación visual móvil 390 × 844 | PASS |

## Entrega

- Versión de paquete: `5.24.0`.
- Identificador de caché PWA: `hanami-crimson-knot-v150-hnm028-r2`.
- Documento de cambio: `GROUP_ADMINISTRATION_SCREEN_V150.md`.
- Documento del hotfix: `ABOUT_VERSION_HNM021.md`.
- Documento del hotfix: `SCREEN_SCROLL_HNM022.md`.
- Documento del hotfix: `GLOBAL_SEARCH_TOOLBAR_HNM023.md`.
- Documento del hotfix: `INITIAL_LIBRARY_SHELL_HNM026.md`.
- Documento del hotfix: `LIBRARY_SELECTION_FIRST_TAP_HNM027.md`.
- Documento del hotfix: `MODAL_BACKDROP_TARGET_GUARD_HNM028.md`.
- Documento del hotfix: `MOBILE_NATIVE_LONGPRESS_HNM024.md`.
- Documento del hotfix: `DETAIL_READ_STATE_HNM025.md`.
- No hay migraciones SQL nuevas.
## Límites y comprobaciones que no pasan

- La misma nueva E2E falla con el `overlay-dismiss.js` del ZIP anterior:
  tocar Atrás fuera de los filtros también desmonta la ficha. En R2 conserva
  la ficha y consume todos los eventos del botón inferior.
- `npm run test:e2e:back` no pasa: la suite histórica v147 registra
  «La copia previa sigue en curso» durante el arranque del subsistema de
  copias. Se repitió contra el código anterior y contra R2; ambas ejecuciones
  produjeron 59 escenarios fallidos con ese diagnóstico. No se etiqueta PASS
  ni se modifica aquí el subsistema de copias. Las pruebas específicas de
  Atrás/Escape de HNM-028 y las otras regresiones enumeradas sí pasan.
- No hay WebKit/Safari ni Firefox instalados en el entorno de prueba. Falta
  confirmar el resultado en el navegador y dispositivo originales, así como
  cualquier mejora de rendimiento de extremo a extremo.
- Ninguna prueba local implica que esta revisión ya esté desplegada.
