# Calidad editorial de Villars Informa

Las noticias fechadas desde 2026-10-17 y las revisadas con campo modificada desde esa fecha deben cumplir los controles del comando npm run validate:editorial. Los artículos anteriores se mantienen para no romper CI y se revisarán editorialmente por separado.

- Noticia común: mínimo 400 palabras, dos secciones útiles y fuente enlazada.
- Evento: mínimo 250 palabras, dos secciones y fuente enlazada.
- Noticia realmente urgente y breve: categoría Breves, mínimo 150 palabras y fuente enlazada. Nunca rellenar con información inventada.
- Descripción de al menos 45 caracteres y portada local válida. Se rechazan SVG como única portada, portadas inexistentes y mapas de bits por debajo de 500 píxeles en algún eje. Se avisa sobre imágenes inferiores a 1200x650 para revisión humana, preservando fotos documentales originales.
- Las fotos reales pertinentes y autorizadas tienen prioridad. Si no las hay, crear portada ilustrativa de calidad con identidad Villars Informa y crédito SolarisPKN Arts.
- Comprobar manualmente autor/fuente/URL y que la imagen documenta el hecho: ningún validador automático puede hacerlo con certeza.

El guard se ejecuta en CI dentro de npm run validate. Si falla, corregir la causa y verificar, nunca evadirlo con relleno ficticio o una imagen ajena.

## Responsabilidad institucional y causas económicas

Para cada aumento, beneficio, subsidio, obra, programa o medida pública, documentar tres planos distintos:

1. **Decisión directa:** jurisdicción, autoridad, funcionario, norma, fecha, facultad concreta y quién ejecuta, cobra o financia.
2. **Mecanismo y antecedentes:** fórmula contractual o legal, paritarias, criterios de actualización, concesionarias, origen histórico del beneficio y cambios normativos a lo largo de distintas gestiones. No atribuir al gobierno actual un beneficio originado antes.
3. **Contexto y cadena de costos:** investigar IPC nacional y regional, salarios, energía, combustibles, impuestos, transporte, materiales, financiamiento y decisiones de diferentes niveles del Estado cuando sean pertinentes al caso. Usar datos oficiales, fechas y comparación de períodos.

**Regla de causalidad:** separar con palabras explícitas lo DOCUMENTADO COMO CAUSA DIRECTA, lo que es CONTEXTO ECONÓMICO COMPROBADO y lo que es HIPÓTESIS O VÍNCULO NO DEMOSTRADO. Una correlación temporal entre decisiones nacionales y una tarifa provincial no acredita que una haya causado la otra. No inventar porcentajes de responsabilidad, intenciones ni explicaciones políticas. Tampoco omitir políticas nacionales cuando existen vínculos económicos relevantes y documentados.

Explicar siempre el efecto en el bolsillo del vecino, distinguiendo aumento nominal, comparación con inflación real cuando corresponda, capacidad de compra, beneficio aplicable y a quién alcanza. Evitar tanto la culpabilización automática de quien firma la última resolución como la exoneración automática por mencionar un contexto nacional. Aplicar el mismo método a Nación, Provincia, municipios, empresas y sindicatos, con fuentes trazables.

### Ejemplo de aplicación: VTV bonaerense, octubre 2026

La Resolución 361/2026 del Ministerio de Transporte provincial autorizó el valor de la VTV. La fórmula de la tarifa básica es el 7% del salario categoría 1 SMATA-CAVEA, acordado en paritarias: la negociación es un factor directo del mecanismo contractual. La inflación nacional y los precios de los insumos son contexto a investigar, no causas porcentualmente atribuibles al aumento sin evidencia adicional. Comparar tarifa vigente, tarifas anteriores e IPC del período; informar bonificaciones, su origen normativo y los efectos para el usuario. Fuentes primarias: https://normas.gba.gob.ar/ar-b/resolucion/2026/361/626643 ; https://www.smata.com.ar/convenios-y-escalas/wp-content/uploads/sites/16/2026/07/CAVEA-SALARIOS-JULIO-AGOSTO-SEPTIEMBRE-2026.pdf ; https://www.indec.gob.ar/

