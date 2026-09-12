# ADR 0003: Villars como consumidor live y mapa provincial por partidos

## Estado

Aceptado. Reemplaza la arquitectura runtime del ADR 0002 sin modificar el contrato de cronogramas del ADR 0001.

## Decisión

Villars Informa es un frontend Astro estático. Conserva la copia SQLite, la exportación determinística de
cronogramas, shapes, tablas, predictor y visualización; no contiene un Worker desplegable ni conectores de
proveedores. La infraestructura live se compila y opera exclusivamente desde SolarisPKN Transport.

El predictor del navegador combina dos capas independientes:

1. el cronograma local siempre crea el servicio previsto y lo proyecta sobre su shape;
2. el schema live v2 puede corregir posición, demora, estado, parada y velocidad.

La ausencia de GPS, una caída del proveedor o una unidad omitida nunca significan cancelación. Sólo un estado
`cancelled` explícito modifica la grilla y el mapa como cancelado. Las últimas cuatro observaciones permiten
calcular velocidad cuando el proveedor no la informa y el movimiento se proyecta sobre el recorrido.

## Cartografía

El mapa provincial se versiona en `public/maps/buenos-aires/` como:

- `overview.pmtiles`, z0–9;
- `partidos/*.pmtiles`, 135 archivos z10–15;
- `manifest.json`, con límites, tamaños, SHA-256 y procedencia.

El overview resuelve la vista regional. A partir de z10 sólo se montan los partidos que intersectan el viewport.
Leaflet/PMTiles pide rangos HTTP de esos archivos y permite overzoom hasta z18. De este modo ninguna visita
descarga el conjunto provincial completo y ningún archivo excede los límites individuales de GitHub/hosting.

`scripts/maps/build-buenos-aires-pmtiles.mjs` reproduce el conjunto desde un basemap Protomaps basado en
OpenStreetMap y los polígonos oficiales Georef/IGN. El PMTiles regional anterior permanece sólo como fallback
de emergencia, no como cartografía principal.

## Consecuencias

- No existen dos sistemas live ejecutables en Villars.
- Un fallo realtime degrada precisión pero no elimina servicios programados.
- El mapa es autocontenido en GitHub y no usa R2, Google Maps ni tiles raster públicos.
- Actualizar cartografía es una operación explícita, reproducible y revisable por diff del manifest.
