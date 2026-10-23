# Validación de la entrega v145

- Aplicación: 5.19.0; caché: hanami-crimson-knot-v145.
- Regresión completa: 113 scripts de npm test, terminados correctamente.
- Recursos precacheados: 72, todos presentes, incluido group-cover.js.
- SQL en PostgreSQL embebido: bucket 1.048.576 bytes/WebP, instalación y
  reejecución, propietario insert/upsert/delete, aislamiento de miembros,
  moderadores, desconocidos y usuarios sin sesión. Las políticas restrictivas
  bloquean rutas adicionales incluso junto a una política permisiva amplia.
- Regresiones anteriores comprobadas: editor de grupo v144, Storage R2 y SQL
  de identidad de capítulos v144.
- Chromium local: PNG real, JPEG con EXIF, WebP con transparencia, GIF y PNG
  ruidoso normalizados; original de más de 10 MiB y archivos corruptos rechazados.
- Mayor archivo normalizado observado en esta prueba: 733950 bytes.
- Límites exactos de 10 MiB original, 40 MP y 1 MiB de resultado verificados
  en las pruebas unitarias; no se amplían imágenes pequeñas.
- Limpieza recursiva y paginada, borrado en lotes de 100, conservación de la
  portada canónica y de otros grupos. Subida y guardado fallidos no disparan
  borrado. Errores, borrados silenciosos y listados inválidos muestran aviso;
  otro guardado reintenta la limpieza.
- Formulario real probado e inspeccionado visualmente a 390×844 y 1280×900.
  Selección, vista previa, límites legibles y guardado correctos. Sin excepciones
  de página ni peticiones fuera de la carpeta del grupo.
- Conservados todos los 386 archivos de la entrega v144, más las correcciones
  posteriores. Sin credenciales reales, sesiones, node_modules ni registros
  privados de pruebas añadidos al paquete.

Las llamadas a Storage de navegador usaron una API simulada; no se accedió ni
se modificó el Supabase o Vercel de producción. El límite real del bucket y
la eliminación física deberán verificarse después de aplicar el SQL y desplegar.
El SQL no borra imágenes antiguas: se normalizan y limpian al sustituirlas con
v145. Una limpieza fallida puede dejar duplicados antiguos temporalmente.

Usar ../../../checksums/archive/V145_FILE_MANIFEST.sha256 para verificar esta entrega. Los documentos y
manifiestos V144 conservados son históricos. Detalles: GROUP_COVER_STORAGE_V145.md.
