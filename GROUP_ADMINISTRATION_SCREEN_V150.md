# Administración de sala como pantalla — v150

Hanami `5.24.0` · PWA `hanami-crimson-knot-v150` · rama `main`.

## Cambio

La acción **Editar sala** ya no reutiliza el diálogo global. Ahora abre la
pantalla `reading-group-admin`, integrada en la pila de `HanamiScreens`.

- La cabecera incluye **Atrás** para volver al detalle de la sala.
- El formulario mantiene nombre, cita, portada desde archivo y URL alternativa.
- La previsualización de portada se libera al abandonar la pantalla.
- Guardar conserva la validación y sincronización local/remota; cierra la
  pantalla de edición y restaura el detalle con los datos actualizados.
- Las portadas locales relativas se aceptan en la URL alternativa, por lo que
  una sala existente puede guardarse sin requerir una URL absoluta.

## Navegación y restauración

La pantalla se registra como `reading-group-admin`. Tras recarga, el
restaurador vuelve a abrir la administración de la sala correspondiente.
Los botones Atrás y Guardar regresan al detalle de la sala sin dejar una
entrada de edición activa en el historial.

## Validación

- `npm test`: 123 comprobaciones PASS.
- `npm run test:e2e:group-admin-screen`: PASS en Chromium móvil 390 × 844.
- El escenario Chromium abre la pantalla, verifica que el modal global no está
  abierto, guarda cambios remotos simulados y comprueba ambos retornos al
  detalle de la sala.

No requiere migraciones SQL ni borrar datos del navegador.