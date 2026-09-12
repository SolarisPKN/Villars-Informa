# Villars Informa

Open-source static community site for Villars, Buenos Aires. It publishes local history, news, businesses, health notices, and scheduled public-transport information.

The project uses Astro 7 and builds without an application server. Transport schedules are copied daily from [SolarisPKN Transport](https://github.com/SolarisPKN/SolarisPKN-Transport), validated from SQLite, and exported to deterministic JSON before the site is built. Realtime collection, Cloudflare deployment, R2 deltas, and daily Registries live only in that self-hosted transport repository; this repository is the consumer/frontend.

The vector basemap is stored in this repository as an overview plus 135 PMTiles archives, one per Buenos Aires Province partido. Real map data is available through zoom 15 and visually overzooms to 18. The browser loads only the archives intersecting the current viewport by HTTP Range requests. Run `npm run maps:build` to reproduce the set from Protomaps/OpenStreetMap and official Georef/IGN boundaries.

See [README.es.md](README.es.md) for architecture, commands, and data-provenance details.
