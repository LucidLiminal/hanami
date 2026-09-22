> Nota: este documento describe una versión histórica. El modelo de ejecución local fue sustituido por `LOCAL_BROWSER_EXTENSIONS_V89.md`.

# Port completo de repositorios de extensiones — v87

Referencia estudiada en Mihon: `ExtensionsTab`, `ExtensionStoresScreen`, `ExtensionStoresViewModel`, `ExtensionStoresContent`, `ExtensionStoresDialogs`, `ExtensionStoreService` y los modelos/interactores de `ExtensionStore`.

## Sub-screens necesarias

### Extensiones
- **ExtensionsTab:** catálogo agrupado en actualizaciones, no cargadas, instaladas y disponibles.
- **ExtensionFilterScreen:** filtros por estado e idioma.
- **ExtensionDetailsScreen:** metadatos, procedencia, fuentes, estado, aviso de contenido y acciones.
- **SourcePreferencesScreen:** preferencias del adaptador web cuando están disponibles.
- **ExtensionStoresScreen:** listado y administración de repositorios externos.

### Repositorios
- **ExtensionStoresScreen** usa `HanamiScreens.push('extension-stores')` y conserva una única transición de Atrás.
- Estado vacío para repositorios externos y tarjeta separada del registro bundled.
- El catálogo externo se combina con el catálogo bundled; nunca reemplaza adaptadores incluidos en el despliegue.

## Bars

- **Extensions toolbar:** búsqueda, refresco del catálogo y overflow.
- **ExtensionStores app bar:** Atrás, título y acción Refrescar.
- **NavigationBar:** oculta en subpantallas mediante `nav-child`.
- **FAB Añadir:** acción principal fija, adaptada a móvil y escritorio.

## itemOverflow

El overflow de Extensiones contiene:
- Filtrar idiomas.
- Cambiar listado detallado.
- Repositorios de extensiones.
- Actualizar todas.

Se cierra completamente antes de abrir `ExtensionStoresScreen`. Las tarjetas de repositorio no usan overflow: Mihon presenta sus acciones directamente.

## Diálogos

- **ExtensionStoreCreateDialog:** URL editable, teclado/semántica URL, foco automático, validación obligatoria, error de duplicado, estado Procesando y confirmación con Enter.
- **ExtensionStoreConfirmDialog:** URL de solo lectura para `?extensionStore=` o `?addExtensionStore=`.
- **ExtensionStoreDeleteDialog:** nombre, URL, Cancelar y eliminación destructiva.
- Todos se cierran mediante Cancelar, toque exterior, Escape y browser/mobile Back a través de `HanamiOverlays`.

## Actions

- Añadir un repositorio desde una URL HTTPS de `github.com`.
- Aceptar URL de repositorio, enlace `blob` a JSON o URL `raw.githubusercontent.com`.
- Buscar automáticamente `hanami-extension-store.json`, `registry/index.json`, `repo.json` e `index.min.json` en `main` y `master`.
- Validar JSON, limitar el índice a 1 MB y rechazar hosts/protocolos ajenos a GitHub.
- Detectar índice Hanami web, Mihon v2 o Mihon legacy.
- Refrescar todos los repositorios conservando los que fallen.
- Abrir web o Discord únicamente por HTTPS.
- Copiar URL al portapapeles.
- Eliminar con confirmación.
- Persistir en `hanami-extension-stores` e incluir en backup/restore.
- Actualizar el catálogo de Extensiones tras añadir, refrescar o eliminar.

## Arquitectura web obligatoria

- Un repositorio externo aporta metadatos y descubrimiento.
- Hanami **no descarga ni ejecuta APK, JVM o código remoto**.
- Solo se reconocen como candidatos web las entradas `runtime: "vercel-js"`.
- Un candidato externo aparece como **NO CARGADA** hasta que su adaptador JS/TS se porte manualmente y se incluya en el proyecto Vercel.
- Un repositorio externo nunca puede sobrescribir un adaptador bundled con el mismo ID.

## Animations y effects

- Entrada corta de tarjetas con opacidad y desplazamiento vertical.
- Giro del botón Refrescar.
- Estados Procesando, error inline, toast de alta/refresco/copia/eliminación y distintivos de compatibilidad.
- `prefers-reduced-motion` desactiva animaciones.

## Gestos

- Scroll vertical de la lista.
- Pulsación prolongada sobre una tarjeta copia la URL y activa vibración breve cuando está disponible.
- Escape, browser Back, botón Atrás y gesto móvil consumen exactamente una transición.
- Enter confirma el alta desde el campo URL.

## Estados y seguridad

- Cargando/procesando, vacío, éxito parcial de refresco, duplicado, URL inválida, índice demasiado grande, JSON inválido y respuesta HTTP fallida.
- La API serverless actúa como proxy de inspección restringido a GitHub para evitar CORS y SSRF.
- No se realizan solicitudes de rastreo ni se reintroducen modelos heredados de tags.
