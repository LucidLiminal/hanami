# Fallback Invidious · v134

Hanami v134 añade una segunda ruta de resolución opcional para pistas de
YouTube. No sustituye el resolvedor existente: solo se consulta después de que
el `best effort` de Hanami falle.

## Flujo

```text
1. Navegador → /api/music/youtube/resolve
2. Hanami/Vercel → InnerTube
3. Si falla la resolución o el proxy de audio y el usuario configuró una instancia:
   Navegador → https://instancia/api/v1/videos/{videoId}?local=true
4. Navegador → https://instancia/videoplayback?... (audio)
```

La petición de audio del paso 4 no atraviesa Vercel. La instancia Invidious
seleccionada actúa como proxy de medios y debe devolver CORS y rangos HTTP.

## Configuración

En el lector:

1. Abre **Música**.
2. En **Buscar**, despliega **Fallback Invidious**.
3. Introduce únicamente el origen HTTPS, por ejemplo
   `https://invidious.example`.
4. Pulsa **Guardar y comprobar**.

La dirección se guarda localmente en el navegador. Para desactivar el fallback,
vacía el campo y vuelve a guardar.

No se incluye ninguna instancia pública predeterminada. Hanami tampoco consulta
un registro, selecciona servidores al azar ni rota entre operadores.

## Restricciones de seguridad

- Solo se aceptan orígenes HTTPS; `http://localhost` queda limitado al
  desarrollo local.
- No se permiten credenciales, rutas, consultas ni fragmentos en la dirección
  configurada.
- El identificador de YouTube debe tener exactamente once caracteres válidos.
- La consulta usa `credentials: omit` y `referrerPolicy: no-referrer`.
- La respuesta JSON declarada no puede superar 2 MB.
- Solo se aceptan formatos de audio de `adaptiveFormats`.
- La URL multimedia debe pertenecer al mismo origen configurado.
- Solo se permiten las rutas `/videoplayback`, `/companion/` y
  `/api/manifest/`.
- Se rechazan URLs directas de `googlevideo.com`; `local=true` debe producir un
  proxy real de la instancia.
- No se envía al backend de Hanami ninguna URL suministrada por Invidious, lo
  que evita convertir Vercel en un proxy o introducir SSRF.

## Privacidad y operación

La instancia elegida ve la IP del usuario, el identificador del vídeo y el
tráfico de audio. Debe ser una instancia de confianza o una instalación propia.
Un operador puede limitar o desactivar `/api/v1/videos`, y la reproducción puede
fallar por CORS, límites de tráfico, bloqueo de YouTube o falta de Invidious
Companion.

Hanami conserva el error original si no existe una instancia configurada. Si
fallan ambos proveedores, muestra un mensaje combinado y no prueba
automáticamente terceros adicionales.

## Persistencia y renovación

Las pistas siguen usando un identificador `youtube-{videoId}`. Se guardan además:

- `playbackProvider`: `youtube-innertube` o `youtube-invidious`;
- `invidiousOrigin`: origen que emitió la URL;
- `expiresAt`: caducidad obtenida del parámetro `expire` o una ventana
  conservadora de cinco minutos.

Cuando una URL caduca, Hanami vuelve a probar primero su resolvedor. Solo si
vuelve a fallar consulta la instancia configurada. De este modo Invidious nunca
se convierte en el proveedor principal. Si la resolución inicial funciona pero
el endpoint de audio de Hanami devuelve un error de red o reproducción, el
reproductor realiza una única recuperación mediante Invidious y vuelve a cargar
la pista; no encadena intentos indefinidos.

## Validación

- `tests/invidious-fallback-v134.test.mjs` cubre validación del origen,
  selección de audio, `local=true`, rechazo de URLs externas, errores 403,
  privacidad y marcadores de versión.
- `tests/invidious-fallback-v134.e2e.mjs` comprueba en Chromium móvil el flujo
  completo: fallo de resolución, fallo posterior del proxy de audio,
  recuperación mediante Invidious y reproducción directa sin exponer
  Googlevideo.