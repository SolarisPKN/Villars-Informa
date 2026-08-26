# ADR 0002: Mapa autocontenido y posiciones vivas degradables

## Contexto

La página de transporte debe seguir siendo útil aunque fallen las APIs externas y, al mismo tiempo, permitir visualizar recorridos y posiciones recientes. Un sitio Astro estático no puede custodiar credenciales ni concentrar consultas a proveedores desde cada navegador. Además, los servidores estándar de mosaicos de OpenStreetMap no permiten descargar masivamente sus tiles para crear un paquete offline.

La fuente de Cuándo SUBO usa una interfaz OneBusAway y expone vehículos activos. La interfaz ferroviaria investigada para los horarios de SOFSE no documenta ni confirma todavía un endpoint de posiciones. Confundir una predicción con una coordenada observada o conservar un vehículo viejo como si siguiera circulando sería peor que mostrar una capa vacía.

## Decisión

Se separan tres planos independientes:

1. `transport-schedules.json` conserva horarios programados y formaciones completas. Es el respaldo estable y auditable.
2. `public/maps/villars-region.pmtiles` contiene una extracción regional de Protomaps/OpenStreetMap. MapLibre la lee mediante solicitudes HTTP Range desde el mismo sitio; admite zoom y desplazamiento sin depender de un servidor cartográfico externo.
3. Un Worker programado consulta los proveedores una vez por minuto, normaliza las posiciones y reemplaza `current.json` en un bucket R2. El navegador consulta solamente ese objeto y actualiza una capa GeoJSON. Si el objeto o un proveedor falla, el mapa y los horarios continúan funcionando.

El snapshot vivo usa `schemaVersion`, `generatedAt`, `expiresAt`, estado por proveedor y una lista de vehículos. Cada posición distingue `observed` de `predicted`, marca datos viejos y no inventa una hora de actualización cuando el proveedor no la entrega. El conector de Cuándo SUBO se limita a los identificadores `135_1623` y `135_1624`. SOFSE permanece explícitamente como `unavailable` hasta verificar una fuente legítima y estable de coordenadas.

El archivo se publica mediante un dominio personalizado de R2 con caché de 45 segundos. El sitio sondea cada 60 segundos, usa `ETag`, pausa al ocultarse la pestaña y nunca llama directamente a Cuándo SUBO o SOFSE.

## Capacidad y costo

- El cron genera 1.440 escrituras por día, unas 43.200 por mes: queda muy por debajo del millón mensual de operaciones Class A incluido en el nivel gratuito de R2 Standard.
- R2 Standard incluye 10 GB-mes y 10 millones de lecturas Class B mensuales. El PMTiles regional ocupa aproximadamente 7,2 MB y `current.json` ocupa pocos KB.
- La caché del dominio personalizado evita que cada sondeo del navegador llegue a R2. Sin caché, diez millones de lecturas equivaldrían a unas 231 sesiones concurrentes sostenidas consultando una vez por minuto; con caché, la lectura de origen se comparte por ubicación de borde.
- El Worker gratuito admite 100.000 solicitudes diarias y 50 subrequests por ejecución. El cron hace una solicitud de colectivo por minuto; la CPU gratuita de 10 ms obliga a mantener la normalización pequeña y sin procesamiento cartográfico.

## Opciones consideradas

- Usar `tile.openstreetmap.org`: descartado para el paquete estático porque su política prohíbe scraping, prefetch y archivos offline.
- Llamar a las APIs desde el navegador: descartado por multiplicar tráfico, exponer detalles del proveedor y mezclar CORS, límites y caídas con la experiencia del usuario.
- Servir `current.json` siempre a través del Worker: viable, pero consumiría el límite de requests del Worker por cada usuario. Un objeto público en R2 con dominio y caché es más simple para esta carga de lectura.
- WebSockets o Durable Objects: descartados; un dato que cambia por minuto no necesita una conexión permanente.
- Mostrar una supuesta posición ferroviaria derivada del horario: descartado porque sería una estimación no verificada presentada como seguimiento real.

## Consecuencias

- El mapa base funciona aunque R2 y los proveedores estén caídos.
- El repositorio suma un binario cartográfico de aproximadamente 7,2 MB y dependencias de MapLibre/PMTiles.
- La línea ferroviaria del overlay une estaciones conocidas; la vía y las calles detalladas pertenecen a la base PMTiles.
- Activar posiciones requiere crear el bucket y el dominio R2, desplegar el Worker y definir `PUBLIC_TRANSPORT_LIVE_URL` durante el build del sitio.
- La cobertura ferroviaria en vivo queda pendiente por decisión de integridad de datos, no por una limitación de la interfaz.

## Acciones de seguimiento

- Confirmar las condiciones vigentes de uso de cada proveedor antes de desplegar el recolector.
- Incorporar un conector ferroviario sólo cuando exista un endpoint de posición verificable y documentar si la coordenada es observada o inferida.
- Alertar si `generatedAt` supera dos minutos y monitorear errores del cron.
- Renovar el extracto PMTiles de forma manual cuando cambie materialmente la cartografía regional.
