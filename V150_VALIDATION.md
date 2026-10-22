# Validación de v150

Hanami `5.24.0` · PWA `hanami-crimson-knot-v150`.

## Alcance

La administración de una sala de grupo se convierte de modal a pantalla
navegable. Conserva la edición de nombre, cita y portada, incluida la
sincronización remota y el retorno seguro al detalle de sala.

El hotfix HNM-021 unifica la versión pública de **Más**, **Ajustes** y
**Acerca de** con la versión declarada en el paquete.

## Resultados

| Comprobación | Resultado |
| --- | --- |
| `npm test` | 124 PASS |
| `npm run test:e2e:group-admin-screen` | PASS |
| `npm run test:e2e:about-version-hnm021` | PASS |
| Sintaxis de `reading-groups.js` | PASS |
| Sintaxis de `app-version.js`, `more-tab.js` y `navigation.js` | PASS |
| Validación visual móvil 390 × 844 | PASS |

## Entrega

- Versión de paquete: `5.24.0`.
- Identificador de caché PWA: `hanami-crimson-knot-v150`.
- Documento de cambio: `GROUP_ADMINISTRATION_SCREEN_V150.md`.
- Documento del hotfix: `ABOUT_VERSION_HNM021.md`.
- No hay migraciones SQL nuevas.