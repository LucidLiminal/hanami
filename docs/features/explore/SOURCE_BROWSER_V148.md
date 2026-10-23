# Navegador de fuentes — v148

Hanami `5.22.0` · Olympus `1.6.0` · PWA `hanami-crimson-knot-v148`.

## Interfaz

- `#sourceQuery` vive dentro de `.toolbar`, en el formulario
  `#sourceSearchForm`. Enter ejecuta la consulta una sola vez; una consulta
  vacía abre Popular. Se elimina `data-source-search`.
- Popular y Recientes conservan sus atributos `data-source-popular` y
  `data-source-latest`. Son pestañas visuales con corazón/check, selección
  subrayada y `aria-pressed`; las flechas y Home/End permiten cambiar entre
  ellas con teclado. Durante una búsqueda no se marca falsamente una de las
  dos como seleccionada.
- Las portadas guardadas se atenúan y llevan un marcador tipo bookmark.
  Conservan contraste en el texto y se pueden abrir normalmente.
- El estado guardado se obtiene de la biblioteca personal, no de un título
  parecido ni de otra fuente. Los registros `favorite: false` son solo historial.
  Se reconocen URLs normalizadas, IDs remotos e identidades/alias ya verificados,
  sin crear identidades nuevas al pintar resultados.
- Añadir o quitar una obra de la biblioteca actualiza las tarjetas existentes
  sin reiniciar el listado ni perder el scroll.
- Los modos cómodo, compacto y lista cambian la presentación sin volver a
  consultar la fuente.

## Páginas incrementales

`public/source-browser.js` mantiene un acumulador por fuente, modo, consulta
y entrada del historial. Solo hay una petición de página activa por listado.

Un observador de intersección solicita la página siguiente cuando el final se
acerca a la ventana. Un listener de scroll/resize es el fallback para navegadores
sin ese observador. El botón «Cargar más» es una alternativa accesible/manual,
no una obligación de pulsarlo para cada página.

- Las tarjetas se añaden; no se reemplazan las primeras 15.
- No hay un tope artificial de 200 obras. Se llega hasta `hasNextPage: false`.
- Si la fuente declara un total, se muestra el avance («15 de 300 obras»)
  mientras queden páginas, para no confundir la primera página con el catálogo.
- Se mantienen índices estables y se deduplican páginas solapadas.
- Un error intermedio conserva las páginas anteriores y ofrece «Reintentar».
  El reintento pide la misma página que falló.
- Las respuestas vacías con continuación, la repetición de una página y los
  metadatos incoherentes detienen la carga en lugar de provocar un bucle.
- Un cambio de fuente, pestaña, búsqueda o pantalla invalida la petición anterior.
  Se utiliza AbortController para fetch y una comprobación de propietario para
  descartar respuestas tardías, incluidas las de extensiones locales.
- La fuente local conserva sus acciones y su final de listado real. Crear o
  editar una serie invalida todas sus pestañas cacheadas.

## Olympus

El adaptador deja de extraer los listados de una selección fija de la portada:

| Listado | Ruta pública |
| --- | --- |
| Popular | `/api/rankings?page=N&period=total_ranking` |
| Recientes | `/api/new-chapters?page=N` |
| Catálogo sin consulta | `/api/series?page=N&type=comic&direction=asc` |
| Búsqueda con consulta | `/api/series/list`, filtrado por la consulta y paginado |

El ranking usa el parámetro público `period=total_ranking`; no sigue
literalmente los enlaces internos que usan `column`. Se comprueba su página y
origen y se reconstruye la ruta pública conocida.

Se respetan `current_page`, `last_page`, `next_page_url` y `total`. No se mezclan
recomendaciones con resultados ni se cambia de listado para inflar el total.
Una respuesta 520/403/429 o JSON corrupto se muestra como error, no como una
portada aparentemente válida.

La compatibilidad HTML se usa solo si la ruta JSON no existe o responde HTML.
En páginas Nuxt se decodifica el JSON estructurado sin ejecutar scripts.
Los layouts antiguos pueden continuar mediante enlaces explícitos a la página
siguiente del mismo listado y origen.

La verificación pública de esta entrega recorrió 14 páginas/200 obras únicas en
Popular y 20 páginas/300 obras únicas en Recientes. Son límites anunciados por
Olympus en esa consulta, no garantías permanentes ni límites de Hanami.

## Atrás, recarga y diagnóstico

Se conservan hasta ocho listados recientes en memoria por entrada de historial.
Atrás reutiliza las páginas ya recibidas y el scroll. Tras una recarga, el
restaurador tipado reconstruye tantas páginas como se habían cargado.

El guardado de scroll ignora posiciones intermedias durante una restauración
asíncrona. Un evento demorado de una pantalla abandonada tampoco puede
sobrescribir el scroll de la pantalla actual. El progreso del lector sigue
usando su propio mecanismo.

En la consola del navegador:

```js
HanamiSourceBrowser.snapshot()
// sourceId, mode, query, loadedPages, loadedCount, hasNextPage, total, loading, error

HanamiSourceBrowser.refresh()
// Vuelve a consultar el listado visible sin reutilizar sus resultados cacheados.

HanamiScreens.debug.enable()
HanamiScreens.debug.report()
HanamiScreens.debug.enable(false)
```

## Despliegue y pruebas

Desplegar el proyecto completo, incluidos `extensions/olympus`, `registry`,
`public/source-browser.js`, `public/app.js`, `public/browse-tab.css`,
`public/screen-history.js`, `public/screen-restoration.js` y `public/sw.js`.
No basta con reemplazar el HTML o el CSS.

No se añade SQL, no se cambia el esquema de Supabase y no se borran datos de
biblioteca, capítulos, grupos o música. Mantener el mismo origen de Vercel y
las migraciones ya aplicadas. Tras desplegar, recargar la app para recibir
los recursos del service worker v148.

```bash
npm test
npm run test:e2e:source-browser
npm run test:e2e:back
```

Las E2E necesitan Playwright y Chromium en el entorno de desarrollo. Los fixtures
no acceden a servicios externos ni modifican proyectos de Supabase o Vercel.
Resultados y alcance: `../../releases/validation/V148_VALIDATION.md`.