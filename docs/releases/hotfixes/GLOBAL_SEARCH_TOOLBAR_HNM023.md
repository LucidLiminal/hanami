# HNM-023 — Barra de búsqueda global

Hanami `5.24.0` · rama `main` · PWA `hanami-crimson-knot-v150`.

## Incidencia

En pantallas estrechas, los elementos de `global-search-toolbar` se
superponían o quedaban fuera de la vista. La composición anterior introducía
`global-search-main` dentro de una cuadrícula compartida; ese contenedor podía
quedar limitado a la primera columna de 48 px, dejando sin espacio útil al
campo de consulta y a su botón.

## Corrección

- Se eliminó el contenedor `global-search-main` y el botón visible de buscar.
- `global-search-toolbar` ahora contiene directamente, y en este orden:
  Atrás, `globalQuery`, `globalProgress` y `global-search-chips`.
- En la pantalla de búsqueda se usa una cuadrícula de flujo por filas con
  `grid-template-columns: 48px minmax(0, 1fr)`.
- El campo ocupa la segunda columna; el progreso y los filtros abarcan ambas
  columnas en sus propias filas.
- Los filtros usan `flex-wrap`, `justify-content: flex-start` y
  `overflow-x: visible`, de modo que se muestran completos sin solapamientos.
- El campo se declara como `type="search"` con `enterkeyhint="search"`.
  Enter en teclado físico, y la acción Buscar del teclado móvil, invocan la
  misma búsqueda global.
- Los títulos de grupos de resultados ajustan su desplazamiento sticky a la
  nueva altura de la toolbar.

## Validación

- `node tests/global-search-toolbar-hnm023.test.mjs`: PASS.
- `npm run test:e2e:global-search-toolbar-hnm023`: PASS en Chromium móvil
  390 × 844. Comprueba orden directo de controles, geometría sin
  solapamientos, Enter y resultados en varios grupos.
- `npm test`: 126 comprobaciones PASS.

## Compatibilidad y despliegue

No requiere migraciones SQL ni borrar datos del navegador. El estado de la
consulta y los filtros siguen usando la navegación y los enlaces profundos
existentes.