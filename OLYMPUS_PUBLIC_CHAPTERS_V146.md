# Recuperación de capítulos Olympus — v146

Hanami `5.20.0`, adaptador Olympus `1.5.0`, caché PWA
`hanami-crimson-knot-v146`. Esta entrega no modifica producción por sí sola.

## Fallo reproducido

El adaptador consultaba primero `panel.olympusxyz.com` para listar capítulos.
Cuando ese servidor respondía HTTP 520, la excepción interrumpía la operación
antes de probar otra ruta o completar la recuperación.

Al preparar esta entrega se comprobó que el panel devolvía 520 mientras la web
pública, sus metadatos y la siguiente ruta respondían correctamente:

```text
https://olympusxyz.com/api/series/<slug>/chapters?page=1&direction=desc&type=comic
```

La extensión actual de Keiyoushi también usa la API del dominio público:
[OlympusScanlation.kt](https://raw.githubusercontent.com/keiyoushi/extensions-source/main/src/es/olympusscanlation/src/eu/kanade/tachiyomi/extension/es/olympusscanlation/OlympusScanlation.kt).
Hanami sigue siendo una implementación manual en JavaScript: no incorpora
ni ejecuta un APK o el código Kotlin. Se conserva la atribución `upstream`.

## Corrección

- Capítulos: primero API pública del dominio resuelto; después, si hace falta,
  panel configurado. Un fallo de un servidor no aborta la alternativa.
- Se conservan los slugs canónicos y variantes de tipo para rutas 404.
- Un fallo transitorio puede reintentarse una sola vez por página. No se
  recorren todas las combinaciones de slug y tipo sobre un host que ha fallado.
- No se reintentan de inmediato bloqueos 403/429 ni esperas `Retry-After`
  superiores a un segundo; se permite la alternativa disponible.
- Las peticiones de capítulos tienen un presupuesto total de 26 segundos
  —incluida la recuperación de la página de serie— y peticiones API de hasta
  seis segundos, para no agotar el límite de 30 segundos de Vercel.
- Se procesan `meta`, `links`, `current_page`, `last_page` y el total anunciado.
  Se conserva también un capítulo explícitamente numerado como cero.
- No se mezclan páginas parciales de dos endpoints. No se anuncia como completa
  una respuesta con páginas ausentes, repetidas, malformadas o totales distintos.
- Si las APIs fallan, no se sustituye toda la colección por el único capítulo
  que pueda aparecer en el HTML. La compatibilidad HTML queda para rutas
  ausentes/no JSON sin indicios de caída ni paginación parcial.
- Los fallos de origen se devuelven como error de fuente, no como `[]`.
  Una respuesta API válida que confirma cero capítulos sí admite `[]`.
- Los hosts de capítulos se limitan al origen público resuelto y los dominios
  configurados. No se consultan hosts de terceros introducidos en el HTML.
- Se mantienen el contrato `vercel-js`, el ID de la fuente y los IDs remotos
  de capítulos, compatibles con la identidad y el progreso de v144.
- Lector actual: se seleccionan las imágenes de `main.strip div.panel > img`.
  Una página legítima llamada `portadas.webp` o `banner.png` ya no se descarta
  por su nombre. Las portadas de recomendaciones fuera del lector no se añaden
  como páginas; se conserva el filtro anterior para layouts antiguos.

El cambio evita depender de un panel averiado cuando la API pública está
disponible. No repara el servidor de Olympus ni garantiza servicio si ambas
rutas están caídas. Las respuestas conservan errores explicativos en ese caso.

## Despliegue

1. Desplegar este proyecto completo en el mismo proyecto y dominio de Vercel.
2. Conservar las variables actuales de Supabase y los datos del navegador.
3. Recargar Hanami o cerrar y volver a abrir la PWA para activar la nueva caché.
4. Volver a abrir la obra de Olympus y comprobar la lista de capítulos.

**Esta corrección de Olympus no requiere SQL nuevo.** Se mantienen las mejoras
de portadas v145. Si aún no se aplicó su migración, sigue siendo necesaria
`supabase/hanami-group-cover-storage-v145.sql` para los límites de portadas;
no está relacionada con el error 520 de Olympus.

## Pruebas

- `npm test`: incluye escenarios 520, recuperación pública/panel, paginación,
  listas incompletas, reintentos, presupuesto, capítulo cero y atribución.
- `npm run test:e2e:olympus-recovery`: navegador local → handler API real de
  Hanami → adaptador real → respuestas de origen simuladas. Prueba biblioteca,
  lector y conservación del progreso en móvil y escritorio sin producción.
- Comprobación real de lectura: URL antigua y canónica de El mecánico legendario,
  metadatos y todas las páginas públicas de capítulos. El resultado observado
  se registra en `V146_VALIDATION.md`; el total puede cambiar después.

Las pruebas de navegador requieren Playwright, Sharp y Chromium local
(`CHROMIUM_PATH` permite indicar su ejecutable).