# Auditoría de agenda — 22/11/2026

**Estado editorial: parcial, con actualización comprobada y publicación nueva pendiente.** Ventana 22/11/2026–17/01/2027.

## Control del repositorio
Se leyeron en main `docs/editorial-quality.md`, `scripts/validate-editorial.mjs` y `src/content.config.ts`. El índice heredado contiene 74 MDX y 23 eventos; no se obtuvo un árbol Git completo en esta ejecución para comprobar de nuevo todos sus SHA. El índice adjunto identifica explícitamente esa limitación. No se inventaron coordenadas ni imágenes.

## Clasificación y evidencia

### FALTA PUBLICAR — 120.º aniversario de Villars, 22 de noviembre
- Fecha: domingo 22/11/2026; finaliza el mismo día (hora de cierre no informada).
- Lugar: Plaza de Villars, General Las Heras. Sin coordenadas verificadas.
- Hora: desde la mañana; escenario anunciado a partir de las 13:00 por Información en Línea (19/11).
- Entrada: gratuita.
- Organización: comisión organizadora e instituciones de Villars, con acompañamiento municipal.
- Actividades: desfile criollo e institucional, música, danza, gastronomía, artesanos y emprendedores. Información en Línea menciona a Los Manseros Santiagueños de Leocadio Torres y A Toda Máquina; cartelera provincial no corrobora la grilla artística nominal.
- Fuentes: https://informacionenlinea.com/2026/11/19/este-domingo-se-celebra-la-fiesta-de-villars-en-la-plaza-principal-artistas-danza-y-tradicion/ ; https://noticiasconenfoque.com.ar/nota/45107/calendario-de-eventos-turisticos-en-la-provincia-de-buenos-aires-del-jueves-19-al-jueves-26-de-noviembre-de-2026 ; https://enprovincia.com.ar/calendario-de-eventos-turisticos-en-la-provincia-hasta-el-26-de-noviembre-de-2026/
- Pendiente: portada real pertinente con derechos y crédito o ilustración editorial original rasterizada. No se publicó MDX sin ella.

### ACTUALIZAR — Expo IATI, 5–8 de diciembre
- Publicación de Zapparancho reproducida en https://www.autos1000.com/AR/Buenos-Aires/225771587290409/Zapparancho informa preventa hasta 27/11: $39.000 por persona en parcela para dos o más, $50.000 parcela para una persona, $14.000 visita diaria; menores de 12 años gratis y beneficio familiar sujeto a condiciones. Se agregó al MDX existente con fecha de modificación 22/11 y advertencia de confirmar vigencia y cupos directamente.
- Original: https://www.todomotorhome.ar/l/8-expo-juntada-atrapa-tu-sueno-iati-diciembre-2026/6a9100e1-5c70-4e45-9f54-0039057d5fb7
- Horarios exactos y coordenadas: sin confirmación.

### YA PUBLICADO
- Expo IATI, noticia preexistente actualizada, no duplicada. Verificar despliegue público de la revisión.
- Maratón Zabala 15/11: pasada, no anunciar como próxima.

### DESCARTADO
- Fiesta del Inmigrante 7–8/11, actividades de octubre y anuncios de ediciones anteriores, por fechas ya transcurridas.
- Eventos genéricos sin fecha de edición 2026/2027 corroborada.

## Validaciones
El MDX actualizado conserva portada existente, tres secciones, fuentes enlazadas y más de 250 palabras. Se mantuvo `evento: true`, fecha inicial y final correctas y `mostrarMapaEvento: false`. No se ejecutó npm validate local ni se confirmó CI nuevo en esta ejecución: **no declarar CI aprobado**.

## Seguimiento
Confirmar programa y cambios del aniversario; conseguir portada editorial adecuada y publicar antes de que termine la jornada si sigue vigente. Revalidar todos los MDX contra el árbol actual y consultar las fuentes municipales, escuelas, clubes y bomberos que no ofrecieron una cartelera accesible y exhaustiva en esta pasada.
