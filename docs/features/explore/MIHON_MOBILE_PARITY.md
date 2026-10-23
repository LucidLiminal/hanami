# Paridad móvil de Biblioteca

La Biblioteca ya no se trata como un panel de escritorio. El comportamiento se corresponde con la estructura Compose de Mihon:

- Toque corto sobre una portada: abre la ficha de la obra.
- Pulsación larga (500 ms): inicia selección, aplica vibración háptica si está disponible y permite selección por rango desde el último elemento.
- Con selección activa, toque corto: añade o quita elementos de la selección.
- Deslizar horizontalmente: cambia de categoría mediante el paginador.
- Tirar hacia abajo desde el inicio: actualiza la categoría visible.
- Atrás: cierra primero ficha, selección o búsqueda.
- Botón de continuar: abre el siguiente capítulo no leído en el lector web.
- Acciones de selección: barra inferior móvil, como Mihon.
- Ajustes: hoja inferior móvil.
- Navegación principal: barra inferior en pantallas móviles.

La Biblioteca usa densidad, tarjetas, pestañas, app bar, selección y hojas inferiores cercanas a Material 3/Mihon, manteniendo la identidad de Hanami fuera de esta vista.
