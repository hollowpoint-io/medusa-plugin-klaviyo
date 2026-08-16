# @hollowpoint-io/medusa-plugin-klaviyo

[Klaviyo](https://www.klaviyo.com) for [Medusa](https://medusajs.com) v2: Started Checkout / Placed Order events, consent sync, and a honeypot newsletter endpoint.

Maintained by [Hollowpoint](https://hollowpoint.io). MIT licensed.

## Install

```bash
npm install @hollowpoint-io/medusa-plugin-klaviyo
# or, until the package is on npm:
npm install github:hollowpoint-io/medusa-plugin-klaviyo
```

```ts
// medusa-config.ts
module.exports = defineConfig({
  plugins: [
    {
      resolve: "@hollowpoint-io/medusa-plugin-klaviyo",
      options: {
        api_key: process.env.KLAVIYO_API_KEY,
        list_id: process.env.KLAVIYO_LIST_ID,
        storefront_url: process.env.STOREFRONT_URL,
        // revision: "2026-07-15",
        // source_name: "Medusa",
        // product_path: "/products/{handle}",
        // checkout_path: "/checkout",
        // order_path: "/account/orders/{order_id}",
        // rate_limit: { max: 5, window_ms: 60_000 },
      },
    },
  ],
})
```

No migrations. If the plugin is installed without `api_key` / `list_id` / `storefront_url`, subscribers no-op and the subscribe route returns 503.

Built and tested against Medusa `>=2.17 <3`.

## What you get

- `cart.updated` → **Started Checkout** (once the cart has `metadata.checkout_started_at`)
- `order.placed` → **Placed Order**
- Idempotency stamps on cart/order metadata (`klaviyo_started_checkout_sent_at`, `klaviyo_placed_order_sent_at`)
- Consent bulk jobs, including Shopify `shopify_email_marketing_state` fallback for migrated stores
- `POST /store/klaviyo/subscribe` with a honeypot `company` field
- Error bodies are never logged (they can echo PII)

## Options

| Option | Required | Default | Notes |
|---|---|---|---|
| `api_key` | yes* | | Klaviyo private key |
| `list_id` | yes* | | list for subscribe/unsubscribe jobs |
| `storefront_url` | yes* | | used to build product/checkout/order URLs |
| `revision` | no | `2026-07-15` | Klaviyo API revision |
| `source_name` | no | `Medusa` | prefix for `custom_source` |
| `product_path` | no | `/products/{handle}` | `{handle}` placeholder |
| `checkout_path` | no | `/checkout` | |
| `order_path` | no | `/account/orders/{order_id}` | `{order_id}` placeholder |
| `rate_limit` | no | off | in-memory per-IP; single-process only — prefer an edge limiter |

\*Required for the plugin to actually send. Missing options degrade silently.

## Subscribe

```http
POST /store/klaviyo/subscribe
{ "email": "a@b.com", "source": "homepage", "company": "" }
```

`source` is `homepage` or `product-unavailable`. A non-empty `company` is treated as a bot and returns `202` without calling Klaviyo.

## Rate limiting

This package does not ship a shared rate-limiter. Rate-limit at your edge, or set `rate_limit` for a naive in-memory cap (not safe across multiple backend instances).

## Develop

```bash
npm install
npm test
npm run build
npm run dev
```

Need this installed and wired on a live Medusa store? [Hollowpoint](https://hollowpoint.io) does Medusa migrations and plugin work.
