# Respaldo inerte del Worker live v1

Estos archivos conservan el código fuente que Villars Informa utilizaba antes de trasladar la infraestructura
live a `SolarisPKN-Transport`. No forman parte de ningún script, workflow, dependencia o build del sitio.

- Último commit del frontend que contenía el Worker activo: `fdc73905`.
- Versión de Cloudflare observada antes del refactor: `a4698e20-d85a-4fd7-8a65-1ed696a98298`.
- La configuración, los conectores, el schema v2, el cron y el Registry actuales se mantienen únicamente en
  `SolarisPKN-Transport/live`, `config/live.json` y `.github/workflows/deploy-live.yml`.

Los imports del archivo archivado reflejan su ubicación original y deliberadamente no se repararon: este
directorio es evidencia recuperable, no un segundo sistema ejecutable.
