// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const noticias = defineCollection({
  schema: z.object({
    titulo: z.string(),
    fecha: z.string(),
    autor: z.string().optional(),
    resumen: z.string(),
  }),
});

const locales = defineCollection({
  schema: z.object({
    nombre: z.string(),
    direccion: z.string(),
    horarios: z.string(),
    telefono: z.string().optional(),
    paga: z.boolean(),
    menu: z.array(z.string()).optional(),
    fotos: z.array(z.string()).optional(),
  }),
});

export const collections = { noticias, locales };