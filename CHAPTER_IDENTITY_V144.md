# Identidad estable y recuperación — v144

Aplicación `5.18.0`, caché PWA `hanami-crimson-knot-v144`, adaptador Olympus
`1.4.0`. Este paquete está preparado para despliegue; no modifica por sí solo
la aplicación ni la base de datos de producción.

## Qué cambia

La identidad lógica del capítulo se separa de su dirección externa:

- `workId` y `chapterId` identifican internamente la obra y el capítulo.
- Una fuente con un ID primario fiable permite reconocer el mismo capítulo
  aunque su dirección cambie. En Olympus se conserva el ID de la API y se
  reconoce el identificador numérico o UUID de `/capitulo/{id}/…`.
- Si la fuente no ofrece un ID fiable, Hanami emite una identidad local y la
  conserva en un registro persistente. Una URL distinta no se fusiona por
  coincidencia de número o título: requiere una equivalencia revisada.
- Las equivalencias manuales están acotadas a la fuente y la sala. Aplicarlas
  también al progreso personal es una decisión adicional, cuando corresponde.
- Los registros y colas anteriores conservan sus IDs, claves, autores y
  revisiones. La capa de compatibilidad resuelve las referencias antiguas;
  no vacía las colas ni vuelve a crear las anotaciones.
- Si dos dispositivos han emitido identidades provisionales diferentes para
  un mismo localizador exacto, se añade una redirección lógica al ID canónico
  de la sala. No se reescriben las claves de los registros existentes.

Los comentarios y pins nuevos llevan metadatos de identidad. El transporte
heredado por URL sigue presente para compatibilidad; deja de ser el único
criterio de reconocimiento en v144. Los triggers SQL completan estos metadatos
cuando la escritura puede asociarse con una identidad registrada.

## Orden de actualización

1. Conserva una copia del proyecto anterior y una copia de seguridad de Supabase.
   No elimines los datos de la PWA, IndexedDB, la sesión anónima ni las colas.
2. En el editor SQL de Supabase, con una cuenta administradora del proyecto,
   ejecuta **`supabase/hanami-chapter-identity-v144.sql`**. Deben estar aplicadas
   las migraciones existentes de este proyecto: `hanami-social-v117.sql`,
   `hanami-group-library-v118.sql`, `hanami-group-administration-v124.sql` y
   `hanami-group-reader-music-v137.sql`. No hace falta volver a ejecutarlas
   si ya estaban instaladas para v143.
3. Despliega este proyecto en **el mismo proyecto y origen de Vercel**. Mantén
   las variables de entorno actuales. Un dominio de preview o un proyecto
   diferente tiene otro almacenamiento local: el ZIP no mueve los datos allí.
4. Cierra las pestañas antiguas de Hanami y vuelve a abrir la PWA o recarga la
   aplicación. Hazlo en los dispositivos de todos los miembros de la sala.
   La caché de aplicación cambia a v144 sin borrar las páginas descargadas.
5. Entra en **Más → Datos y almacenamiento → Identidad y recuperación**.
   Descarga **Copia previa protegida** antes de confirmar asociaciones manuales.

El SQL es transaccional y se puede volver a ejecutar. Si falta un requisito,
la transacción debe fallar sin dejar una migración parcialmente aplicada.
No ejecutes scripts para vaciar tablas o reinstalar las cuentas.

## Copias y reversibilidad

### Copia local

Antes de introducir las identidades, Hanami guarda una copia inmutable
`before-v144` en una base IndexedDB separada. Incluye las bases de comentarios
con sus colas, la biblioteca musical con sus blobs de audio y las claves locales
de lectura pertinentes. Excluye las sesiones y la configuración de autenticación
almacenadas por Hanami.

Si no puede guardar esta copia —por falta de espacio, bloqueo de IndexedDB u
otro error—, no autoriza la migración de identidad. Conserva los datos; cierra
otras pestañas si están bloqueando la base, comprueba el espacio y recarga.
No borres datos para solventarlo.

Cada equivalencia manual y resolución de conflicto obtiene además una copia
previa. **Crear copia completa actual** permite descargar otra copia con los
archivos locales. Las copias descargadas pueden contener anotaciones privadas;
consérvalas en un lugar seguro.

### Copia remota

El SQL guarda una copia de las tablas de comentarios, pins de grupo y progreso
antes de añadir metadatos, en el esquema privado `hanami_recovery`. Las cuentas
normales de la aplicación no pueden leerla. Reejecutar el SQL no sustituye esas
copias por el estado posterior.

Esta copia incluye registros y referencias a medios; **no duplica los objetos
de los buckets ni las tablas de autenticación**. Mantén también la copia de
seguridad normal de Supabase y de sus medios.

### Deshacer

**Deshacer equivalencias posteriores** solo revierte decisiones de alias locales.
Mantiene los IDs emitidos, los comentarios, los pins, las colas y los cambios de
lectura posteriores. No revierte equivalencias ya publicadas en una sala.

