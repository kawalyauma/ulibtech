import type { MetadataRoute } from 'next';
import { SITE_NAME } from '@/lib/config';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: 'EduShare',
    description: 'Free past papers, notes, schemes of work and lesson plans for Ugandan schools.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0f766e',
    lang: 'en-UG',
    categories: ['education', 'books'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Search', url: '/search' },
      { name: 'Past papers', url: '/past-papers' },
      { name: 'Classes', url: '/classes' },
    ],
  };
}
