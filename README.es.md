# Villars Informa

Sitio comunitario, estático y de código abierto para Villars, provincia de Buenos Aires. Reúne historia local, noticias, comercios, avisos de salud y horarios programados de transporte.

Sitio publicado: <https://villars.solarispkn.com.ar>

## Arquitectura

- Astro 7 con salida HTML estática.
- Content Layer para noticias, comercios, contenido premium y actualizaciones.
- SEO y navegación accesible centralizados en el layout: canonicales, Open Graph, Twitter Cards y schemas específicos para noticias, listados, comercios, salud y transporte.
- JavaScript nativo y progresivo; el contenido esencial se genera en el build.
- CI con tests, `astro check`, build, auditoría de dependencias y validación del HTML, canonicales, H1, imágenes y grafos JSON-LD generados.

Las decisiones de transporte están documentadas en [`docs/adr/0001-static-transport-snapshot.md`](docs/adr/0001-static-transport-snapshot.md), el ADR histórico 0002 y [`docs/adr/0003-frontend-de-transporte-y-mapa-por-partidos.md`](docs/adr/0003-frontend-de-transporte-y-mapa-por-partidos.md).

## Transporte

`data/transport/horarios.db` es una copia versionada de la base pública de [SolarisPKN Transport](https://github.com/SolarisPKN/SolarisPKN-Transport). `npm run data:transport` valida SQLite y genera `src/data/transport-schedules.json`, incluyendo el SHA-256 de la base de origen. El JSON conserva cada formación, sus paradas efectivas y su terminal real; una grilla cuyo nombre diga “Lozano” ya no convierte automáticamente en servicios a las formaciones cortas que terminan en Marcos Paz o Villars.

El workflow `sync-transport.yml` se ejecuta una vez al día. Si la base no cambió, no crea commits. Si cambió, regenera los datos, valida todo el proyecto y recién entonces publica el snapshot.

El mapa vectorial cubre toda la provincia de Buenos Aires. `public/maps/buenos-aires/` contiene un overview z0–9 y 135 PMTiles z10–15, uno por partido, generados desde Protomaps/OpenStreetMap y los límites oficiales Georef/IGN. El navegador activa sólo los partidos visibles, solicita rangos HTTP del archivo correspondiente y permite overzoom visual hasta z18; nunca descarga el mapa provincial completo. `public/maps/villars-region.pmtiles` queda únicamente como recuperación degradada si el manifest provincial no está disponible. La interfaz conserva la atribución a Protomaps y OpenStreetMap.

`npm run maps:build` descarga un CLI `go-pmtiles` fijado y verificado, obtiene los 135 polígonos oficiales, genera cada archivo y escribe un manifest con tamaños, límites y SHA-256. Los binarios se versionan normalmente en Git porque ningún archivo supera 11 MB. `npm run data:transport-map` renueva las trazas y paradas estáticas de Belgrano Sur, Sarmiento Merlo–Lobos, 136 Rápido y línea 322.

El corredor local del 136 se construyó mediante transcripción manual de horarios y paradas visibles en páginas públicas, tratadas como fuente secundaria mientras no exista una publicación primaria equivalente. No se usa una API privada ni scraping automatizado. Su geometría vial queda incorporada al bundle y la estimación por horario ocurre sólo en el navegador.

Los horarios mostrados son programados. El navegador mantiene visibles los servicios previstos aunque falte GPS o caiga un proveedor, interpola sobre el shape real, aplica demoras conocidas y usa observaciones GPS como correcciones suaves. Sólo presenta una cancelación cuando el proveedor aporta evidencia explícita.

## Capa realtime

Villars Informa ya no compila ni despliega Workers. Consume `current.json` schema v2 generado por la instancia self-hosted de [SolarisPKN Transport](https://github.com/SolarisPKN/SolarisPKN-Transport). El cliente consulta ese objeto cada 60 segundos, usa `ETag`, pausa al ocultarse la pestaña y nunca llama directamente a los proveedores. `PUBLIC_TRANSPORT_LIVE_URL` permite cambiar el snapshot de la instalación sin incorporar secretos al JavaScript.

El código viejo está preservado como evidencia inerte en `backup/transport-live-v1/`; no participa del build. La arquitectura, conectores, cron, bindings, deltas y Registry vigentes se mantienen exclusivamente en SolarisPKN Transport.

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
npm run maps:build
```

## Licencia y contribuciones

Antes de proponer cambios, ejecutá la validación completa y no publiques datos personales o información local sin una fuente verificable. La licencia formal del contenido y el código aún debe definirse.
