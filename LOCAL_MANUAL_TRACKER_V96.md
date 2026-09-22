# Creación manual y metadatos de tracker — v96

## Sub-screens

- Editor de serie local.
- Buscador público de metadatos en AniList.
- Selector de resultado de tracker.
- Editor de capítulo.
- Gestor de capítulos.
- Gestor general de series locales.

## Bars y acciones

- **Crear serie** aparece en Browse Local y en el overflow de la fuente.
- El gestor ofrece **Añadir capítulo**, **Capítulos**, **Editar** y **Eliminar**.
- El editor permite definir título, autor, artista, descripción, géneros, estado
  y portada.
- **Completar metadatos desde AniList** busca por título y permite copiar título,
  descripción, estado, portada y vínculo remoto.
- La portada del tracker se descarga a IndexedDB cuando CORS lo permite; en caso
  contrario se conserva su URL como respaldo.

## Capítulos

Cada capítulo se puede crear manualmente con:

- Varias imágenes AVIF, GIF, JPEG, PNG o WebP.
- Un ZIP o CBZ cuyas carpetas internas se ignoran.
- Un único PDF.

Volver a guardar el mismo nombre reemplaza el contenido del capítulo. El gestor
permite consultar el formato, número de páginas y eliminar capítulos.

## Diálogos

- Crear/editar serie.
- Buscar y seleccionar metadatos de AniList.
- Añadir/reemplazar capítulo.
- Gestionar capítulos.
- Confirmar eliminación de capítulo.
- Confirmar eliminación de serie.

## Persistencia y navegación

- Todos los metadatos y archivos continúan en IndexedDB.
- Las URLs Blob se regeneran después de reiniciar la PWA.
- Cada cambio emite `hanami-local-source-change` y actualiza Explorar y
  Biblioteca.
- Escape, toque exterior y Atrás siguen consumiendo una sola superficie.

## Privacidad

- Crear y editar manualmente no realiza solicitudes externas.
- Solo se consulta AniList cuando el usuario pulsa explícitamente Buscar.
- No se ejecuta código de ZIP, CBZ, imágenes o PDF.