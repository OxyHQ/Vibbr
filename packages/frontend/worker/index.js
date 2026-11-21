/**
 * Vibbr web Worker -- serves the Expo static export with proper MIME types.
 *
 * It is the Worker entrypoint (`main` in wrangler.toml), never `public/_worker.js`:
 * that is Pages Advanced Mode, which nothing but Pages loads, and under
 * `public/` it would also be uploaded as a public asset.
 *
 * The asset pipeline (`env.ASSETS.fetch`) answers ANY miss with index.html,
 * because wrangler.toml sets `not_found_handling = "single-page-application"`
 * (that is what makes a dynamic route such as /post/<id> load). A browser that
 * asked for a stale hashed `.js` and was handed `text/html` rejects it, so this
 * returns a real 404 for asset extensions instead.
 *
 * Response headers are owned by public/_headers in the asset pipeline.
 */

const STATIC_EXTENSIONS = new Set([
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.map',
  '.wasm',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.webp',
  '.avif',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.mp3',
  '.mp4',
  '.webm',
  '.ogg',
  '.wav',
  '.pdf',
  '.xml',
  '.txt',
]);

function getExtension(pathname) {
  const lastDot = pathname.lastIndexOf('.');
  return lastDot === -1 ? '' : pathname.slice(lastDot).toLowerCase();
}

const SITE = 'https://vibbr.co';
const API = 'https://api.vibbr.co/v1';
const EVENT_PATH = /^\/e\/([A-Za-z0-9_-]+)\/?$/;
const STATIC_PAGES = ['/', '/search'];
const API_ORIGIN = 'https://api.vibbr.co';
/** What remote servers ask vibbr.co for: discovery, actors, the inbox and event objects (ADR 0002). */
const FEDERATION_PATH = /^\/(\.well-known\/(webfinger|host-meta(\.json)?)|ap\/)/;

/**
 * Hands a federation request to the API unchanged. The signature of an inbound activity covers the
 * `host` the sender used, `vibbr.co`, so it travels as X-Forwarded-Host (the engine rebuilds the
 * signed line from it). The API answers 404 until federation is switched on there.
 */
