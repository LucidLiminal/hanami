# Badges globales — v106

## Referencias de Mihon portadas

Se portó el contrato de `HomeScreen.tabBadge`, `LibraryPreferences.newShowUpdatesCount`, `LibraryUpdateJob`, `UpdatesViewModel.resetNewUpdatesCount`, `UpdatesTab` y `ExtensionManager.updatePendingUpdatesCount`. Los badges pertenecen a NavigationSuite, no a la toolbar interna de cada pantalla.

## Contadores

### Actualizar

- Acumula capítulos nuevos de varios trabajos foreground o background hasta que se visitan.
- Cada ejecución tiene token y no puede sumarse dos veces cuando el Service Worker notifica y después entrega el mismo resultado persistido.
- Entrar en Actualizar marca el contador como visto y lo reinicia, igual que el `DisposableEffect` de Mihon.
- Más → Ajustes → Biblioteca permite mostrar u ocultar el contador sin borrar la cantidad pendiente.
- El contador de la PWA (`setAppBadge`) se sincroniza cuando el navegador lo admite.

### Explorar

- Cuenta extensiones instaladas con actualización disponible en todo el catálogo.
- Se calcula al iniciar y cada vez que un repositorio, instalación, actualización o desinstalación reconstruye el catálogo.
- No depende de haber abierto Extensiones ni cambia por búsqueda, idioma, estado o filtro visual.
- Al completar una actualización desaparece automáticamente.

## Pantallas y sub-screens

- NavigationBar móvil y NavigationRail tablet.
- Biblioteca, Actualizar, Historial, Explorar y Más.
- Próximas, errores y Cola de descargas no crean contadores alternativos.
- Fuentes, Extensiones, repositorios y detalles usan el mismo contador global de Explorar.
- Los child screens, selección contextual, diálogos e itemOverflow conservan el badge del destino raíz.

## Barras, diálogos e itemOverflow

- Los badges están anclados al icono del destino en NavigationSuite.
- La toolbar de Extensiones conserva su indicador local, alimentado por el mismo total global.
- No se añadió ningún diálogo o itemOverflow: solo una preferencia booleana dentro de Ajustes de Biblioteca.
- Abrir/cerrar diálogos, sheets o menús no modifica los contadores.

## Acciones, animaciones, efectos y gestos

- Límite visual `99+`; el valor completo permanece en estado.
- Cambio de valor con `hanamiBadgePop`; `prefers-reduced-motion` lo desactiva.
- `aria-live="polite"`, `aria-atomic="true"` y descripción singular/plural específica.
- Tap, teclado, swipe, Back, Escape, resize y cambio bar/rail no duplican ni limpian accidentalmente valores.
- El estado persiste en `localStorage` y se sincroniza entre pestañas mediante el evento `storage`.

## Validación

- Regresión estructural de persistencia, deduplicación, origen de datos, preferencia, precaché y accesibilidad.
- E2E móvil/tablet: acumulación 4 + 2 + 1, rechazo del duplicado, limpieza al visitar Actualizar, ocultación sin pérdida, badge de extensiones y conservación al pasar de NavigationBar a NavigationRail.
