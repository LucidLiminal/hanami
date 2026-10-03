# Hanami — Mihon Explore Web + Olympus

Primer port manual del catálogo TypeScript de Hanami. Funciona como un único proyecto de Vercel: no usa Docker, Java, Miwayomi ni APK.

## Nuevo en v142: comentarios anclados tras recargar

- Un comentario vuelve a calcular su posición cuando termina de cargar la
  imagen real de la página; ya no conserva el rectángulo temporal de carga.
- Crear o mover un comentario mantiene las mismas coordenadas normalizadas al
  recargar, reabrir una página descargada o volver a mostrarla en el lector.
- Los cambios de tamaño de la página, orientación o zoom vuelven a alinear la
  tarjeta con la imagen sin alterar el comentario guardado.

Versión `5.16.0` · caché PWA `hanami-crimson-knot-v142`.
No hay una migración SQL nueva. Detalles y pruebas:
`READER_COMMENT_COORDINATES_V142.md`.

## Nuevo en v141: arrastre de pins estable en táctil

- El pin musical ya no vuelve a su posición original cuando el navegador
  cancela un gesto táctil tras haberlo movido.
- Los botones de un pin plegado conservan el gesto de arrastre vertical:
  moverlos no abre la tarjeta por accidente y tocar sin moverlos sigue
  desplegándola.
- La coordenada final se toma del último punto del gesto, por lo que se
  conserva al mover el pin tanto hacia arriba como hacia abajo. La cola de
  lectura y la sincronización de grupo mantienen el mismo pin y canción.

Versión `5.15.0` · caché PWA `hanami-crimson-knot-v141`.
No hay una migración SQL nueva. Detalles y pruebas:
`READER_MUSIC_V141.md`.

## Nuevo en v140: sincronización completa de música de grupo

- La cola de pins compartidos ya no se bloquea si una pista tiene una
  carátula que Supabase no admite.
- Los pins pendientes guardados por versiones anteriores se reparan
  automáticamente antes de sincronizarse.
- Una pista no compatible queda como personal en lugar de mantener el resto
  de la cola en **Pendiente**.
- Los miembros del grupo reciben todas las pistas compatibles de las páginas
  sincronizadas, no solo la primera.

Versión `5.14.0` · caché PWA `hanami-crimson-knot-v140`.
No hay una migración SQL nueva. Detalles y pruebas:
`READER_MUSIC_V140.md`.

## Nuevo en v139: cambiar y recolocar los pins musicales

- La tarjeta expandida de cada pin tiene una acción **Cambiar canción**.
  Abre `reader-music-picker` directamente en el contexto de ese pin.
- La nueva elección conserva el pin, sustituye su canción y actualiza la
  cola de lectura activa; no borra archivos ni listas personales.
- Los pins editables se pueden arrastrar verticalmente. La altura nueva se
  guarda como coordenada de lectura y reordena la cola sin cortar la canción
  actual.
- Los cambios de posición y de canción de un pin propio de SoundCloud se
  sincronizan con el grupo. Los pins compartidos de otros lectores permanecen
  bloqueados para edición y arrastre.

Versión `5.13.0` · caché PWA `hanami-crimson-knot-v139`.
No hay una migración SQL nueva. Detalles y pruebas:
`READER_MUSIC_V139.md`.

## Nuevo en v138: tarjetas laterales, listas locales y reproducción continua

- Se elimina `span#readerIndicator`.
- Los marcadores de música son tarjetas plegables en el lateral del lector.
  Cerradas muestran únicamente el botón de desplegar; abiertas muestran
  carátula, título, artista, play/pausa, eliminar y minimizar.
- Eliminar un marcador también retira su canción de la cola activa, sin
  borrar el archivo de la biblioteca ni las listas personales.
- El selector de música incluye **Tus listas**, con las listas reales
  guardadas en este dispositivo. Las listas creadas en v137 se conservan.
- Se corrige el avance automático al terminar una canción y la repetición
  sin otro clic, tanto para archivos locales como para el widget de SoundCloud.
- SoundCloud muestra **Abrir canción en su fuente original**. Los archivos
  locales mantienen una acción distinta y real: **Guardar archivo original**.

Versión `5.12.0` · caché PWA `hanami-crimson-knot-v138`.
No hay una migración SQL nueva: si v137 ya estaba configurada, basta con
desplegar este proyecto y recargar o reabrir la PWA.
Detalles y pruebas: `READER_MUSIC_V138.md`.

## Nuevo en v137: reproductor completo y música compartida

- `reader-music` es una pantalla completa: carátula grande, título y artista,
  progreso, anterior / play-pausa / siguiente y acciones de compartir y descargar.
