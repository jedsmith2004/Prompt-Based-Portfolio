/* ============================================================================
   The web app manifest.

   Not because this is a web app — there is no service worker, nothing works
   offline, and none of that is wanted here. It exists for one narrow reason:
   an Android home screen icon comes from the manifest, and without one Chrome
   falls back to the 32px favicon and scales it to 192, which turns Pip into
   nine hundred blurred pixels. `public/icon-192.png` and `public/icon-512.png`
   are drawn at those exact sizes by scripts/build-pip-icons.js.

   `display: browser` rather than `standalone`, and that is deliberate. This is
   a document, not an application: taking the address bar away from a site
   whose whole structure is nine addressable plates would remove the one
   control a reader has for moving between them and for seeing where they are.

   The name is split because the two are shown in different places: `name` on
   the install prompt, where there is room for the thesis, and `short_name`
   under the icon, where there is room for about twelve characters.
   ========================================================================== */

import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Jack Smith — builds from the metal up',
    short_name: 'Jack Smith',
    description:
      'Software rasterizers written from nothing, neural runtimes that never leave ' +
      'your machine, motion models that answer inside the editor.',
    start_url: '/',
    display: 'browser',
    /* The paper the site is printed on, and the ink it is printed in. */
    background_color: '#E4DFD3',
    theme_color: '#E4DFD3',
    lang: 'en-GB',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      /* `maskable` lets Android crop to whatever shape the launcher uses. The
         art is a full-bleed paper tile with the bird well inside it, so a
         circular mask takes paper off the corners and never touches him. */
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}
