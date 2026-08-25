# Villars Informa

Sitio comunitario, estático y de código abierto para Villars, provincia de Buenos Aires. Reúne historia local, noticias, comercios, avisos de salud y horarios programados de transporte.

Sitio publicado: <https://villars.solarispkn.com.ar>

## Arquitectura

- Astro 7 con salida HTML estática.
- Content Layer para noticias, comercios, contenido premium y actualizaciones.
- SEO, datos estructurados y navegación accesible centralizados en el layout.
- JavaScript nativo y progresivo; el contenido esencial se genera en el build.
- CI con tests, `astro check`, build y auditoría de dependencias.

La decisión completa sobre transporte está documentada en [`docs/adr/0001-static-transport-snapshot.md`](docs/adr/0001-static-transport-snapshot.md).

## Transporte

`data/transport/horarios.db` es una copia versionada de la base pública de [SolarisPKN Transport](https://github.com/SolarisPKN/SolarisPKN-Transport). `npm run data:transport` valida SQLite y genera `src/data/transport-schedules.json`, incluyendo el SHA-256 de la base de origen.

El workflow `sync-transport.yml` se ejecuta una vez al día. Si la base no cambió, no crea commits. Si cambió, regenera los datos, valida todo el proyecto y recién entonces publica el snapshot.

Los horarios mostrados son programados, no información en tiempo real.

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
npm run create-local
```

## Licencia y contribuciones

Antes de proponer cambios, ejecutá la validación completa y no publiques datos personales o información local sin una fuente verificable. La licencia formal del contenido y el código aún debe definirse.
