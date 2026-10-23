# Validación de v148

Hanami `5.22.0` · Olympus `1.6.0` · PWA `hanami-crimson-knot-v148`.

## Pruebas automatizadas

| Prueba | Resultado | Alcance |
| --- | --- | --- |
| `npm test` | 118 scripts correctos; 120 líneas PASS | Regresiones existentes y nuevas pruebas de acumulación, identidad, API, Olympus y scroll |
| `npm run test:e2e:source-browser` | 27 escenarios correctos | App real con fixtures de red; 390×844, 1280×900 y 320×740 |
| `npm run test:e2e:back` | 60 escenarios correctos | Fichas, lector, overlays, grupos, recargas y respuestas tardías |
| `tests/root-back-v108.mobile.e2e.mjs` | Correcto | Política de Atrás en pestañas raíz y rail |
| `tests/reload-restoration-v110.mobile.e2e.mjs` | Correcto | Ajustes, búsqueda, lector, ficha de fuente y migración |
| `npm run test:e2e:olympus-recovery` | Correcto; 3 líneas PASS | API y adaptador reales con upstream controlado; recuperación de 81 capítulos y errores 520 |
| `npm run test:e2e:group-covers` | Correcto; 7 líneas PASS | Optimización, reemplazo, errores y limpieza segura de portadas |
| `tests/reader-music-v141.e2e.mjs` | Correcto; 4 líneas PASS | Fin automático de pistas, callbacks antiguos y reproducción nativa |

Las E2E requieren Playwright y Chromium. Las pruebas históricas que usan una
URL de desarrollo se ejecutaron con un servidor estático local de esta versión.
Los fixtures no contactaron proyectos de producción.

### Casos específicos de v148

- La búsqueda pertenece a la toolbar y Enter genera una sola consulta.
- Popular/Recientes tienen iconos, selección accesible y navegación por teclado.
- Las obras favoritas se distinguen de registros de historial, otras fuentes y
  títulos coincidentes. Añadir/quitar favoritos actualiza las tarjetas sin
  refetch ni pérdida de posición.
- El acumulador unitario conserva 247 obras únicas. En la app, los fixtures de
  Popular y Recientes acumulan 241 y 287 obras respectivamente, sin duplicados
  ni un tope artificial de 200.
- Las peticiones repetidas de «Cargar más», el scroll y el observador no
  superponen peticiones de página dentro del mismo listado.
- Se llega a la última página parcial y no se solicita una página posterior.
- Se comprueba el contador cargado/total, por ejemplo «15 de 300 obras».
- Un fallo en la página siguiente conserva las tarjetas previas y reintenta
  solo la página fallida.
- Una fuente que repite páginas queda detenida con un error explícito.
- Cambiar de pestaña, consulta, fuente o pantalla descarta respuestas antiguas.
- Se puede seguir escribiendo sin que una página recibida borre el borrador.
- Abrir la obra de índice 219, volver, recargar y avanzar conserva el resultado
  correcto, las 17 páginas y la posición del listado.
- La persistencia de scroll no escribe posiciones transitorias durante la
  restauración ni eventos demorados de otra pantalla.
- Cómodo, compacto y lista cambian el diseño sin perder resultados ni refetch.
- La fuente local conserva sus acciones e invalida sus pestañas al crear una
  serie; no inventa paginación.
- A 320 px no hay scroll horizontal y la paginación funciona sin
  `IntersectionObserver`.
- La API real conserva `page`, `nextPage`, `hasNextPage`, `total`,
  `remoteWorkId` y `sourceId` del adaptador.
- Olympus excluye recomendaciones, filtra consultas reales, valida metadatos
  y decodifica datos Nuxt sin ejecutar scripts.

## Verificación pública de Olympus

Se recorrieron las páginas públicas de ambos listados con el adaptador 1.6.0 y
el mismo acumulador que utiliza la interfaz:

| Listado | Páginas | Obras únicas | Última página |
| --- | --- | --- | --- |
| Popular, ranking histórico | 14 | 200 | 5 obras; sin continuación |
| Recientes | 20 | 300 | 15 obras; sin continuación |

Rutas consultadas:

- `https://olympusxyz.com/api/rankings?page=N&period=total_ranking`
- `https://olympusxyz.com/api/new-chapters?page=N`

La consulta fue de solo lectura: 34 páginas, sin escrituras en Olympus,
Supabase o Vercel. Metadatos de cada página:
`docs/olympus-listing-verification-v148.json`.

Los totales son los anunciados por Olympus durante esta verificación. No son
límites permanentes de Hanami ni una promesa de que Olympus mantendrá siempre
el mismo número de obras. Los fixtures de interfaz usan totales distintos
deliberadamente para comprobar que la app no depende de 200/300 constantes.

## Revisión visual

Se renderizaron con Chromium y se inspeccionaron individualmente 10 estados:

- Popular móvil y escritorio.
- Recientes móvil.
- Búsqueda con consulta y contador.
- Menú de visualización.
- Modo lista.
- Cuadrícula compacta.
- Error intermedio y reintento.
- Sin resultados.
- Carga inicial.

Se comprobaron búsqueda dentro de la toolbar, iconos reconocibles, pestaña
activa, atenuación/marcador, espaciado, contraste, foco, targets de al menos
44 px y ausencia de desbordamiento horizontal. Las portadas de la revisión
son imágenes públicas reales de Olympus. El menú se corrigió a fondo sólido
y texto de 16 px, y se volvió a renderizar e inspeccionar.

Los títulos de tarjetas tienen truncado deliberado de dos líneas; su texto
completo sigue disponible en el nombre accesible del botón. Las etiquetas
visualmente ocultas son intencionales, no fallos de layout.

## Integridad y despliegue

- Se conservan las 409 rutas de archivo de v147.
- Todos los 75 recursos de precache existen, incluido `source-browser.js`.
- Manifiesto, registro y exportación de Olympus coinciden en `1.6.0`.
- No se modifica ningún archivo SQL ni el esquema de Supabase.
- Los manifiestos de versiones anteriores se conservan como histórico.
  `../../../checksums/archive/V148_FILE_MANIFEST.sha256` es el inventario correspondiente a esta entrega.
- El paquete está preparado para desplegar; no se ha desplegado en producción.

Desplegar el proyecto completo en el mismo origen. No borrar almacenamiento
del navegador, bibliotecas, grupos, archivos ni cachés de lectura del usuario.
Detalles: `../../features/explore/SOURCE_BROWSER_V148.md`.