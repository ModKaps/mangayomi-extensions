const mangayomiSources = [{
    "name": "Hanime1",
    "lang": "en",
    "baseUrl": "https://hanime1.me",
    "apiUrl": "",
    "iconUrl": "https://hanime1.me/favicon.ico",
    "typeSource": "single",
    "itemType": 1,
    "isManga": false,
    "isNsfw": true,
    "version": "1.0.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "anime/src/en/hanime1.js"
}];

 class DefaultExtension extends MProvider {
    getHeaders() {
        return {
            "Referer": "https://hanime1.me/"
        };
    }

    formatUrl(url) {
        if (!url) return "";
        if (url.startsWith("//")) return "https:" + url;
        if (url.startsWith("/")) return "https://hanime1.me" + url;
        return url;
    }

    async getPopular(page) {
        const client = new Client();
        const res = await client.get(`https://hanime1.me/search?page=${page}&sort=popular`, this.getHeaders());
        return this.searchAnimeParse(res.body);
    }

    async getLatestUpdates(page) {
        const client = new Client();
        const res = await client.get(`https://hanime1.me/search?page=${page}`, this.getHeaders());
        return this.searchAnimeParse(res.body);
    }

    async search(query, page, filters) {
        const client = new Client();
        const url = `https://hanime1.me/search?query=${encodeURIComponent(query)}&page=${page}`;
        const res = await client.get(url, this.getHeaders());
        return this.searchAnimeParse(res.body);
    }

    searchAnimeParse(body) {
        const doc = new Document(body);
        const nodes = doc.select(".horizontal-row .video-item-container");
        const list = [];
        
        if (nodes && nodes.length > 0) {
            for (let i = 0; i < nodes.length; i++) {
                const it = nodes[i];
                const aLink = it.select("a.video-link");
                if (!aLink || aLink.length === 0) continue;
                
                const target = aLink[0].attr("target");
                if (target) continue;
                
                const detailUrl = this.formatUrl(aLink[0].attr("href"));
                const img = it.select(".main-thumb");
                const rawLink = img && img.length > 0 ? (img[0].attr("data-src") || img[0].attr("src")) : "";
                const coverUrl = this.formatUrl(rawLink);
                
                const titleEl = it.select(".title");
                const name = titleEl && titleEl.length > 0 && titleEl[0].text ? titleEl[0].text.trim() : "";
                
                if (detailUrl && !detailUrl.toLowerCase().includes(".jpg")) {
                    list.push({ 
                        name: name, 
                        imageUrl: coverUrl, 
                        link: detailUrl, 
                        url: detailUrl 
                    });
                }
            }
        } else {
            const aNodes = doc.select("a");
            if (aNodes) {
                for (let i = 0; i < aNodes.length; i++) {
                    const a = aNodes[i];
                    if (a.attr("target")) continue;
                    
                    const searchV = a.select(".search-videos");
                    if (searchV && searchV.length > 0) {
                        const detailUrl = this.formatUrl(a.attr("href"));
                        const img = a.select("img");
                        const rawLink = img && img.length > 0 ? (img[0].attr("data-src") || img[0].attr("src")) : "";
                        const coverUrl = this.formatUrl(rawLink);
                        
                        const titleEl = a.select(".home-rows-videos-title");
                        const name = titleEl && titleEl.length > 0 && titleEl[0].text ? titleEl[0].text.trim() : "";
                        
                        if (detailUrl && !detailUrl.toLowerCase().includes(".jpg")) {
                            list.push({ 
                                name: name, 
                                imageUrl: coverUrl, 
                                link: detailUrl, 
                                url: detailUrl 
                            });
                        }
                    }
                }
            }
        }
        
        const nextPages = doc.select("li.page-item a.page-link");
        let hasNextPage = false;
        if (nextPages) {
            for (let i = 0; i < nextPages.length; i++) {
                if (nextPages[i].attr("rel") === "next") {
                    hasNextPage = true;
                    break;
                }
            }
        }
        
        return { list: list, hasNextPage: hasNextPage };
    }

    async getDetail(url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        
        const tags = doc.select(".single-video-tag");
        const genre = [];
        if (tags && tags.length > 0) {
            for (let i = 0; i < tags.length; i++) {
                const el = tags[i];
                const attr = el.attr("data-toggle");
                if (!attr && el.text) {
                    const textContent = el.text.replace(/^# /, "").replace(/ \(\d+\)$/, "").trim();
                    if (textContent) genre.push(textContent);
                }
            }
        }
        
        const authorElements = doc.select("#video-artist-name");
        const author = authorElements && authorElements.length > 0 && authorElements[0].text ? authorElements[0].text.trim() : "Unknown";
        
        const shareBtnTitle = doc.select("#shareBtn-title");
        let realTitle = "";
        if (shareBtnTitle && shareBtnTitle.length > 0 && shareBtnTitle[0].text) {
            realTitle = shareBtnTitle[0].text.trim();
        } else {
            const metaTitle = doc.select("meta[property=og:title]");
            if (metaTitle && metaTitle.length > 0 && metaTitle[0].attr("content")) {
                realTitle = metaTitle[0].attr("content").trim();
            }
        }
        const name = realTitle || "Unknown Title";
        
        const metaDesc = doc.select("meta[property=og:description]");
        const description = metaDesc && metaDesc.length > 0 && metaDesc[0].attr("content") ? metaDesc[0].attr("content") : "";

        const metaImg = doc.select("meta[property=og:image]");
        let imageUrl = metaImg && metaImg.length > 0 && metaImg[0].attr("content") ? metaImg[0].attr("content") : "";
        
        if (!imageUrl) {
            const player = doc.select("#player");
            if (player && player.length > 0) {
                imageUrl = player[0].attr("data-poster") || player[0].attr("poster") || "";
            }
        }
        if (!imageUrl) imageUrl = "https://hanime1.me/favicon.ico";
        
        // Force every page to act as a standalone single-item entry with its own unique thumbnail
        const episodes = [{
            name: name,
            link: url,
            url: url,
            imageUrl: imageUrl
        }];
        
        return {
            name: name,
            url: url,
            imageUrl: imageUrl,
            description: description,
            author: author,
            genre: genre,
            status: 1,
            episodes: episodes
        };
    }

    async getVideoList(url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders());
        const html = res.body;
        
        if (html.includes("Cloudflare") || html.includes("Just a moment...")) {
            throw new Error("Cloudflare block detected! Tap Webview to solve.");
        }

        const doc = new Document(html);
        const videos = [];
        
        const sourceRegex = /<source\s+[^>]*src\s*=\s*['"]([^'"]+)['"][^>]*>/gi;
        let match;
        while ((match = sourceRegex.exec(html)) !== null) {
            let vUrl = match[1];
            let quality = "Unknown";
            const sizeMatch = match[0].match(/size\s*=\s*['"]([^'"]+)['"]/i);
            if (sizeMatch && sizeMatch[1]) quality = sizeMatch[1] + "P";
            
            if (vUrl && !videos.some(v => v.url === vUrl)) {
                videos.push({ url: vUrl, originalUrl: vUrl, quality });
            }
        }
        
        if (videos.length === 0) {
            const sourceTags = doc.select("video source");
            if (sourceTags && sourceTags.length > 0) {
                for (let i = 0; i < sourceTags.length; i++) {
                    const el = sourceTags[i];
                    const quality = el.attr("size");
                    const vUrl = el.attr("src");
                    if (vUrl && !videos.some(v => v.url === vUrl)) {
                        videos.push({
                            url: vUrl,
                            originalUrl: vUrl,
                            quality: quality ? (quality + "P") : "Unknown"
                        });
                    }
                }
            }
        }

        if (videos.length === 0) {
            throw new Error(`No video links found.`);
        }
        
        return videos;
    }
}
