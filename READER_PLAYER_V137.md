# Reproductor completo y pistas compartidas · v137

Versión `5.11.0` · caché PWA `hanami-crimson-knot-v137`.

## Pantalla del reproductor

`reader-music` ocupa toda la pantalla y mantiene la distribución de la
referencia: cabecera con minimizar, estado, grupo, letras y cola; carátula
grande; título y artista; añadir a una lista y favoritos; progreso y tiempos;
anterior, play/pausa y siguiente; orden lineal/aleatorio; modo de lectura;
compartir y descargar.

El fondo usa la carátula real con desenfoque. Si no existe una carátula,
aparece un símbolo de disco, no una imagen ni metadatos inventados.
En escritorio, carátula y controles se distribuyen en dos columnas.

La biblioteca, las listas, las letras, los modos y el grupo se abren como
paneles secundarios. Atrás, Escape y el botón de cierre regresan al reproductor;
minimizar vuelve al visor sin interrumpir la música. Recargar una lectura
guardada restaura también el reproductor y el panel secundario abierto,
sin añadir entradas duplicadas a Atrás/Adelante. Los ajustes del lector
siguen usando su propia navegación de overlays.

Favoritos y listas se conservan en este navegador y no se publican en el grupo.
La búsqueda, el reconocimiento y la importación anteriores siguen disponibles
en **Cola → Biblioteca**. El selector URL de la pulsación larga continúa siendo
una pantalla independiente: no mezcla el reproductor con `reader-music-services`.

## Los cuatro modos

| Número | Modo | Al terminar la canción | Marcadores del visor |
| --- | --- | --- | --- |
| 1 | Lector · Repetir | Repite la canción activa | El siguiente marcador visible cambia la canción |
| 2 | Lector · Una vez | Pausa y espera | El siguiente marcador visible inicia su canción |
| 3 | Cola · Repetir | Avanza; al completar la cola, vuelve a empezar | No cambia automáticamente por los marcadores |
| 4 | Cola · Una vez | Avanza; al completar la cola, se detiene | No cambia automáticamente por los marcadores |

La cola se recorre en orden lineal o aleatorio según el botón de orden. En
aleatorio, el modo 4 visita cada canción una vez y termina: no queda en un
bucle de selecciones aleatorias. Al pasar de un marcador a un modo de cola,
se prepara la música de las páginas de lectura actualmente cargadas y se
empieza por la primera pista. No se descargan capítulos todavía no cargados.

En los modos 1 y 2, la entrada del centro de un marcador en `readerViewport`
activa su pista. Se usa el orden de las páginas y la dirección del
desplazamiento, tanto al avanzar como al volver atrás. Un marcador que sigue
visible no reinicia continuamente la canción. Abrir el reproductor, el
selector o un editor suspende esta detección mientras el visor está bloqueado.

Una pausa manual suspende la activación automática hasta volver a reproducir
o tocar un marcador. Si el navegador bloquea el primer audio automático,
se pide tocar Reproducir o el marcador. Recargar restaura la biblioteca y las
preferencias, pero deja el audio pausado. Las cargas canceladas y los eventos
tardíos de SoundCloud no deben reanudar una pausa ni una cola terminada.

## Compartir la banda sonora en el grupo

Una instancia creada con un grupo remoto activo comparte:

- La identidad de la obra, el capítulo y la página.
- Sus coordenadas relativas en esa página.
- El enlace público de SoundCloud y los metadatos acotados de la canción.

Es información privada del grupo, no un catálogo público. Se reutilizan la
sesión y los permisos sociales existentes. Los miembros activos pueden
publicar; miembros silenciados pueden consultar, pero no publicar; los
bloqueados o ajenos al grupo no pueden consultar ni publicar. El autor puede
retirar su instancia y los administradores autorizados pueden moderarla.

La sincronización se actualiza al cambiar de grupo, recuperar conexión y
periódicamente cada 25 segundos mientras el visor está visible. Las
operaciones pendientes conservan autor, UUID y revisión; los reintentos son
idempotentes y una cuenta diferente nunca publica la cola de otra cuenta.
Una denegación de lectura retira los marcadores compartidos visibles.

