# Corrección del HTTP 404 de Olympus

- La página pública se consulta antes del panel para obtener la URL canónica actual.
- Se prueban el slug original, el canónico, variantes con/sin prefijo y la variante sin timestamp.
- Se detectan dinámicamente URLs de API y slugs embebidos en el HTML.
- Un 404 prueba la siguiente variante en lugar de abortar toda la ficha.
- Si el panel cambia, se reconstruyen capítulos desde enlaces públicos válidos.
- Si ninguna estrategia funciona, se devuelve un error diagnóstico; nunca una lista vacía falsa.
- Biblioteca valida `response.ok` y `Array.isArray` para impedir `ch.map is not a function`.
