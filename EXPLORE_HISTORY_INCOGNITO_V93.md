# Historial de Explorar y modo incógnito — v93

## Bugs corregidos

1. Al abrir un capítulo desde **Explorar**, Hanami crea o actualiza una entrada de historial aunque la obra todavía no pertenezca a Biblioteca.
2. Con **Modo incógnito** activo no se crean entradas ni se actualizan la fecha, el capítulo o los metadatos temporales del historial.

## Modelo

Las obras procedentes de Explorar se conservan como registros `favorite: false`. HistoryTab puede mostrarlas, reanudarlas, abrir sus detalles y añadirlas posteriormente a Biblioteca. Estos registros quedan excluidos de:

- la cuadrícula y contadores de Biblioteca;
- Actualizaciones;
- Estadísticas de Biblioteca;
- selección de migración.

Al pulsar el corazón desde Historial, el registro se promociona sin perder progreso, capítulos ni metadatos.

## Privacidad

El progreso necesario para **Continuar** puede seguir guardándose en una obra que ya pertenece a Biblioteca, pero los timestamps y el capítulo mostrado en Historial permanecen sin cambios durante una sesión incógnita. El modo incógnito no borra historial anterior: únicamente detiene nuevas escrituras.

## Limpieza

Borrar una entrada no favorita elimina el registro transitorio completo. Borrar el historial de una obra de Biblioteca conserva la obra y limpia únicamente sus metadatos históricos.

## Validación

- `node --check` superado en todos los JavaScript modificados.
- Suite completa `npm test` superada.
- E2E Chromium táctil 390×844 superado:
  - una obra de Explorar aparece en Historial;
  - no aparece en la cuadrícula de Biblioteca mientras `favorite: false`;
  - Incógnito no crea una segunda entrada;
  - Incógnito no modifica fecha, capítulo ni `lastReadAt`;
  - el progreso de página continúa disponible para reanudar.
