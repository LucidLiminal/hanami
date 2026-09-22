# Reanudación exacta del lector

El botón Continuar diferencia dos estados:

1. **Capítulo en curso:** vuelve al mismo capítulo, página e intervalo vertical guardados.
2. **Capítulo terminado:** abre el siguiente capítulo no leído.

Mientras se lee se persiste en `hanami-library`:
- URL y número del capítulo.
- Índice de página.
- Posición relativa dentro de la página (`0..1`).
- Marca de tiempo.
- Si se alcanzó o no el final.

El capítulo solo se marca como completado al llegar al final del lector. Cerrar el lector a mitad de capítulo conserva el punto exacto y no avanza el contador.
