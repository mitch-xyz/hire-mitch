import { defineCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const projects = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/projects' }),
  schema: ({ image }) => {
    const media = z.discriminatedUnion('type', [
      z.object({ type: z.literal('image'), src: image() }),
      /** Videos are served as-is from /public (Astro doesn't optimize video). */
      z.object({ type: z.literal('video'), src: z.string() }),
    ]);

    return z.object({
      title: z.string(),
      tagline: z.string(),
      /** Homepage display order, ascending. */
      order: z.number(),
      /** Media shown on the homepage card. */
      cover: media,
      /**
       * Homepage card button.
       * - 'detail': "See More" -> this project's own page
       * - { href }: "See Website" -> external link in a new tab
       * - undefined: no button
       */
      cta: z.union([z.literal('detail'), z.object({ href: z.string() })]).optional(),
      /** Slides on the project's detail page. */
      gallery: z.array(media),
    });
  },
});

export const collections = { projects };

type ProjectData = CollectionEntry<'projects'>['data'];
export type Media = ProjectData['cover'];
/** A project entry flattened with its slug (filename, used as the URL path). */
export type Project = ProjectData & { slug: string };
