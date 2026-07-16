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

// Solo locales (datos básicos) - type: 'data'
const locales = defineCollection({
  type: 'data',
  schema: z.object({
    nombre: z.string(),
    direccion: z.string(),
    horarios: z.string(),
    telefono: z.string().optional(),
    categoria: z.string(),
    descripcion_corta: z.string().optional(),
    paga: z.boolean().default(false),
    menu: z.array(z.string()).optional(),
    fotos: z.array(z.string()).optional(),
    portada: z.string().optional(),
  }),
});
const premium = defineCollection({
  type: 'content',
  schema: z.object({
    titulo: z.string().optional(),
    subtitulo: z.string().optional(),
  }),
});
export const collections = { noticias, locales, premium };