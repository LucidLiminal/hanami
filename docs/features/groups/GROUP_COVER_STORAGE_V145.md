# Portadas ligeras y un único archivo por grupo — v145

Aplicación `5.19.0`, caché PWA `hanami-crimson-knot-v145`.
Esta entrega prepara los cambios; no modifica producción por sí sola.

## Límites

- Original: JPG, PNG, WebP o GIF, de hasta 10 MiB y 40 megapíxeles.
- Resultado: WebP estático de como máximo 1 MiB (1.048.576 bytes), con un lado
  largo de como máximo 1280 píxeles. Se conserva la proporción y no se amplía.
- El navegador reduce dimensiones y calidad antes de enviar el archivo. Los GIF
  se convierten en una imagen estática; no se conserva la animación.
- El bucket `group-covers` también rechaza subidas mayores de 1 MiB y MIME
  distintos de `image/webp`, aunque no se use la interfaz de Hanami.
- El límite de 1280 píxeles lo aplica el cliente, no el bucket.
- Las salas locales usan la misma compresión, pero no suben archivos a Supabase.

## Un archivo reutilizado

```text
group-covers/<uuid-del-grupo>/cover.webp
```

La ruta no depende del nombre original ni de su extensión. Cada sustitución hace
un upsert del mismo objeto. La tabla `reading_groups` conserva solo la URL
pública, con `?v=…` para evitar la caché de una versión anterior.

Las políticas RLS permiten subir y reemplazar únicamente esa ruta al propietario
del grupo. Las políticas restrictivas impiden que otra política permisiva habilite
archivos adicionales o cambios en otros grupos. No se desactiva RLS.
El bucket sigue siendo público, como antes: una persona con la URL puede ver
la imagen; los permisos aquí descritos protegen la escritura y el listado.

## Archivos anteriores

1. Se optimiza y se sube `cover.webp`.
2. Se guarda la URL nueva mediante `update_reading_group`.
3. Solo después de una respuesta correcta se listan y borran los demás objetos
   de la carpeta de ese grupo, incluidas las antiguas `cover.jpg`, `cover.png`
   y `cover.gif`. Se conserva siempre la nueva `cover.webp`.
4. Se comprueba que no queden objetos antiguos.

La limpieza usa la API de Storage. No se hace `DELETE FROM storage.objects`:
eliminar solo los metadatos SQL puede dejar el archivo físico huérfano.

Si falla la compresión o la subida, no se borran archivos anteriores. Si falla el
guardado en la base de datos, no comienza la limpieza. Un upsert ya completado
sí habrá reemplazado el contenido de `cover.webp`; no hay una transacción
atómica conjunta entre Storage y la actualización del grupo.

Si falla la limpieza, el cambio del grupo queda guardado y se muestra un aviso
explícito. Volver a guardar el grupo, manteniendo su URL `cover.webp`, reintenta
la limpieza sin necesidad de subir otra imagen. No se anuncian como borrados los
archivos cuya eliminación no se haya confirmado.

El SQL no convierte ni borra archivos existentes. Los grupos con portadas de
versiones anteriores quedan normalizados al subir su próxima portada con v145.
Hasta entonces pueden conservar duplicados o archivos que superen el límite
nuevo. Una URL externa no genera una copia en Storage ni dispara limpieza.
Los archivos físicos que ya hayan perdido su registro SQL requieren una
revisión administrativa independiente; la app no puede descubrirlos.

## Despliegue

1. En el mismo proyecto de Supabase, ejecutar
   `supabase/hanami-group-cover-storage-v145.sql` después de las migraciones
   existentes de grupos. Esta migración incluye las políticas corregidas de R2.
2. Desplegar el proyecto completo v145 en el proyecto y dominio actuales de
   Vercel. No borrar los datos locales ni cambiar de origen.
3. Recargar Hanami y permitir la activación de la nueva caché PWA.
4. Cambiar la portada de un grupo. En Storage debe quedar únicamente
   `<uuid-del-grupo>/cover.webp`, de no más de 1.048.576 bytes.

No volver a ejecutar las migraciones antiguas de grupos después de este SQL sin
reaplicarlo al final: pueden restablecer los límites del bucket. Los clientes
antiguos que intenten subir JPG o PNG sin conversión recibirán un rechazo.
Si el límite global de Storage es menor, prevalece ese límite más estricto.

## Pruebas

- `npm test`: regresión completa y pruebas unitarias de compresión y rutas.
- `npm run test:sql:group-covers`: políticas reales en PostgreSQL embebido,
  límites de configuración, upsert, nombres rechazados, limpieza y aislamiento.
- `npm run test:e2e:group-covers`: Chromium local, imágenes reales y API de
  Storage simulada, orden del guardado, limpieza y estados de error.

Las pruebas locales no equivalen a una comprobación del proyecto de Supabase
de producción.

Las pruebas SQL requieren `@electric-sql/pglite` instalado o `PGLITE_PATH`
apuntando a su módulo. Las pruebas de navegador requieren Playwright, Sharp
y un Chromium local; `CHROMIUM_PATH` permite indicar su ejecutable.
Estas dependencias de pruebas no son necesarias para servir Hanami en Vercel.

## Referencias de implementación

- [Restricciones del bucket](https://supabase.com/docs/guides/storage/buckets/creating-buckets).
- [Borrado mediante la API de Storage](https://supabase.com/docs/guides/storage/management/delete-objects).