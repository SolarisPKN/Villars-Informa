# Calidad editorial de Villars Informa

Las noticias fechadas desde 2026-10-17 y las revisadas con campo modificada desde esa fecha deben cumplir los controles del comando npm run validate:editorial. Los artículos anteriores se mantienen para no romper CI y se revisarán editorialmente por separado.

- Noticia común: mínimo 400 palabras, dos secciones útiles y fuente enlazada.
- Evento: mínimo 250 palabras, dos secciones y fuente enlazada.
- Noticia realmente urgente y breve: categoría Breves, mínimo 150 palabras y fuente enlazada. Nunca rellenar con información inventada.
- Descripción de al menos 45 caracteres y portada local válida. Se rechazan SVG como única portada, portadas inexistentes y mapas de bits por debajo de 500 píxeles en algún eje. Se avisa sobre imágenes inferiores a 1200x650 para revisión humana, preservando fotos documentales originales.
- Las fotos reales pertinentes y autorizadas tienen prioridad. Si no las hay, crear portada ilustrativa de calidad con identidad Villars Informa y crédito SolarisPKN Arts.
- Comprobar manualmente autor/fuente/URL y que la imagen documenta el hecho: ningún validador automático puede hacerlo con certeza.

El guard se ejecuta en CI dentro de npm run validate. Si falla, corregir la causa y verificar, nunca evadirlo con relleno ficticio o una imagen ajena.
