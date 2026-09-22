# MoreTab — port web completo v91

## Referencias revisadas

- `MoreTab.kt` y `MoreScreen.kt`.
- `DownloadQueueScreen.kt` y su ViewModel.
- `CategoryScreen.kt`, lista reordenable y diálogos de categoría.
- `StatsScreen.kt`, `StatsScreenContent.kt` y modelos de estadísticas.
- `SettingsScreen.kt`, `SettingsMainScreen.kt` y destinos de ajustes.
- `SettingsDataScreen.kt`, pantallas de copia y restauración.
- `SupportUsScreen.kt` y `AboutScreen.kt`.

## Pantalla principal

- **Top app bar:** título «Más» y conservación de la barra de navegación principal.
- **Cabecera Hanami:** sustituye el logo de Mihon sin copiar su identidad visual.
- **Interruptores globales:** Solo descargados y Modo incógnito, persistentes en el navegador.
- **Destinos:** Cola de descargas, Categorías, Estadísticas, Datos y almacenamiento, Ajustes, Apoyar Hanami, Acerca de y Ayuda.
- **Reselección de Más:** abre Ajustes, igual que `MoreTab.onReselect()`.

## Sub-screens portadas

1. **Cola de descargas**
   - Estado detenida, pausada o activa y número de capítulos pendientes.
   - Lista con portada, fuente, progreso y cancelación por obra.
   - FAB Pausar/Reanudar.
   - Reordenación con arrastre de ratón o gesto táctil.
   - Orden manual, por título, fuente o cantidad.
2. **Categorías**
   - Lista, conteo, categoría Predeterminada protegida y FAB Añadir.
   - Renombrar y eliminar mediante los diálogos ya conectados a la biblioteca.
   - Reordenación por drag-and-drop y arrastre táctil.
3. **Estadísticas**
   - Resumen, obras, capítulos y seguimiento.
   - Totales derivados de la biblioteca, metadatos de capítulos, descargas y trackers.
4. **Datos y almacenamiento**
   - Reutiliza el port de `SettingsDataScreen`: copias, restauración, automáticas, uso, caché y CSV.
5. **Ajustes**
   - App bar con búsqueda.
   - Cada sección es una subpantalla real; Atrás vuelve primero a la lista de Ajustes.
   - Destinos Apariencia, Biblioteca, Lector, Descargas, Seguimiento, Explorar, Datos, Seguridad, Avanzado y Acerca de.
   - Ajustes compatibles persistentes; enlaces a Categorías y Extensiones.
6. **Apoyar Hanami**, **Acerca de** y **Ayuda**
   - Contenido adaptado al proyecto web, sin enlaces de donación o identidad de Mihon.
   - Contrato de extensiones y solución de problemas documentados dentro de la aplicación.

## ItemOverflow

- Menú de orden de la cola anclado a la app bar.
- Menú Más con invertir orden y cancelar todas.
- Se cierran al seleccionar una opción o tocar fuera.
- «Cancelar todas» permanece como acción destructiva con confirmación, no como ejecución directa.

## Diálogos

- Confirmación para vaciar la cola.
- Crear, renombrar y eliminar categorías.
- Diálogos de copias/restauración y limpieza heredados de Datos y almacenamiento.

## Acciones, estados y efectos

- Pausar/reanudar, ordenar, reordenar y cancelar descargas.
- Crear, renombrar, eliminar y reordenar categorías.
- Búsqueda de ajustes y cambios persistentes.
- El filtro Solo descargados se aplica inmediatamente a Biblioteca.
- Cambios de categorías y biblioteca actualizan las pantallas conectadas.
- Estados vacíos y progreso visibles.

## Navegación, animaciones y gestos

- Todas las subpantallas usan `HanamiScreens.push()` y restauradores registrados.
- Escape, browser Back, gesto móvil y flecha Atrás realizan una sola transición.
- Entrada atenuada de la raíz, transición lateral de subpantallas y aparición del FAB.
- `prefers-reduced-motion` desactiva las animaciones.
- Drag-and-drop de escritorio y arrastre táctil para cola y categorías.
- Diseño mobile-first de 390 px y límite de lectura ampliado en escritorio.

## Validación

- `node --check` superado en todos los JavaScript modificados.
- Suite completa `npm test` superada.
- E2E Chromium táctil **390 × 844 px** superado: raíz, interruptor Solo descargados, Cola, itemOverflow, pausa, Atrás, reselección de Más, Ajustes, Apariencia y retorno a Ajustes.