**Grupo → Compartir mis pistas de esta lectura** permite publicar explícitamente
las pistas personales o anteriores de las páginas cargadas. No se publican
automáticamente marcadores antiguos. Los archivos locales no se suben; el
modo incógnito no publica instancias ni envía actividad musical.

La identidad musical usa el enlace estable de la obra, no un ID de biblioteca
distinto en cada dispositivo. Las instancias locales anteriores que usaban
ese ID se conservan y migran sin publicarse; no se cambian las claves de los
comentarios ni del progreso de lectura.

El historial personal, favoritos y listas permanecen en el dispositivo.
Las tendencias v136 reciben únicamente actividad de canciones públicas:
no reciben coordenadas, páginas, comentarios ni archivos de audio.
Cada lector conserva sus propios controles, pausa y preferencias; no se
sincroniza el segundo exacto de reproducción entre dispositivos.

## Activación del servidor

1. Conserva las variables `SUPABASE_URL` y `SUPABASE_ANON_KEY` existentes.
2. Con las migraciones sociales v117 y v124 aplicadas, ejecuta
   `supabase/hanami-group-reader-music-v137.sql` en el SQL Editor de Supabase.
3. Despliega el proyecto y recarga la PWA para activar la caché v137.

La migración es transaccional y puede volver a aplicarse. La tabla privada
no admite acceso directo de clientes; los RPC verifican `auth.uid()` y la
pertenencia al grupo. El actor no procede de un campo enviado por el navegador.
Se validan URL, metadatos, página, coordenadas y revisión, con límites de
20 instancias activas por página y 60 cambios de marcadores distintos por
minuto y autor. Las lecturas de páginas autorizadas no se truncan silenciosamente.

Sin configuración, sesión, conexión o migración, la interfaz muestra el estado
real y no simula datos compartidos. La migración v136 para **Tendencias** es
independiente: aplica también `supabase/hanami-reader-music-v136.sql` si no
estaba activada. Este proyecto no incluye ninguna clave `service_role` pública.

## Compartir y descargar audio

- Un archivo local se comparte como `File` cuando Web Share lo permite y se
  descarga con sus bytes y nombre originales, sanitizando caracteres inválidos.
- SoundCloud se comparte mediante su enlace original. Descargar abre la fuente
  y explica que depende de la autorización del artista; no extrae el stream,
  elude restricciones ni promete audio sin conexión.
- Si el navegador no permite compartir, se muestra un aviso útil; cancelar el
  diálogo de compartir no se considera un error.

La música sigue usando `SC.Widget`; el audio no atraviesa Vercel. No se
reintroducen volumen, crossfade, ecualizador ni temporizador.

## Pruebas

- `npm test`: 108 comprobaciones unitarias y regresiones.
- `npm run test:e2e:reader-player`: móvil y escritorio, navegación de paneles,
  favoritos/listas, letras/cola, recarga/Atrás/Adelante, los cuatro modos, fin de cola aleatoria,
  activación de marcadores, dos cuentas, pausa, cola pendiente e incógnito.
- Regresiones E2E de SoundCloud v135, audio local v128, runtime v130,
  acciones de página v136 y comentarios v115/v126.
- `npm run test:sql:group-music`: ejecuta y reaplica el SQL en PostgreSQL local
  con PGlite; comprueba permisos, actor, revisiones, moderación y límites.
  Usa `PGLITE_PATH` para señalar una instalación externa de PGlite.
- La regresión local verifica compartir un `File` y que el archivo descargado
  contiene exactamente los bytes originales del WAV de prueba.

Las E2E requieren Playwright, Sharp y un Chromium disponible; puedes indicar
su ejecutable mediante `CHROMIUM_PATH`. Son herramientas de prueba, no
dependencias del servidor de Hanami. Para las pruebas SQL se utiliza una
instalación externa de `@electric-sql/pglite` indicada por `PGLITE_PATH`.

Las E2E musicales usan fixtures locales de la interfaz del SDK de SoundCloud,
incluyendo eventos `FINISH`, además del sondeo cuando falta un evento de carga.
No son una certificación de disponibilidad de SoundCloud, letras o Supabase
en producción. Los SQL se validaron localmente; no se ejecutaron en el servidor
del usuario. La imagen del álbum aportada para la referencia se conserva solo
como fixture de prueba, no como canción precargada de la aplicación.