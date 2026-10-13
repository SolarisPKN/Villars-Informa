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

### Compatibilidad con alojamiento sin rangos HTTP

PMTiles conserva acceso aleatorio con HTTP 206 si el host lo soporta. Si Cloudflare Pages responde HTTP 200, el cliente descarga el archivo solicitado (overview o partido necesario), limitado a 25 MiB, verifica firma/tamaño y lo expone mediante un Source de memoria. No se descarga toda la provincia; la solución es completamente estática y gratuita. En hosting sin Range el consumo de datos es mayor.


### Continuidad visual al mover o ampliar el mapa

La vista regional permanece montada y hace *overzoom* de la información z0–9 hasta z18. Los archivos por partido son **superposiciones con fondo transparente**: no deben tapar los municipios vecinos ni dejar en gris una tesela para la que todavía no llegó un archivo de detalle.

Protomaps Leaflet usa por defecto teselas fuente de 512 px con levelDiff=1. Por eso el primer nivel **visual** que puede usar los PMTiles municipales con datos mínimos z10 es **z11**; a z10 aún corresponde usar la vista regional (datos z9). Activarlos a z10 era un error de nivel fuente y dejaba huecos.

Las capas municipales se limitan a su propia caja geográfica, no a todo el rectángulo provincial. El controlador conserva como máximo 12 capas recientes en caché para evitar descargas repetidas cuando se cruza una frontera; carga hasta tres partidos en paralelo y abandona nuevos lotes obsoletos ante un desplazamiento. Si una descarga falla, se conserva la cartografía regional mientras los datos de transporte siguen visibles.

**Límite de cobertura:** los archivos incluidos están recortados a la provincia de Buenos Aires; desplazarse fuera del rectángulo provincial no produce cartografía nueva. Sobre otras provincias haría falta ampliar el inventario de archivos o añadir otro proveedor.


### 136 Rápido: trazado vial, no línea recta

El corredor 136 Rápido estaba representado por 23 puntos de referencia unidos de forma recta, atravesando superficies sin calles. El trazado del mapa se regeneró con OSRM usando la red vial de OpenStreetMap (licencia ODbL), obteniendo 2.256 vértices y unos 125 km de recorrido vial, con validación de continuidad entre los vértices. El script reproducible es `scripts/maps/trace-136-rapido.mjs` y no requiere claves ni servicios pagos para el sitio publicado.

**Importante:** OSRM asegura que el camino coincide con calles ruteables, pero **no certifica el itinerario exacto del concesionario de la 136**. Por eso se identifica explícitamente como `road-network-estimate`, y la procedencia se conserva en el GeoJSON. Los recorridos 322 conservan sus trazas detalladas preexistentes.


### Alineación ferroviaria de Belgrano Sur y Sarmiento

En la auditoría de 2026-10-13 se detectó que ambos trenes estaban representados por líneas rectas entre estaciones (5 puntos en González Catán–Lozano y 13 en Merlo–Lobos). Se reemplazaron por las polilíneas de la **Red ferrocarriles - Nacional** del IGN/Ministerio de Transporte (ArcGIS FeatureServer 0, edición de mayo de 2026). El script reproducible de solo desarrollo scripts/maps/trace-ign-railways.mjs verifica uniones de segmentos, estaciones y geometrías; no realiza consultas del navegador al servidor oficial.

- Belgrano Sur: segmentos IGN OBJECTID 305, 292 y 288 (ramal G/G4), 62 vértices ferroviarios entre González Catán y Lozano.
- Sarmiento: segmentos IGN 346, 334, 309, 291, 225 y 861 (S3 y empalme hacia Lobos), 72 vértices ferroviarios.
- Los datos conservan geometryKind: ign-rail-network, geometrySource y geometrySourceIds para auditoría. Las posiciones estimadas se interpolan **sobre la polilínea**, no en recta entre estaciones. Una actualización de cronogramas conserva estos recorridos.

**Precisión y límites:** la cobertura geográfica oficial disponible está generalizada: algunos vértices quedan separados hasta ~4,8 km y algunas estaciones históricas del sitio se encuentran a ~1,2 km de la polilínea más cercana. Por eso el resultado es *una traza ferroviaria oficial de referencia*, no una geometría de alta resolución apta para afirmar la ubicación métrica exacta de una formación. No sustituye una revisión de campo ni GPS real. Para mejorar la precisión se requiere otra fuente de geometría más detallada, sin interpolar rectas sobre el terreno.

**Ferromapas:** el archivo KMZ original no se pudo obtener de una fuente verificable en esta auditoría, por lo que **no se afirmó ni registró que esta geometría proviniera de Ferromapas**. Se prefirió la cartografía pública oficial con procedencia explícita y sin claves ni costes operativos.