- Cabecera con minimizar, grupo, letras y cola. Favoritos y listas personales
  se guardan en el navegador; biblioteca y servicios están detrás de sus pestañas.
- Cuatro modos: repetir hasta el siguiente marcador, reproducir una vez y
  esperar al siguiente, repetir toda la cola o reproducirla completa una vez.
- Los dos modos de lectura activan pistas cuando sus marcadores entran en el
  visor. Los dos modos de cola ignoran la posición de los marcadores.
- Los miembros autorizados del grupo activo comparten las pistas de SoundCloud
  y sus posiciones; no se suben archivos de audio locales.

Para activar **pistas compartidas**, ejecuta
`supabase/hanami-group-reader-music-v137.sql` en el proyecto Supabase existente,
con las migraciones sociales v117 y v124 ya aplicadas. El ZIP incluye la
migración, pero no la ejecuta en producción.

Detalles de modos, privacidad, límites y pruebas: `READER_PLAYER_V137.md`.
Versión `5.11.0` · caché PWA `hanami-crimson-knot-v137`.
Después de desplegar, recarga o reabre la PWA.

## Nuevo en v136: acciones de página y selector de música

- La pulsación larga abre una barra con **poner como portada, copiar la imagen,
  compartirla, guardarla, hacer un comentario e instanciar una pista de música**.
- El selector independiente contiene únicamente los servicios de música:
  búsqueda por URL de canción de SoundCloud, **Para ti** con reproducciones
  recientes y **Tendencias** con actividad de otros usuarios.
- Elegir una canción coloca una instancia en el punto de la página; su botón
  permite reproducir o pausar. El historial sigue siendo local. En v137,
  las instancias de SoundCloud también se sincronizan con el grupo activo.
- Las portadas personalizadas se conservan al actualizar los metadatos.

Para activar **Tendencias reales**, ejecuta
`supabase/hanami-reader-music-v136.sql` en el SQL Editor del proyecto Supabase
que ya utiliza Hanami. Se reutilizan `SUPABASE_URL`, `SUPABASE_ANON_KEY` y la
sesión existente; no se necesita una clave `service_role` en el cliente.
Sin servidor, migración, conexión o actividad suficiente se muestra el estado
correspondiente, nunca una lista ficticia de canciones.

Detalles, límites de navegador y pruebas: `READER_PAGE_ACTIONS_V136.md`.
El selector continúa separado del reproductor completo de v137.

## Incluido

- Adaptador `hanami.es.olympus` inspirado en la operación de la extensión Keiyoushi.
- Popular, recientes, búsqueda, detalles, capítulos y páginas.
- Recuperación de listas de capítulos e imágenes desde HTML y payloads embebidos de aplicaciones React/Next.
- Obtención paginada de capítulos desde la API real `panel.olympusxyz.com/api/series/{slug}/chapters`.
- Reconstrucción de rutas `/capitulo/{id}/{slug}` con los identificadores devueltos por el panel.
- Service worker v16 sin reutilización del cuerpo de `Response`.
- Cabeceras de fuente y proxy serverless de imágenes.
- Detección explícita de desafíos anti-bot y cambios de estructura.
- Registro JS propio en `registry/index.json`.
- UI responsiva con Fuentes, Extensiones y Migrar.
- Port web de las agrupaciones, acciones, filtros, búsqueda global, instalación lógica y flujo de migración de Mihon Explore.
- Persistencia de fuentes instaladas, ancladas, recientes, biblioteca y migraciones en el navegador.

## Despliegue

1. Descomprime el proyecto.
2. Impórtalo en Vercel como proyecto nuevo.
3. Framework preset: **Other**.
4. Build command: vacío.
5. Output directory: `public`.
6. Añade `SUPABASE_URL` y `SUPABASE_ANON_KEY` para los grupos compartidos.
7. Para buscar SoundCloud por texto, añade
   `HANAMI_SOUNDCLOUD_CLIENT_ID` y `HANAMI_SOUNDCLOUD_CLIENT_SECRET`. Pegar
   enlaces y reproducir con el widget oficial funciona sin estas variables.
8. Deploy.

## Grupos compartidos

Ejecuta en Supabase SQL Editor, en este orden:

```text
supabase/hanami-social-v117.sql
supabase/hanami-group-library-v118.sql
supabase/hanami-invite-access-v120.sql
supabase/hanami-library-parity-v125.sql
```

Después habilita **Authentication → Providers → Anonymous Sign-Ins**. Hanami
crea identidades ligadas al dispositivo y consume invitaciones privadas de un
solo uso; ya no depende de enlaces mágicos por correo.

