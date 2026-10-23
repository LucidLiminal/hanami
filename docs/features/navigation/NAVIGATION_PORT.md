# Port funcional de navegación Mihon → Hanami

Principio permanente: **Mihon aporta arquitectura, jerarquía, comportamiento y gestos; Hanami conserva colores, tipografía, textura, formas y atmósfera grunge.**

## Destinos principales

1. **Biblioteca**
   - Categorías, búsqueda, filtros, orden, visualización y actualización.
   - Apertura de ficha y continuación exacta de lectura.
   - Pulsación prolongada para selección múltiple.
   - Barra principal oculta durante la selección; barra contextual superior y acciones inferiores.
   - Seleccionar todo, invertir, categorías, leído/no leído, descargas, migración y eliminación.
   - Deslizamiento horizontal entre categorías y pull-to-refresh.
2. **Actualizar**
   - Cronología de capítulos agrupada por fecha.
   - Abrir obra o leer directamente un capítulo.
   - Actualización manual y pull-to-refresh respetando Actualizaciones inteligentes.
   - Filtros por no leído, descargado y categoría.
   - Subpantalla **Próximas**, con calendario predictivo.
   - Pulsación prolongada para selección múltiple, sustitución de la barra principal por herramientas contextuales y acciones de leído, no leído, descargar, marcar y eliminar.
3. **Historial**
   - Última lectura por obra, agrupada por fecha.
   - Continuar exactamente desde la posición guardada.
   - Buscar, eliminar una entrada y eliminar todo el historial.
   - Pulsación prolongada, selección múltiple, añadir a Biblioteca y eliminación múltiple.
4. **Explorar**
   - Subpestañas **Fuentes**, **Extensiones** y **Migrar**.
   - Fuentes recientes/ancladas, idiomas, búsqueda global y navegación por catálogo.
   - Ciclo de extensiones y sus ajustes.
   - Migración individual y masiva.
   - La navegación principal se oculta al entrar en una fuente, ficha o lector.
5. **Más**
   - **Descargas**: listado, eliminación individual y limpieza completa.
   - **Categorías**: acceso al administrador compartido.
   - **Seguimiento**: acceso conceptual a servicios por obra.
   - **Ajustes**: Actualizaciones inteligentes, incógnito y acceso a Extensiones.
   - **Datos y almacenamiento**: exportar y restaurar copia JSON.
   - **Acerca de**.

## Navegación y gestos compartidos

- Tocar un destino cambia de raíz; tocar de nuevo el activo vuelve arriba.
- Back/Escape cierra primero selección o subpantalla.
- Las subpantallas, fichas, fuentes y lector ocultan la barra principal.
- Mantener pulsado activa selección con vibración cuando está disponible.
- Durante selección, tocar alterna elementos y la navegación se sustituye por las acciones contextuales.
- Pull-to-refresh en Biblioteca y Actualizar.
- Diseño mobile-first, con barra inferior; en pantallas amplias sigue siendo responsive sin transformar la experiencia en una UI empresarial.
