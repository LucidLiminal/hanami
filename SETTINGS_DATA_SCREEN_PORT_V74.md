# SettingsDataScreen web port — v74

## Ubicación

`SettingsDataScreen.kt` corresponde a **Más → Datos y almacenamiento**. El placeholder anterior de dos acciones se sustituyó por una pantalla completa.

## Funciones portadas

- Ubicación para copias mediante File System Access API, con almacenamiento interno del navegador como fallback.
- Crear copia con las opciones de Biblioteca y Ajustes de Mihon.
- Restaurar con validación, selección de secciones y aviso de fuentes o servicios ausentes.
- Compatibilidad de restauración con las copias JSON v1 anteriores de Hanami.
- Copias automáticas cada 6, 12, 24, 48 o 168 horas mientras Hanami está activo.
- Conservación de las cuatro copias automáticas más recientes.
- Fecha relativa de la última copia.
- Uso de almacenamiento mediante `navigator.storage.estimate()`.
- Medición y limpieza independiente del caché temporal de capítulos.
- Limpieza automática opcional.
- Exportación CSV con título, autor y artista.

## Adaptación web

Android ejecuta trabajos garantizados y conserva permisos SAF. Un navegador no ofrece esas garantías: Hanami programa la siguiente copia cuando la PWA está activa, conserva copias internas en IndexedDB e intenta escribir también en la carpeta elegida cuando el permiso continúa concedido.

Los datos principales permanecen en el almacenamiento del sitio; elegir una carpeta no mueve la aplicación ni sus bases internas.