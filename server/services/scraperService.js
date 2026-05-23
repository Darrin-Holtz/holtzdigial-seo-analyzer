import { chromium } from 'playwright-core';
import Browserbase from '@browserbasehq/sdk';

const bb = new Browserbase({
  apiKey: process.env.BROWSERBASE_API_KEY,
});

// Probe a set of internal URLs (HEAD request) to detect broken links.
// Runs at most MAX_LINK_CHECKS checks with capped concurrency to stay fast.
const MAX_LINK_CHECKS = 20;
const LINK_CHECK_CONCURRENCY = 5;

async function checkBrokenLinks(internalUrls) {
    const sample = internalUrls.slice(0, MAX_LINK_CHECKS);
    let brokenCount = 0;

    for (let i = 0; i < sample.length; i += LINK_CHECK_CONCURRENCY) {
        const batch = sample.slice(i, i + LINK_CHECK_CONCURRENCY);
        const results = await Promise.allSettled(
            batch.map((href) =>
                fetch(href, { method: 'HEAD', signal: AbortSignal.timeout(5000), redirect: 'follow' })
                    .then((r) => r.status)
                    .catch(() => 0)
            )
        );
        for (const r of results) {
            const status = r.status === 'fulfilled' ? r.value : 0;
            if (status === 0 || status >= 400) brokenCount++;
        }
    }
    return brokenCount;
}

// Fetch robots.txt and detect sitemap references
async function fetchRobotsTxt(origin) {
    try {
        const res = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return { exists: false, allowsCrawling: true, sitemapUrl: null, raw: '' };
        const raw = await res.text();
        const lines = raw.split('\n').map((l) => l.trim().toLowerCase());
        // Walk through the User-agent: * block tracking Allow/Disallow rules
        let inStarAgent = false;
        let disallowsAll = false;
        let allowsRoot = false;
        for (const line of lines) {
            if (line.startsWith('user-agent:')) {
                inStarAgent = line.replace('user-agent:', '').trim() === '*';
                continue;
            }
            if (!inStarAgent) continue;
            if (line === 'allow: /' || line === 'allow:/') allowsRoot = true;
            if (line === 'disallow: /' || line === 'disallow:/') disallowsAll = true;
        }
        // Blocked only if Disallow: / exists with no Allow: / to override it
        const sitemapMatch = raw.match(/^Sitemap:\s*(\S+)/im);
        return {
            exists: true,
            allowsCrawling: !(disallowsAll && !allowsRoot),
            sitemapUrl: sitemapMatch ? sitemapMatch[1] : null,
            raw: raw.substring(0, 500),
        };
    } catch {
        return { exists: false, allowsCrawling: true, sitemapUrl: null, raw: '' };
    }
}

