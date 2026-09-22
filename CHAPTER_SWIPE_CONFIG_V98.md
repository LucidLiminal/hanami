# Swipe de capítulos configurable — v98

## Resultado

La lista de capítulos de la ficha de obra porta las acciones laterales de Mihon.
Cada dirección se configura independientemente desde **Más → Ajustes → Biblioteca → Comportamiento**.
Los valores iniciales respetan Mihon: izquierda marca el capítulo y derecha alterna leído/no leído.

## Referencias de Mihon

- `LibraryPreferences.kt`: modelo `ChapterSwipeAction` y valores predeterminados.
- `SettingsLibraryScreen.kt`: preferencias independientes para izquierda y derecha.
- `MangaChapterListItem.kt`: caja deslizable, iconos dependientes del estado y umbral de 56 dp.
- `MangaViewModel.kt`: semántica ToggleRead, ToggleBookmark y Download según su estado.

## Sub-screens

- Ficha de obra de Biblioteca.
- Ficha de obra abierta desde Explorar.
- Lista filtrada/ordenada de capítulos dentro de la ficha.
- Más → Ajustes.
- Más → Ajustes → Biblioteca, sección Comportamiento.

No se crea una pantalla intermedia: la configuración forma parte de `SettingsLibraryScreen` y la acción ocurre en la propia fila.

## Bars

- App bar normal de la ficha: Atrás, Descargar, Filtrar y Más.
- App bar contextual de selección de capítulos.
- Bottom action bar de selección múltiple.
- App bar de Ajustes → Biblioteca.
- Navbar principal: se oculta en las pantallas hijas como antes.

El swipe no modifica el historial centralizado de pantallas ni consume Back.

## `itemOverflow`

- Overflow de ficha: actualizar, categorías, migrar, compartir, notas y diagnóstico.
- Overflow de descarga de capítulo: descargar ahora, cancelar o eliminar.
- Overflow de descarga global: siguiente, 5/10/25 y todos sin leer.

El gesto reutiliza exactamente las operaciones reales de descarga. No abre un overflow adicional.

## Diálogos

No se necesita un diálogo nuevo. Los selectores de izquierda y derecha son preferencias persistentes dentro de Ajustes. Los diálogos existentes de ficha, filtros, notas, tracking y confirmaciones mantienen su comportamiento.

## Acciones configurables por lado

- **Desactivado:** conserva el scroll vertical y no desplaza la fila.
- **Marcar capítulo:** alterna bookmark y lo sincroniza con `_chapterMeta` y Biblioteca.
- **Marcar como leído:** alterna leído/no leído, reinicia el progreso local del capítulo y recalcula `readCount`, `unreadCount` e indicador de Biblioteca.
- **Descargar:**
  - no descargado/error → descarga prioritaria inmediata;
  - en cola/descargando → cancela;
  - descargado → elimina las páginas offline.

Claves persistentes:

- `hanami-chapter-swipe-left`
- `hanami-chapter-swipe-right`

## Animaciones y efectos

- La fila sigue el dedo mediante `translate3d`.
- Antes del umbral se muestra una superficie nocturna neutra.
- Al alcanzar 56 px, el fondo cambia a morado y confirma que la acción está preparada.
- Al completar, el estado pasa brevemente al verde ácido antes de actualizar la fila.
- Icono y texto cambian según la operación inversa disponible: leer/desleer, marcar/desmarcar, descargar/cancelar/eliminar.
- Vibración breve al confirmar, cuando el navegador la permite.
- `prefers-reduced-motion` elimina las transiciones.

## Gestos y conflictos resueltos

- Swipe izquierdo y derecho independientes.
- Umbral horizontal de 56 px.
- El gesto solo comienza cuando domina claramente al desplazamiento vertical.
- `touch-action: pan-y` conserva el scroll de la ficha.
- Mover más de 10 px cancela la pulsación prolongada.
- La pulsación prolongada continúa activando selección por rango.
- El swipe queda deshabilitado durante selección contextual.
- El botón de descarga conserva tap y pulsación prolongada propios y no inicia swipe.
- El click sintético posterior al gesto se consume una sola vez y nunca abre el lector accidentalmente.
- `pointercancel` restaura fila, clases y anclajes transitorios.

## Archivos modificados

- `public/manga-detail.js`
- `public/more-tab.js`
- `public/styles.css`
- `public/sw.js`
- `package.json`
- `tests/chapter-swipe-config-v98.test.mjs`
- `tests/chapter-swipe-config-v98.mobile.e2e.mjs`
- Ajuste compatible de `tests/chapter-longpress-release.test.mjs`.

## Validación

- `node --check` en todos los JavaScript modificados.
- Regresión específica v98 superada.
- Suite completa `npm test` superada.
- E2E Chromium/Playwright móvil 390 × 844: bookmark a la izquierda, leído a la derecha, sincronización de Biblioteca, persistencia de preferencias y lado desactivado.
- ZIP final verificado con `unzip -t`.
