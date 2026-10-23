# Extensiones locales descargables — v89

## Modelo

- Los repositorios contienen extensiones nativas de Hanami, nunca APK.
- El usuario revisa el repositorio y los hosts, confirma confianza y pulsa Habilitar.
- El bundle se descarga desde GitHub, se valida y se guarda en IndexedDB.
- Se ejecuta en un Web Worker aislado y se integra con Fuentes, búsqueda, detalles, capítulos y lector.
- Deshabilitar elimina el bundle local; no existe PackageInstaller ni instalación del sistema.

## Seguridad

- Contrato `hanami-extension-store/v1` y runtime `vercel-js`.
- Bundle autocontenido, máximo 500 KB, sin imports y con SHA-256 opcional.
- Proxy restringido: revalida el índice GitHub en cada solicitud y solo permite los orígenes HTTPS declarados por la fuente.
- Solo GET/POST, cabeceras limitadas, sin credenciales, sin redes privadas y con límites de respuesta.
- Proxy de imágenes separado y validado con límite de 20 MB.
- Diálogo explícito de confianza antes de habilitar.

## Persistencia y ciclo de vida

- Base IndexedDB `hanami-local-extensions`, object store `bundles`.
- Los Workers se restauran al iniciar Hanami.
- Las fuentes habilitadas se combinan con las fuentes bundled sin reemplazarlas.
- Refrescar un repositorio detecta nuevas versiones.
- Borrar un repositorio termina y elimina sus Workers y fuentes.
