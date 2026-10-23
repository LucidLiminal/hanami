# Preferencias de comportamiento de Biblioteca — v99

## Resultado

Se completó el grupo **Comportamiento** de `SettingsLibraryScreen` aplicable a Hanami. Ya no son controles decorativos: las preferencias se consumen en la ficha, Reader, sincronización de capítulos y actualización de Biblioteca.

Incluye:

1. Swipe izquierdo configurable.
2. Swipe derecho configurable.
3. Marcar duplicados como leídos al obtener capítulos nuevos.
4. Marcar duplicados como leídos al terminar un capítulo.
5. Mostrar u ocultar separadores de capítulos faltantes.

## Referencias de Mihon

- `SettingsLibraryScreen.kt`: composición del grupo Comportamiento.
- `LibraryPreferences.kt`: claves, valores iniciales y opciones `new`/`existing`.
- `SyncChaptersWithSource.kt`: herencia de lectura para duplicados recién obtenidos.
- `ReaderViewModel.kt`: propagación al terminar un duplicado existente.
- `MangaViewModel.kt` y `MissingChapters.kt`: cálculo e inserción de huecos.
- `MissingChapterCountListItem.kt`: separador visual entre capítulos.
- `MangaChapterListItem.kt`: acciones laterales configurables.

## Sub-screens

- Más.
- Más → Ajustes.
- Más → Ajustes → Biblioteca.
- Ficha de obra desde Biblioteca.
- Ficha de obra desde Explorar.
- Lista filtrada y ordenada de capítulos.
- Reader y transiciones entre capítulos.
- Actualización de una categoría.
- Actualización global de Biblioteca.

## Bars

- `SettingsLibraryScreen` usa una app bar hija con Atrás.
- App bar normal de la ficha: Atrás, descarga, filtro y Más.
- Selection AppBar de capítulos.
- Bottom action bar de selección múltiple.
- Cabecera de capítulos con total y recuento global de faltantes.
- Navbar principal oculta mientras se navega por pantallas hijas.

Las preferencias no añaden pasos al historial de `HanamiScreens`.

## `itemOverflow`

- Overflow de ficha: actualizar, categorías, migrar, compartir, notas y diagnóstico.
- Overflow de descarga global y por capítulo.
- Menús contextuales ya existentes de selección.

Las preferencias no necesitan un overflow propio. Las operaciones de descarga del swipe reutilizan el mismo motor y estados que esos menús.

## Diálogos

No se crea un diálogo nuevo. Mihon presenta estas opciones dentro de Ajustes, por lo que Hanami usa:

- Dos selectores persistentes para los swipes.
- Un grupo multiselección para duplicados.
- Un switch para indicadores faltantes.

Los diálogos de filtro, notas, tracking, categorías y descargas no cambian.

## Acciones

### Duplicados al obtener capítulos nuevos

Si una actualización recibe una URL nueva cuyo número coincide exactamente con un capítulo leído, la nueva entrada hereda `read: true` cuando está activa la opción `new`.

- Solo se consideran números reconocidos y no negativos.
- Los decimales se comparan exactamente: 12 y 12.5 no son duplicados.
- Se preservan metadatos de URLs ya conocidas.
- Se recalculan `readCount`, `unreadCount` y `totalChapters`.
- Funciona en actualización de categoría, actualización global, hidratación inicial, apertura de ficha y carga diferida.

### Duplicados existentes al terminar de leer

Al completar un capítulo en Reader, todas las entradas no leídas con el mismo número se marcan como leídas cuando está activa `existing`.

- Se actualiza `_chapterMeta`.
- Se sincronizan indicadores de Biblioteca e Historial.
- Se conserva el progreso y la política de modo incógnito existente.
- No confunde capítulos con números desconocidos.

### Capítulos faltantes

- El cálculo ignora números desconocidos.
- Los decimales se reducen al entero únicamente para detectar huecos.
- Los duplicados no aumentan el recuento.
- Se insertan separadores entre capítulos según el orden ascendente o descendente.
- También se representa el hueco anterior al primer capítulo disponible.
- Los filtros activos recalculan los separadores sobre la lista procesada, como Mihon.
- Al ocultarlos desaparecen las filas separadoras, pero la cabecera conserva el recuento global, igual que el flujo de Mihon.

## Preferencias persistentes

- `hanami-chapter-swipe-left`
- `hanami-chapter-swipe-right`
- `hanami-mark-duplicate-read`: array con `new` y/o `existing`.
- `hanami-hide-missing-chapters`: booleano.

Los valores iniciales de duplicados son ninguno y el indicador de faltantes se muestra.

## Animaciones y efectos

- Los separadores usan divisores laterales y tipografía secundaria, adaptados a la estética nocturna de Hanami.
- Las acciones swipe mantienen seguimiento del dedo, umbral de 56 px, confirmación visual y vibración opcional.
- Los cambios de lectura actualizan inmediatamente opacidad, marcador, contador e indicador de no leídos.
- `prefers-reduced-motion` continúa desactivando las transiciones de swipe.

## Gestos

- Swipe izquierdo/derecho por capítulo.
- Scroll vertical prioritario.
- Pulsación prolongada para selección y selección por rango.
- Tap para leer.
- Tap/pulsación prolongada propios del botón de descarga.
- Back, Escape y gesto Atrás mantienen una única transición.

## Archivos modificados

- `public/library-progress.js`
- `public/library.js`
- `public/manga-detail.js`
- `public/more-tab.js`
- `public/styles.css`
- `public/sw.js`
- `package.json`
- `tests/library-behavior-preferences-v99.test.mjs`
- `tests/library-behavior-preferences-v99.mobile.e2e.mjs`

## Validación

- `node --check` en todos los JavaScript modificados.
- Regresión funcional v99 superada.
- Suite completa `npm test` superada.
- E2E Chromium/Playwright móvil 390 × 844 superado: duplicado existente, recuento faltante, separador, multiselección, persistencia y ocultación.
- ZIP final verificado con `unzip -t`.
