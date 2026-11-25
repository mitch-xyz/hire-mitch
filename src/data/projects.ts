import type { ImageMetadata } from 'astro';

import convergenceWhiskey1 from '../assets/projects/convergence-whiskey-1-1.webp';
import convergenceWhiskey2 from '../assets/projects/convergence-whiskey-2.webp';
import coolBanner3 from '../assets/projects/cool-banner-3.webp';
import jamesgangNecklabel from '../assets/projects/jamesgang-necklabel-1.webp';
import nittiCdCover from '../assets/projects/nitti-cd-cover-2.webp';
import overunderMockup from '../assets/projects/overunder-mockup2.webp';
import waitformeWeb2 from '../assets/projects/waitforme-web-2.webp';
import waitformeWeb3 from '../assets/projects/waitforme-web-3.webp';
import wbwcLabelShoot from '../assets/projects/wbwc-label-shoot-014-1.webp';
import wbwcOfLabel from '../assets/projects/wbwc-of-label-v1.webp';
import wbwcStudioSesh from '../assets/projects/wbwc-studiosesh-april2026-058-edit2.webp';
import webMockupEsea from '../assets/projects/web-mockup-esea.webp';
import webMockupNurture from '../assets/projects/web-mockup-nurture.webp';
import webMockupSocas from '../assets/projects/web-mockup-socas.webp';

/** Videos are served as-is from /public (Astro doesn't optimize video). */
export type Media = { type: 'image'; src: ImageMetadata } | { type: 'video'; src: string };

export interface Project {
  /** URL path: /<slug>/ */
  slug: string;
  title: string;
  tagline: string;
  /** Media shown on the homepage card. */
  cover: Media;
  /**
   * Homepage card button.
   * - 'detail': "See More" -> this project's own page
   * - { href }: "See Website" -> external link in a new tab
   * - undefined: no button
   */
  cta?: 'detail' | { href: string };
  /** Slides on the project's detail page. */
  gallery: Media[];
}

const img = (src: ImageMetadata): Media => ({ type: 'image', src });
const vid = (src: string): Media => ({ type: 'video', src });

const ottosVideo = vid('/video/ottos-scrolling-720p.mp4');

/** Order here is the order on the homepage. */
export const projects: Project[] = [
  {
    slug: 'west-bottoms-whiskey-co',
    title: 'West Bottoms Whiskey Co.',
    tagline: 'Bottle Label Design',
    cover: img(convergenceWhiskey1),
    cta: 'detail',
    gallery: [
      img(convergenceWhiskey2),
      img(wbwcOfLabel),
      img(wbwcStudioSesh),
      img(jamesgangNecklabel),
      img(convergenceWhiskey1),
      img(waitformeWeb3),
      img(waitformeWeb2),
      img(wbwcLabelShoot),
    ],
  },
  {
    slug: 'ottos-environmental-improvements',
    title: 'Ottos Environmental Improvements',
    tagline: 'Branding and website design + development',
    cover: ottosVideo,
    cta: { href: 'https://www.ottosenvironmental.com/' },
    gallery: [ottosVideo],
  },
  {
    slug: 'esea',
    title: 'ESEA',
    tagline: 'E-Sports Platform Redesign',
    cover: img(webMockupEsea),
    gallery: [img(webMockupEsea)],
  },
  {
    slug: 'socas-web-kit',
    title: 'SOCAS Web Kit',
    tagline: 'Website design and prototype',
    cover: img(webMockupSocas),
    cta: {
      href: 'https://www.figma.com/proto/gGEJ2mZKj0YpTOCpRakj22/SOCAS-Web-Kit?page-id=0%3A1&node-id=74-21&viewport=-620%2C290%2C0.12&scaling=scale-down-width&starting-point-node-id=74%3A21&hotspot-hints=0',
    },
    gallery: [img(webMockupSocas)],
  },
  {
    slug: 'nurture-uk',
    title: 'Nurture UK',
    tagline: 'Mental health resource website design',
    cover: img(webMockupNurture),
    cta: {
      href: 'https://www.figma.com/proto/lwvKhMknUwyd4P1ndiOVtV/Nurture-UK?page-id=0%3A1&node-id=42-423&viewport=10%2C-434%2C0.12&scaling=scale-down-width&starting-point-node-id=42%3A423',
    },
    gallery: [img(webMockupNurture)],
  },
  {
    slug: 'over-under',
    title: 'Over Under',
    tagline: 'Sports bar branding and design',
    cover: img(overunderMockup),
    gallery: [img(overunderMockup)],
  },
  {
    slug: 'misc-design',
    title: 'Misc. Design',
    tagline: 'Promotional art and miscellaneous design',
    cover: img(nittiCdCover),
    cta: 'detail',
    gallery: [img(nittiCdCover), img(coolBanner3)],
  },
];
