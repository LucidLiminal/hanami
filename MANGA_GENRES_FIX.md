# Géneros de MangaDetails — v38

Hanami usa exclusivamente `genre: List<String>`, como Mihon. Se eliminó el fallback legado a `tags`, su marcado `.md-tags` y la salida plural duplicada. Olympus consulta primero el endpoint exacto de Mihon: `/api/series/{slug}?type=comic`; la respuesta del proveedor se normaliza a `genre`. Autor y artista también aceptan las listas de objetos del panel.
