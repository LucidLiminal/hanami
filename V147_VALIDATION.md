# Validación de la entrega v147

Hanami 5.21.0 · Olympus 1.5.0 · caché hanami-crimson-knot-v147.

## Resultados

- Reproducción en v146: ficha visible con estado root/source después de recargar;
  lector visible con estado library-detail; refrescos que duplicaban entradas;
  excepción por escribir en un contenedor eliminado tras un error tardío.
- Se confirmó también la carrera entre el cierre de un menú y la apertura
  de la configuración de migración.
- npm test: **115 scripts correctos**, incluido el nuevo test conductual del
  historial. Las comprobaciones conductuales no se sustituyeron por texto estático.
- Nuevo E2E: **60 escenarios correctos**, 30 recorridos a 390×844 y 1280×900,
  con aplicación e historial reales, API simulada y cero excepciones de página.
- Cobertura: biblioteca, fuentes, grupos, refresco, recarga, botones de retroceso,
  Atrás del navegador, Escape, doble clic, Forward, búsqueda conservada, menús,
  modales, migración, lector, música y herramienta hija, saltos de varias entradas,
  respuestas tardías de éxito/error/páginas y salida durante reconstrucción.
- Regresiones E2E v108 y v110 correctas: política raíz móvil/rail y recarga de
  ajustes, búsqueda, lector, ficha de fuente y migración.
- Olympus v146 E2E correcto: handler/adaptador reales con origen simulado,
  recuperación de URL, 81 capítulos paginados, lector móvil/escritorio, fallo
  explícito de ambos orígenes y conservación de progreso y marcadores.
- Portadas v145 E2E correcto: conversión, límites, objeto único por grupo,
  sustitución/limpieza, tratamiento de fallos y formulario móvil/escritorio.
- Música v141 E2E correcto: selector, cola, arrastre, listas y permisos;
  finales automáticos de cuatro modos, eventos tardíos, polling y audio nativo.
- Test conductual del historial: restauradores tipados, promesas esperadas,
  cierre de toda la rama saliente, padres conservados, cancelación de restores
  obsoletos, destino sin restaurador, fallback visual y diagnóstico opcional
  acotado a 120 eventos sin payloads de pantalla.

## Integridad y alcance

- Sin dependencias de producción nuevas. Se conservan todos los archivos v146.
- API, adaptadores Olympus y SQL anteriores conservados sin modificaciones.
- Se actualizaron las aserciones de versión/caché de las pruebas históricas y
  se adaptaron las de ciclo de vida a la nueva implementación.
- Precaché PWA comprobada; incluye historial y overlays. No se cambia la caché
  de capítulos. La biblioteca y el progreso no requieren migración por este cambio.
- Sin claves ni sesiones reales, node_modules, registros privados o capturas de
  pruebas añadidos al paquete. Se utilizaron fixtures y Chromium local.
- No se desplegó ni modificó Vercel o Supabase de producción.

No requiere SQL nuevo. Desplegar el proyecto completo en el mismo Vercel y
recargar la PWA, sin borrar almacenamiento local, biblioteca ni progreso.
Guía: NAVIGATION_BACK_V147.md. Manifiesto actual: V147_FILE_MANIFEST.sha256.
Los manifiestos anteriores conservados describen sus versiones históricas.
