# Validación de la entrega v146

- Hanami 5.20.0; Olympus 1.5.0; caché hanami-crimson-knot-v146.
- Regresión completa: 114 scripts de npm test, terminados correctamente.
- Reproducción anterior: el adaptador v145 abortaba con el 520 del panel sin
  intentar la API pública, incluso disponiendo de una respuesta pública válida.
- Comprobación pública real: panel HTTP 520, web pública y API de capítulos HTTP
  200. URL antigua de El mecánico legendario recuperada a su URL canónica.
- Adaptador real: 284 capítulos con 284 IDs remotos únicos,
  ocho páginas públicas, sin solicitudes al panel durante esa comprobación.
  Se incluye el capítulo cero; no se renumeran los IDs de los capítulos.
- Lectura pública real: capítulo 281.05, 1 imagen; capítulo
  0, 12 imágenes. La página legítima portadas.webp
  se conserva y no se añaden portadas de recomendaciones fuera del lector.
- Pruebas de error: 520/503, red, 403/429, Retry-After, paginación ausente o
  repetida, total inconsistente, JSON inválido, rutas 404 y presupuesto agotado.
  No se confunden errores o respuestas parciales con una lista vacía válida.
- E2E con handler y adaptador reales, origen simulado: biblioteca y lector a
  390×844 y 1280×900, 81 capítulos paginados, reparación de URL, conservación de
  lectura y marcadores tras error de actualización. Sin excepciones de página.
- Regresión anterior de portadas v145: SQL PostgreSQL embebido y E2E de
  compresión, sustitución y limpieza móvil/escritorio correctos.
- 72 recursos PWA presentes; todos los 399 archivos de la entrega anterior
  conservados. Procedencia Keiyoushi y contrato JavaScript vercel-js conservados.
- No se ejecutó ni incorporó un APK o Kotlin, ni se añadieron dependencias de
  producción para este cambio. Sin sesiones, claves reales, node_modules,
  capturas ni registros privados de pruebas añadidos al paquete.

Las comprobaciones reales solo consultaron páginas y APIs públicas de Olympus.
Los E2E de fallo utilizaron fixtures. No se modificó Supabase o Vercel de
producción. El panel de Olympus no fue reparado por esta entrega: la corrección
prioriza la ruta pública y gestiona alternativas y errores de forma acotada.

No requiere SQL nuevo por Olympus. Se mantienen la función de portadas v145 y
su migración, necesaria si aún no fue aplicada. Desplegar el proyecto completo
en el mismo Vercel y recargar la PWA, sin borrar los datos del navegador.

Usar V146_FILE_MANIFEST.sha256 para esta entrega. Los documentos y manifiestos
V144/V145 conservados son históricos. Guía: OLYMPUS_PUBLIC_CHAPTERS_V146.md.
Los totales y respuestas de Olympus reflejan la comprobación de esta entrega y
pueden cambiar posteriormente.