Las salas no ocupan una pestaña principal. Aparecen bajo la toolbar de
**Biblioteca** como una barra horizontal compacta de accesos circulares. Un
toque alterna entre la biblioteca personal y la biblioteca independiente de
cada sala; una pulsación prolongada abre sus detalles. La sala activa encabeza
su estantería, **Recomendar lectura** es la primera tarjeta y **Actualizar
biblioteca** del menú actualiza el grupo que se esté mostrando. Las bibliotecas
de grupo reutilizan las mismas pestañas, subpantallas de categorías, gestos de
selección y barras contextuales que la Biblioteca personal.

## Desarrollo local

```bash
npm run dev
```

Abre `http://127.0.0.1:4173`. Este comando usa el servidor local incluido y evita la invocación recursiva de Vercel.

No abras `public/` con `python -m http.server`, `serve`, Live Server ni un
preview exclusivamente estático: esos servidores muestran la interfaz, pero
devuelven 404 para `/api/music/*` y para el resto de funciones serverless. Se
puede comprobar el runtime correcto con:

```bash
curl http://127.0.0.1:4173/api/music/capabilities
```

Para emular expresamente el entorno de Vercel, ejecuta `npm run dev:vercel` desde una terminal normal. En los ajustes del proyecto de Vercel, deja **Development Command** en automático o usa `node dev.mjs`; no lo configures como `vercel dev`.

También puede desplegarse con Vercel CLI:

```bash
npm test
vercel
```

`vercel.json` reescribe `/api/*` a una función Node serverless. La lectura local
no necesita variables. La sincronización social requiere `SUPABASE_URL` y
`SUPABASE_ANON_KEY`; opcionalmente `OLYMPUS_BASE_URL` permite cambiar el espejo.

## Estado del port

El contrato completo está probado con fixtures realistas. La fuente se marca **BETA** hasta validar desde una región de Vercel contra el sitio real. Si Olympus presenta Cloudflare/reCAPTCHA o cambia su HTML, la API devuelve un diagnóstico; nunca transforma el fallo en una lista vacía.

## Límites

Vercel no ejecuta las APK originales. Este proyecto contiene una reimplementación JavaScript mantenida por Hanami. No elude CAPTCHA, autenticación ni controles de acceso. Respeta los términos de la fuente y los derechos sobre el contenido.

## Música durante la lectura

El visor incluye un reproductor y servicios musicales adaptados de la
arquitectura de TSuki. Pulsa **Música** en la barra inferior del capítulo.
La pantalla principal muestra la canción y los controles; la cabecera abre
letras, cola y grupo. Desde **Cola → Biblioteca** puedes:

- buscar pistas públicas en SoundCloud mediante su API oficial;
- pegar un enlace de una pista y resolverlo mediante oEmbed, incluso sin
  credenciales de API;
- reproducir mediante el SDK oficial `SC.Widget`: el audio va directamente de
  SoundCloud al navegador y nunca atraviesa Vercel;
- reconocer música ambiental con el micrófono y una firma compatible con
  Shazam;
- obtener letras de LRCLIB, Unison, Paxsenix y BetterLyrics, con seguimiento
  automático cuando están sincronizadas;
- importar MP3, M4A, AAC, WAV, OGG, Opus, FLAC o playlists M3U/M3U8 como
  alternativa local;
- conservar biblioteca, cola, posición, repetición, aleatorio y letras entre
  capítulos y recargas.

La búsqueda textual usa OAuth Client Credentials. El secreto permanece en el
backend y el token se reutiliza; nunca se incorpora al JavaScript público. Una
pista puede aparecer como `playable`, `preview` o `blocked`, y Hanami solo
ofrece resultados reproducibles e insertables.

El widget vive en un iframe aislado. Hanami controla play, pausa, posición,
cola y Media Session; la reproducción se mantiene siempre al volumen máximo.
El reproductor no incluye crossfade, ecualizador ni temporizador.

Hanami almacena únicamente el enlace y los metadatos de SoundCloud. No descarga
ni conserva audio para uso sin conexión. Los resultados muestran atribución y
un enlace a la pista original. Shazam y algunos proveedores de letras son
servicios externos y pueden cambiar o limitar solicitudes; el micrófono solo se
activa tras una acción explícita.

Consulta `READER_PLAYER_V137.md`, `SOUNDCLOUD_WIDGET_V135.md`, `READER_MUSIC_V128.md` y
`THIRD_PARTY_NOTICES.md` para la arquitectura, configuración y atribución.

## Identidad visual v133

La piel **Crimson Knot** incorpora el logo de nudo y agujas, una paleta cálida carmesí y recursos PWA renovados. Consulta [BRANDING_V133.md](BRANDING_V133.md).
