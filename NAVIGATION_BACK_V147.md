# Retroceso y diagnóstico de navegación — v147

## Fallos reproducidos

1. **Estado raíz con la ficha todavía visible tras recargar.** Los registros
   persistían en sessionStorage, pero las funciones del mapa runtime no. El
   popstate solo consultaba ese mapa y emitía un evento sin restaurador visual
   general. Los restauradores por tipo existían, pero solo se usaban al recargar.
2. **Lector que no se cerraba tras recargar.** Reabrirlo con restoring=true no
   volvía a asociar su función suspend al registro de historial.
3. **Actualizar parecía inutilizar Atrás.** Algunas fichas añadían otra entrada
   idéntica al refrescar. El retroceso volvía a la misma ficha.
4. **Un menú deshacía la navegación siguiente.** Su eliminación disparaba un
   history.back mientras la subpantalla ya se estaba abriendo. Se reprodujo
   al entrar en la configuración de migración desde el menú de una ficha.
5. **Respuestas tardías y errores.** Las rutas de error no comprobaban siempre
   si la persona había salido. Se reprodujo una escritura en un contenedor
   eliminado y fichas/lectores que podían reaparecer después de salir.

## Cambios de ciclo de vida

- popstate resuelve runtime.restore o, si falta, el restaurador registrado por
  tipo. Espera su promesa antes de anunciar la transición completada.
- Se suspenden todas las capas que salen de la rama activa, desde la más
  profunda. No se suspende un padre conservado al avanzar a uno de sus hijos.
- Restaurar un lector vuelve a registrar restore/suspend. Los lectores de grupo
  conservan su contexto; se reconocen también registros anteriores por su padre.
- Una restauración sustituida por otra navegación no publica un commit obsoleto.
  Salir durante la reconstrucción de una sesión cancela el destino original.
- Si falta un restaurador o falla, se intenta un ancestro válido y se sincroniza
  también la interfaz. Las entradas cerradas siguen saltándose.
- Los clics de Atrás recibidos antes del mismo popstate se agrupan. Si hay un
  overlay, se cierra esa capa primero, sin un segundo retroceso de pantalla.
- Actualizar conserva la entrada actual. Las acciones del menú que abren otra
  superficie esperan el cierre de ese menú.
- Cada carga de ficha comprueba su pantalla y solicitud propietarias, tanto en
  éxito como en error. Las páginas de un capítulo no abren el lector si ya se salió.
- El inicio de comentarios y los redibujados de biblioteca no sustituyen una
  subpantalla activa. Volver a la raíz limpia el estado local de la ficha.
- Atrás en una fuente conserva modo y consulta de búsqueda.

## Diagnosticar otro caso

En la consola de desarrollo del navegador:

```js
HanamiScreens.debug.enable();
```

Reproducir el fallo con los botones de la aplicación o con Atrás del navegador.
Consultar después:

```js
HanamiScreens.debug.report();
```

El informe contiene:

- snapshot: registro actual resumido, ID del historial, transición pendiente,
  pestaña raíz, indicador de subpantalla, superficies visibles, número de fichas,
  visibilidad del lector y número de overlays;
- events: los últimos 120 eventos de diagnóstico de esta carga: solicitud de
  retroceso, agrupación de clics, suspensión, restauración, fallback y finalización.

No incluye el payload completo de los registros (mangas, títulos, consultas,
capítulos ni credenciales de sesión). El diagnóstico está desactivado por defecto.
La activación persiste solo en sessionStorage de esta pestaña; el búfer de eventos
se mantiene en memoria y se reinicia al recargar. Los cambios de pantalla siguen
emitiendo hanami-screen-change; los fallos de restauración emiten hanami-screen-error.

```js
HanamiScreens.debug.snapshot();    // Solo la situación actual
HanamiScreens.debug.clear();       // Vaciar eventos en memoria
HanamiScreens.debug.enable(false); // Desactivar el registro
```

Una diferencia temporal durante una restauración pendiente no demuestra un fallo.
Comprobar el informe tras pop:settled. Si el estado es root y queda una ficha o un
lector visibles, anotar el recorrido exacto y conservar ese informe.

## Pruebas y despliegue

```sh
npm test
CHROMIUM_PATH="$(command -v chromium)" npm run test:e2e:back
```

El E2E arranca su propio servidor, usa API simulada y abre Chromium local en
390×844 y 1280×900. No necesita credenciales ni modifica servicios reales.

Desplegar el proyecto completo en el mismo Vercel y recargar la PWA. La caché de
aplicación cambia a hanami-crimson-knot-v147 e incluye los controladores de historial
y overlays. No borrar localStorage, IndexedDB, biblioteca, capítulos descargados
ni progreso. No hay migración SQL nueva por este cambio. Las migraciones anteriores
que aún no se hayan aplicado siguen siendo independientes.
