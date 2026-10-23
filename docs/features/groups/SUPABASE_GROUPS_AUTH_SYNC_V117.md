# v117 — autenticación y sincronización de grupos con Supabase

## Resultado

Hanami incorpora un adaptador Supabase opcional que mantiene intacto el funcionamiento local-first de v116.

Cuando Supabase está configurado:

- el usuario entra mediante enlace mágico por correo;
- la sesión se conserva y renueva;
- las salas privadas se cargan según la membresía;
- se pueden crear salas remotas;
- se puede entrar mediante código de invitación;
- los comentarios pendientes se envían desde `syncQueue`;
- los comentarios remotos se fusionan por `id` y `revision`;
- imágenes y GIF se suben al bucket privado `comment-media`;
- los autores se muestran sobre los comentarios;
- la sincronización se reintenta al recuperar conexión.

Sin Supabase, las salas, comentarios, importación y exportación siguen funcionando localmente.

## Configuración en Vercel

Añadir:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<public-anon-key>
```

Hanami expone únicamente esos valores públicos mediante:

```text
GET /api/social-config
```

No se utiliza ni se expone una clave `service_role`.

Para desarrollo también puede configurarse el proyecto desde la pestaña **Grupos**. Esa configuración queda limitada al navegador.

## Preparación de Supabase

Ejecutar en el SQL Editor:

```text
supabase/hanami-social-v117.sql
```

El script crea:

- `profiles`;
- `reading_groups`;
- `reading_group_members`;
- `reader_comments`;
- funciones para crear, listar y unirse a grupos;
- trigger para perfiles;
- políticas Row Level Security;
- bucket privado `comment-media`;
- políticas de Storage basadas en membresía.

En Authentication → URL Configuration debe añadirse la URL desplegada de Hanami como URL permitida para redirecciones.

## Sincronización

La cola de IndexedDB sigue siendo la fuente local inmediata:

1. Crear, editar, mover, redimensionar o eliminar un comentario escribe localmente.
2. Se añade una operación a `syncQueue`.
3. Al sincronizar, los adjuntos se suben primero.
4. El comentario se inserta o actualiza con `on_conflict=id`.
5. La operación se elimina de la cola solo tras respuesta correcta.
6. Después se descargan los comentarios permitidos por RLS.

v117 no añade presencia ni actualizaciones en tiempo real; esas capacidades quedan para v118.

## Validación

- Regresión: `tests/supabase-groups-auth-sync-v117.test.mjs`
- Prueba móvil simulando Supabase: `tests/supabase-groups-mobile-v117.e2e.mjs`
- Viewport: 390 × 844
- Versión: `5.8.50`
- Caché: `hanami-supabase-groups-auth-sync-v117`