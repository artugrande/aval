// app/api/wavynode-reports/route.ts
//
// Server-side proxy for WavyNode's compliance-reports endpoints. We never
// expose the WavyNode API key to the browser, so the /lend page calls this
// route, which in turn calls WavyNode.
//
// GET /api/wavynode-reports?country=MX&period=2026-04
//   → list of reports for that country + period
//
// GET /api/wavynode-reports?id=<reportId>
//   → { filename, url } signed download URL

import {
    wavynodeGetReportDownload,
    wavynodeListReports,
    type WavyReport,
    type WavyReportDownload,
} from "@/lib/wavynode";

export const runtime = "nodejs";

const COUNTRIES = ["MX", "CO", "SV", "GT"] as const;
type Country = (typeof COUNTRIES)[number];

export async function GET(req: Request) {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (id) {
        const dl = await wavynodeGetReportDownload(id);
        if (!dl) return json({error: "report_not_found"}, 404);
        return json(dl satisfies WavyReportDownload);
    }

    const country = url.searchParams.get("country");
    const period = url.searchParams.get("period");
    if (!country || !COUNTRIES.includes(country as Country)) {
        return json({error: "invalid_country", allowed: COUNTRIES}, 400);
    }
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
        return json({error: "invalid_period", format: "YYYY-MM"}, 400);
    }

    const reports = await wavynodeListReports(country as Country, period);
    return json({reports} satisfies {reports: WavyReport[]});
}

function json(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {"content-type": "application/json", "cache-control": "private, max-age=30"},
    });
}
