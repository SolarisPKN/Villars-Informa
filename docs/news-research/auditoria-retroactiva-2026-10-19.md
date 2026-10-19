# Auditoría editorial retroactiva — 19/10/2026

Repositorio: SolarisPKN/Villars-Informa. Se examinó el índice de 68 MDX existentes tras publicar el Registro de Murgas (commit 035d794), comparando slugs, fechas, eventos, fuentes y extensión. Se revisaron las reglas de docs/editorial-quality.md, el esquema de src/content.config.ts y scripts/validate-editorial.mjs.

## Hallazgo: control editorial retroactivo

El validador deja exentos los artículos cuya fecha y modificación sean anteriores al 17/10/2026. En el tramo de contenidos creados/actualizados entre el 5 y el 16 de octubre había 15 noticias o eventos por debajo de los mínimos aplicables (noticias de 400 palabras, eventos de 250). Algunos carecían de portada o utilizaban SVG. Pasar CI no garantiza suficiencia editorial de estas notas antiguas.

## REPARADO — notas existentes

1. VTV: 108 → 658 palabras; portada original JPG y fuentes normativas (commit 8c6c31b).
2. Ruta 6 peaje: 159 → 715; resoluciones 475 y 767 y reclamo de CONADUV con su efecto real (8c6c31b).
3. Tren Sarmiento: 188 → 643; distinción entre frecuencia restablecida y tramo a Villars cerrado (8c6c31b).
4. Zona Fría: 278 → 708; Ley 27.828 y condiciones de subsidio sin calcular aumentos ficticios (23e59b6).
5. HCD líneas 136/163: 90 → 626; resolución local y expediente nacional diferenciados (23e59b6).
6. Coordinación Las Heras/Marcos Paz/Navarro: 141 → 643; responsabilidades y pendientes (23e59b6).
7. Reunión con Banco Provincia: 117 → artículo desarrollado, con fuentes y sin atribuir créditos aún no otorgados (commit posterior).
8. Festival N-Escena: 212 → nota histórica ampliada, fuentes de balance y programación (commit posterior).
9. Fiesta del Jamón y la Cerveza: 194 → balance retrospectivo y sede corregida (commit posterior).
10. Maratón Zabala: 208 → evento ampliado por la auditoría de agenda (4741401).
11. Daniel Agostini: 53 → evento ampliado por auditoría de agenda (4741401).

Además se corrigió la agenda de Luján y la reclasificación de eventos vencidos en la auditoría de agenda. Se publicó la nueva noticia de inscripción municipal de murgas (035d794) sin duplicados.

## VENCIDAS / NO CORROBORADAS: no rellenar con suposiciones

Persisten cuatro notas antiguas con datos insuficientes para reconstruir los hechos una vez vencida la fecha:
- Carolina Centurión (50 palabras; espectáculo anunciado para 17/10): comprobar si se realizó antes de transformarlo en crónica.
- El hombre inesperado (81 palabras; función prevista para 11/10): fuente de ticketera, falta confirmación independiente de presentación.
- Trasnoche Paranormal (44 palabras; función anunciada 16/10): no hay resultados verificados.
- Macondo 98 años en Villars (154 palabras; encuentro anunciado 10–12/10): no encontramos balance independiente, confirmación de asistencia ni programa realizado.

Estas fichas quedan como antecedentes históricos de convocatorias, no como noticias nuevas ni eventos futuros. No se inventa que el espectáculo o encuentro ocurrió por el mero hecho de haber estado anunciado. Deben revisarse en una etapa de verificación documental y ampliarse a 250 palabras útiles cuando haya pruebas, o retirarse de exposición destacada según criterio editorial.

## OK / REPARADO / REQUIERE INTERVENCIÓN

- OK: índice semántico, esquema real de MDX, fuentes, deduplicación por acontecimiento, validación de longitudes y controles de portadas.
- REPARADO: notas enumeradas arriba, con edición directa del mismo slug, sin forzar commits ni modificar fecha original.
- REQUIERE INTERVENCIÓN editorial: 4 convocatorias vencidas sin evidencia suficiente para sostener un desarrollo retrospectivo. Decidir si permanecen como archivo provisional o se despublican al cerrar la revisión.
- La comprobación CI debe revisarse para cada commit. GitHub main no equivale automáticamente a sitio desplegado; comprobar URLs públicas por separado.

Portadas nuevas: imágenes raster JPG 2016×1152 de Adobe Firefly, ilustración editorial de SolarisPKN Arts, con créditos en MDX. Las fotografías reales solo se incorporarán con fuentes y derechos de uso verificados.

Se prohíbe inferir cifras, asistentes, resultados y cambios de fecha. Los borradores que no satisfacen el umbral editorial no se marcan como publicados.
