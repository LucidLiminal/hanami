# Validación de la entrega v144

- Aplicación: 5.18.0; caché: hanami-crimson-knot-v144; Olympus: 1.4.0.
- Regresión completa: 112 scripts, salida correcta.
- Sintaxis: 219 archivos JavaScript/MJS, cero errores.
- Caché offline: 71 rutas, todos los recursos presentes.
- SQL v144 en PostgreSQL embebido (PGlite): instalación y reejecución,
  copias privadas, autorización, aislamiento por sala, reconciliación,
  música histórica y claves/revisiones/timestamps intactos.
- Regresión SQL v137 de música de grupo: correcta.
- Chromium: copia previa con blobs de audio; recuperación por ID tras cambio
  de dominio/slug; equivalencia revisada; seis operaciones pendientes ficticias
  preservadas; mismo ID y clave de transporte del pin al cambiar canción;
  aislamiento de salas; conflictos explícitos; deshacer sin rebobinar lecturas.
- Regresiones reales de interfaz: coordenadas de comentarios v143; música v141
  con RPCs anteriores y nuevos, pins, arrastre, reemplazo, colas y audio nativo.
- Revisión visual: vistas móviles de 390 px y escritorio de 1280 px; inicio,
  referencias, confirmación, conflictos, deshacer e inventario vacío.
- Contraste del panel: texto principal 14.91:1, secundario 8.12:1, borde 3.75:1.
- Sin eliminación de archivos respecto al paquete v143; sin sesiones,
  credenciales, node_modules ni resultados privados de pruebas en la entrega.

Estas pruebas usan datos ficticios. No se ha aplicado SQL ni desplegado el
paquete en producción, ni se ha confirmado la recuperación de datos reales.
