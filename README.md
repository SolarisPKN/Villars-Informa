# Villars Informa

Open-source static community site for Villars, Buenos Aires. It publishes local history, news, businesses, health notices, and scheduled public-transport information.

The project uses Astro 7 and builds without an application server. Transport data is copied daily from [SolarisPKN Transport](https://github.com/SolarisPKN/SolarisPKN-Transport), validated from SQLite, and exported to deterministic JSON before the site is built.

See [README.es.md](README.es.md) for architecture, commands, and data-provenance details.
