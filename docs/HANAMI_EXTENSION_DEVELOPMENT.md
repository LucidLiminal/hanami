# Cómo crear extensiones para Hanami

## 1. Qué es una extensión Hanami

Una extensión Hanami es un **adaptador JavaScript/TypeScript ejecutado en el servidor de un único proyecto Vercel**. Traduce una web pública de lectura al contrato normalizado de Hanami.

No es una extensión Mihon renombrada. Hanami no usa ni admite:

- APK, DEX, JVM, Java, Kotlin o Android Activities.
- `packageName`, `pkgName`, `apkUrl`, `extensionLib` o `versionCode`.
- Carga o ejecución dinámica de código remoto.
- Solicitudes de analítica, fingerprinting o rastreo.
- Los modelos heredados `m.tags`, `m.genres` o `.md-tags`.

Mihon puede servir como referencia de comportamiento, arquitectura y extracción, pero el adaptador debe reescribirse para web.

## 2. Estructura mínima

```text
extensions/
  ejemplo/
    index.mjs
    manifest.json
registry/
  index.json
api/
  index.mjs
```

El repositorio externo también debe publicar en su raíz:

```text
hanami-extension-store.json
```

Hanami acepta alternativamente `registry/index.json`, pero su contenido debe usar exactamente el mismo contrato `hanami-extension-store/v1`.

## 3. Manifiesto de la extensión

```json
{
  "id": "hanami.es.ejemplo",
  "name": "Fuente de ejemplo",
  "version": "1.0.0",
  "lang": "es",
  "runtime": "vercel-js",
  "status": "beta",
  "upstream": "referencia/original",
  "operations": ["popular", "latest", "search", "details", "chapters", "pages"]
}
```

Reglas:

- `id`: minúsculas y con prefijo `hanami.`, por ejemplo `hanami.es.ejemplo`.
- `version`: SemVer, por ejemplo `1.2.0`.
- `lang`: código en minúsculas o `all`.
- `runtime`: siempre `vercel-js`.
- `operations`: debe contener las seis operaciones obligatorias.
- El título visible nunca incluye la procedencia; la fuente vive en `sourceId`.

## 4. Contrato del adaptador

`index.mjs` exporta el manifiesto, el adaptador y un `default`:

```js
export const manifest = {
  id: 'hanami.es.ejemplo',
  name: 'Fuente de ejemplo',
  version: '1.0.0',
  lang: 'es',
  runtime: 'vercel-js',
  status: 'beta',
};

export const ejemplo = {
  ...manifest,
  async popular({ page = 1 } = {}) {},
  async latest({ page = 1 } = {}) {},
  async search({ page = 1, query = '' } = {}) {},
  async details(manga) {},
  async chapters(manga) {},
  async pages(chapter) {},
  imageHeaders(imageUrl) { return {}; },
};

export default ejemplo;
```

### `popular`, `latest` y `search`

Devuelven:

```js
{
  mangas: [
    {
      id: '/serie/ejemplo',
      url: 'https://sitio.example/serie/ejemplo',
      title: 'Título limpio',
      thumbnailUrl: 'https://sitio.example/cover.webp'
    }
  ],
  hasNextPage: false
}
```

`search` debe usar realmente `query`; no puede devolver simplemente toda la portada o catálogo.

### `details`

Devuelve el manga normalizado. El único modelo de géneros permitido es:

```js
{
  ...manga,
  title: 'Título limpio',
  description: 'Sinopsis',
  author: 'Autor',
  artist: 'Artista',
  genre: ['Acción', 'Drama'],
  status: 'ongoing'
}
```

Estados recomendados: `ongoing`, `completed`, `hiatus` y `cancelled`.

### `chapters`

Devuelve un array, preferentemente del capítulo más reciente al más antiguo:

```js
[
  {
    id: '/capitulo/12',
    url: 'https://sitio.example/capitulo/12',
    name: 'Capítulo 12',
    number: 12,
    date: '2026-09-17T12:00:00Z'
  }
]
```

