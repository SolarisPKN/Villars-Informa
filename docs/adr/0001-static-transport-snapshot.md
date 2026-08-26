# ADR 0001: Snapshot estático y auditable de transporte

## Contexto

Villars Informa se publica como un sitio Astro completamente estático. Los horarios se mantienen en `SolarisPKN-Transport/horarios.db`, una base SQLite pública que se actualiza por separado y contiene más recorridos que los necesarios para Villars. El sitio necesita consultar esos datos sin incorporar un servidor ni presentar horarios programados como seguimiento en tiempo real.

## Decisión

Se versiona una copia exacta de la base en `data/transport/horarios.db`. Un exportador determinista, basado en `node:sqlite`, valida la integridad y las claves foráneas y genera `src/data/transport-schedules.json`. El esquema conserva la matriz formación por parada para calcular el destino real a partir de la última parada con horario; el nombre general de una grilla no se usa como terminal de todas sus formaciones. Astro incluye ese JSON en el build estático y JavaScript nativo aporta filtros y el cálculo del próximo servicio.

Un workflow diario compara la base pública de origen con la copia local. Sólo cuando cambia, copia el archivo, regenera el JSON, ejecuta tests, chequeo de tipos y build, y finalmente publica ambos artefactos en un único commit.

## Opciones consideradas

- Consultar SQLite directamente desde el navegador: requeriría WebAssembly, aumentaría mucho el peso enviado y expondría una interfaz innecesariamente compleja.
- Consumir GitHub en cada visita: introduciría latencia, límites de API y un punto de falla en una página que puede resolverse en build time.
- Implementar una API propia: permitiría datos dinámicos, pero agrega infraestructura operativa sin aportar tiempo real real.
- Copiar solamente un CSV de Villars: sería liviano, pero perdería procedencia, esquema y auditabilidad de la fuente completa.

## Consecuencias

- El sitio funciona sin backend y conserva una fuente reproducible mediante SHA-256.
- La interfaz debe rotular los datos como programados, no como tiempo real.
- El repositorio crece aproximadamente 150 KB por revisión de la base; Git sólo almacena los deltas que pueda comprimir.
- Si cambia el esquema SQLite, el workflow falla antes de publicar y obliga a actualizar deliberadamente el exportador.
- Node.js 22.12 o superior es requisito por el uso de `node:sqlite`.

## Acciones de seguimiento

- Vigilar los fallos del workflow diario.
- Incorporar una fuente oficial de alertas sólo si ofrece datos verificables y condiciones de uso compatibles.
- Revisar periódicamente las vigencias informadas por cada operador.
