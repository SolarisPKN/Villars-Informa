import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const slugFromIndex = ({ entry }: { entry: string }) =>
  entry.replace(/\\/g, '/').replace(/\/index\.(?:md|mdx)$/i, '');

const slugFromJson = ({ entry }: { entry: string }) =>
  entry.replace(/\\/g, '/').replace(/\/(?:post|local)\.json$/i, '');

const noticias = defineCollection({
  loader: glob({
    pattern: '**/index.(md|mdx)',
    base: './src/content/noticias',
    generateId: slugFromIndex,
  }),
  schema: z.object({
    titulo: z.string(),
    descripcion: z.string().default(''),
    fecha: z.coerce.date(),
    autor: z.string().optional(),
    tags: z.array(z.string()).default([]),
    portada: z.string().optional(),
  }),
});

const locales = defineCollection({
  loader: glob({
    pattern: '**/{post,local}.json',
    base: './src/content/locales',
    generateId: slugFromJson,
  }),
  schema: z.object({
    nombre: z.string(),
    direccion: z.string(),
    horarios: z.string(),
    telefono: z.string().optional(),
    categoria: z.string(),
    descripcion_corta: z.string().optional(),
    paga: z.boolean().default(false),
    menu: z.array(z.string()).default([]),
    fotos: z.array(z.string()).default([]),
    portada: z.string().optional(),
  }),
});

const premium = defineCollection({
  loader: glob({
    pattern: '**/index.mdx',
    base: './src/content/premium',
    generateId: slugFromIndex,
  }),
  schema: z.object({
    titulo: z.string().optional(),
    subtitulo: z.string().optional(),
  }),
});

const actualizaciones = defineCollection({
  loader: glob({
    pattern: '**/index.(md|mdx)',
    base: './src/content/actualizaciones',
    generateId: slugFromIndex,
  }),
  schema: z.object({
    fecha: z.coerce.date(),
    titulo: z.string().default('Actualización'),
  }),
});

export const collections = { noticias, locales, premium, actualizaciones };