Si el sitio pagina los capítulos, el adaptador debe recorrer todas las páginas necesarias y eliminar duplicados.

### `pages`

Devuelve un array ordenado:

```js
[
  { "index": 0, "imageUrl": "https://cdn.example/001.webp" },
  { "index": 1, "imageUrl": "https://cdn.example/002.webp" }
]
```

`imageHeaders()` define únicamente los encabezados necesarios para el proxy de imágenes, por ejemplo `Referer`, `Origin` y `User-Agent`.

## 5. Contrato del repositorio

Consulta `docs/examples/hanami-extension-store.json` para un archivo completo.

Campos superiores:

- `schema`: debe ser exactamente `hanami-extension-store/v1`.
- `name`: nombre del catálogo.
- `badgeLabel`: distintivo corto opcional.
- `contact.website`: URL HTTPS.
- `contact.discord`: URL HTTPS opcional.
- `extensions`: una o más extensiones Hanami válidas.

Cada entrada requiere:

- `id`, `name`, `version`, `lang` y `runtime: "vercel-js"`.
- `entry`: ruta relativa terminada en `.mjs`.
- `manifest`: ruta relativa terminada en `manifest.json`.
- Las seis operaciones web obligatorias.

La presencia de una sola extensión Android o inválida hace que Hanami rechace el repositorio completo.

## 6. Descarga, confianza y ejecución

Añadir una URL de GitHub permite a Hanami leer el catálogo. La extensión todavía no se ejecuta en ese momento.

Para usarla, el usuario pulsa **Habilitar** y confirma explícitamente que confía en el repositorio y en los hosts solicitados. Hanami descarga el bundle, verifica su estructura e integridad, lo guarda en IndexedDB y lo inicia dentro de un Web Worker aislado.

No hay APK, instalación del sistema ni import dinámico desde la red. El único código aceptado es el bundle autocontenido validado y guardado localmente. Deshabilitar elimina ese bundle y termina su Worker.

## 7. Red y seguridad

- Usa solo `http:` o `https:` para las webs fuente; prefiere HTTPS.
- Aplica `AbortSignal.timeout()` a todas las solicitudes.
- Comprueba `response.ok` y el tipo de contenido.
- Limita tamaños y evita cargar recursos innecesarios.
- No accedas a localhost, redes privadas, metadatos cloud o URLs aportadas sin validar.
- No reproduzcas endpoints de analítica o rastreo encontrados en la web original.
- No guardes cookies, tokens o credenciales dentro del repositorio.
- Los enlaces del catálogo y la inspección del índice deben ser HTTPS y estar alojados en GitHub.

## 8. Normalización

- Elimina sufijos de fuente como `| Olympus Scanlation` del título.
- Conserva la procedencia exclusivamente en `sourceId`.
- Devuelve `manga.genre` como `string[]`.
- Usa URLs absolutas.
- Usa IDs estables.
- Elimina resultados duplicados por URL.
- Escapa y limpia HTML antes de convertirlo en texto visible.

## 9. Integración en Hanami

Ejemplo conceptual en `api/index.mjs`:

```js
import ejemplo, { manifest as ejemploManifest } from '../extensions/ejemplo/index.mjs';

const registry = [ejemploManifest];
const sources = new Map([[ejemplo.id, ejemplo]]);
```

Cuando existan varias fuentes, se añaden todas al array y al `Map`. No se usa `import()` con una URL externa.

## 10. Pruebas obligatorias

Cada extensión debe probar:

- Popular, recientes y búsqueda con consulta real.
- Paginación y `hasNextPage`.
- Detalles y títulos normalizados.
- `genre` como único campo de géneros.
- Capítulos completos, orden y deduplicación.
- Páginas del lector e imágenes proxificadas.
- Errores HTTP, timeouts, HTML inesperado y cambios de estructura.
- Ausencia de endpoints de rastreo.
- `node --check` en los JavaScript modificados.
- Suite completa `npm test`.
- Una regresión específica.
- E2E móvil con Chromium.

## 11. Checklist de publicación

