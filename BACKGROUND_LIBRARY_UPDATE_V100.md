# Actualización de Biblioteca en background — v100

## Resultado

Hanami incorpora un equivalente web persistente de `LibraryUpdateJob`. Mantiene una cola y un snapshot en IndexedDB, ejecuta fuentes compatibles desde el Service Worker y recupera los resultados cuando la PWA vuelve a abrirse.

La estrategia usa, por orden de capacidad:

1. **Periodic Background Sync** para comprobaciones periódicas cuando Chromium/PWA lo concede.
2. **Background Sync** para reintentar trabajos aplazados por conectividad o restricciones.
3. **Service Worker por mensaje** para “Actualizar ahora”.
4. **Fallback foreground** al abrir Hanami, recuperar foco, volver online, cambiar a visible o alcanzar el siguiente intervalo con la aplicación abierta.

No introduce Docker, JVM, APK ni procesos externos. Sigue siendo el mismo despliegue Vercel.

## Referencias de Mihon

- `LibraryUpdateJob.kt`: trabajo periódico/único, exclusión mutua, restricciones, concurrencia, progreso, errores y notificaciones.
- `SettingsLibraryScreen.kt`: intervalo, restricciones del dispositivo, categorías, metadata, smart updates y badge.
- `LibraryPreferences.kt`: claves y valores de actualización global.
- `UpdatesViewModel.kt` y `LibraryTab.kt`: actualización manual global o por categoría.
- `LibraryUpdateNotifier`: progreso, nuevos capítulos y errores.
- `NotificationReceiver.kt`: apertura de Actualizaciones desde una notificación.

## Sub-screens

- Más.
- Más → Actualización en segundo plano.
- Más → Ajustes → Biblioteca → Actualización en segundo plano.
- Diálogo de categorías incluidas/excluidas.
- Diálogo existente de restricciones inteligentes por obra.
- Actualizaciones.
- Próximas actualizaciones.
- Biblioteca y actualización por categoría.
- Ficha de obra para metadatos y capítulos sincronizados.

La subpantalla participa en `HanamiScreens`; Atrás realiza exactamente una transición.

## Bars

### App bar de background

- Atrás.
- Actualizar ahora, con rotación durante ejecución.
- Más opciones.

### Otras barras conectadas

- Toolbar de Actualizaciones: actualización manual.
- Toolbar de Biblioteca: actualización de categoría o global.
- Navbar principal: badge de capítulos nuevos en Actualizaciones.
- App bar de Ajustes → Biblioteca.

## `itemOverflow`

El overflow de la app bar de background contiene:

- **Sincronizar programación:** vuelve a copiar preferencias/snapshot y registra Periodic Sync cuando está disponible.
- **Borrar registro:** limpia progreso, errores, omitidos y contador sin borrar Biblioteca.

Se conservan los overflows existentes de Biblioteca y Actualizaciones. No se usa un diálogo donde corresponde un overflow.

## Diálogos

### Categorías

Diálogo tri-state por categoría:

- Cualquiera.
- Incluir.
- Excluir.

Excluir tiene prioridad. Sin inclusiones se consideran todas salvo las excluidas.

### Restricciones por obra

Reutiliza el diálogo de Actualizaciones inteligentes:

- Solo obras al día.
- Solo iniciadas.
- Solo no completadas.
- Solo dentro del periodo previsto.

### Permiso de notificaciones

El permiso se solicita únicamente tras pulsar **Permitir notificaciones**. No se dispara automáticamente.

## Ajustes y acciones

### Intervalos

- Nunca.
- 12 horas.
- 24 horas.
- 48 horas.
- 72 horas.
- Semanal.

### Restricciones del dispositivo

- Solo Wi‑Fi.
- Conexión no medida/Ahorro de datos desactivado.
- Mientras carga.

Hanami guarda un snapshot de `Network Information API` y `Battery API`. Si una restricción estricta está activa y el navegador no puede confirmarla, el trabajo se aplaza en lugar de ignorarla.

### Actualización

