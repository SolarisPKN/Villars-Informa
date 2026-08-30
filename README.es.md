# Villars Informa

Sitio comunitario, estático y de código abierto para Villars, provincia de Buenos Aires. Reúne historia local, noticias, comercios, avisos de salud y horarios programados de transporte.

Sitio publicado: <https://villars.solarispkn.com.ar>

## Arquitectura

- Astro 7 con salida HTML estática.
- Content Layer para noticias, comercios, contenido premium y actualizaciones.
- SEO y navegación accesible centralizados en el layout: canonicales, Open Graph, Twitter Cards y schemas específicos para noticias, listados, comercios, salud y transporte.
- JavaScript nativo y progresivo; el contenido esencial se genera en el build.
- CI con tests, `astro check`, build, auditoría de dependencias y validación del HTML, canonicales, H1, imágenes y grafos JSON-LD generados.

Las decisiones de transporte están documentadas en [`docs/adr/0001-static-transport-snapshot.md`](docs/adr/0001-static-transport-snapshot.md) y [`docs/adr/0002-mapa-estatico-y-posiciones-vivas.md`](docs/adr/0002-mapa-estatico-y-posiciones-vivas.md).

## Transporte

`data/transport/horarios.db` es una copia versionada de la base pública de [SolarisPKN Transport](https://github.com/SolarisPKN/SolarisPKN-Transport). `npm run data:transport` valida SQLite y genera `src/data/transport-schedules.json`, incluyendo el SHA-256 de la base de origen. El JSON conserva cada formación, sus paradas efectivas y su terminal real; una grilla cuyo nombre diga “Lozano” ya no convierte automáticamente en servicios a las formaciones cortas que terminan en Marcos Paz o Villars.

El workflow `sync-transport.yml` se ejecuta una vez al día. Si la base no cambió, no crea commits. Si cambió, regenera los datos, valida todo el proyecto y recién entonces publica el snapshot.

El mapa usa MapLibre sobre `public/maps/villars-region.pmtiles`, un extracto autocontenido de Protomaps/OpenStreetMap. `npm run data:transport-map` renueva las trazas y paradas estáticas de la línea 322; el mapa base no se descarga en cada visita desde OpenStreetMap.

Los horarios mostrados son programados. Las posiciones son una capa separada y sólo se rotulan como vivas cuando existe un snapshot reciente.

## Activar la capa de posiciones

El Worker de `workers/transport-live` consulta Cuándo SUBO y SOFSE una vez por minuto y escribe un snapshot consolidado en R2. El cliente distingue posiciones informadas de estimaciones: si SOFSE informa una formación activa pero no entrega GPS, no se presenta como una coordenada medida.

1. Crear los buckets `villars-transport-live` y `villars-transport-live-preview` en Cloudflare R2.
2. Configurar el CORS del bucket con `workers/transport-live/r2-cors.json` y vincular un dominio personalizado, por ejemplo `transport-data.solarispkn.com.ar`.
3. Ejecutar `npm run worker:transport:check` y luego `npm run worker:transport:deploy`.
4. Definir `PUBLIC_TRANSPORT_LIVE_URL=https://transport-data.solarispkn.com.ar/current.json` en el entorno que construye Astro y volver a publicar el sitio.

El cliente consulta ese JSON cada 60 segundos, usa `ETag` y detiene el sondeo cuando la pestaña queda en segundo plano. No llama a los proveedores desde el navegador.

## Desarrollo

Requisitos: Node.js 22.12 o superior y npm 9.6.5 o superior.

```bash
npm ci
npm run dev
```

Validación completa:

```bash
npm run validate
npm audit --audit-level=high
```

Comandos de contenido:

```bash
npm run create-news
npm run create-health
npm run create-local
```

## Licencia y contribuciones

Antes de proponer cambios, ejecutá la validación completa y no publiques datos personales o información local sin una fuente verificable. La licencia formal del contenido y el código aún debe definirse.
