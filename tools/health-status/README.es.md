# Recolector opcional de estados de WhatsApp (Salud de Villars)

**Prototipo experimental no activado.** Este módulo NO está conectado todavía a ninguna cuenta y NO publica automáticamente nada en Villars Informa. Requiere una cuenta de WhatsApp dedicada, sesión autenticada y autorización de la fuente (CAPS) para recibir y reutilizar avisos públicos. El uso de clientes no oficiales puede violar las condiciones de WhatsApp y conllevar el bloqueo de la cuenta, incluso en consultas de bajo volumen.

## Qué hace

- Usa `whatsapp-web.js` (funciones documentadas `getBroadcasts()` y `Broadcast.msgs`); depende de WhatsApp Web y puede romperse si la plataforma cambia.
- Consulta **solo estados pertenecientes a teléfonos previamente autorizados**, identificados por número exacto, nunca por coincidencias de nombres.
- Conserva únicamente estados con `timestamp` y `id` válidos, creados en las últimas 24 horas; descarta los expirados y deduplica por SHA-256.
- Guarda borradores **solo en una carpeta PRIVADA externa al repositorio**, con marca de tiempo y fecha de caducidad del estado. Imágenes JPEG/PNG/WebP hasta 8 MB se guardan localmente si es posible. No se hace OCR ni transcripción de vídeos.
- Cada borrador lleva `state: pending-human-review` y `publishingAuthorized: false`. **No se sube contenido a GitHub, no se publica y no se exponen sesiones.**
- Importante: que un estado esté visible hoy **NO** garantiza que sus citas, guardias o campañas sigan vigentes. Antes de publicar se debe comprobar la **fecha del evento**, el establecimiento y el permiso para reutilizar la pieza.

## Uso local, una vez obtenida la autorización

Necesitás Node 22+ y Chromium/Chrome capaz de iniciar `whatsapp-web.js`. Ejecutá **en tu propia PC/servidor, nunca en un runner temporal de GitHub**:

1. `npm install --prefix tools/health-status` desde el repositorio (instala la biblioteca separada del sitio).
2. Configurá de manera privada, fuera del repo:
   - `WA_STATUS_CONSENT=yes` — indica que obtuviste autorización explícita del CAPS.
   - `WA_ALLOWED_CONTACTS=549...` — número real de la cuenta que PUBLICA los estados; no asumir que coincide con el teléfono de turnos. Permite coma para más cuentas.
   - `WA_STATE_DIR` — carpeta absoluta y privada, fuera del directorio de Git, para sesión y borradores (ej.: `D:\\SolarisPKN-IA\\privado\\salud-status`).
   - `WA_SOURCE_LABEL=CAPS Villars` (opcional; solo nombre de la fuente).
3. Ejecutá `node tools/health-status/run.mjs` desde una terminal privada. En el primer enlace se imprime QR solo en esa terminal; enlazá la **cuenta dedicada** y restringí la visibilidad de estados en el teléfono del CAPS según su consentimiento.
4. Los borradores se encuentran en `WA_STATE_DIR/inbox/*.json`, con imágenes adjuntas en la misma carpeta. Nunca hagas commit de esos archivos. Cada estado se registra una sola vez; repetir la consulta no duplica avisos.
5. Para automatizar en Windows, creá una tarea en **Programador de tareas** que ejecute el mismo script **cada 6 horas** con las variables configuradas para el usuario del sistema. Conservá el perfil y la sesión de WhatsApp fuera del repositorio. Si la cuenta pierde el vínculo, hay que volver a enlazarla localmente.

**No utilizar el número de contacto "Sala Villars" como identificador del emisor sin comprobar en WhatsApp qué cuenta realmente publica el estado.** Los contactos de llamadas y los emisores de estados pueden ser distintos.

## GitHub Actions: opción correcta

No guardar cookies, códigos QR, `LocalAuth`, número de cuenta, imágenes ni estados en `actions/cache`, artefactos o secretos de un repositorio **público**.

Si preferís usar la programación de GitHub:

- Crea un **repositorio privado** de automatizaciones con un workflow `schedule` que ejecute esta herramienta en un **runner self-hosted privado** de Windows/Linux, con `WA_STATE_DIR` persistente. El workflow del repositorio privado solo iniciaría el trabajo en el equipo; el navegador y sus sesiones vivirían en ese equipo, NO en los servidores temporales de GitHub.
- En repositorios públicos, evita conectar un runner self-hosted con acceso a sesiones y credenciales. Limitá los permisos de workflow y no ejecutes código proveniente de pull requests no confiables.
- GitHub puede retrasar u omitir trabajos programados. Por eso recomendamos cada 6 horas (y no exactamente una vez por día), con deduplicación y comprobación estricta del momento de publicación.

## Enlace posterior con Villars Informa

Fase 1 (este commit): **captura experimental local** y borradores sin publicación.

Fase 2 (solo tras probar con la cuenta real y obtener autorización): revisor local que apruebe texto e imagen, compruebe vigencia del evento y convierta avisos autorizados en `src/content/actualizaciones/<slug>/index.md` mediante un PR. La sección de Salud ya usa esa colección y muestra hasta cinco avisos. Nunca publicar automáticamente contenido privado o datos personales de pacientes.

Fuentes técnicas: https://docs.wwebjs.dev/Broadcast.html y https://faq.whatsapp.com/434518851968943
