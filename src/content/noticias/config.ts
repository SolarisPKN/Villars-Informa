import { defineCollection, z } from 'astro:content';

const noticias = defineCollection({
  type: 'content',
  schema: z.object({
    titulo: z.string(),
    descripcion: z.string().optional(),
    fecha: z.string(),
    autor: z.string().optional(),
    tags: z.array(z.string()).optional(),
    portada: z.string().optional(),
  }),
});

export const collections = { noticias };