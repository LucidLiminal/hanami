# NavigationRail / tablet de Mihon — v105

## Referencias portadas

Se portó el comportamiento de `HomeScreen.kt`, `DisplayExtensions.kt`, `TabletUiMode.kt` y los `onReselect()` de LibraryTab, UpdatesTab, HistoryTab, BrowseTab y MoreTab. En Hanami sigue siendo una única PWA: `NavigationSuite` cambia entre barra inferior y rail lateral sin reiniciar ni crear un segundo layout.

## Pantallas y sub-screens cubiertas

- Pestañas raíz: Biblioteca, Actualizar, Historial, Explorar y Más.
- Sub-screens de Biblioteca y Detalle, Próximas/Descargas/errores de Actualizar, búsquedas y acciones de Historial, Fuentes/Extensiones/Migrar y sus hijos, y todos los Ajustes de Más.
- En tablet el rail permanece visible al abrir sub-screens y durante selección contextual, como `showBottomNavEvent` de Mihon.
- El Lector es fullscreen y oculta el rail.
- Diálogos, sheets, itemOverflow, toolbar, app bars y barras contextuales conservan sus propietarios; el rail no los reemplaza ni añade entradas a `HanamiScreens`.

## Modos adaptativos

Más → Ajustes → Apariencia → Interfaz para tablet:

- **Automática:** portrait desde 700 px; landscape desde 600 px.
- **Siempre:** fuerza rail.
- **Solo horizontal:** rail únicamente en landscape.
- **Nunca:** fuerza barra inferior.

El cambio es inmediato y responde a resize/orientación; no requiere recargar la PWA.

## Acciones y reselección

- Seleccionar otro destino cambia de pestaña y ejecuta una transición Fade Through de 200 ms.
- Reseleccionar Biblioteca abre Ajustes de Biblioteca.
- Reseleccionar Actualizar abre la Cola de descargas.
- Reseleccionar Historial reanuda la lectura más reciente.
- Reseleccionar Explorar abre Búsqueda global.
- Reseleccionar Más abre Ajustes.
- Back desde una pestaña raíz no crea rutas por el mero cambio bar/rail; se conserva la máquina `HanamiScreens`.

## Barras, badges, itemOverflow y diálogos

- NavigationBar inferior en móvil y NavigationRail permanente de 92 px en tablet.
- Toolbar/app bar de cada destino sigue dentro del contenido desplazado; no queda debajo del rail.
- Los itemOverflow continúan anclados a su acción de origen.
- Diálogos y sheets mantienen cierre exterior, Escape y Back.
- Badge de capítulos nuevos en Actualizar y badge de extensiones pendientes en Explorar usan datos reales, límite visual `99+` y descripción accesible.

## Animaciones, efectos, teclado y gestos

- Indicador píldora, animación de icono, ripple y estética nocturna/grunge de Hanami.
- Fade Through del contenido en 200 ms; `prefers-reduced-motion` lo elimina.
- `aria-current="page"`, etiqueta dinámica del contenedor y badges con `aria-label`.
- En rail, ↑/↓ mueve el foco y Home/End salta al primer/último destino; Enter/Espacio conservan el click nativo.
- Tap, mouse, orientación, resize y navegación por teclado realizan una sola transición.

## Validación

- Regresión estructural para modos, breakpoints, rail permanente, fullscreen, badges, reselección, teclado y animación.
- E2E 1024×768: geometría vertical, cinco destinos, contenido desplazado, badges, reselección y rail en sub-screen.
- E2E responsive: `Nunca`, `Siempre`, portrait automático 390×844 y landscape automático 844×390.
