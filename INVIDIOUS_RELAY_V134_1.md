# Relay Invidious v134.1

La v134.1 sustituye el fallback directo de navegador de v134 por un relay de
mismo origen. Su objetivo es resolver el fallo de CORS entre la PWA y una
instancia Invidious que sí puede entregar audio.

```text
Browser → Hanami → Invidious → upstream de Invidious
```

1. Si el resolvedor principal de Hanami falla, la PWA llama a
   `POST /api/music/invidious/resolve` en **su propio origen**.
2. Hanami consulta `/api/v1/videos/:id?local=true` en la instancia elegida.
3. Hanami devuelve a la PWA una URL relativa
   `/api/music/invidious/audio/:id?instance=…`; nunca expone al navegador la
   URL temporal `videoplayback` de Invidious.
4. El elemento de audio pide esa URL a Hanami. Hanami solicita el stream a
   Invidious, conserva `Range` y retransmite el cuerpo y las cabeceras de
   audio necesarias.

El navegador no solicita ni `/api/v1/videos` ni `/videoplayback` a la
instancia, por lo que la ausencia de `Access-Control-Allow-Origin` en
Invidious ya no bloquea a la PWA. El stream sigue siendo best effort: si
Invidious no puede obtenerlo de su upstream, Hanami propaga ese fallo; no lo
corrige ni intenta eludirlo.

## Configuración de producción

Por seguridad, una ejecución de producción no acepta una instancia arbitraria
desde el navegador. Configura en Vercel una lista exacta de orígenes públicos
HTTPS permitidos antes de usar el fallback:

```dotenv
HANAMI_INVIDIOUS_ALLOWED_ORIGINS=https://invidious.f5.si
```

Para varias instancias controladas por ti, sepáralas con comas:

```dotenv
HANAMI_INVIDIOUS_ALLOWED_ORIGINS=https://invidious.f5.si,https://invidious.example.org
```

La instancia que escribas en la PWA debe coincidir exactamente con uno de esos
orígenes (sin ruta). En desarrollo local se permite una instancia HTTPS pública
sin esa variable, y también `http://localhost` o `http://127.0.0.1` para una
instancia local de prueba.

## Límites deliberados

- No hay instancia pública predeterminada ni rotación automática.
- Solo se aceptan orígenes HTTPS públicos autorizados en producción; no se
  convierten URL arbitrarias en un proxy.
- Solo se retransmiten rutas de medio locales de Invidious:
  `/videoplayback`, `/companion/` o `/api/manifest/`.
- Se aplica un timeout a la API (12 s) y al stream (25 s), se limita la
  respuesta JSON a 2 MB y se admite un único `Range` de bytes.
- El relay usa ancho de banda y tiempo de ejecución de Hanami/Vercel únicamente
  cuando el fallback llega a reproducir audio. Ajusta el uso a los límites de
  tu despliegue.

## Migración desde v134

Los registros de reproducción directos de v134 se renuevan por el relay en la
siguiente carga. Actualiza el despliegue, define
`HANAMI_INVIDIOUS_ALLOWED_ORIGINS` y vuelve a guardar en la interfaz el mismo
origen HTTPS. No hace falta cambiar la PWA ni pegar URLs `videoplayback`.
