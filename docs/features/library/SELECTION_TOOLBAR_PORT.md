# Port funcional de la toolbar contextual de Mihon

La arquitectura, posición y gestos siguen el patrón de selección contextual de Mihon. Los colores, tipografía, textura y atmósfera siguen siendo Hanami.

## Pantallas y participación

### Biblioteca (`libraryRoot`)
- Pulsación larga (500 ms) para iniciar selección.
- Pulsación normal para añadir o quitar elementos mientras el modo está activo.
- Segunda pulsación larga para selección por rango.
- Cerrar/atrás, contador vivo, seleccionar todo e invertir.
- Acciones inferiores: categorías, leído, no leído, descargar, migrar y eliminar.
- Subpantallas: selector trietado de categorías, opciones de descarga y confirmación de eliminación/descargas.

### Detalle de obra (`mihon-detail`)
- Pulsación larga sobre capítulo para seleccionar; pulsaciones posteriores alternan; pulsación larga adicional amplía el rango.
- Cerrar/atrás, contador vivo, seleccionar todo e invertir.
- Acciones: marcar/desmarcar favorito, leído, no leído, descargar y eliminar descarga.
- La toolbar normal queda sustituida, no apilada, durante la selección.

### Actualizaciones
- Pulsación larga sobre una actualización para entrar en selección.
- Cerrar, contador, seleccionar todo e invertir.
- Acciones: leído, no leído, descargar, marcar y eliminar descarga.
- Se conserva el gesto de arrastrar para actualizar cuando no hay selección.

### Historial
- Pulsación larga sobre una entrada para iniciar selección.
- Cerrar, contador, seleccionar todo e invertir.
- Acciones: añadir a Biblioteca y eliminar del historial.

## Comportamiento compartido
- Toolbar superior contextual y barra de acciones inferior adaptadas al viewport móvil.
- La navegación principal se oculta mientras la selección está activa.
- `Escape` cancela primero la selección en escritorio.
- Atrás cancela primero la selección antes de abandonar la pantalla.
- Vibración háptica cuando el navegador/dispositivo lo permite.
- Contador anunciado mediante una región `aria-live`.
- Botones de al menos 48 px y etiquetas accesibles.
- Estado vacío de selección cierra automáticamente el modo contextual.
