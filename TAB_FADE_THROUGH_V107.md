# Transición entre tabs — v107

## Referencia portada

`HomeScreen.kt` usa `AnimatedContent` con `materialFadeThroughIn(initialScale = 1f, durationMillis = 200)` junto con `materialFadeThroughOut(200)`. Hanami porta ese contrato al DOM: mantiene simultáneamente la pestaña saliente y la entrante, sin escalado, con salida durante el primer 35 % y entrada durante el 65 % restante.

## Alcance de pantallas

- Destinos raíz: Biblioteca, Actualizar, Historial, Explorar y Más.
- Funciona igual desde NavigationBar móvil y NavigationRail tablet.
- Back/browser Back entre destinos raíz usa la misma transición porque restaura mediante `showTab`/`HanamiScreens`.
- Las sub-screens de Detalle, Próximas, Descargas, Historial, Fuentes, Extensiones, Migración, Ajustes y Datos conservan sus transiciones propias de navegación; no reciben un Fade Through incorrecto.
- Fuentes/Extensiones/Migrar son subpestañas internas de Explorar y conservan su pager/indicador, sin disparar la transición raíz.

## Coordinación visual

1. Antes del cambio se captura una copia visual de los nodos visibles del contenido actual.
2. La copia se vuelve inerte, `aria-hidden` y sin IDs para no duplicar selectores ni controles.
3. Salida: opacidad 1→0 entre 0 y 70 ms.
4. Entrada: permanece invisible hasta 70 ms y aparece entre 70 y 200 ms.
5. La NavigationBar/NavigationRail, su ripple, indicador, icono y badges no se clonan ni desaparecen.
6. Al terminar se elimina la copia, las clases y `aria-busy`.

## Barras, diálogos e itemOverflow

- Toolbars, app bars y contenido pertenecen a la pestaña y participan en su snapshot.
- NavigationSuite queda estable por encima de la transición.
- Diálogos y sheets viven en top layer; no se clonan ni se cierran accidentalmente.
- Los itemOverflow no se duplican y conservan el cierre centralizado de overlays.
- Barras contextuales y selección no transfieren eventos porque la copia saliente es inerte y no acepta puntero.

## Acciones, animaciones, efectos y gestos

- Cambiar de destino inicia un Fade Through; reseleccionar el activo ejecuta `onReselect` sin animar la misma pestaña.
- Taps rápidos cancelan y reemplazan la transición anterior: nunca quedan varias capas ni timers huérfanos.
- Durante 200 ms el contenido bloquea puntero, pero NavigationSuite sigue disponible para otro destino.
- `prefers-reduced-motion` y el ajuste «Reducir movimiento» desactivan por completo la captura y animación.
- Tap, ratón, teclado, Back y cambio a rail ejecutan una sola transición y no modifican la pila.
- `pagehide` o pestaña oculta cancelan la capa temporal.

## Validación

- Regresión estructural del coordinador, fases 35/65, duración, snapshot seguro, cancelación, precaché y movimiento reducido.
- E2E 390×844 y 1024×768: salida/entrada simultáneas, limpieza, taps rápidos, reselección, subpestañas sin Fade Through, preferencia reducida y paridad NavigationBar/NavigationRail.
