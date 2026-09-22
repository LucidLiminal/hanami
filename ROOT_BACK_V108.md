# Back raíz — port de Mihon HomeScreen (v108)

## Referencia portada

Mihon configura `LibraryTab` como pestaña inicial de `HomeScreen` y registra `BackHandler(enabled = tabNavigator.current != LibraryTab)`. Por tanto, Back desde Actualizaciones, Historial, Explorar o Más cambia primero a Biblioteca; Back desde Biblioteca queda libre para que Android, el navegador o la PWA salgan.

## Superficies incluidas

### Pestañas raíz y barras
- **Biblioteca:** destino raíz y pestaña inicial. Su Back raíz no se consume.
- **Actualizar, Historial, Explorar y Más:** Back raíz vuelve directamente a Biblioteca.
- La regla es idéntica en **NavigationBar** móvil y **NavigationRail** de tablet.
- El cambio usa el **Material Fade Through** de contenido v107 y actualiza indicador, icono, etiqueta, badge y `aria-current`.

### Sub-screens antes de la raíz
Back conserva el orden de la máquina `HanamiScreens`: lector; detalle de Biblioteca/Explorar/candidato de migración; fuente; búsqueda global; configuración y resultados de migración; cola, próximas y errores de actualización; repositorios, detalles y preferencias de extensiones; descargas, categorías, estadísticas, datos, ajustes, ayuda, soporte, acerca de e instalación PWA. Cada superficie vuelve primero a su padre. La regla raíz solo actúa al alcanzar una pantalla `root`.

### Selección, búsqueda y estados contextuales
Antes de cambiar de raíz, Back sigue consumiendo: selección contextual de Biblioteca/Actualizar/Historial; búsqueda activa de Historial; selección de obras para migrar; estados secundarios propios de cada pestaña. Cada consumo equivale a una sola transición.

### Diálogos e itemOverflow
Los diálogos (`dialog`), sheets y confirmaciones cierran primero. Los `itemOverflow` anclados de Biblioteca, capítulos, Actualizar, Historial, Explorar/Fuentes/Extensiones/Migrar y Más también cierran antes de tocar la raíz. Toque exterior, Escape y browser/gesto Back mantienen la misma prioridad mediante `HanamiOverlays`.

### Acciones y gestos
- Botón Atrás de toolbar, Escape, browser Back y gesto Back móvil comparten la pila central.
- Cambiar de pestaña no crea una cadena entre pestañas hermanas: existe como máximo un destino no-Biblioteca sobre Biblioteca.
- Cambiar entre pestañas no-Biblioteca reemplaza ese destino.
- Pulsar Biblioteca desde otra raíz consume esa entrada y deja Biblioteca preparada para salir.
- Reseleccionar una pestaña conserva su acción propia y no activa Back raíz.

### Animación, efectos y accesibilidad
- La vuelta a Biblioteca usa Fade Through de 200 ms salvo movimiento reducido.
- No se anima la salida de la aplicación desde Biblioteca.
- Los overlays mantienen foco, cierre exterior y semántica existentes.
- La navegación activa conserva `aria-current`; el contenido en transición queda `aria-busy` y la copia saliente es inerte.

## Máquina de estado

`HanamiScreens.root(tab, handlers)` aplica la política de `HomeScreen`:
1. Biblioteca → otro root: `push` único sobre Biblioteca.
2. Root no-Biblioteca → otro root no-Biblioteca: `replace`.
3. Root no-Biblioteca → Biblioteca: `history.back()` al padre Biblioteca.
4. Biblioteca → Biblioteca: no-op con actualización del handler runtime.
5. Una sub-screen nunca es saltada por esta política.

## Validación
- Regresión estática `tests/root-back-v108.test.mjs`.
- E2E móvil/tablet para botones, Escape, browser Back, sub-screen y salida libre desde Biblioteca.
- Suite completa, `node --check`, caché v108 y ZIP verificado.
