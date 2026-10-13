# Auditoría técnica de Villars Informa · 2026-10-13

## Alcance y fuentes verificadas

Revisión estática del repositorio público (rama main), manifest cartográfico, frontend Astro, integraciones Leaflet/PMTiles, rutas de noticias, cabeceras y workflows GitHub Actions. Se consultaron logs reales de la sincronización del 12 de octubre de 2026. No se dispone de una sesión de navegador con consola ni una captura verificable de las respuestas HTTP Range desde el host final; la causa exacta del fallo visual en producción requiere el workflow de salud del mapa.

## Hallazgos confirmados

1. **Sincronización detenida:** workflow `sync-transport.yml` falla en `npm run validate:dist` porque las noticias incluyen un H1 en la plantilla y otro H1 en el Markdown. La regeneración del transporte nunca alcanza su paso de publicación. Reparación: plugin Remark acotado a `src/content/noticias/`, que elimina el encabezado Markdown duplicado de apertura y degrada otros H1 a H2; prueba unitaria.
2. **Prueba de mapa incompleta:** antes se verificaban existencia, tamaño y cantidad de archivos, pero no firma PMTiles ni integridad del transporte por rangos. Reparación: cabecera en `validate:dist`, preflight real de 16 bytes 206/Content-Range/firma, y monitor HTTP programado.
3. **Fallos de teselas invisibles:** los `tileerror` sólo llegaban a consola, mientras el UI podía seguir indicando funcionamiento. Reparación: mensajes de degradación, botón para reintentar y marcadores de eventos dibujados incluso si la cartografía falla.
4. **Cargas provinciales asíncronas:** los errores de partidas durante cambios de zoom podían generar rechazos de promesa no tratados y mapas parciales sin explicación. Reparación: captura por archivo, estado degradado y respaldo regional cuando todos los tiles visibles fallan.

## Arquitectura / seguridad

- Astro genera páginas estáticas; no hay backend de cuentas/contraseñas en este repositorio.
- Fuente de posiciones live externa `transport-data.solarispkn.com.ar`; un corte no debe confundirse con cancelación.
- No colocar claves ni tokens en `PUBLIC_*` o en JSON/MDX publicados. El respaldo `backup/transport-live-v1` no es fuente operativa de servicios: conviene retirarlo tras revisión histórica independiente de secretos.
- Hay directorio `public/.well-know/` (error tipográfico) además de `public/.well-known/`: corregirlo en una limpieza controlada.
- PMTiles necesita respuesta HTTP **206** y bytes sin transformaciones; `_headers` de Cloudflare Pages puede reducir compresión no deseada, pero GitHub Pages ignora ese archivo. Revisar la configuración del hosting real si falla la prueba HTTP.
- Riesgo residual: sin navegador automatizado no hay confirmación de render visual, filtrado o mobile. Añadir prueba Playwright cuando haya runner/despliegue de preview confiable.

## Reproducción

- `npm ci && npm run validate`: pruebas, tipos, build y estructura estática.
- `node scripts/check-live-map.mjs`: valida respuestas de producción sin claves.
- Workflow `Verificar cartografía publicada`: diario, 11:15 UTC, alarma por GitHub Actions sin servicio pago.
- Si el healthcheck falla con 200, 206 truncado o Content-Range erróneo, revisar compresión/CDN y respuesta a Range; no añadir APIs de pago.

## Reparación de hosting estático, 13 de octubre

El monitor de producción confirmó la causa: la CDN respondió HTTP 200 sin Content-Range a Range: bytes=0-15 para archivos PMTiles. La lectura aleatoria del mapa no estaba disponible.

Se agregó un Source compatible con PMTiles que prefiere HTTP 206, pero para HTTP 200 descarga en streaming limitado el único archivo local que se necesita (overview o partido visible), valida firma y cantidad de bytes contra el manifest y lo lee en memoria. Nunca se descarga el mapa provincial completo. Se mantiene un tope de 25 MiB por archivo. El healthcheck ahora valida ambos mecanismos abriendo la cabecera PMTiles real.

**Costo técnico:** en este hosting cada partido se descarga completo en vez de pedir bloques. Aumenta transferencia/memoria del navegador, pero no necesita R2, backend o APIs pagas. Un monitor HTTP verde no sustituye un test E2E visual en navegador.
