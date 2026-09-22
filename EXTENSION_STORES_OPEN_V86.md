# Extension Stores Open Fix v86

## Problema

El itemOverflow de **Extensiones** añadía una entrada temporal al historial del navegador. Al pulsar **Repositorios de extensiones**, Hanami ocultaba el menú y abría inmediatamente la pantalla hija. El cierre asíncrono del overlay ejecutaba después un `history.back()` y restauraba la pestaña Extensiones, por lo que la pantalla de repositorios parecía no abrirse.

## Solución

- Se añadió `closeExtensionMenuThen(action)`.
- La acción espera el evento `hanami-overlay-close` antes de crear la pantalla `extension-stores`.
- El filtro de extensiones y el cambio de tipo de listado usan la misma transición segura.
- La pantalla continúa registrada en `HanamiScreens`, por lo que Atrás realiza una sola transición a Extensiones.

## Regresión

`tests/extension-stores-open-v86.test.mjs` verifica que el botón ya no abre la pantalla mientras el itemOverflow sigue siendo la entrada activa del historial.
