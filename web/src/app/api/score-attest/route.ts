// app/api/score-attest/route.ts
//
// Same-origin proxy to the Supabase score-attest edge function. Same
// rationale as /api/kyb-status — eliminates cross-origin fetches from
// the browser so privacy extensions / proxies / CORS preflights can't
// silently kill the request.
//
// POST /api/score-attest  body: { wallet, chainId?, ttlSeconds? }

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return json({error: "supabase_misconfigured"}, 500);

    let body: unknown;
    try { body = await req.json(); } catch { return json({error: "invalid_json"}, 400); }

    try {
        const upstream = await fetch(`${url}/functions/v1/score-attest`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                apikey: anon,
                authorization: `Bearer ${anon}`,
            },
            body: JSON.stringify(body),
        });
        const data = await upstream.text();
        return new Response(data, {
            status: upstream.status,
            headers: {
                "content-type": upstream.headers.get("content-type") ?? "application/json",
                "cache-control": "no-store",
            },
        });
    } catch (e) {
        return json({error: "upstream_failed", detail: e instanceof Error ? e.message : "unknown"}, 502);
    }
}

function json(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {"content-type": "application/json", "cache-control": "no-store"},
    });
}