- Snapshot transaccional de Biblioteca, categorías y preferencias en `hanami-background-v1`.
- Una única ejecución simultánea.
- Consulta de fuentes server-side compatibles mediante `/api/sources`.
- Hasta cinco obras concurrentes, igual que el semáforo de Mihon.
- Actualización de capítulos.
- Detección de capítulos nuevos por URL/ID.
- Herencia de lectura para duplicados nuevos cuando la preferencia está activa.
- Actualización opcional de título, portada, autor, artista, género y estado.
- Recálculo de total, leídos y no leídos.
- Aplicación atómica de resultados al volver a la aplicación.
- Sincronización en vivo mediante `postMessage` si existe una ventana abierta.

### Fuentes

- Los adaptadores incluidos en el despliegue y reconocidos por `/api/sources` pueden ejecutarse desde el Service Worker.
- La fuente Local se omite porque no necesita red y depende de datos del navegador.
- Las extensiones descargadas que requieren su Web Worker aislado se aplazan al fallback foreground; el Service Worker no evalúa bundles locales ni reduce su aislamiento de seguridad.
- Cada omisión aparece con motivo en Resultado detallado.

## Estados y errores

La pantalla muestra:

- Inactiva.
- En cola.
- Actualizando.
- Completada.
- Completada con errores.
- Aplazada.
- Error.
- Fallback en primer plano.

Incluye progreso `completadas / total`, capítulos nuevos, última ejecución, próxima comprobación, errores por obra y motivos de omisión.

Los fallos de una obra no detienen las demás. El resultado final es `partial` cuando corresponde.

## Notificaciones y badge

- Notificación agrupada de capítulos nuevos.
- Notificación de actualización incompleta.
- Icono PWA y etiqueta estable para evitar duplicados.
- Pulsar una notificación enfoca/abre Hanami y solicita la pestaña Actualizaciones.
- Badge dentro de la navbar de Actualizaciones.
- App Badge API cuando está disponible.
- El ajuste “Mostrar contador” desactiva ambos badges.

## Animaciones y efectos

- Spinner en Actualizar mientras existe un trabajo activo.
- Cambio de borde según estado: morado, verde ácido o rojo.
- Progreso y resultados se actualizan mediante mensajes del Service Worker.
- Entrada lateral estándar de subpantallas de Más.
- `prefers-reduced-motion` elimina el giro y las animaciones de navegación.

## Gestos y navegación

- Tap en Actualizar ahora.
- Tap en overflow y cierre exterior mediante el sistema centralizado.
- Back, Escape, browser Back y gesto móvil ejecutan una transición.
- Los diálogos se cierran con exterior, Escape y Back.
- Recuperar foco, visibilidad u online dispara solo una comprobación de vencimiento, no una navegación.

## Límites web explícitos

Un navegador no ofrece una garantía equivalente a Android WorkManager:

- Periodic Sync depende de Chromium, instalación PWA, permisos implícitos y engagement.
- Safari y Firefox pueden no ejecutar tareas periódicas con la aplicación cerrada.
- El sistema operativo puede suspender o eliminar el Service Worker.
- Wi‑Fi y carga solo pueden exigirse si sus APIs están disponibles.

Por ello Hanami combina Periodic Sync con Background Sync, Service Worker manual y múltiples fallbacks foreground. La pantalla de capacidades indica qué ruta está disponible en el dispositivo actual.

## Archivos modificados

- `public/background-updates.js`
- `public/sw.js`
- `public/index.html`
- `public/more-tab.js`
- `public/more-tab.css`
- `public/styles.css`
- `package.json`
- `tests/background-library-update-v100.test.mjs`
- `tests/background-library-update-v100.mobile.e2e.mjs`

## Validación

- `node --check` en todos los JavaScript modificados.
- Regresión específica v100 superada.
- Suite completa `npm test` superada.
- E2E Chromium/Playwright móvil 390 × 844: pantalla, intervalo, restricciones, categorías, snapshot IndexedDB y ejecución real mediante Service Worker.
- ZIP final verificado mediante `unzip -t`.
