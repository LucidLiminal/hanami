# SnackbarHost global — port de Mihon (v111)

## Referencia
Mihon proporciona `SnackbarHostState` a Biblioteca, Actualizaciones, Historial, fichas, Fuentes y Migración mediante sus `Scaffold`. Hanami centraliza esos productores en un único host web persistente entre pantallas, manteniendo su identidad visual nocturna.

## Host y cola
- Un único `#snackbarHost` fuera de las superficies navegables.
- `HanamiSnackbar.show(message, options)` devuelve `action`, `dismissed` o `deduped`.
- Cola FIFO, un aviso visible cada vez y deduplicación mediante `dedupeKey`.
- Un duplicado activo actualiza texto y reinicia su duración.
- Duraciones: `short` 4 s, `long` 10 s, `indefinite`, milisegundos o `timeout`.
- Tipos: `info`, `success`, `warning`, `error`.
- `HanamiToast()` queda como alias compatible, sin host independiente.

## Sub-screens conectadas
- Biblioteca, selección, ficha, capítulos, categorías, notas y lector.
- Actualizar, Próximas, cola, errores por obra y background.
- Historial, reanudación, favoritos, borrado y duplicados.
- Explorar, Fuentes, búsqueda global, Extensiones, repositorios y fuente Local.
- Configuración, búsqueda, candidato, copia y finalización de migración.
- Más, Descargas, Estadísticas, Datos, Ajustes, instalación PWA y soporte.
- Tracking, actualizaciones inteligentes, portadas y almacenamiento.

## Actions
- Acción opcional síncrona o asíncrona.
- Promesa con resultado de acción o cierre.
- Si una acción falla se encola un aviso de error.
- Botón de cierre accesible.
- API: `show`, `dismiss`, `clear`, `current`, `pending`.

## Barras y layout
- En móvil aparece sobre `NavigationBar` y la safe area.
- Con `NavigationRail` compensa el ancho lateral y se centra en el contenido.
- En sub-screens, selección o lector baja al borde seguro cuando desaparece la barra raíz.
- No altera toolbar, app bar, tabs, FAB, sheets ni dos paneles.

## Diálogos e itemOverflow
- Diálogos, sheets e itemOverflow conservan prioridad y foco.
- El host no añade History API ni consume Back.
- Cambiar de pantalla o cerrar un overlay no elimina el aviso.
- Una recarga vacía cola, callbacks y acciones para no repetir operaciones antiguas.

## Animaciones, efectos y gestos
- Entrada y salida de 170 ms mediante desplazamiento, escala y opacidad.
- El siguiente aviso espera a que termine la salida.
- `prefers-reduced-motion` elimina la transición.
- Swipe horizontal superior a 72 px descarta.
- Hover o foco pausa el tiempo restante; visibilidad también pausa/reanuda.
- `pagehide` limpia temporizadores, callbacks y cola.

## Accesibilidad
- Región `aria-live="polite"` y `aria-relevant="additions text"`.
- Avisos normales: `role="status"`; errores: `role="alert"`.
- Contenido atómico, botones con foco visible y texto insertado con `textContent`.

## Validación
- Regresión `tests/global-snackbar-v111.test.mjs`.
- E2E móvil/tablet de cola, acción, deduplicación, timeout, swipe, tabs, NavigationRail, error y recarga.
