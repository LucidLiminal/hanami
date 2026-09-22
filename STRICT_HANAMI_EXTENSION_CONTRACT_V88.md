> Nota: este documento describe una versión histórica. El modelo de ejecución local fue sustituido por `LOCAL_BROWSER_EXTENSIONS_V89.md`.

# Contrato estricto de extensiones Hanami — v88

- Solo se acepta `schema: "hanami-extension-store/v1"`.
- Se rechazan índices Mihon, arrays legacy, APK y campos Android.
- Todas las extensiones deben usar `runtime: "vercel-js"`, SemVer, rutas relativas y las seis operaciones web.
- Un repositorio vacío, mixto o parcialmente incompatible se rechaza completo.
- Los repositorios incompatibles guardados por v87 se eliminan durante la hidratación.
- Los catálogos externos siguen siendo solo descubrimiento: el código necesita revisión e integración estática en Vercel.
- Se añadió `docs/HANAMI_EXTENSION_DEVELOPMENT.md` y un índice de ejemplo en `docs/examples/hanami-extension-store.json`.
