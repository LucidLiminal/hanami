# Reader continuo — port Mihon

- Marca cada capítulo como leído al alcanzar su final.
- Añade el siguiente capítulo al mismo `readerViewport`.
- Separadores “Siguiente capítulo · Capítulo N” y “Finalizado · Capítulo N”.
- `readerSlider` refleja solo el capítulo activo.
- Culling: máximo capítulo activo, anterior y siguiente; imágenes lejanas se descargan mediante `IntersectionObserver` conservando altura.

- El flujo es bidireccional: precarga y antepone el capítulo anterior conservando el scroll.
- La detección usa una línea activa del viewport y funciona al subir o bajar.
- Slider, contador, indicador, cabecera y botones anterior/siguiente se sincronizan con el capítulo activo.
