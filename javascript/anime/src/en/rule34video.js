const mangayomiSources = [{
    "name": "Rule34Video",
    "lang": "en",
    "baseUrl": "https://rule34video.com",
    "apiUrl": "",
    "iconUrl": "https://rule34video.com/apple-touch-icon.png",
    "typeSource": "single",
    "itemType": 1,
    "isManga": false,
    "isNsfw": true,
    "version": "1.43.6",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "anime/src/en/rule34video.js"
}];

const mangayomiSources = [
    {
        "name": "Rule34Video",
        "lang": "en",
        "isNsfw": true,
        "isManga": false,
        "itemType": 1,
        "iconUrl": "https://rule34video.com/apple-touch-icon.png",
        "sourceType": "anime",
        "baseUrl": "https://rule34video.com",
        "version": "1.43.6"
    }
];

class DefaultExtension extends MProvider {
    cleanUrl(url) {
        if (!url) return "";
        let formatted = url.trim();
        if (formatted.startsWith("data:image")) return "";
        if (formatted.startsWith("//")) formatted = "https:" + formatted;
        else if (formatted.startsWith("/")) formatted = "https://rule34video.com" + formatted;
        return formatted.replace(/\\/g, "").replace(/ /g, "%20");
    }

    isPlaceholderImage(url) {
        if (!url) return true;
        const lower = url.toLowerCase();
        return (
            lower.startsWith("data:image") ||
            lower.includes("blank.gif") ||
            lower.includes("spacer") ||
            lower.includes("loader") ||
            lower.includes("placeholder")
        );
    }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://rule34video.com/",
            "Cookie": "has_visited=1; age_verified=1; kt_tldmz=1"
        };
    }

    getImageHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            "Referer": "https://rule34video.com/"
        };
    }

    extractImageUrl(item) {
        const imgEl =
            item.selectFirst("img.thumb") ||
            item.selectFirst("a.th img") ||
            item.selectFirst("img");

        const attrs = [
            "data-original",
            "data-rd-jpg",
            "data-rd-webp",
            "data-webp",
            "data-src",
            "data-lazy",
            "data-thumb",
            "data-poster",
            "data-srcset",
            "srcset",
            "src"
        ];

        if (imgEl) {
            for (let j = 0; j < attrs.length; j++) {
                let raw = imgEl.attr(attrs[j]) || "";
                if (!raw) continue;
                if (attrs[j].includes("srcset")) {
                    raw = raw.split(",")[0].trim().split(" ")[0];
                }
                if (!this.isPlaceholderImage(raw)) {
                    const cleaned = this.cleanUrl(raw);
                    if (cleaned) return cleaned;
                }
            }
        }

        const bgEl = item.selectFirst(".img, a.th, [style*='background-image']");
        if (bgEl) {
            const style = bgEl.attr("style") || "";
            const m = style.match(/url\(['"]?([^'")]+)['"]?\)/i);
            if (m && m[1] && !this.isPlaceholderImage(m[1])) {
                const cleaned = this.cleanUrl(m[1]);
                if (cleaned) return cleaned;
            }
        }

        const sourceEl = item.selectFirst("picture source[srcset], picture source[data-srcset]");
        if (sourceEl) {
            const rawSet = sourceEl.attr("data-srcset") || sourceEl.attr("srcset") || "";
            const first = rawSet.split(",")[0].trim().split(" ")[0];
            if (!this.isPlaceholderImage(first)) {
                const cleaned = this.cleanUrl(first);
                if (cleaned) return cleaned;
            }
        }

        return "";
    }

    parseVideoList(doc) {
        const list = [];
        const items = doc.select(".item.thumb, div.item");

        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            const cls = item.attr("class") || "";
            if (cls.includes("adv") || cls.includes("ad_")) continue;

            const linkEl = item.selectFirst("a.th, a.js-open-popup, a[href*='/video/']");
            if (!linkEl) continue;

            const href = this.cleanUrl(linkEl.attr("href") || "");
            if (!href || href.endsWith("#") || !href.includes("/video/")) continue;

            let title = "";
            const titleEl = item.selectFirst(".thumb_title, .th, strong");
            if (titleEl) {
                title = titleEl.text.trim();
            }

            const imgEl = item.selectFirst("img.thumb, img");
            if (!title && imgEl) {
                title = (imgEl.attr("alt") || "").trim();
            }
            if (!title) {
                const parts = href.split("/").filter(Boolean);
                title = parts[parts.length - 1] || "Rule34 Video";
            }

            const finalImg = this.extractImageUrl(item) || "https://rule34video.com/apple-touch-icon.png";

            if (!list.some(v => v.link === href)) {
                list.push({
                    name: title.trim(),
                    link: href,
                    imageUrl: finalImg,
                    cover: finalImg,
                    headers: this.getImageHeaders()
                });
            }
        }

        return list;
    }

    async fetchBatchedPages(baseEndpoint, page) {
        const client = new Client();
        const combined = [];
        const p = page > 0 ? page : 1;

        const startPage = (p - 1) * 2 + 1;
        const pagesToFetch = [startPage, startPage + 1];

        for (let i = 0; i < pagesToFetch.length; i++) {
            const targetP = pagesToFetch[i];
            const url = targetP === 1
                ? `https://rule34video.com/${baseEndpoint}/`
                : `https://rule34video.com/${baseEndpoint}/${targetP}/`;

            try {
                const res = await client.get(url, { headers: this.getHeaders() });
                const doc = new Document(res.body);
                const items = this.parseVideoList(doc);
                for (let j = 0; j < items.length; j++) {
                    if (!combined.some(v => v.link === items[j].link)) {
                        combined.push(items[j]);
                    }
                }
                if (items.length === 0) break;
            } catch (e) {
                break;
            }
        }

        return {
            list: combined,
            hasNextPage: combined.length >= 24
        };
    }

    async getPopular(page) {
        return await this.fetchBatchedPages("most-popular", page);
    }

    async getLatestUpdates(page) {
        return await this.fetchBatchedPages("latest-updates", page);
    }

    async search(query, page, filters) {
        const client = new Client();
        const combined = [];
        const p = page > 0 ? page : 1;

        let sortBy = "post_date";
        let flag1 = "";
        let isHd = "";
        let flag2 = "";
        let dateFrom = "";
        let durRange = "";
        let tagsInput = "";
        let catSlug = "";
        let artistSlug = "";

        if (filters && filters.length > 0) {
            for (let i = 0; i < filters.length; i++) {
                const f = filters[i];
                if (f.type === "sort" && f.values && f.values[f.state]) {
                    sortBy = f.values[f.state].value;
                } else if (f.type === "type" && f.values && f.values[f.state]) {
                    flag1 = f.values[f.state].value;
                } else if (f.type === "date" && f.values && f.values[f.state]) {
                    dateFrom = f.values[f.state].value;
                } else if (f.type === "duration" && f.values && f.values[f.state]) {
                    durRange = f.values[f.state].value;
                } else if (f.type === "quality" && f.values && f.values[f.state]) {
                    isHd = f.values[f.state].value;
                } else if (f.type === "options" && f.state) {
                    for (let j = 0; j < f.state.length; j++) {
                        if (f.state[j].value === "verified" && f.state[j].state) {
                            flag2 = "1";
                        }
                    }
                } else if (f.type === "tags_text" && f.state) {
                    tagsInput = f.state.trim();
                } else if (f.type === "cat_text" && f.state) {
                    catSlug = f.state.trim().toLowerCase().replace(/\s+/g, "-");
                } else if (f.type === "artist_text" && f.state) {
                    artistSlug = f.state.trim().toLowerCase().replace(/\s+/g, "-");
                }
            }
        }

        const qStr = (query || "").trim();
        const mergedQuery = [qStr, tagsInput].filter(Boolean).join(" ").trim();
        const cleanQuery = encodeURIComponent(mergedQuery.replace(/\s+/g, "+"));

        let basePath = "latest-updates";
        if (mergedQuery) {
            basePath = `search/${cleanQuery}`;
        } else if (catSlug) {
            basePath = `categories/${encodeURIComponent(catSlug)}`;
        } else if (artistSlug) {
            basePath = `models/${encodeURIComponent(artistSlug)}`;
        }

        const params = [];
        if (sortBy) params.push(`sort_by=${encodeURIComponent(sortBy)}`);
        if (flag1) params.push(`flag1=${encodeURIComponent(flag1)}`);
        if (isHd) params.push(`is_hd=${encodeURIComponent(isHd)}`);
        if (flag2) params.push(`flag2=${encodeURIComponent(flag2)}`);
        if (dateFrom) params.push(`post_date_from=${encodeURIComponent(dateFrom)}`);
        if (durRange) {
            const parts = durRange.split("-");
            if (parts[0]) params.push(`duration_from=${encodeURIComponent(parts[0])}`);
            if (parts[1]) params.push(`duration_to=${encodeURIComponent(parts[1])}`);
        }
        const querySuffix = params.length > 0 ? `?${params.join("&")}` : "";

        const startPage = (p - 1) * 2 + 1;
        const pagesToFetch = [startPage, startPage + 1];

        for (let i = 0; i < pagesToFetch.length; i++) {
            const targetP = pagesToFetch[i];
            const url = targetP === 1
                ? `https://rule34video.com/${basePath}/${querySuffix}`
                : `https://rule34video.com/${basePath}/${targetP}/${querySuffix}`;

            try {
                const res = await client.get(url, { headers: this.getHeaders() });
                const doc = new Document(res.body);
                const items = this.parseVideoList(doc);
                for (let j = 0; j < items.length; j++) {
                    if (!combined.some(v => v.link === items[j].link)) {
                        combined.push(items[j]);
                    }
                }
                if (items.length === 0) break;
            } catch (e) {
                break;
            }
        }

        return {
            list: combined,
            hasNextPage: combined.length >= 24
        };
    }

    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                type: "sort",
                name: "Sort by",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Newest", value: "post_date" },
                    { type_name: "SelectOption", name: "Most Viewed", value: "video_viewed" },
                    { type_name: "SelectOption", name: "Top Rated", value: "rating" },
                    { type_name: "SelectOption", name: "Most Favourited", value: "most_favourited" },
                    { type_name: "SelectOption", name: "Most Commented", value: "most_commented" },
                    { type_name: "SelectOption", name: "Longest", value: "duration" }
                ]
            },
            {
                type_name: "SelectFilter",
                type: "type",
                name: "Type",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "" },
                    { type_name: "SelectOption", name: "Straight", value: "2109" },
                    { type_name: "SelectOption", name: "Gay", value: "192" },
                    { type_name: "SelectOption", name: "Futa", value: "15" },
                    { type_name: "SelectOption", name: "Music", value: "4747" },
                    { type_name: "SelectOption", name: "Iwara", value: "1821" }
                ]
            },
            {
                type_name: "SelectFilter",
                type: "date",
                name: "Date added",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All time", value: "" },
                    { type_name: "SelectOption", name: "Last 24 hours", value: "1" },
                    { type_name: "SelectOption", name: "Last 7 days", value: "7" },
                    { type_name: "SelectOption", name: "Last 30 days", value: "30" },
                    { type_name: "SelectOption", name: "Last year", value: "365" }
                ]
            },
            {
                type_name: "SelectFilter",
                type: "duration",
                name: "Duration",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Any", value: "" },
                    { type_name: "SelectOption", name: "Short (< 1 min)", value: "0-60" },
                    { type_name: "SelectOption", name: "1 - 5 min", value: "60-300" },
                    { type_name: "SelectOption", name: "5 - 15 min", value: "300-900" },
                    { type_name: "SelectOption", name: "15+ min", value: "900-" }
                ]
            },
            {
                type_name: "SelectFilter",
                type: "quality",
                name: "Quality",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "" },
                    { type_name: "SelectOption", name: "HD Only", value: "1" }
                ]
            },
            {
                type_name: "GroupFilter",
                type: "options",
                name: "Uploaders",
                state: [
                    { type_name: "CheckBox", name: "Verified Uploaders Only", value: "verified" }
                ]
            },
            {
                type_name: "TextFilter",
                type: "tags_text",
                name: "Tags (space-separated)",
                state: ""
            },
            {
                type_name: "TextFilter",
                type: "cat_text",
                name: "Category (slug)",
                state: ""
            },
            {
                type_name: "TextFilter",
                type: "artist_text",
                name: "Artist (slug)",
                state: ""
            }
        ];
    }

    getSourcePreferences() {
        return [];
    }

    convertWordToNumber(word) {
        const numWords = {
            one: 1, two: 2, three: 3, four: 4, five: 5,
            six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
            eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
            sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20
        };
        const clean = (word || "").toLowerCase().trim();
        return numWords[clean] !== undefined ? numWords[clean] : null;
    }

    extractEpisodeNumber(title) {
        const epRegex = /(?:ep(?:isode)?\.?|part\.?|pt\.?|vol(?:ume)?\.?|ch(?:apter)?\.?|#)\s*([a-zA-Z0-9]+)/i;
        const match = title.match(epRegex);
        if (match) {
            const val = match[1];
            const wordVal = this.convertWordToNumber(val);
            if (wordVal !== null) return wordVal;
            const parsed = parseFloat(val);
            if (!isNaN(parsed)) return parsed;
        }

        const trailing = title.match(/\b([a-zA-Z0-9]+)\b(?=[^a-zA-Z0-9]*$)/);
        if (trailing) {
            const wordVal = this.convertWordToNumber(trailing[1]);
            if (wordVal !== null) return wordVal;
            const parsed = parseFloat(trailing[1]);
            if (!isNaN(parsed)) return parsed;
        }

        return 1.0;
    }

    async getDetail(url) {
        const client = new Client();
        const res = await client.get(url, { headers: this.getHeaders() });
        const html = res.body;
        const doc = new Document(html);

        const titleEl = doc.selectFirst("h1, .headline h1, .thumb_title");
        const title = titleEl ? titleEl.text.trim() : "Rule34 Video";

        let poster = "";
        const previewMatch = html.match(/preview_url\w*\s*:\s*['"]([^'"]+)['"]/);
        if (previewMatch && previewMatch[1]) {
            poster = this.cleanUrl(previewMatch[1]);
        }
        if (!poster) {
            const metaPoster = doc.selectFirst("meta[property='og:image'], meta[name='twitter:image']");
            if (metaPoster) poster = this.cleanUrl(metaPoster.attr("content") || "");
        }
        if (!poster) {
            const videoEl = doc.selectFirst("video[poster]");
            if (videoEl) poster = this.cleanUrl(videoEl.attr("poster") || "");
        }
        const finalPoster = poster || "https://rule34video.com/apple-touch-icon.png";

        const genres = [];
        const tagElements = doc.select("a[href*='/tags/'], a[href*='/categories/'], .tags a");
        for (let i = 0; i < tagElements.length; i++) {
            const tag = tagElements[i].text.trim();
            if (tag && !genres.includes(tag)) genres.push(tag);
        }

        const episodesMap = new Map();
        const currentEpNum = this.extractEpisodeNumber(title);
        episodesMap.set(url, {
            name: title,
            url: url,
            epNumber: currentEpNum
        });

        const isSeries = /(?:ep(?:isode)?|part|pt|vol(?:ume)?|ch(?:apter)?|#)\s*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)/i.test(title);

        let baseSeriesTitle = title
            .replace(/(?:ep(?:isode)?\.?|part\.?|pt\.?|vol(?:ume)?\.?|ch(?:apter)?\.?|#)\s*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)/gi, "")
            .replace(/[-_–:]+\s*$/, "")
            .replace(/^\s*[-_–:]+/, "")
            .replace(/\[[^\]]*\]/g, "")
            .trim();

        const prefixMatch = baseSeriesTitle.match(/^(.*?)(?:\s*-\s*[^-]+)$/);
        const searchQuery = prefixMatch ? prefixMatch[1].trim() : baseSeriesTitle;

        if (isSeries && searchQuery.length > 2) {
            try {
                const searchQ = encodeURIComponent(searchQuery.replace(/\s+/g, "+"));
                const seriesRes = await client.get(`https://rule34video.com/search/${searchQ}/`, { headers: this.getHeaders() });
                const seriesDoc = new Document(seriesRes.body);
                const relatedVideos = this.parseVideoList(seriesDoc);

                for (let i = 0; i < relatedVideos.length; i++) {
                    const item = relatedVideos[i];
                    const itemTitleLower = item.name.toLowerCase();
                    const queryLower = searchQuery.toLowerCase();

                    if (itemTitleLower.includes(queryLower)) {
                        const epNum = this.extractEpisodeNumber(item.name);
                        if (!episodesMap.has(item.link)) {
                            episodesMap.set(item.link, {
                                name: item.name,
                                url: item.link,
                                epNumber: epNum
                            });
                        }
                    }
                }
            } catch (e) {
            }
        }

        const sortedEpisodes = Array.from(episodesMap.values());
        sortedEpisodes.sort((a, b) => a.epNumber - b.epNumber);

        // Prefix every entry with "Episode N - ..." so Mangayomi's auto-numbering never fails
        const chapters = sortedEpisodes.map((ep, idx) => ({
            name: `Episode ${idx + 1} - ${ep.name}`,
            url: ep.url,
            dateUpload: null
        }));

        return {
            name: isSeries && searchQuery ? searchQuery : title,
            description: genres.length > 0 ? `Tags: ${genres.join(", ")}` : "Rule34Video",
            author: "Rule34Video",
            artist: "Rule34Video",
            imageUrl: finalPoster,
            cover: finalPoster,
            genre: genres,
            status: 0,
            chapters: chapters
        };
    }

    async getVideoList(url) {
        const client = new Client();
        const res = await client.get(url, { headers: this.getHeaders() });
        const html = res.body;
        const videos = [];
        const seen = new Set();

        const flashvarsMatch = html.match(/var\s+flashvars\s*=\s*\{([\s\S]*?)\};/);
        if (flashvarsMatch) {
            const block = flashvarsMatch[1];
            const urlRegex = /(video(?:_alt)?_url\w*)\s*:\s*['"]([^'"]+)['"]/g;
            let m;

            while ((m = urlRegex.exec(block)) !== null) {
                const key = m[1];
                let streamUrl = this.cleanUrl(m[2]);

                if (streamUrl && !seen.has(streamUrl)) {
                    seen.add(streamUrl);

                    const labelRegex = new RegExp(key + '_text\\s*:\\s*[\'"]([^\'"]+)[\'"]');
                    const labelMatch = block.match(labelRegex);

                    let quality = labelMatch ? labelMatch[1].trim() : "";
                    if (!quality) {
                        if (key.includes("alt") || key.includes("hd") || key.includes("2")) {
                            quality = "HD Quality";
                        } else {
                            quality = "Default Quality";
                        }
                    }

                    videos.push({
                        url: streamUrl,
                        originalUrl: url,
                        quality: quality,
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                            "Referer": "https://rule34video.com/"
                        }
                    });
                }
            }
        }

        if (videos.length === 0) {
            const doc = new Document(html);
            const sources = doc.select("video source, video");
            for (let i = 0; i < sources.length; i++) {
                const s = sources[i];
                const raw = s.attr("src") || s.attr("data-src") || "";
                const streamUrl = this.cleanUrl(raw);
                if (streamUrl && !seen.has(streamUrl)) {
                    seen.add(streamUrl);
                    videos.push({
                        url: streamUrl,
                        originalUrl: url,
                        quality: s.attr("title") || s.attr("label") || "MP4 Stream",
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                            "Referer": "https://rule34video.com/"
                        }
                    });
                }
            }
        }

        if (videos.length === 0) {
            const regex = /(https?:\\?\/\\?\/[^"'\s<>]+\.mp4[^"'\s<>]*)/gi;
            let m;
            let counter = 1;
            while ((m = regex.exec(html)) !== null) {
                let streamUrl = this.cleanUrl(m[1].replace(/\\\//g, "/"));
                if (streamUrl && !seen.has(streamUrl) && !streamUrl.includes("preview.mp4")) {
                    seen.add(streamUrl);
                    videos.push({
                        url: streamUrl,
                        originalUrl: url,
                        quality: `Stream ${counter++}`,
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                            "Referer": "https://rule34video.com/"
                        }
                    });
                }
            }
        }

        videos.sort((a, b) => {
            const parseRes = q => {
                const match = q.match(/(\d+)p?/i);
                return match ? parseInt(match[1], 10) : 0;
            };
            return parseRes(b.quality) - parseRes(a.quality);
        });

        return videos;
    }
}
