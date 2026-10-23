# Deep links — port web de Mihon (v109)

## Referencia Mihon
Mihon resuelve intents de shortcuts, búsqueda, texto compartido, enlaces de obra/capítulo, Extensiones, Descargas, Ajustes y repositorios. `DeepLinkScreen` muestra carga, intenta resolver fuente/obra/capítulo y deriva a ficha, lector o búsqueda global. Hanami porta el comportamiento a URLs HTTPS, History API, manifest PWA y adaptadores JavaScript; no usa intents Android, APK ni actividades.

## Rutas canónicas
- `/library`, `/updates`, `/history`, `/explore`, `/more`: tabs raíz.
- `/extensions`: Explorar → Extensiones.
- `/search?q=Título`: `GlobalSearchScreen`, campo rellenado y búsqueda automática.
- `/manga/:id`: ficha de una obra de la biblioteca local.
- `/manga/:id/chapter?chapter=<url|id|número|índice>`: lector del capítulo resuelto.
- `/manga?source=<sourceId>&url=<url>&title=<título>`: ficha de una fuente compatible instalada.
- `/downloads`: Más → Cola de descargas.
- `/settings`: pantalla principal de Ajustes.
- `/settings/:section`: Apariencia, Biblioteca, Lector, Descargas, Seguimiento, Explorar, Seguridad o Avanzado.
- `/?extensionStore=<URL>` y `/?addExtensionStore=<URL>` continúan abriendo el flujo seguro de repositorios.

## Sub-screens y estados
- **DeepLink/Loading:** la ruta espera `hanami-app-ready`, fuentes locales y extensiones del navegador.
- **NoResults/Error:** diálogo accesible con salida a Biblioteca o Búsqueda global.
- **Result/Manga:** abre `library-detail` o `migration-candidate-detail` según el origen.
- **Result/Chapter:** resuelve metadatos, páginas y abre `reader` conservando su padre.
- Recargar una ruta vuelve a reconstruir su destino desde URL y almacenamiento local.

## Barras y navegación
- La `NavigationBar` móvil y `NavigationRail` tablet señalan la tab propietaria.
- Toolbars de búsqueda, ficha, lector, Extensiones, Descargas y Ajustes conservan sus acciones existentes.
- El botón Atrás, Escape, gesto móvil y browser Back recorren la pila `HanamiScreens`; después aplican Back raíz v108.
- Cada `push`, `replace`, `root` y `pop` sincroniza la URL sin crear un historial paralelo.

## Actions
- Abrir rutas directamente, desde shortcuts PWA o texto compartido.
- Copiar la URL canónica mediante `HanamiDeepLinks.copy()`.
- Compartir mediante Web Share con `HanamiDeepLinks.share()` cuando está disponible.
- La búsqueda compartida usa `share_target`; `web+hanami:` se deriva a búsqueda.

## Diálogos e itemOverflow
- Los deep links no saltan overlays existentes: diálogos y sheets siguen cerrando primero.
- Los itemOverflow de ficha, capítulos, Extensiones, Descargas y Ajustes permanecen anclados y no crean rutas propias.
- Un destino ausente abre un diálogo real, no `alert`, y permite Biblioteca o Buscar.

## Animaciones, efectos y gestos
- Las rutas raíz usan Fade Through v107.
- Las sub-screens conservan slide/fade y sheets adaptativos ya portados.
- Movimiento reducido evita animaciones decorativas.
- Swipe de capítulos, pager de Explorar, pulsación prolongada y pull-to-refresh no modifican la URL hasta cambiar de pantalla.

## Web/PWA/offline
- Vercel reescribe todas las rutas canónicas a la única aplicación desplegable.
- El servidor local sirve `index.html` para rutas sin extensión.
- El Service Worker devuelve el shell `/` para navegaciones offline.
- El manifest incorpora shortcuts, Share Target y protocolo `web+hanami`.
- Los IDs y URLs se codifican; solo se ejecutan fuentes instaladas compatibles con Hanami.

## Validación
- `tests/deep-links-v109.test.mjs`: contrato estático.
- `tests/deep-links-v109.mobile.e2e.mjs`: recarga directa de búsqueda, obra, capítulo, Extensiones, Descargas y Ajustes; Back móvil/tablet y sincronización URL.