El JSON completo sirve para una restauración supervisada de datos. Esta versión
no lo importa automáticamente sobre revisiones remotas posteriores ni resucita
registros eliminados. Volver al ZIP anterior tampoco borra las copias ni obliga
a deshacer las columnas SQL aditivas; un cliente antiguo, sin embargo, no sabe
resolver los nuevos alias.

## Recuperar asociaciones que dejaron de verse

1. Abre o actualiza la obra correcta para que su lista actual de capítulos quede
   disponible. Si vas a recuperar anclajes, abre también el capítulo para conocer
   su distribución de páginas.
2. En **Identidad y recuperación**, elige el ámbito correcto y pulsa
   **Actualizar inventario**. Las filas distinguen identidades reconocidas de
   referencias pendientes. Los fragmentos y URLs solo se muestran localmente;
   el inventario no sube el progreso personal ni el audio al servidor.
3. Para una referencia pendiente, despliega **Ver referencias originales** y
   comprueba el capítulo real de destino. No se selecciona ningún destino por
   defecto ni se presupone que dos «capítulos 7» sean el mismo.
4. Confirma que son la misma obra y capítulo **y** que las páginas conservan
   su orden y distribución. Si hay anotaciones en páginas que no existen en el
   destino conocido, Hanami bloquea la equivalencia.
5. En una sala remota, elige por separado si quieres aplicarla al progreso
   personal o compartirla con la sala. Publicar la equivalencia exige ser
   propietario o moderador; los permisos del servidor siguen siendo la autoridad.
6. Reabre el capítulo. Las anotaciones compatibles se reconocen sin cambiar
   sus registros originales. Las operaciones pendientes mantienen sus claves y
   siguen el proceso normal de sincronización cuando hay acceso y conexión.

Si dos estados históricos de lectura o marcador se contradicen y no existe
una decisión explícita fechada, se conservan para revisión. La interfaz exige
confirmar **tanto lectura como marcador** antes de resolverlos. Una decisión
explícita posterior de marcar «no leído» se conserva al cambiar la URL.

## Compatibilidad y límites

- Con SQL anterior, la recuperación local sigue funcionando y la música utiliza
  el RPC anterior cuando Supabase informa de que el nuevo no existe. No se usa
  ese fallback para eludir una denegación de acceso.
- Para que otros dispositivos reciban alias compartidos y busquen música remota
  por identidad, hacen falta el SQL v144 y clientes v144. Los lectores anteriores
  siguen sujetos a sus comparaciones por URL.
- Se pueden recuperar comentarios, canciones y estados si sus registros siguen
  en el dispositivo o en Supabase y hay evidencia de la identidad del capítulo.
  Un archivo de audio borrado, un comentario realmente eliminado o una canción
  retirada de su proveedor no se reconstruyen sin una copia disponible.
- El reconocimiento de Olympus depende de que la fuente conserve un ID primario
  real. Si cambia ese ID o reutiliza una dirección para otro capítulo, corresponde
  revisar la equivalencia, no fusionar automáticamente.
- **Identidad del capítulo no equivale a identidad visual de cada página.** Los
  anclajes actuales usan posiciones de página. Un cambio conocido en el número
  de páginas suspende los anclajes hasta revisión; una reordenación con el mismo
  número no puede detectarse automáticamente. Otra edición, páginas divididas
  o un orden distinto requieren una correspondencia de páginas antes de migrar
  las coordenadas; esta versión no inventa esa correspondencia.
- La biblioteca personal continúa siendo local. No se convierte en una nueva
  sincronización de cuentas entre navegadores ni fuentes diferentes.

No se ha realizado una recuperación de los datos reales del usuario con este
paquete. El inventario disponible después del despliegue permite verificar qué
registros siguen presentes y cuáles necesitan revisión.

## Validación del paquete

- `npm test`: los 112 scripts de regresión terminan correctamente, incluida la
  batería de UUID estables, aislamiento, metadatos y estados contradictorios.
- `npm run test:identity:sql`, con PGlite disponible mediante `PGLITE_PATH`:
  PostgreSQL embebido valida reejecución, copias privadas, RLS, IDs canónicos,
  alias autorizados, consulta de música histórica y claves originales intactas.
- La regresión SQL de música de grupo v137 permanece compatible.
- `npm run test:e2e:identity`, con `HANAMI_TEST_URL` apuntando al servidor local:
  Chromium verifica copias con audio, cambio de dominio/slug, recuperación
  automática y revisada, seis operaciones ficticias conservadas, conflictos
  explícitos y deshacer sin destruir IDs ni lecturas nuevas.
- Las regresiones de comentarios v143 y música v141 verifican coordenadas,
  pins, reemplazo, arrastre, permisos, colas y reproducción. La prueba de música
  cubre tanto un servidor sin las funciones v144 como el contrato actualizado.

Las cifras y registros de estas pruebas son **fixtures**, no datos de producción.
