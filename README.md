# Hanami — Mihon Explore Web + Olympus

Primer port manual del catálogo TypeScript de Hanami. Funciona como un único proyecto de Vercel: no usa Docker, Java, Miwayomi ni APK.

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
7. Deploy.

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
arquitectura de TSuki. Pulsa **Música** en la barra inferior del capítulo para:

- buscar canciones y artistas con una interfaz tipo YouTube Music, sin pegar
  URLs;
- añadir y reproducir resultados mediante InnerTube; Hanami conserva las URLs
  firmadas en el servidor, transmite el audio por una ruta same-origin y las
  renueva cuando caducan;
- reconocer música ambiental con el micrófono y una firma compatible con
  Shazam;
- obtener letras de LRCLIB, Unison, Paxsenix y BetterLyrics, con seguimiento
  automático cuando están sincronizadas;
- usar un ecualizador Web Audio de 10 bandas, refuerzo de graves, amplitud
  estéreo, ganancia y preajustes;
- importar MP3, M4A, AAC, WAV, OGG, Opus, FLAC o playlists M3U/M3U8 como
  alternativa local;
- conservar biblioteca, cola, posición, preferencias, letras y efectos entre
  capítulos y recargas.

La URL manual queda disponible sólo como opción avanzada. InnerTube acepta
únicamente formatos de audio directos entregados por YouTube: Hanami no
implementa descifrado de firmas, descarga de contenido protegido, evasión de
DRM ni bloqueo de anuncios. Shazam y algunos proveedores de letras son
endpoints externos no oficiales y pueden cambiar o limitar solicitudes. El
micrófono sólo se activa tras una acción explícita del usuario.

Si YouTube aplica una comprobación anti-bot a la IP del servidor, el despliegue
puede conectar su propio adaptador NewPipe/yt-dlp mediante
`HANAMI_YOUTUBE_RESOLVER_URL` y, opcionalmente,
`HANAMI_YOUTUBE_RESOLVER_TOKEN`. Las credenciales permanecen en el servidor.

Consulta `READER_MUSIC_SERVICES_V129.md`, `YOUTUBE_AUDIO_PROXY_V131.md`,
`GOOGLEVIDEO_RETRY_V132.md` y `THIRD_PARTY_NOTICES.md` para la arquitectura,
límites, atribución y licencia de TSuki.
