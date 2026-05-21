import axios from "axios";

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// Fetch one page of organic results from SerpAPI
async function fetchSerpPage(keyword, start) {
    if (!process.env.SERPAPI_KEY) throw new Error("SERPAPI_KEY environment variable is not set.");

    const { data } = await axios.get("https://serpapi.com/search.json", {
        timeout: 30000,
        params: {
            engine: "google",
            q: keyword,
            hl: "en",
            gl: "us",
            start,
            num: 10,
            api_key: process.env.SERPAPI_KEY,
        },
    });

    const organic = data.organic_results || [];
    console.log(`[RankTracker] SerpAPI start=${start}: ${organic.length} organic results`);

    return organic.map((r) => {
        let domain = "";
        try { domain = new URL(r.link).hostname.replace(/^www\./, "").toLowerCase(); } catch {}
        return { url: r.link || "", domain, title: r.title || "", snippet: r.snippet || "" };
    }).filter((r) => r.url && r.domain);
}

// Search Google for a keyword and extract ranking results for a target domain
export async function rankTracker(keyword, targetDomain) {
    const cleanTarget = targetDomain.replace(/^www\./, "").toLowerCase();
    let found = null;
    const allResults = [];

    try {
        for (let gPage = 0; gPage < 5; gPage++) {
            let pageResults = [];

            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    pageResults = await fetchSerpPage(keyword, gPage * 10);
                    break;
                } catch (err) {
                    console.warn(`[RankTracker] Page ${gPage + 1} attempt ${attempt + 1} failed: ${err.message}`);
                    if (attempt === 1) break;
                    await sleep(2000);
                }
            }

            if (!pageResults.length) {
                console.warn(`[RankTracker] Page ${gPage + 1}: no results — stopping.`);
                break;
            }

            for (const r of pageResults) {
                r.position = allResults.length + 1;
                allResults.push(r);
                if (!found && r.domain === cleanTarget) {
                    found = { ...r, page: gPage + 1 };
                }
            }

            console.log(`[RankTracker] Page ${gPage + 1}: ${pageResults.length} results, total=${allResults.length}, found=${found ? `pos ${found.position}` : "no"}`);

            if (found) break;
            await sleep(300);
        }

        const competitors = allResults.filter((r) => r.domain !== cleanTarget).slice(0, 10);
        console.log(`[RankTracker] Done. keyword="${keyword}" domain="${cleanTarget}" totalScanned=${allResults.length} position=${found?.position ?? "not found"}`);

        return {
            success: true,
            data: {
                keyword,
                targetDomain,
                position: found?.position || null,
                page: found?.page || null,
                title: found?.title || "",
                snippet: found?.snippet || "",
                competitors,
                totalResultsScanned: allResults.length,
            },
        };
    } catch (error) {
        console.error("[RankTracker] Fatal error:", error.message);
        return { success: false, error: error.message };
    }
}