function proxyToApi(request, url) {
  const headers = new Headers(request.headers);
  headers.set('x-forwarded-host', url.hostname);
  return fetch(
    new Request(`${API_ORIGIN}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual',
    }),
  );
}

const SITE_TITLE = 'Vibbr: events and tickets near you';
const SITE_DESCRIPTION =
  'Discover concerts, nights out, talks and community events, get your tickets in a couple of taps and organize your own. Free and paid events, resale and door scanning, all in one app.';
const SITE_IMAGE = `${SITE}/og-image.jpg`;
const IMAGE_ALT = 'Six friends gathered around a golden ticket with a star';

const SITE_JSON_LD = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Vibbr',
    url: SITE,
    description: SITE_DESCRIPTION,
    inLanguage: ['en', 'es'],
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Vibbr',
    url: SITE,
    logo: `${SITE}/icon-512.png`,
  },
];

const escapeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escapeAttr = (s) => escapeXml(String(s));
/** JSON for a <script>: `<` can never close the tag early. */
const jsonForScript = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

/** A public read of the API; null when it fails, so SEO never takes the page down with it. */
async function readApi(path) {
  try {
    const res = await fetch(`${API}${path}`, { cf: { cacheTtl: 300, cacheEverything: true } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function sitemap() {
  const events = await readApi('/events?limit=100');
  const urls = [
    ...STATIC_PAGES.map((p) => `<url><loc>${SITE}${p === '/' ? '' : p}</loc></url>`),
    ...(events?.items ?? []).map((e) => `<url><loc>${SITE}/e/${escapeXml(e.id)}</loc></url>`),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;
  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}

function eventDescription(card) {
  const when = new Date(card.startsAt).toLocaleDateString('en', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: card.timeZone,
  });
  const where = [card.venueName, card.city].filter(Boolean).join(', ');
  const price = card.free ? 'Free' : card.soldOut ? 'Sold out' : 'Tickets available';
  return `${card.title} by ${card.organizerName}, ${when}${where ? ` at ${where}` : ''}. ${price} on Vibbr.`;
}

function eventJsonLd(card, description) {
  const url = `${SITE}/e/${card.id}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: card.title,
    description,
    startDate: card.startsAt,
    ...(card.endsAt ? { endDate: card.endsAt } : {}),
    eventStatus:
      card.status === 'cancelled'
        ? 'https://schema.org/EventCancelled'
        : 'https://schema.org/EventScheduled',
    ...(card.venueName
      ? { location: { '@type': 'Place', name: card.venueName, address: card.city ?? undefined } }
      : {}),
    ...(card.coverUrl ? { image: [card.coverUrl] } : {}),
    organizer: { '@type': 'Organization', name: card.organizerName },
    url,
    ...(card.priceFrom || card.free
      ? {
          offers: {
            '@type': 'Offer',
            url,
            price: card.free ? '0' : String(card.priceFrom.amount / 100),
            priceCurrency: card.free ? 'USD' : card.priceFrom.currency,
            availability: card.soldOut
              ? 'https://schema.org/SoldOut'
              : 'https://schema.org/InStock',
          },
        }
      : {}),
  };
}

/** Everything a crawler or a link preview reads from the head of one page. */
function headTags({ title, description, url, image, type, jsonLd, sized }) {
  const t = escapeAttr(title);
  const d = escapeAttr(description);
  const i = escapeAttr(image);
  return [
    `<title>${escapeXml(title)}</title>`,
    `<meta name="description" content="${d}">`,
    `<link rel="canonical" href="${escapeAttr(url)}">`,
    '<meta name="robots" content="index, follow, max-image-preview:large">',
    '<meta name="theme-color" content="#fff3d6">',
    '<link rel="manifest" href="/manifest.json">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    '<meta property="og:site_name" content="Vibbr">',
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:url" content="${escapeAttr(url)}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:image" content="${i}">`,
    ...(sized
      ? [
          '<meta property="og:image:width" content="1200">',
          '<meta property="og:image:height" content="630">',
          `<meta property="og:image:alt" content="${escapeAttr(IMAGE_ALT)}">`,
        ]
      : []),
    '<meta property="og:locale" content="en_US">',
    '<meta property="og:locale:alternate" content="es_ES">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
    `<meta name="twitter:image" content="${i}">`,
    `<script type="application/ld+json">${jsonForScript(jsonLd)}</script>`,
  ].join('');
}

/** The page's own head: an event's data on /e/<id>, the site's everywhere else. */
async function withSeoHead(response, pathname) {
  const event = EVENT_PATH.exec(pathname);
  const card = event ? await readApi(`/events/${encodeURIComponent(event[1])}/card`) : null;
  const tags =
    card && card.status !== 'draft'
      ? (() => {
          const description = eventDescription(card);
          return headTags({
            title: `${card.title} · Vibbr`,
            description,
            url: `${SITE}/e/${card.id}`,
            image: card.coverUrl ?? SITE_IMAGE,
            type: 'event',
            jsonLd: eventJsonLd(card, description),
            sized: !card.coverUrl,
          });
        })()
      : headTags({
          title: SITE_TITLE,
          description: SITE_DESCRIPTION,
          url: `${SITE}${pathname === '/' ? '/' : pathname}`,
          image: SITE_IMAGE,
          type: 'website',
          jsonLd: SITE_JSON_LD,
          sized: true,
        });
  return new HTMLRewriter()
    .on('title', { element: (el) => el.remove() })
    .on('head', { element: (el) => el.append(tags, { html: true }) })
    .transform(response);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const extension = getExtension(pathname);

    if (pathname === '/sitemap.xml') return sitemap();
    if (FEDERATION_PATH.test(pathname)) return proxyToApi(request, url);

    // Try the asset pipeline first.
    const assetResponse = await env.ASSETS.fetch(request);
    const contentType = assetResponse.headers.get('content-type') || '';

    // Detect when the platform returns an HTML fallback for a static-asset URL.
    // If the URL has a known static extension but the response is HTML, the
    // actual file doesn't exist (e.g., stale hashed bundle from a previous
    // deploy). Return a clean 404 instead of HTML with the wrong MIME type.
    if (STATIC_EXTENSIONS.has(extension) && contentType.includes('text/html')) {
      return new Response('Not Found', { status: 404 });
    }

    // Every page gets its own head so crawlers and link previews see the page, not the bare shell.
    if (request.method === 'GET' && contentType.includes('text/html')) {
      return withSeoHead(assetResponse, pathname);
    }

    // For non-asset paths (SPA navigation routes), the platform's index.html
    // fallback is correct behavior. Return the response as-is.
    return assetResponse;
  },
};
