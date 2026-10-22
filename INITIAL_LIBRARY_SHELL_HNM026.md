# HNM-026 — Inicio directo en Biblioteca

Hanami `5.24.0` · rama `main` · PWA `hanami-crimson-knot-v150`.

## Incidencia

La URL base renderizaba el shell estático de **Explorar** y solo después de
cargar los módulos y resolver la ruta cambiaba a **Biblioteca**. El cambio era
visible como un destello de la pestaña equivocada.

## Corrección

- `index.html` ahora describe desde el HTML parseado el estado de Biblioteca:
  `data-root`, panel visible, navegación activa y `aria-current` coherentes.
- El héroe, chrome y pestañas de Explorar, además del panel de Fuentes, nacen
  ocultos y se habilitan únicamente al abrir Explorar.
- El estado inicial del módulo de navegación también es `library`, por lo que
  no existe una discrepancia entre el DOM previo a JavaScript y la interacción
  que queda disponible durante el arranque.
- La resolución habitual de rutas sigue atendiendo enlaces directos; la raíz
  ya no depende de esa resolución para mostrar Biblioteca correctamente.

## Validación

- `node tests/initial-library-shell-hnm026.test.mjs`: PASS. Verifica el shell
  estático, la navegación y el fallback de ruta.
- `npm run test:e2e:initial-library-shell-hnm026`: PASS en Chromium móvil
  390 × 844. Primero carga la página con JavaScript desactivado para inspeccionar
  el primer DOM pintable; después comprueba que el arranque completo conserva
  Biblioteca y no emite errores de página.
- `npm test`: 129 comprobaciones PASS.

## Compatibilidad y despliegue

No requiere migraciones SQL, cambios de datos locales ni restablecer la
instalación PWA. Los enlaces explícitos a Explorar, extensiones y el resto de
raíces conservan su resolución existente.
