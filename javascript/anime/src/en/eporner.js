const mangayomiSources = [{
    "name": "Eporner",
    "lang": "en",
    "baseUrl": "https://www.eporner.com",
    "apiUrl": "",
    "iconUrl": "https://static-eu-cdn.eporner.com/favicon.png",
    "typeSource": "single",
    "itemType": 1,
    "isManga": false,
    "isNsfw": true,
    "version": "1.0.2",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "anime/src/en/eporner.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.dartClient = new Client({ "useDartHttpClient": true });
        this.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
    }

    getBaseUrl() {
        let base = (this.source && this.source.baseUrl) ? this.source.baseUrl.trim() : "https://www.eporner.com";
        try {
            const prefs = new SharedPreferences();
            const custom = prefs.get("override_base_url");
            if (custom && typeof custom === "string" && custom.trim().startsWith("http")) {
                base = custom.trim();
            }
        } catch (e) {
            // Ignore if SharedPreferences is unavailable
        }
        base = base.replace(/\/+$/, "");
        if (/^https?:\/\/eporner\.com$/i.test(base)) {
            base = base.replace(/^(https?:\/\/)eporner\.com$/i, "$1www.eporner.com");
        }
        return base;
    }

    getHeaders(referer = null) {
        const base = this.getBaseUrl();
        return {
            "User-Agent": this.userAgent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": referer || (base + "/"),
        };
    }

    async safeGet(url, headers = null) {
        const reqHeaders = headers || this.getHeaders();
        const normalizedUrl = url.replace(/^(https?:\/\/)eporner\.com(\/|$)/i, "$1www.eporner.com$2");

        // 1. Try default rhttp client
        try {
            return await this.client.get(normalizedUrl, reqHeaders);
        } catch (primaryErr) {
            // 2. Fallback to Dart HttpClient (bypasses rhttp/rustls TLS fingerprint resets)
            try {
                return await this.dartClient.get(normalizedUrl, reqHeaders);
            } catch (_) {
                // 3. Fallback to en.eporner.com mirror via Dart HttpClient
                if (normalizedUrl.includes("://www.eporner.com")) {
                    const mirrorUrl = normalizedUrl.replace("://www.eporner.com", "://en.eporner.com");
                    try {
                        return await this.dartClient.get(mirrorUrl, reqHeaders);
                    } catch (_) {
                        throw primaryErr;
                    }
                }
                throw primaryErr;
            }
        }
    }

    get supportsLatest() {
        return true;
    }

    parseVideoList(html) {
        const base = this.getBaseUrl();
        const doc = new Document(html);
        const list = [];
        const seen = new Set();

        let cards = doc.select("#vidresults div.mb[data-id]");
        if (!cards || cards.length === 0) {
            cards = doc.select("div.mb[data-id]");
        }

        for (const card of cards) {
            const titleLink = card.selectFirst("p.mbtit a") || card.selectFirst(".mbcontent a");
            if (!titleLink) continue;

            const href = titleLink.attr("href");
            if (!href) continue;

            const link = href.startsWith("http") ? href : base + href;
            if (seen.has(link)) continue;
            seen.add(link);

            const img = card.selectFirst(".mbcontent img");
            let imageUrl = "";
            if (img) {
                const dataSrc = img.attr("data-src");
                const src = img.attr("src");
                if (dataSrc && dataSrc.startsWith("http")) {
                    imageUrl = dataSrc;
                } else if (src && src.startsWith("http")) {
                    imageUrl = src;
                }
            }

            const title = (titleLink.text || (img ? img.attr("alt") : "") || "Untitled").trim();
            const durationEl = card.selectFirst(".mbstats .mbtim");
            const qualityEl = card.selectFirst(".mvhdico span");
            const duration = durationEl ? durationEl.text.trim() : "";
            const quality = qualityEl ? qualityEl.text.trim() : "";

            const displayParts = [title];
            if (quality || duration) {
                const meta = [quality, duration].filter(Boolean).join(" • ");
                displayParts.push(`[${meta}]`);
            }

            list.push({
                name: displayParts.join(" "),
                imageUrl: imageUrl,
                link: link,
            });
        }

        const hasNextPage = doc.selectFirst("div.numlist2 a.nmnext") !== null;
        return { list, hasNextPage };
    }

    async getPopular(page) {
        const base = this.getBaseUrl();
        const url = page === 1
            ? `${base}/best-videos/`
            : `${base}/best-videos/${page}/`;
        const res = await this.safeGet(url);
        return this.parseVideoList(res.body);
    }

    async getLatestUpdates(page) {
        const base = this.getBaseUrl();
        const url = page === 1
            ? `${base}/`
            : `${base}/${page}/`;
        const res = await this.safeGet(url);
        return this.parseVideoList(res.body);
    }

    async search(query, page, filters) {
        const base = this.getBaseUrl();
        let sortSlug = "";
        let categorySlug = "";
        let productionSlug = "";

        if (filters && filters.length > 0) {
            for (const filter of filters) {
                if (filter.type_name === "SelectFilter") {
                    const selected = filter.values[filter.state];
                    if (!selected) continue;
                    if (filter.name === "Sort By") {
                        sortSlug = selected.value;
                    } else if (filter.name === "Category") {
                        categorySlug = selected.value;
                    } else if (filter.name === "Production") {
                        productionSlug = selected.value;
                    }
                }
            }
        }

        let url = "";
        const cleanQuery = (query || "").trim();

        if (cleanQuery.length > 0) {
            const encoded = encodeURIComponent(cleanQuery).replace(/%20/g, "-");
            url = `${base}/search/${encoded}/`;
            if (page > 1) {
                url += `${page}/`;
            }
            if (sortSlug && sortSlug !== "most-recent") {
                url += `${sortSlug}/`;
            }
        } else if (categorySlug) {
            url = `${base}/cat/${categorySlug}/`;
            if (productionSlug) {
                url += `${productionSlug}/`;
            }
            if (page > 1) {
                url += `${page}/`;
            }
            if (sortSlug && sortSlug !== "most-recent") {
                url += `SORT-${sortSlug}/`;
            }
        } else if (productionSlug) {
            url = `${base}/cat/all/${productionSlug}/`;
            if (page > 1) {
                url += `${page}/`;
            }
            if (sortSlug && sortSlug !== "most-recent") {
                url += `SORT-${sortSlug}/`;
            }
        } else {
            if (sortSlug && sortSlug !== "most-recent") {
                url = page > 1
                    ? `${base}/${sortSlug}/${page}/`
                    : `${base}/${sortSlug}/`;
            } else {
                url = page > 1
                    ? `${base}/${page}/`
                    : `${base}/`;
            }
        }

        const res = await this.safeGet(url);
        return this.parseVideoList(res.body);
    }

    async getDetail(url) {
        const base = this.getBaseUrl();
        const fullUrl = url.startsWith("http") ? url : base + url;
        const res = await this.safeGet(fullUrl);
        const doc = new Document(res.body);

        const ogTitle = doc.selectFirst('meta[property="og:title"]');
        const h1Title = doc.selectFirst("h1");
        const title = (
            (ogTitle ? ogTitle.attr("content") : "") ||
            (h1Title ? h1Title.text : "") ||
            "Eporner Video"
        ).replace(/\s*-\s*EPORNER.*$/i, "").trim();

        const ogImage = doc.selectFirst('meta[property="og:image"]');
        const imageUrl = ogImage ? ogImage.attr("content") : "";

        const ogDesc = doc.selectFirst('meta[property="og:description"]');
        const descEl = doc.selectFirst("#video-info-description, .video-description");
        const durationMeta = doc.selectFirst('meta[name="duration"]');
        const viewsEl = doc.selectFirst("#cinemaviews1");

        const descParts = [];
        if (descEl && descEl.text.trim()) {
            descParts.push(descEl.text.trim());
        } else if (ogDesc && ogDesc.attr("content")) {
            descParts.push(ogDesc.attr("content").trim());
        }
        if (durationMeta && durationMeta.attr("content")) {
            descParts.push(`Duration: ${durationMeta.attr("content")}`);
        }
        if (viewsEl && viewsEl.text.trim()) {
            descParts.push(`Views: ${viewsEl.text.trim()}`);
        }

        const uploaderEl = doc.selectFirst(".vit-uploader a, .mb-uploader a, a[href^='/profile/'], a[href^='/channel/']");
        const author = uploaderEl ? uploaderEl.text.trim() : "Eporner";

        const genreSet = new Set();
        const tagEls = doc.select(".vit-category a, .vit-tags a, a[href^='/cat/'], a[href^='/tag/']");
        for (const el of tagEls) {
            const txt = el.text.trim();
            if (txt && txt.length < 40) {
                genreSet.add(txt);
            }
        }

        return {
            name: title,
            imageUrl: imageUrl,
            description: descParts.join("\n"),
            author: author,
            status: 1,
            genre: Array.from(genreSet),
            episodes: [
                {
                    name: "Watch / Download Video",
                    url: fullUrl,
                }
            ]
        };
    }

    calcHash(hexHash) {
        let result = "";
        for (let i = 0; i < 32; i += 8) {
            const chunk = hexHash.substring(i, i + 8);
            result += parseInt(chunk, 16).toString(36);
        }
        return result;
    }

    parseResolutionRank(label) {
        const match = /(\d+)[pP]/.exec(label || "");
        return match ? parseInt(match[1], 10) : 0;
    }

    async getVideoList(url) {
        const base = this.getBaseUrl();
        const fullUrl = url.startsWith("http") ? url : base + url;
        const res = await this.safeGet(fullUrl);
        const html = res.body;

        const videos = [];
        const headers = this.getHeaders(fullUrl);

        let preferredQuality = "best";
        try {
            const prefs = new SharedPreferences();
            const q = prefs.get("preferred_quality");
            if (q) preferredQuality = q;
        } catch (e) {
            // Ignore
        }

        const idMatch = /(?:hd-porn|embed|video-)(\w+)/i.exec(fullUrl)
            || /eporner\.com\/(?:hd-porn|embed|video-)(\w+)/i.exec(html);
        const videoId = idMatch ? idMatch[1] : null;
        const hashMatch = /hash\s*[:=]\s*["']([\da-f]{32})["']/i.exec(html);

        if (videoId && hashMatch) {
            const vidHash = hashMatch[1];
            const encodedHash = this.calcHash(vidHash);
            const domainHost = base.replace(/^https?:\/\//i, "").split("/")[0];
            const xhrUrl = `${base}/xhr/video/${videoId}?hash=${encodedHash}&device=generic&domain=${encodeURIComponent(domainHost)}&fallback=false`;

            try {
                const xhrHeaders = {
                    ...headers,
                    "X-Requested-With": "XMLHttpRequest",
                    "Accept": "application/json, text/javascript, */*; q=0.01",
                };
                const xhrRes = await this.safeGet(xhrUrl, xhrHeaders);
                const data = JSON.parse(xhrRes.body);

                if (data && data.available !== false && data.sources) {
                    const mp4Sources = [];
                    const hlsSources = [];

                    if (data.sources.mp4 && typeof data.sources.mp4 === "object") {
                        for (const [formatId, info] of Object.entries(data.sources.mp4)) {
                            if (info && typeof info === "object" && info.src && info.src.startsWith("http")) {
                                mp4Sources.push({
                                    url: info.src,
                                    originalUrl: info.src,
                                    quality: `${formatId} (MP4)`,
                                    headers: headers,
                                    _rank: this.parseResolutionRank(formatId),
                                });
                            }
                        }
                    }

                    mp4Sources.sort((a, b) => {
                        if (preferredQuality !== "best") {
                            const prefNum = parseInt(preferredQuality, 10);
                            if (a._rank === prefNum && b._rank !== prefNum) return -1;
                            if (b._rank === prefNum && a._rank !== prefNum) return 1;
                        }
                        return b._rank - a._rank;
                    });

                    for (const v of mp4Sources) {
                        videos.push({
                            url: v.url,
                            originalUrl: v.originalUrl,
                            quality: v.quality,
                            headers: v.headers,
                        });
                    }

                    if (data.sources.hls && typeof data.sources.hls === "object") {
                        for (const [formatId, info] of Object.entries(data.sources.hls)) {
                            if (info && typeof info === "object" && info.src && info.src.startsWith("http")) {
                                hlsSources.push({
                                    url: info.src,
                                    originalUrl: info.src,
                                    quality: `${formatId} (HLS)`,
                                    headers: headers,
                                });
                            }
                        }
                        videos.push(...hlsSources);
                    }
                }
            } catch (e) {
                // Fall through to HTML download link fallback
            }
        }

        if (videos.length === 0) {
            const doc = new Document(html);
            const dloadLinks = doc.select("a[href*='/dload/']");
            for (const a of dloadLinks) {
                const href = a.attr("href");
                if (!href) continue;
                const dlUrl = href.startsWith("http") ? href : base + href;
                const label = a.text.trim() || "Download MP4";
                videos.push({
                    url: dlUrl,
                    originalUrl: dlUrl,
                    quality: `${label} (Direct Download)`,
                    headers: headers,
                });
            }
        }

        return videos;
    }

    getFilterList() {
        const mapOptions = (entries) => entries.map(([name, value]) => ({
            type_name: "SelectOption",
            name,
            value,
        }));

        return [
            {
                type_name: "SelectFilter",
                name: "Sort By",
                state: 0,
                values: mapOptions([
                    ["Most Recent", "most-recent"],
                    ["Best Videos", "best-videos"],
                    ["Most Viewed", "most-viewed"],
                    ["Top Rated", "top-rated"],
                    ["Longest", "longest"],
                    ["Shortest", "shortest"],
                ]),
            },
            {
                type_name: "SelectFilter",
                name: "Production",
                state: 0,
                values: mapOptions([
                    ["All", ""],
                    ["Professional", "PROD-pro"],
                    ["Homemade", "PROD-home"],
                ]),
            },
            {
                type_name: "SelectFilter",
                name: "Category",
                state: 0,
                values: mapOptions([
                    ["All", ""],
                    ["4K Ultra HD", "4k-porn"],
                    ["60 FPS", "60fps"],
                    ["HD 1080p", "hd-1080p"],
                    ["VR Porn", "vr-porn"],
                    ["AI", "ai"],
                    ["Amateur", "amateur"],
                    ["Anal", "anal"],
                    ["Asian", "asian"],
                    ["ASMR", "asmr"],
                    ["BBW", "bbw"],
                    ["BDSM", "bdsm"],
                    ["Big Ass", "big-ass"],
                    ["Big Dick", "big-dick"],
                    ["Big Tits", "big-tits"],
                    ["Bisexual", "bisexual"],
                    ["Blonde", "blonde"],
                    ["Blowjob", "blowjob"],
                    ["Bondage", "bondage"],
                    ["Brunette", "brunette"],
                    ["Bukkake", "bukkake"],
                    ["Casting", "casting"],
                    ["Compilation", "compilation"],
                    ["Cosplay", "cosplay"],
                    ["Creampie", "creampie"],
                    ["Cuckold", "cuckold"],
                    ["Cumshot", "cumshot"],
                    ["Double Penetration", "double-penetration"],
                    ["Ebony", "ebony"],
                    ["Fat", "fat"],
                    ["Fetish", "fetish"],
                    ["Fisting", "fisting"],
                    ["Footjob", "footjob"],
                    ["For Women", "for-women"],
                    ["Gay", "gay"],
                    ["Gloryhole", "gloryhole"],
                    ["Group Sex", "group-sex"],
                    ["Handjob", "handjob"],
                    ["Hardcore", "hardcore"],
                    ["Hentai", "hentai"],
                    ["Homemade", "homemade"],
                    ["Hotel", "hotel"],
                    ["Hotwife", "hotwife"],
                    ["Housewives", "housewives"],
                    ["HQ Porn", "hq-porn"],
                    ["Indian", "indian"],
                    ["Indonesia", "indonesia"],
                    ["Interracial", "interracial"],
                    ["Japanese", "japanese"],
                    ["Latina", "latina"],
                    ["Lesbian", "lesbians"],
                    ["Lingerie", "lingerie"],
                    ["Massage", "massage"],
                    ["Masturbation", "masturbation"],
                    ["Mature", "mature"],
                    ["MILF", "milf"],
                    ["Nurses", "nurse"],
                    ["Office", "office"],
                    ["Older Men", "old-man"],
                    ["Orgy", "orgy"],
                    ["Outdoor", "outdoor"],
                    ["PAWG", "pawg"],
                    ["Petite", "petite"],
                    ["Pinay", "pinay"],
                    ["Pornstar", "pornstar"],
                    ["POV", "pov-porn"],
                    ["Pregnant", "pregnant"],
                    ["Public", "public"],
                    ["Redhead", "redhead"],
                    ["Small Tits", "small-tits"],
                    ["Squirt", "squirt"],
                    ["Stepmom", "stepmom"],
                    ["Stepsister", "stepsister"],
                    ["Striptease", "striptease"],
                    ["Students", "students"],
                    ["Swinger", "swingers"],
                    ["Teen", "teens"],
                    ["Threesome", "threesome"],
                    ["Toys", "toys"],
                    ["Trans", "shemale"],
                    ["Uncategorized", "uncategorized"],
                    ["Uniform", "uniform"],
                    ["Vintage", "vintage"],
                    ["Webcam", "webcam"],
                ]),
            },
        ];
    }

    getSourcePreferences() {
        return [
            {
                key: "override_base_url",
                editTextPreference: {
                    title: "Custom Base URL / Mirror",
                    summary: "Leave empty for https://www.eporner.com, or enter a mirror (e.g. https://en.eporner.com)",
                    value: "https://www.eporner.com",
                    dialogTitle: "Custom Base URL",
                    dialogMessage: "Enter the base URL without a trailing slash.",
                    text: "https://www.eporner.com",
                },
            },
            {
                key: "preferred_quality",
                listPreference: {
                    title: "Preferred Video Quality",
                    summary: "Prioritize this resolution when loading or downloading",
                    valueIndex: 0,
                    entries: ["Best Available", "2160p (4K)", "1080p", "720p", "480p", "360p"],
                    entryValues: ["best", "2160", "1080", "720", "480", "360"],
                },
            },
        ];
    }
}