1. Actualizar `manifest.json` y la versión del adaptador.
2. Actualizar `hanami-extension-store.json` o `registry/index.json`.
3. Revisar licencias y atribución upstream.
4. Auditar red y seguridad.
5. Integrar estáticamente el adaptador.
6. Ejecutar las pruebas.
7. Incrementar `package.json` y la caché del Service Worker.
8. Documentar el cambio y verificar el ZIP final.

## 12. Runtime descargable en el navegador

Las extensiones externas no se incorporan automáticamente al código del servidor. Al pulsar **Habilitar**:

1. Hanami muestra un diálogo de confianza con el repositorio y los hosts solicitados.
2. Descarga `entry` desde GitHub mediante `/api/extension-bundle`.
3. Rechaza bundles de más de 500 KB, sin `export default` o con cualquier `import` estático/dinámico.
4. Verifica `sha256` cuando el catálogo lo declara.
5. Guarda el código y sus metadatos en IndexedDB, dentro de `hanami-local-extensions`.
6. Ejecuta el adaptador en un Web Worker sin DOM, `localStorage`, `XMLHttpRequest`, WebSocket, EventSource ni `importScripts`.
7. Registra sus fuentes en Explorar y enruta las seis operaciones al Worker.
8. Deshabilitar la extensión termina el Worker y elimina el bundle local. No existe instalación de APK.

El bundle debe ser autocontenido. Puede usar las APIs estándar `URL`, `Response`, `Headers`, `AbortSignal` y `fetch`, pero `fetch` queda sustituido por el proxy restringido de Hanami.

### Fuentes y permisos de red

Cada extensión del catálogo debe declarar `sources`:

```json
{
  "sources": [
    {
      "id": "hanami.es.ejemplo",
      "name": "Fuente de ejemplo",
      "lang": "es",
      "baseUrl": "https://lector.example",
      "hosts": [
        "https://lector.example",
        "https://api.lector.example",
        "https://cdn.lector.example"
      ],
      "imageHeaders": {
        "Referer": "https://lector.example/"
      }
    }
  ]
}
```

- `baseUrl` y todos los elementos de `hosts` deben ser orígenes HTTPS.
- El origen de `baseUrl` se añade siempre a `hosts`.
- No se admiten comodines.
- Antes de cada solicitud, el servidor vuelve a leer y validar el índice alojado en GitHub. La extensión no puede ampliar los hosts desde el navegador.
- Solo se permiten `GET` y `POST`.
- Se eliminan cookies, autorización y cabeceras no permitidas.
- Se bloquean redes privadas y hosts de rastreo conocidos.
- Las respuestas de texto/datos tienen un máximo de 4 MB y las imágenes de 20 MB.

### Integridad opcional

El catálogo puede fijar el bundle esperado:

```json
{
  "sha256": "HASH_SHA256_HEXADECIMAL_DEL_ARCHIVO_INDEX_MJS"
}
```

Si el archivo cambia y el hash no coincide, Hanami no lo habilita. Se recomienda actualizar versión y hash juntos.

### Actualizaciones

Hanami compara la versión del catálogo con la guardada en IndexedDB. Si cambia, muestra **Actualización**. La actualización descarga y valida el nuevo bundle, sustituye el Worker y conserva los datos de Biblioteca.


## Identidad persistente (v144)

Los campos históricos `id` y `url` siguen admitidos. Añade campos opcionales
cuando la fuente tenga claves primarias estables:

- Obra: `remoteWorkId` (string).
- Capítulo: `remoteId` (string) y `remoteIdScope: "work"` por defecto.
- Usa `remoteIdScope: "source"` solamente si el proveedor garantiza que el ID
  es único en toda la fuente, incluyendo traducciones y ediciones.

No inventes un ID remoto a partir del número, título, slug o URL. Si no existe
una clave persistente, omite el campo: Hanami emite un UUID interno y conserva
el registro de alias. Los cambios de dirección sin evidencia inequívoca
requieren una equivalencia revisada. Las ediciones no se fusionan por número.
