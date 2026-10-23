# Instalación PWA desde MoreTab — v92

## Flujo

- MoreTab incorpora el acceso **Instalar Hanami** con estado contextual.
- `beforeinstallprompt` se intercepta y conserva únicamente para una interacción explícita del usuario.
- **Instalar ahora** abre el prompt nativo y procesa `userChoice` sin alertas ni banners invasivos.
- `appinstalled` confirma la instalación, limpia el evento consumido y actualiza la interfaz.
- El modo standalone se detecta mediante `display-mode` y `navigator.standalone`.

## Plataformas

- Chromium en Android y escritorio: instalación nativa cuando el navegador la ofrece.
- iPhone/iPad: guía visual para Safari → Compartir → Añadir a pantalla de inicio.
- Otros navegadores o prompt no disponible: diagnóstico y pasos manuales específicos.
- HTTP inseguro: aviso de que se requiere HTTPS o localhost.

## Experiencia y seguridad

La pantalla explica que Hanami sigue siendo una aplicación web Vercel y no instala APK, JVM ni servicios externos. También advierte que biblioteca, progreso, descargas y extensiones dependen del almacenamiento local del navegador.

## Installability

- Manifiesto con `id`, `scope`, descripción, categorías y `display_override`.
- Iconos PNG 192×192, 512×512 y maskable 512×512.
- Apple touch icon 180×180 y metadatos iOS.
- Todos los recursos se precachean en `hanami-pwa-install-v92`.

## Validación

- Suite completa y regresión `pwa-install-v92` superadas.
- E2E Chromium táctil 390×844: disponibilidad, prompt nativo, aceptación y estado instalado.
- Inspección visual móvil completada sin solapamientos ni scroll horizontal.
- Iconos normal y maskable inspeccionados dentro de sus zonas seguras.
