/**
 * CORS proxy Worker for the Feira do Livro app.
 *
 * Usage: GET /?url=ENCODED_TARGET_URL
 *
 * Proxies requests to an allowlisted set of origins so the browser can
 * call them cross-origin (they don't set Access-Control-Allow-Origin).
 *
 * Allowed origins:
 *   - https://www.goodreads.com           (Goodreads RSS shelves)
 *   - https://feiradolivrodelisboa.pt     (Feira API — all books / search)
 */

const ALLOWED_PREFIXES = [
  'https://www.goodreads.com',
  'https://feiradolivrodelisboa.pt/_fll/wp-admin/admin-ajax.php',
]

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default {
  async fetch(request) {
    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })
    }

    const { searchParams } = new URL(request.url)
    const target = searchParams.get('url')

    if (!target) {
      return new Response('Missing ?url= parameter', { status: 400, headers: CORS_HEADERS })
    }

    // Allowlist check — must start with one of the approved prefixes
    const allowed = ALLOWED_PREFIXES.some(prefix => target.startsWith(prefix))
    if (!allowed) {
      return new Response('URL not in allowlist', { status: 403, headers: CORS_HEADERS })
    }

    let upstream
    try {
      upstream = await fetch(target, {
        headers: {
          // Some sites block requests without a User-Agent
          'User-Agent': 'Mozilla/5.0 (compatible; FeiraCORSProxy/1.0)',
        },
        cf: { cacheTtl: 60 }, // Cache upstream responses for 60 s at Cloudflare edge
      })
    } catch (e) {
      return new Response(`Upstream fetch failed: ${e.message}`, {
        status: 502,
        headers: CORS_HEADERS,
      })
    }

    // Forward response body + status, inject CORS headers
    const contentType = upstream.headers.get('Content-Type') || 'application/octet-stream'
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': contentType,
      },
    })
  },
}
