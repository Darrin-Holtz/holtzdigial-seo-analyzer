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

// Rotate through realistic User-Agent strings to reduce bot detection
const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
];

function randomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// Fetch one page of Google search results and return parsed organic results
async function fetchGooglePage(keyword, start) {
    const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&start=${start}&num=10&hl=en&gl=us&pws=0`;
    const { data } = await axios.get(url, {
        timeout: 20000,
        headers: {
            "User-Agent": randomUA(),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "DNT": "1",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Cache-Control": "max-age=0",
        },
        decompress: true,
    });

    const $ = cheerio.load(data);
    const seen = new Set();
    const results = [];

    // Google's organic result links wrap an <h3> directly inside <a href="...">
    $("a[href]").each((_, el) => {
        const a = $(el);
        const h3 = a.find("h3").first();
        if (!h3.length || !h3.text().trim()) return;

        let href = a.attr("href") || "";

        // Unwrap Google redirect URLs: /url?q=https://example.com&sa=...
        if (href.startsWith("/url?")) {
            try {
                href = new URL(href, "https://www.google.com").searchParams.get("q") || href;
            } catch {}
        }

        if (!href.startsWith("http")) return;

        let hostname;
        try { hostname = new URL(href).hostname; } catch { return; }

        // Drop Google-internal links
        if (hostname.endsWith("google.com") || hostname.startsWith("google.") ||
            hostname.endsWith("googleapis.com") || hostname.endsWith("gstatic.com")) return;

        if (seen.has(href)) return;
        seen.add(href);

        const domain = hostname.replace(/^www\./, "").toLowerCase();
        const title = h3.text().trim();

        // Snippet: the nearest parent block that has enough text beyond the title
        let snippet = "";
        let node = a.parent();
        for (let j = 0; j < 8 && node.length; j++, node = node.parent()) {
            const txt = (node.text() || "").trim();
            if (txt.length > title.length + 50) {
                const line = txt.split("\n").find(
                    (l) => l.trim().length > 30 && !l.includes(title.substring(0, 20))
                );
                if (line) { snippet = line.trim().substring(0, 300); break; }
            }
        }

        results.push({ url: href, domain, title, snippet });
    });

    console.log(`[RankTracker] start=${start}: parsed ${results.length} results from HTML (length=${data.length})`);
    return results;
}

// Search Google for a keyword and extract ranking results for a target domain
export async function rankTracker(keyword, targetDomain) {
    const cleanTarget = targetDomain.replace(/^www\./, "").toLowerCase();
    let found = null;
    const allResults = [];

    try {
        for (let gPage = 0; gPage < 5; gPage++) {
            let pageResults = [];

            // Retry once on transient network errors
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    pageResults = await fetchGooglePage(keyword, gPage * 10);
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
            await sleep(800 + Math.random() * 700);
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
