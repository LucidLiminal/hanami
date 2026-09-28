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
supabase/hanami-group-administration-v124.sql
```

Después habilita **Authentication → Providers → Anonymous Sign-Ins**. Hanami
crea identidades ligadas al dispositivo y consume invitaciones privadas de un
solo uso; ya no depende de enlaces mágicos por correo.

Las salas no ocupan una pestaña principal. Aparecen bajo la toolbar de
**Biblioteca** como una barra horizontal compacta de accesos circulares. Un
toque alterna entre la biblioteca personal y la biblioteca independiente de
cada sala; una pulsación prolongada abre sus detalles. La sala activa encabeza
su estantería, **Recomendar lectura** es la primera tarjeta y **Actualizar
biblioteca** del menú actualiza el grupo que se esté mostrando.

## Desarrollo local

```bash
npm run dev
```

Abre `http://127.0.0.1:4173`. Este comando usa el servidor local incluido y evita la invocación recursiva de Vercel.

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
