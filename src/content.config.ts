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
    modificada: z.coerce.date().optional(),
    autor: z.string().optional(),
    categoria: z.string().default('General'),
    tags: z.array(z.string()).default([]),
    portada: z.string().optional(),
    imagenes: z.array(z.string()).default([]),
    evento: z.boolean().default(false),
    fechaEvento: z.coerce.date().optional(),
    fechaFinEvento: z.coerce.date().optional(),
    horaEvento: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    lugarEvento: z.string().max(180).default(''),
    latEvento: z.number().min(-90).max(90).optional(),
    lonEvento: z.number().min(-180).max(180).optional(),
    mostrarMapaEvento: z.boolean().default(false),
  }).superRefine((data, context) => {
    if (data.evento && !data.fechaEvento) {
      context.addIssue({ code: 'custom', path: ['fechaEvento'], message: 'Los eventos requieren una fecha.' });
    }
    if (data.fechaEvento && data.fechaFinEvento && data.fechaFinEvento < data.fechaEvento) {
      context.addIssue({ code: 'custom', path: ['fechaFinEvento'], message: 'La fecha final no puede ser anterior al comienzo.' });
    }
    if ((data.latEvento === undefined) !== (data.lonEvento === undefined)) {
      context.addIssue({ code: 'custom', path: ['latEvento'], message: 'La ubicación requiere latitud y longitud.' });
    }
    if (data.mostrarMapaEvento && (data.latEvento === undefined || data.lonEvento === undefined)) {
      context.addIssue({ code: 'custom', path: ['mostrarMapaEvento'], message: 'Para mostrar el mapa primero elegí una ubicación.' });
    }
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
    mensaje: z.string().max(500),
    fuente: z.string().default(''),
    fuenteUrl: z.union([z.url(), z.literal('')]).default(''),
    imagen: z.string().default(''),
  }),
});

export const collections = { noticias, locales, premium, actualizaciones };
