# RENTA PWA and offline browsing

RENTA is configured as an installable Progressive Web App. The service worker precaches the built application shell and uses runtime caches for public listing responses, individual public listing details, listing photographs, OpenStreetMap tiles, web fonts, and the Pannellum viewer assets.

## First-time setup

1. Open a terminal in `client`.
2. Run `npm ci` to install dependencies for your operating system.
3. Run `npm run build`.
4. Run `npm run preview` and open the local preview URL. The service worker is enabled in the production preview. It is also enabled in Vite development mode by the current config.
5. Open RENTA while online and browse the landing page and the listing details you want available offline. The first visit must be online so the browser can cache those resources.

Service workers require `localhost` or an HTTPS origin. Opening `index.html` directly with a `file://` URL does not support PWA installation or offline caching.

## Verify offline browsing

1. While online, load the landing page and allow the property cards and images to finish loading.
2. Open one or more listing detail pages so their public listing data and images are cached.
3. In Chrome, open DevTools → Application → Service Workers and confirm the RENTA worker is activated. Under Cache Storage, look for cache entries beginning with `renta-` and Workbox precache entries.
4. In DevTools → Network, enable Offline, then reload the page.
5. Confirm the app shell opens, the previously cached public listings remain visible, previously cached property photos appear, and previously visited listing details load when their public detail response was cached.
6. Disable Offline and reload to refresh data.

## Offline behavior and limitations

- The app shell and previously downloaded static assets are cached.
- The public listings feed and individual public listing details use network-first caching. When the server cannot be reached, a previously cached response is used.
- The landing page also stores the public listing feed in local storage as a fallback for offline search.
- Property photos are cached after they have been viewed. A photo that has never been downloaded cannot appear offline.
- OpenStreetMap tiles are cached after they have been viewed. Offline map coverage is limited to tiles already stored by the browser.
- Authentication, OTP verification, reservation submission, viewing requests, reviews, payment actions, uploads, and owner/admin management require the backend and an internet connection. Do not treat an offline screen as confirmation that any server-side action was saved.
- Cached listing information can become outdated while offline. Reconnect before relying on current availability, prices, or reservation status.

The browser manages cache storage and can evict it when device storage is low. PWA caching is best-effort browser storage, not a permanent backup of property images or listing records.
