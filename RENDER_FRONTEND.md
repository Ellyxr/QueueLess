# QueueLess frontend on Render (US-050)

The React/Vite frontend is deployed at `https://queueless-static.onrender.com`.
The root `render.yaml` describes a static site, but an existing site created
through Render's dashboard is not automatically changed by this file. Check
the existing site's dashboard settings as well.

## Prerequisite

The Nest API needs its own stable public **HTTPS** URL. A browser on another
device cannot reach `localhost:5000`, and a temporary Cloudflare quick tunnel
can stop or change addresses. Keep the API server and database running during
the demo.

## Configure the existing static site

1. In the existing static site's **Settings**, use the Git branch containing
   US-050 (normally `main` after merge), leave **Root Directory** blank, set
   **Build Command** to
   `pnpm install --frozen-lockfile && pnpm --dir artifacts/frontend build`,
   and set **Publish Directory** to `artifacts/frontend/dist/public`. Add a
   rewrite from `/*` to `/index.html` in **Redirects/Rewrites** so direct
   navigation to `/login` and `/payment/success` works.
2. In the static site's **Environment**, set `VITE_API_BASE_URL` to
   `https://queueless-bg1x.onrender.com/api/v1` and rebuild/deploy. The build
   rejects an unset, non-HTTPS, or trailing-slash URL. This value is embedded in public
   JavaScript at build time. Never put an API secret in a `VITE_` variable.
3. If the vendor product-image upload is part of the demo, add the public
   `VITE_IMAGEKIT_PUBLIC_KEY` to the Render static site's Environment settings
   and select **Save, rebuild, and deploy**. The private ImageKit key stays on
   the API server.
4. The static site's URL is `https://queueless-static.onrender.com`.
   Set the **Web Service's actual environment variable** `CORS_ORIGIN` to that
   exact origin, plus any local origin you
   still use, separated by commas:

   ```env
   CORS_ORIGIN=http://localhost:5173,https://queueless-static.onrender.com
   PAYMONGO_SUCCESS_URL=https://queueless-static.onrender.com/payment/success
   PAYMONGO_CANCEL_URL=https://queueless-static.onrender.com/payment/cancel
   ```

   Restart/redeploy the API after changing its environment. `CORS_ORIGIN`
   accepts origins only (scheme, hostname, optional port), without paths or
   wildcards. Configure PayMongo's webhook against the stable public API URL;
   the payment redirect URLs above point to the static frontend.

## Verify

- Visit the Render URL and reload `/login` and `/payment/success` directly.
  Both should load the React app instead of a 404.
- Open browser Network tools and confirm login calls the configured HTTPS API
  URL. A browser preflight from the Render origin should receive
  `Access-Control-Allow-Origin` matching that origin. An unlisted origin should
  receive no matching allow-origin header.
- Sign in with a demo account and load a page that fetches API data. If the
  API URL changes, update `VITE_API_BASE_URL` on Render and rebuild the static
  site; API CORS changes require an API restart/redeploy.
