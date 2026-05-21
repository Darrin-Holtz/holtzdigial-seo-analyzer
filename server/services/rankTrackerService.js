import { chromium } from "playwright-core";
import Browserbase from "@browserbasehq/sdk";

const bb = new Browserbase({
  apiKey: process.env.BROWSERBASE_API_KEY,
});

// Search Google for a keyword and extract ranking results for a target domain
export async function rankTracker(keyword, targetDomain) {
    let browser;
    try{
        // 1. Initialize Browserbase Session & Connect Playwright
        const session = await bb.sessions.create({browserSettings: {blockAds: true}});
        browser = await chromium.connectOverCDP(session.connectUrl);
        const page = browser.contexts()[0].pages()[0];
        page.setDefaultNavigationTimeout(25000); // 25 seconds

        // 2. Initialize Google Visit & Consent Handling
        await page.goto("https://www.google.com", { waitUntil: "domcontentloaded" });
        try{
            const btn = await page.$('button[id="L2AGLb"], button[id="W0wltc"], form[action*="consent"] button');
            if (btn) {
                await btn.click();
                await page.waitForTimeout(1500); // Wait for consent to process
            }
        } catch {}

        let found = null,
        allResults = [];

        const cleanTarget = targetDomain.replace("www.", '').toLowerCase();

        // 3. Search Loop: Iterate through up to 5 pages of Google results
        for(let gPage = 0; gPage < 5; gPage++) {
            await page.goto(`https://www.google.com/search?q=${encodeURIComponent(keyword)}&start=${gPage * 10}&num=10&hl=en&gl=us`, { waitUntil: "load" });

            // 4. Page Extraction: Retry up to 3 times if results are missing
            let pageResults = [];
            for (let retry = 0; retry < 3; retry++) {
                try {
                    // Wait for any h3 — present in both organic results and SERP features
                    await page.waitForSelector('a[href] h3', { timeout: 8000 });
                    pageResults = await page.evaluate(() => {
                        const seen = new Set();
                        // Strategy: find every <a> that directly contains an <h3> — this is how
                        // Google wraps organic result titles in its current DOM structure.
                        return Array.from(document.querySelectorAll('a[href]')).flatMap((a) => {
                            const h3 = a.querySelector('h3');
                            if (!h3 || !h3.innerText.trim()) return [];

                            // Unwrap Google redirect URLs (e.g. /url?q=https://example.com&...)
                            let href = a.href;
                            if (href.includes('/url?q=')) {
                                try { href = new URL(href).searchParams.get('q') || href; } catch {}
                            }
                            if (!href.startsWith('http')) return [];

                            let hostname;
                            try { hostname = new URL(href).hostname; } catch { return []; }
                            // Drop Google-internal links
                            if (hostname.endsWith('google.com') || hostname.endsWith('google.co.uk') ||
                                hostname.startsWith('google.') || href.includes('google.com/search')) return [];

                            // Deduplicate by URL
                            if (seen.has(href)) return [];
                            seen.add(href);

                            const domain = hostname.replace(/^www\./, '').toLowerCase();

                            // Extract snippet: walk up from the anchor to find a block with enough text
                            let snippet = '';
                            let c = a.parentElement;
                            for (let j = 0; j < 8 && c; j++, c = c.parentElement) {
                                const txt = (c.innerText || '').trim();
                                if (txt.length > h3.innerText.length + 50) {
                                    const line = txt.split('\n').find(
                                        (l) => l.length > 30 && !l.includes(h3.innerText.substring(0, 20))
                                    );
                                    if (line) { snippet = line.trim().substring(0, 300); break; }
                                }
                            }

                            return [{ url: href, domain, title: h3.innerText.trim(), snippet }];
                        }).filter((r) => r && r.domain);
                    });
                    
                    if(pageResults.length > 0) break; // If we got results, no need to retry
                    console.warn(`[RankTracker] Page ${gPage + 1} retry ${retry + 1}: 0 results, reloading...`);
                    await page.reload({ waitUntil: "domcontentloaded" });
                } catch (err) {
                    console.warn(`[RankTracker] Page ${gPage + 1} retry ${retry + 1} selector error: ${err.message}`);
                    if(retry === 2) break;
                    await page.reload({ waitUntil: "domcontentloaded" });
                }
            }
            console.log(`[RankTracker] Page ${gPage + 1}: extracted ${pageResults.length} results (total so far: ${allResults.length + pageResults.length})`);
            if(!pageResults.length) break;

            // 5. Result Synthesis: Update global results and check for target match
            for (const r of pageResults) {
                r.position = allResults.length + 1;
                allResults.push(r);
                // Exact domain match (after www-strip) to avoid false positives with subdomains
                if (!found && r.domain === cleanTarget) {
                    found = {...r, page: gPage + 1};
                }
            }
            if(found) break; // If we found the target, stop searching further pages
            await page.waitForTimeout(500 + Math.random() * 500); // Wait before navigating to next page
        }

        // 6. Finalize: Close browser and extract competitors
        await browser.close();
        console.log(`[RankTracker] Done. keyword="${keyword}" domain="${cleanTarget}" totalScanned=${allResults.length} position=${found?.position ?? 'not found'}`);
        const competitors = allResults.filter((r) => r.domain !== cleanTarget).slice(0, 10);
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
            }
        }
    } catch (error) {
        console.error("Rank Tracker Error:", error.message);
        if(browser) await browser.close().catch(() => {});
        return { success: false, error: error.message };
    }
}