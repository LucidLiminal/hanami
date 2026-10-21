# Validación de v150

Hanami `5.24.0` · PWA `hanami-crimson-knot-v150`.

## Alcance

La administración de una sala de grupo se convierte de modal a pantalla
navegable. Conserva la edición de nombre, cita y portada, incluida la
sincronización remota y el retorno seguro al detalle de sala.

## Resultados

| Comprobación | Resultado |
| --- | --- |
| `npm test` | 123 PASS |
| `npm run test:e2e:group-admin-screen` | PASS |
| Sintaxis de `reading-groups.js` | PASS |
| Validación visual móvil 390 × 844 | PASS |

## Entrega

- Versión de paquete: `5.24.0`.
- Identificador de caché PWA: `hanami-crimson-knot-v150`.
- Documento de cambio: `GROUP_ADMINISTRATION_SCREEN_V150.md`.
- No hay migraciones SQL nuevas.