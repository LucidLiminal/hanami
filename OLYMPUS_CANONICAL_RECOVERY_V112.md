# Recuperación de URLs Olympus — v112

## Problema
Olympus puede cambiar el slug público de una serie. Las obras guardadas anteriormente conservaban la URL antigua, por lo que `details` y `chapters` intentaban abrirla directamente y terminaban con `Olympus respondió HTTP 404`.

## Corrección
- Un 404 de una página de serie ya no aborta inmediatamente.
- El adaptador consulta el catálogo público `/api/series/list`.
- Busca la obra mediante ID remoto, slug y título normalizado.
- Reconstruye la URL canónica respetando `comic-` o `novela-`.
- Reintenta la página pública con el slug vigente.
- Detalles y capítulos comparten el mismo resolvedor.
- El catálogo se conserva cinco minutos en memoria para evitar solicitudes repetidas.
- La respuesta de detalles devuelve la URL canónica.
- Biblioteca actualiza la URL almacenada al hidratar metadatos, reparando automáticamente registros antiguos.
- Si no existe ninguna coincidencia segura, se muestra un error explicativo en lugar de ocultar el 404.

## Seguridad y contrato
- Solo se consulta el catálogo público oficial de Olympus.
- Los capítulos siguen usando el endpoint del panel ya permitido.
- No se realizan solicitudes a hosts de rastreo.
- Se mantiene exclusivamente `manga.genre`.
- Los títulos siguen limpiándose sin añadir la procedencia.

## Validación
- Regresión `tests/olympus-canonical-recovery-v112.test.mjs`.
- Prueba real con la URL antigua de «El mecánico legendario» recuperando su slug vigente, metadatos y 283 capítulos.
- E2E móvil confirma que Biblioteca reemplaza la URL antigua por la canónica.
