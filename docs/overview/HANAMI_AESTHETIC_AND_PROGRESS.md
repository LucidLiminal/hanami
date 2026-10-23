# Corrección v22

## Identidad visual
La interacción móvil continúa siguiendo Mihon, pero la Biblioteca recupera la identidad de Hanami: negro neo-noir, violeta, verde ácido, tipografía editorial, grano, imágenes desaturadas, bordes rectos, sombras desplazadas y detalles de fanzine. No se cambian los gestos ni la jerarquía móvil.

## Continuar leyendo
El progreso ya no se incrementa de forma ficticia. Hanami guarda `lastReadChapterUrl` y `lastReadChapterNumber` al abrir un capítulo. El botón de cada tarjeta obtiene la lista real de capítulos, la ordena del más antiguo al más nuevo y abre exactamente el capítulo posterior al último leído. Si el catálogo cambió, usa el número o `readCount` como respaldo. Si ya no quedan capítulos, lo indica sin volver a abrir uno anterior.
