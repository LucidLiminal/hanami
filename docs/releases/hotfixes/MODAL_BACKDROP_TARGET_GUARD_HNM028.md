# HNM-028 R2 — Cierre exterior sin activación subyacente

Hanami `5.24.0` · rama `main` · revisión `hnm028-r2` · caché PWA
`hanami-crimson-knot-v150-hnm028-r2`.

Estado: corrección candidata comprobada localmente; incidencia reabierta y
pendiente de confirmación en el dispositivo del reporte. Esta entrega
sustituye `Hanami-5.24.0-HNM-028-modal-backdrop-guard-fix.zip`.

## Reproducción y error de la primera solución

Con un toque real en Chromium móvil, los filtros `.md-settings` de una ficha
se cerraban al tocar Atrás, pero el mismo gesto también cerraba la ficha. Un
menú `.lib-toolbar-menu` abierto dejaba activar la pestaña Explorar inferior.
Se registraron `pointerup` y `click` con `isTrusted: true` en esos controles.

La primera solución solo reservaba el puntero de los `<dialog>`. Los paneles
no nativos conservaban el cierre temprano en `pointerdown`. Además, su prueba
E2E despachaba eventos sintéticos contra un diálogo genérico: no ejercitaba
el panel real de filtrado. El guard de clic se retiraba con un temporizador
de 0 ms, de modo que tampoco era una frontera fiable para clics diferidos.

## Enfoque nuevo

`public/overlay-dismiss.js` mantiene la capa activa hasta que el clic exterior
se haya cancelado en captura. Solo después pide cerrar mediante el historial.

- La misma regla cubre todos los selectores ya gestionados: filtros, menús,
  hojas del lector y diálogos; no solo elementos nativos `<dialog>`.
- Los eventos exteriores `pointerdown` y `pointerup` no alcanzan sus destinos
  inferiores, pero tampoco cierran la capa antes del clic terminal.
- Se cancela el clic antes de pedir el cierre. No se necesita una ventana de
  tiempo ni un bloqueo que sobreviva al cierre; el siguiente toque funciona.
- Un gesto que cruza entre interior y exterior se consume sin ejecutar una
  acción ni cerrar; `pointercancel` limpia el gesto.
- El padding del diálogo se distingue del backdrop por sus coordenadas. Las
  acciones internas, Escape, Atrás y el propietario del historial del
  reproductor musical completo conservan sus flujos.

## Trabajo de renderizado

El observador anterior ejecutaba una consulta de todos los overlays del
documento ante cualquier mutación de clase o de hijos, incluso en tarjetas,
indicadores y animaciones ajenas a las capas.

R2 solo reconcilia la pila al detectar paneles añadidos/eliminados, cambios
en un overlay o cambios de visibilidad de sus ancestros. Se contemplan
`class`, `open`, `hidden` e `inert`. En un mismo ensayo de 40 cambios de clase
no relacionados se midieron 40 barridos completos antes y 0 con R2, tanto en
la E2E móvil como en escritorio. Esto verifica la eliminación de ese trabajo
innecesario; no demuestra por sí solo una aceleración global de la app.

## Actualización PWA

Se cambia únicamente el identificador de caché del shell a
`hanami-crimson-knot-v150-hnm028-r2`. La versión pública sigue en `5.24.0`.
La revisión activa se puede verificar con `window.HanamiOverlays.revision`.

La E2E de actualización instala primero un worker con el caché anterior,
guarda una página con manifiesto de descarga válido y una portada, actualiza
el worker normalmente y arranca R2 sin conexión. Comprueba que los cachés de
capítulos y portadas se conservan. No requiere SQL, borrar datos locales ni
reinstalar la PWA.

## Validación

- `node tests/modal-backdrop-target-guard-hnm028.test.mjs`: pruebas de conducta
  en VM, no búsquedas de cadenas en el código. Todos los tipos de capa, clic
  diferido, padding, cruces, cancelación, siguiente toque, mutaciones relevantes
  e irrelevantes y exclusión del reproductor completo.
- `npm run test:e2e:modal-backdrop-target-guard-hnm028`: PASS en Chromium
  táctil 390 × 844 y escritorio 1280 × 900. Abre los filtros reales, usa sus
  acciones internas y toca botones inferiores con eventos de navegador,
  incluyendo una pulsación mantenida. Verifica cero activaciones inferiores,
  el primer toque posterior, Escape, Atrás y aperturas/cierres repetidos.
- Prueba red/green: la misma E2E, con el módulo del ZIP anterior, falla porque
  el toque exterior cierra también la ficha; con R2 pasa.
- `npm run test:e2e:modal-update-hnm028`: PASS con actualización y arranque
  offline, manteniendo la página descargada registrada y la portada.
- `npm test`: 131 líneas PASS, sin fallos.
- Diez scripts E2E existentes pasan: administración de salas, versión Acerca
  de, scroll, búsqueda global, long press nativo, progreso al volver, arranque
  Biblioteca, primer toque de selección, acciones del lector (22 casos) y
  sesión musical.

## Limitaciones explícitas

La suite histórica `test:e2e:back` no pasa por errores del guard de copias
«La copia previa sigue en curso». Se contrastó con el ZIP anterior: también
falla, con 59 escenarios en ambas ejecuciones. No se corrige aquí ese
subsistema ni se presenta esa suite como validada. Las comprobaciones de
Atrás y Escape específicas de esta revisión sí pasan.

No se ha probado Safari/WebKit, Firefox ni el dispositivo original. Falta
validar el despliegue y la percepción de rendimiento en ese entorno. No se
da por cerrado HNM-028 únicamente por las pruebas locales.

## Entrega

`Hanami-5.24.0-HNM-028-R2-overlay-click-boundary-fix.zip` contiene el proyecto
completo sin carpeta contenedora, las pruebas revisadas y el manifiesto
`../../../checksums/current/V150_FILE_MANIFEST.sha256`. La entrega se comprueba por CRC, manifiesto SHA-256
y ejecución de pruebas tras extraer el ZIP.