// ── HTTP fallback scraper ────────────────────────────────────────────────────
// Used automatically when Browserbase is unavailable (quota exhausted, etc.).
// Fetches raw HTML with fetch(); CWV metrics and detailed mobile layout checks
// are unavailable without a real browser — those fields return null / basic.
async function httpFallbackScrape(url) {
    const startTime = Date.now();

    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
        },
        signal: AbortSignal.timeout(15000),
        redirect: 'follow',
    });

    const html = await res.text();
    const loadTime = Date.now() - startTime;
    const statusCode = res.status;

    const getMeta = (name) => {
        const patterns = [
            new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'),
            new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`, 'i'),
        ];
        for (const p of patterns) { const m = html.match(p); if (m) return m[1]; }
        return '';
    };

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    const description = getMeta('description');
    const robots = getMeta('robots');
    const ogTitle = getMeta('og:title');
    const ogDescription = getMeta('og:description');
    const ogImage = getMeta('og:image');
    const twitterCard = getMeta('twitter:card');
    const viewport = getMeta('viewport');

    const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i)
        || html.match(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i);
    const canonical = canonicalMatch ? canonicalMatch[1] : '';

    const charsetMatch = html.match(/<meta[^>]+charset=["']?([^"'\s/>]+)/i);
    const charset = charsetMatch ? charsetMatch[1] : '';

    // Headings
    const countTag = (tag) => (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    const h1Matches = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)];
    const h1Texts = h1Matches.map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
    const headings = {
        h1: countTag('h1'), h2: countTag('h2'), h3: countTag('h3'),
        h4: countTag('h4'), h5: countTag('h5'), h6: countTag('h6'),
        h1Texts,
    };

    // Links
    const baseHost = new URL(url).hostname;
    let internalLinks = 0, externalLinks = 0;
    const internalHrefs = [];
    for (const m of html.matchAll(/href=["']([^"'#][^"']*?)["']/gi)) {
        const href = m[1];
        if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
        try {
            const u = new URL(href, url);
            if (u.hostname === baseHost) { internalLinks++; internalHrefs.push(u.href); }
            else externalLinks++;
        } catch {}
    }

    // Images
    const imgMatches = [...html.matchAll(/<img([^>]*)>/gi)];
    const totalImages = imgMatches.length;
    const missingAlt = imgMatches.filter((m) => !/alt=["'][^"']+["']/.test(m[1])).length;

    // Word count — strip scripts, styles, then tags
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const rawBody = (bodyMatch ? bodyMatch[1] : html)
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ');
    const bodyText = rawBody.replace(/\s+/g, ' ').trim();
    const wordCount = bodyText.split(/\s+/).filter((w) => w.length > 0).length;

    // Structured data (JSON-LD)
    const structuredData = [];
    for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
        try {
            const parsed = JSON.parse(m[1]);
            if (parsed['@graph'] && Array.isArray(parsed['@graph'])) {
                structuredData.push(...parsed['@graph'].map((item) => ({ '@context': parsed['@context'] || 'https://schema.org', ...item })));
            } else {
                structuredData.push(parsed);
            }
        } catch {}
    }

    // Sitemap link tag
    const sitemapLinkMatch = html.match(/<link[^>]+rel=["']sitemap["'][^>]+href=["']([^"']*)["']/i)
        || html.match(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["']sitemap["']/i);
    const sitemapLinkTag = sitemapLinkMatch ? sitemapLinkMatch[1] : null;

    const scrapedData = {
        metaData: { title, description, canonical, robots, ogTitle, ogDescription, ogImage, twitterCard, viewport, charset },
        headings,
        links: { internal: internalLinks, external: externalLinks, total: internalLinks + externalLinks, internalHrefs: internalHrefs.slice(0, 20) },
        images: { total: totalImages, withAlt: totalImages - missingAlt, missingAlt },
        wordCount,
        pageSize: html.length,
        structuredData,
        sitemapLinkTag,
        currentOrigin: new URL(url).origin,
        bodyText: bodyText.substring(0, 3000),
    };

    // Basic mobile friendliness from viewport meta only (no layout data without real browser)
    const mobileFriendliness = {
        isMobileFriendly: !!viewport,
        issues: viewport ? [] : ['Missing viewport meta tag'],
    };

    const origin = new URL(url).origin;
    const [robotsData, brokenLinksCount] = await Promise.all([
        fetchRobotsTxt(origin),
        checkBrokenLinks(scrapedData.links.internalHrefs || []),
    ]);

    const { internalHrefs: _dropped, ...links } = scrapedData.links;

    return {
        success: true,
        scrapedViaFallback: true,
        data: {
            ...scrapedData,
            links: { ...links, broken: brokenLinksCount },
            robotsTxt: robotsData,
            coreWebVitals: { fcp: null, lcp: null, cls: null, ttfb: null },
            mobileFriendliness,
            loadTime,
            statusCode,
            url,
        },
    };
}

export async function scrapeUrl(url) {
    let browser;
    try {
        if (!process.env.BROWSERBASE_API_KEY) throw new Error('BROWSERBASE_API_KEY is not set');
        if (!process.env.BROWSERBASE_PROJECT_ID) throw new Error('BROWSERBASE_PROJECT_ID is not set');

        const session = await bb.sessions.create({
            projectId: process.env.BROWSERBASE_PROJECT_ID,
            browserSettings: { blockAds: true },
        });
        browser = await chromium.connectOverCDP(session.connectUrl);
        const defaultContext = browser.contexts()[0];
        const page = defaultContext.pages()[0];
        page.setDefaultNavigationTimeout(30000); // 30 seconds

        const startTime = Date.now();
        let response;
        try {
            response = await page.goto(url, { waitUntil: 'domcontentloaded' });
        } catch (navError) {
            await browser.close().catch(() => {});
            browser = null;
            return {success: false, error: navError.message};
        }

        const loadTime = Date.now() - startTime;
        await page.waitForTimeout(2000); // Wait for 2 seconds to allow any additional content to load

        // Extract all SEO-relevant data from the rendered page
        const scrapedData = await page.evaluate(() => {
            const getMeta = (name) => {
                const el = document.querySelector(`meta[name="${name}"]`) || document.querySelector(`meta[property="${name}"]`);
                return el ? el.getAttribute('content') || '' : '';
            };

            const title = document.title || '';
            const description = getMeta('description');
            const canonical = document.querySelector('link[rel="canonical"]') ?.href || '';
            const robots = getMeta('robots');
            const ogTitle = getMeta('og:title');
            const ogDescription = getMeta('og:description');
            const ogImage = getMeta('og:image');
            const twitterCard = getMeta('twitter:card');
            const viewport = getMeta('viewport');
            const charsetMeta = document.querySelector('meta[charset]');
            const charset = charsetMeta ? charsetMeta.getAttribute('charset') || '' : '';
            const h1Elements = document.querySelectorAll('h1');
            const h1Texts = Array.from(h1Elements).map((el) => el.textContent?.trim() || '');
            const headings = {
                h1: document.querySelectorAll('h1').length,
                h2: document.querySelectorAll('h2').length,
                h3: document.querySelectorAll('h3').length,
                h4: document.querySelectorAll('h4').length,
                h5: document.querySelectorAll('h5').length,
                h6: document.querySelectorAll('h6').length,
                h1Texts,
            };
            const allLinks = Array.from(document.querySelectorAll('a[href]'));
            const currentHost = window.location.hostname;
            const currentOrigin = window.location.origin;
            let internalLinks = 0;
            let externalLinks = 0;
            const internalHrefs = [];
            allLinks.forEach((link) => {
                try {
                    const href = link.href;
                    if(href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
                    const linkUrl = new URL(href);
                    if (linkUrl.hostname === currentHost) {
                        internalLinks++;
                        internalHrefs.push(href);
                    } else {
                        externalLinks++;
                    }
                } catch { /* ignore unparseable hrefs */ }
            });
            const allImages = Array.from(document.querySelectorAll('img'));
            const missingAlt = allImages.filter((img) => !img.alt || img.alt.trim() === '').length;
            const bodyText = document.body?.innerText || '';
            const wordCount = bodyText.split(/\s+/).filter(w => w.length > 0).length;
            const pageSize = document.documentElement.outerHTML.length;

            // Structured data (JSON-LD) — flatten @graph arrays
            const structuredData = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
                .flatMap((s) => {
                    try {
                        const parsed = JSON.parse(s.textContent || '');
                        if (parsed['@graph'] && Array.isArray(parsed['@graph'])) {
                            return parsed['@graph'].map((item) => ({
                                '@context': parsed['@context'] || 'https://schema.org',
                                ...item,
                            }));
                        }
                        return [parsed];
                    } catch { return []; }
                })
                .filter(Boolean);

            // Sitemap link tag
            const sitemapLink = document.querySelector('link[rel="sitemap"]');
            const sitemapHref = sitemapLink ? sitemapLink.getAttribute('href') || null : null;

            return {
                metaData: {
                    title,
                    description,
                    canonical,
                    robots,
                    ogTitle,
                    ogDescription,
                    ogImage,
                    twitterCard,
                    viewport,
                    charset,
                },
                headings,
                links: {
                    internal: internalLinks,
                    external: externalLinks,
                    total: allLinks.length,
                    internalHrefs: internalHrefs.slice(0, 20), // pass to server for broken-link checking
                },
                images: {
                    total: allImages.length,
                    withAlt: allImages.length - missingAlt,
                    missingAlt: missingAlt,
                },
                wordCount,
                pageSize,
                structuredData,
                sitemapLinkTag: sitemapHref,
                currentOrigin,
                bodyText: bodyText.substring(0, 3000), // Limit body text to first 3k characters to avoid huge payloads
            };
        });

        // ── Core Web Vitals (measured while page is still open) ──────────────
        const cwv = await page.evaluate(() => {
            const result = { fcp: null, lcp: null, cls: null, ttfb: null };

            // TTFB from navigation timing
            const navEntry = performance.getEntriesByType('navigation')[0];
            if (navEntry) result.ttfb = Math.round(navEntry.responseStart - navEntry.requestStart);

            // FCP from paint timing
            const paintEntries = performance.getEntriesByType('paint');
            const fcp = paintEntries.find((e) => e.name === 'first-contentful-paint');
            if (fcp) result.fcp = Math.round(fcp.startTime);

            // LCP — read buffered entries directly (no observer needed after load)
            const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
            if (lcpEntries.length > 0) {
                result.lcp = Math.round(lcpEntries[lcpEntries.length - 1].startTime);
            }

            // CLS — aggregate all layout-shift entries
            const layoutShifts = performance.getEntriesByType('layout-shift');
            let clsValue = 0;
            for (const entry of layoutShifts) {
                if (!entry.hadRecentInput) clsValue += entry.value ?? 0;
            }
            result.cls = Math.round(clsValue * 1000) / 1000;

            return result;
        }).catch(() => ({ fcp: null, lcp: null, cls: null, ttfb: null }));

        // ── Mobile Friendliness Check (new context, same session) ────────────
        let mobileFriendliness = { isMobileFriendly: false, issues: [] };
        try {
            const mobileContext = await browser.newContext({
                viewport: { width: 375, height: 667 },
                userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            });
            const mobilePage = await mobileContext.newPage();
            mobilePage.setDefaultNavigationTimeout(20000);
            try {
                await mobilePage.goto(url, { waitUntil: 'domcontentloaded' });
                await mobilePage.waitForTimeout(1000);
                mobileFriendliness = await mobilePage.evaluate(() => {
                    const criticalIssues = [];
                    const advisoryIssues = [];
                    const vw = window.innerWidth;

                    // CRITICAL: Missing viewport meta tag
                    const vpMeta = document.querySelector('meta[name="viewport"]');
                    if (!vpMeta) criticalIssues.push('Missing viewport meta tag');

                    // CRITICAL: Horizontal overflow (causes horizontal scroll)
                    // Only flag if overflow-x is NOT hidden/clip on html or body (those suppress visible scroll)
                    const htmlOverflow = window.getComputedStyle(document.documentElement).overflowX;
                    const bodyOverflow = window.getComputedStyle(document.body).overflowX;
                    const overflowSuppressed = ['hidden', 'clip'].includes(htmlOverflow) || ['hidden', 'clip'].includes(bodyOverflow);
                    const bodyWidth = document.documentElement.scrollWidth;
                    if (!overflowSuppressed && bodyWidth > vw + 5) criticalIssues.push(`Page wider than viewport (${bodyWidth}px > ${vw}px) — causes horizontal scroll`);

                    // ADVISORY: Tap target sizes — only flag if more than 10% of targets are too small
                    const tapTargets = Array.from(document.querySelectorAll('a, button, input, select'))
                        .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
                    const smallTargets = tapTargets.filter((el) => {
                        const r = el.getBoundingClientRect();
                        return r.width < 24 || r.height < 24;
                    }).length;
                    if (tapTargets.length > 0 && smallTargets / tapTargets.length > 0.1 && smallTargets > 3) {
                        advisoryIssues.push(`${smallTargets} tap target(s) smaller than 24×24px`);
                    }

                    // ADVISORY: Small font sizes
                    const allText = Array.from(document.querySelectorAll('p, span, li, td'));
                    let smallFonts = 0;
                    allText.slice(0, 50).forEach((el) => {
                        const fs = parseFloat(window.getComputedStyle(el).fontSize);
                        if (fs > 0 && fs < 10) smallFonts++;
                    });
                    if (smallFonts > 0) advisoryIssues.push(`${smallFonts} element(s) with font size < 10px`);

                    return {
                        isMobileFriendly: criticalIssues.length === 0,
                        issues: [...criticalIssues, ...advisoryIssues],
                    };
                });
            } finally {
                await mobileContext.close().catch(() => {});
            }
        } catch (mobileErr) {
            console.warn('[SCRAPER] Mobile check failed:', mobileErr.message);
        }

        const statusCode = response?.status() || 0;
        await page.close();
        await browser.close();
        browser = null;

        // Server-side checks (run after browser is closed to free the session)
        const origin = new URL(url).origin;

        const [robotsData, brokenLinksCount] = await Promise.all([
            fetchRobotsTxt(origin),
            checkBrokenLinks(scrapedData.links.internalHrefs || []),
        ]);

        // Remove internalHrefs from final payload (not needed by consumers)
        const { internalHrefs: _dropped, ...links } = scrapedData.links;

        return {
            success: true,
            data: {
                ...scrapedData,
                links: { ...links, broken: brokenLinksCount },
                robotsTxt: robotsData,
                coreWebVitals: cwv,
                mobileFriendliness,
                loadTime,
                statusCode,
                url,
            },
        };
    } catch (error) {
        console.error('[SCRAPER] Browserbase/Playwright failed:', error.message);
        if (browser) {
            await browser.close().catch((e) => console.error('[SCRAPER] Failed to close browser:', e.message));
        }
        console.warn('[SCRAPER] Falling back to HTTP scraper for:', url);
        try {
            return await httpFallbackScrape(url);
        } catch (fallbackError) {
            console.error('[SCRAPER] HTTP fallback also failed:', fallbackError.message);
            return { success: false, error: fallbackError.message };
        }
    }
}