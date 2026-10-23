# Caché de portadas — v104

## Referencia portada desde Mihon

Se revisaron `CoverCache.kt`, `MangaCoverFetcher.kt`, `MangaCoverKeyer.kt`, `UpdateMangaFromRemote.kt` y la configuración de Coil en `App.kt`. Hanami reproduce sus contratos útiles en web: clave por URL de portada, caché persistente especial para Biblioteca, caché temporal para resultados externos, lectura desde disco antes de red e invalidación cuando cambia la URL. Las portadas locales/custom continúan en IndexedDB y no se duplican.

## Sub-screens y superficies cubiertas

- Biblioteca: cuadrículas, lista, categorías, selección y detalle.
- Actualizaciones e Historial.
- Explorar: fuentes, búsqueda por fuente, búsqueda global, extensiones, migración y resultados.
- Detalle reutilizable abierto desde Biblioteca, Explorar o migración.
- Tracking y resultados que adjunten una portada.
- Datos y almacenamiento: métricas y limpieza dedicada.
- Se excluyen el lector, páginas de capítulos, assets empaquetados, `blob:`/`data:` y los dominios de rastreo prohibidos.

## Política offline y evicción

- Cache Storage independiente: `hanami-covers-v1`.
- El Service Worker consulta portadas antes de la red y conserva el caché entre actualizaciones del shell.
- Biblioteca: entradas fijadas mientras la obra siga guardada.
- Explorar/búsquedas: LRU temporal, caduca tras 30 días sin uso.
- Límite blando: 400 entradas o 128 MiB; se expulsan primero portadas no fijadas, de menor uso reciente a mayor.
- Límite duro: 800 entradas o 256 MiB para evitar crecimiento sin cota.
- Con más del 82 % de la cuota del origen ocupada, el objetivo baja a 240 entradas/80 MiB.
- Respuestas opacas sin tamaño observable usan una estimación conservadora de 128 KiB.
- Una URL de portada nueva invalida inmediatamente la anterior.

## Barras, itemOverflow y diálogos

- No se añade ninguna barra ni itemOverflow artificial: la caché actúa transversalmente y no cambia la navegación.
- Más → Datos y almacenamiento muestra cantidad, tamaño estimado y cuántas portadas pertenecen a Biblioteca.
- «Limpiar caché de portadas» abre un diálogo destructivo con la opción marcada «Conservar portadas de Biblioteca».
- Toque exterior, Escape y Back mantienen el comportamiento centralizado de diálogos existente.

## Acciones, estados y efectos

- Precarga en tiempo ocioso, deduplicación de solicitudes simultáneas y reconciliación tras cambios de Biblioteca.
- Quitar una obra deja su portada como temporal, disponible hasta la siguiente poda.
- Migrar o cambiar metadatos fija la portada nueva y libera la URL sustituida.
- La carga aplica un fundido corto y desaturado; `prefers-reduced-motion` desactiva la transición.
- Tap, long press, swipe, scroll, cambio de pestaña y Back no causan descargas duplicadas ni entradas de historial.

## Validación

- Regresión del plan LRU/TTL, protección de Biblioteca, integración SW, UI de almacenamiento y dominios bloqueados.
- E2E móvil: guarda dos portadas, limpia solo la temporal y verifica que la portada de Biblioteca carga con Chromium completamente offline.
