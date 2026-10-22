# Versión visible de Acerca de — HNM-021

Hanami `5.24.0` · build `v150` · rama `main`.

## Incidencia

La pantalla **Acerca de** podía mostrar versiones distintas y obsoletas:
`5.8.40`, `5.9.5` o el fallback `5.1.0`, según la superficie de navegación.

## Corrección

- Se añadió `public/app-version.js` como fuente pública única para la versión
  visible de la aplicación.
- **Más**, **Ajustes**, **Acerca de** y el fallback de `navigation.js` consumen
  ese valor en lugar de literales independientes.
- El módulo se carga antes de `more-tab.js` y queda incluido en la caché PWA.
- La prueba estática exige coincidencia entre `app-version.js` y
  `package.json`, además de bloquear las cadenas antiguas.

## Versionado

La entrega mantiene `5.24.0` porque esa versión sigue en desarrollo y pendiente
de despliegue. No se incrementa SemVer por un hotfix incorporado antes del
lanzamiento. Si `5.24.0` ya estuviera publicada, correspondería subir el tercer
componente de parche: `5.24.0` → `5.24.1`.

## Validación

- `npm test`: 124 comprobaciones PASS.
- `npm run test:e2e:about-version-hnm021`: PASS en Chromium móvil 390 × 844;
  comprueba Más, Ajustes y Acerca de.
- `npm run test:e2e:group-admin-screen`: PASS tras el hotfix.
- Sintaxis verificada para los módulos modificados.

No requiere migraciones SQL ni borrar datos del navegador.