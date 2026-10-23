# Olympus public details — v40

La extensión de Mihon obtiene `SManga.genre` desde la respuesta de detalles y después `SManga.getGenres()` divide la cadena por `, `. En la web actual, el panel devuelve 401 para metadatos, mientras que el frontend consume la ruta pública del mismo origen: `/api/series/{slug}?type=comic`. Hanami ahora consulta primero esa API pública, normaliza `genres[].name` a `genre: string[]` y reserva el panel para capítulos. No existe fallback a tags.
