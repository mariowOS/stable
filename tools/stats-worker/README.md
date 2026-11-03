# mariowOS anonymous usage counter

A Cloudflare Worker that counts how many mariowOS systems are on each day. Systems only
ping it when their owner turned on **Settings › General › Anonymous usage count** (also
offered in setup), at most once a day, with just `{ version, channel }`.

## Deploy (free plan is enough)

```bash
npx wrangler login
npx wrangler kv namespace create STATS   # paste the id into wrangler.toml
npx wrangler deploy
```

Wrangler prints the address, e.g. `https://mariowos-stats.<account>.workers.dev`.
Put `https://…/ping` in `STATS_URL` in `server.js` (or set `MARIOWOS_STATS_URL`) and
ship it in the next release. Until then the kernel sends nothing.

## Read the numbers

Open `https://…/stats`: totals per day for the last 30 days, split by version and channel.
