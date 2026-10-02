# Música del lector — v138

Versión de aplicación: `5.12.0`. Caché PWA: `hanami-crimson-knot-v138`.

## Tarjetas de música

Se ha retirado `span#readerIndicator` y sus escrituras desde JavaScript.
Los anclajes de las canciones siguen asociados al punto de lectura, pero
la tarjeta visible vive en el lateral derecho de la pantalla, no encima
de la coordenada de la imagen.

- Minimizada: únicamente un botón de desplegar.
- Desplegada: carátula, título, artista, página y ámbito del marcador,
  play/pausa, eliminar y minimizar.
- Solo se muestran las tarjetas cuyos puntos de lectura están en el visor.
  Una pila desplazable evita que varios marcadores se superpongan.
- Solo hay una tarjeta desplegada a la vez. Escape la minimiza y devuelve
  el foco a su botón, sin cerrar el lector.
- Los controles tienen etiquetas accesibles y áreas táctiles de al menos
  44 px. Las tarjetas respetan el espacio de las barras del lector.

La acción de eliminar quita el marcador y su canción de la cola activa.
Si era la canción activa y estaba reproduciéndose, continúa la siguiente
canción disponible. Si la cola queda vacía, se detiene. No se borra el
archivo importado ni se modifica el contenido de las listas personales.
Los permisos de los marcadores compartidos se mantienen: otros miembros
no pueden borrar un marcador ajeno sin autorización del grupo.

## Tus listas en el selector

`reader-music-services reader-music-picker` muestra una sección
**En este dispositivo / Tus listas** antes de los recientes.
Cada lista se despliega para mostrar sus canciones disponibles, sus
carátulas y un botón para elegir cada pista.

- Desde una página del lector, elegir una canción crea un marcador en
  esa página y punto de lectura.
- Sin un punto de página, elegir una canción inicia esa lista personal
  desde la canción seleccionada.
- Las listas son personales y no se publican en el grupo.
- Se conserva la clave de almacenamiento utilizada en v137, por lo que
  no hay que volver a crear las listas ni los favoritos.
- Si no hay listas, se muestra un estado vacío. Si faltan canciones de
  una lista, se informa del número de pistas no disponibles.

## Fin de canción y continuidad

Se conservan los cuatro modos existentes:

| Modo | Al terminar |
| --- | --- |
| Lector · Repetir | Reinicia la canción hasta el siguiente marcador. |
| Lector · Una vez | Espera al siguiente marcador. |
| Lista · Repetir | Avanza y vuelve al principio al completar la lista. |
| Lista · Una vez | Avanza y se detiene al completar la lista. |

En SoundCloud se reutilizan el iframe y la instancia autorizada del
widget oficial. Para repetir la misma canción se utiliza `seekTo(0)`
seguido de `play()`, sin volver a cargar el iframe. Para cambiar de pista
se confirma la canción tras el callback de `load()` antes de reproducirla.
Se descartan eventos de fin, pausa y progreso de solicitudes anteriores.
El sondeo de posición sigue cubriendo la ausencia de un evento `FINISH`.

En archivos locales se conserva el elemento de audio y la fuente cuando
se repite la misma canción. El final natural avanza la cola o reinicia
según el modo, sin pedir otro clic. Una pausa manual cancela las solicitudes
de reproducción pendientes.

La selección automática de un marcador ya activo no reinicia la canción
ni pisa la cola. Al volver del selector al lector se actualizan las
tarjetas, también en bibliotecas locales sin sincronización de grupo.

Referencia de la API utilizada:
[SoundCloud HTML5 Widget API](https://developers.soundcloud.com/docs/api/html5-widget).

## Fuente original y archivos

Las canciones de SoundCloud tienen un enlace normal con la etiqueta
**Abrir canción en su fuente original**. Abre el permalink de la canción
en una pestaña nueva. No se presenta como descarga ni utiliza un relay
para obtener el audio.

Una canción importada que conserva su archivo local tiene la acción
**Guardar archivo original**. Esta acción guarda los bytes del archivo
importado; no pretende descargar una canción remota.

## Validación

- `npm test`: 109 comprobaciones satisfactorias.
- `npm run test:e2e:reader-v138`: tarjetas, listas reales, fuente original,
  eliminación de marcador y cola, permisos compartidos, estados vacíos,
  navegación por teclado y tamaños de 320, 390 y 1280 px.
- Fixture estricto del SDK: los cuatro modos al terminar naturalmente,
  callback de carga, eventos antiguos y recuperación de `FINISH` ausente.
- Audio WAV real en Chromium: avance y repetición tras el evento natural
  `ended`, sin sustituir la fuente de la canción repetida.
- Prueba adicional con el SDK real de SoundCloud, sin fixture: repetición
  y paso a la siguiente canción sin otra interacción tras iniciar el audio.
- Regresiones del reproductor v137, acciones de página v136, widget v135,
  archivos locales v128 y consola/PWA v130 superadas.
- Revisión visual de las tarjetas, las listas y el enlace de origen en
  móvil y escritorio.

Las pruebas de reproducción se realizaron en Chromium. La disponibilidad
de una canción remota y las políticas de audio del navegador siguen
dependiendo del proveedor y del dispositivo. El inicio de reproducción
puede requerir la interacción inicial habitual del navegador.

## Despliegue

El proyecto mantiene la estructura de Vercel existente. No se añade ninguna
migración SQL ni se ejecuta SQL en producción con esta entrega.
Si la música compartida de v137 ya está configurada, solo hay que desplegar
y recargar o reabrir la PWA para recibir los nuevos assets.

Si todavía no se habilitó la música compartida, se mantiene la migración
existente `supabase/hanami-group-reader-music-v137.sql` y sus requisitos,
documentados en `READER_PLAYER_V137.md`.