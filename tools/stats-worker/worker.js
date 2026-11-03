// mariowOS anonymous usage counter (Cloudflare Worker + one KV namespace bound as STATS).
//
//   POST /ping   {"version":"1.5.0","channel":"stable"}  -> adds 1 to today's total
//   GET  /stats                                          -> daily totals of the last 30 days
//
// A mariowOS kernel pings at most once a day and only when its owner turned the count on
// (server.js › sendAnonymousStats), so a day's total is the number of systems that were on
// that day. Nothing about the sender is stored: not the IP address, not a header, not an id.
// Only the day, the version and the channel become part of a KV key.

const CHANNELS = new Set(["stable", "beta", "insiders"]);
const VERSION = /^[0-9A-Za-z.+-]{1,32}$/;
const DAYS_KEPT = 400;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/ping") return ping(request, env);
    if (request.method === "GET" && url.pathname === "/stats") return stats(env);
    return new Response("Not found", { status: 404 });
  }
};

async function ping(request, env) {
  let body;
  try { body = await request.json(); } catch { return new Response("Bad request", { status: 400 }); }
  const version = String(body && body.version || "");
  const channel = String(body && body.channel || "");
  if (!VERSION.test(version) || !CHANNELS.has(channel)) return new Response("Bad request", { status: 400 });
  const key = `${new Date().toISOString().slice(0, 10)}|${version}|${channel}`;
  // KV has no atomic increment: two pings in the same instant can count once. At a few
  // hundred systems a day that is a rounding error, not worth a Durable Object.
  const count = Number(await env.STATS.get(key)) || 0;
  await env.STATS.put(key, String(count + 1), { expirationTtl: DAYS_KEPT * 86400 });
  return new Response(null, { status: 204 });
}

async function stats(env) {
  const days = {};
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  let cursor;
  do {
    const page = await env.STATS.list({ cursor });
    for (const { name } of page.keys) {
      const [day, version, channel] = name.split("|");
      if (day < since) continue;
      const count = Number(await env.STATS.get(name)) || 0;
      const entry = days[day] || (days[day] = { total: 0, versions: {}, channels: {} });
      entry.total += count;
      entry.versions[version] = (entry.versions[version] || 0) + count;
      entry.channels[channel] = (entry.channels[channel] || 0) + count;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return Response.json(days, { headers: { "Cache-Control": "max-age=300" } });
}
