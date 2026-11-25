const mangayomiSources = [{
    "name": "Oppai.stream",
    "lang": "en",
    "baseUrl": "https://oppai.stream",
    "apiUrl": "",
    "iconUrl": "https://oppai.stream/assets/logo/favicon-32x32.png",
    "typeSource": "single",
    "itemType": 1,
    "isManga": false,
    "isNsfw": true,
    "version": "1.0.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "anime/src/en/oppaistream.js"
}];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this._categoryUrls = [];
  }

  getHeaders(referer = "https://oppai.stream/") {
    return {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: referer,
    };
  }

  cleanImageUrl(url) {
    if (
      !url ||
      url.includes("aspect.png") ||
      url.includes("placeholder") ||
      url.includes("logo.png") ||
      url.startsWith("data:image")
    ) {
      return "";
    }
    let formatted = url.trim().replace(/\\\//g, "/");
    if (formatted.startsWith("//")) formatted = "https:" + formatted;
    else if (formatted.startsWith("/")) formatted = "https://oppai.stream" + formatted;

    return formatted.replace(/ /g, "%20");
  }

  normalizeUrl(url) {
    if (!url) return "";
    let clean = url.trim().split("?")[0].split("#")[0];
    if (clean.startsWith("/")) {
      clean = "https://oppai.stream" + clean;
    }
    clean = clean.replace(/\/from\/.*$/i, "");
    return clean;
  }

  getSeriesSlug(url) {
    const clean = this.normalizeUrl(url);
    const match = clean.match(/\/watch\/(.+)$/i);
    if (!match) return clean.toLowerCase();
    let slug = match[1];
    try {
      slug = decodeURIComponent(slug);
    } catch (e) {}
    return slug.replace(/-\d+$/, "").trim().toLowerCase();
  }

  parseVideoList(doc, groupSeries = true, selector = "a.episode") {
    const list = [];
    const seenIdentities = new Set();

    let elements = doc.select(selector);
    if (elements.length === 0 && selector === "a.episode") {
      elements = doc.select("a[href*='/watch/']");
    }

    const ignoredKeywords = [
      "twinrdengine",
      "patreon",
      "twitter",
      "discord",
      "telegram",
      "manhwa",
      "privacy",
      "terms",
      "dmca",
      "contact",
      "about",
      "faq",
      "partners",
      "partner",
    ];

    for (let i = 0; i < elements.length; i++) {
      const card = elements[i];
      let href = card.attr("href") || "";
      if (!href) {
        const innerA = card.selectFirst("a[href*='/watch/']");
        if (innerA) href = innerA.attr("href") || "";
      }

      if (!href || href === "/" || href.includes("#") || !href.includes("/watch/")) {
        continue;
      }

      const lowerHref = href.toLowerCase();
      if (ignoredKeywords.some((kw) => lowerHref.includes(kw))) {
        continue;
      }

      const cleanUrl = this.normalizeUrl(
        href.startsWith("http")
          ? href
          : "https://oppai.stream" + (href.startsWith("/") ? "" : "/") + href
      );

      let epNum = card.attr("epid") || "";
      if (!epNum) {
        const epEl = card.selectFirst(".episode-number");
        if (epEl) epNum = epEl.text.trim();
      }
      if (!epNum) {
        const epMatch = cleanUrl.match(/-(\d+)$/);
        if (epMatch) epNum = epMatch[1];
      }

      let seriesTitle = "";
      const titleEl = card.selectFirst(".episode-title, .title, .name, h2, h3, h4");
      if (titleEl) {
        seriesTitle = titleEl.text.trim();
      }
      if (!seriesTitle) {
        const imgAlt = card.selectFirst("img.cover");
        if (imgAlt && imgAlt.attr("alt")) {
          seriesTitle = imgAlt
            .attr("alt")
            .replace(/\s+Episode\s+\d+\s+thumbnail$/i, "")
            .trim();
        }
      }

      if (!seriesTitle || seriesTitle.length < 2) continue;

      const lowerTitle = seriesTitle.toLowerCase();
      if (
        lowerTitle.includes("privacy policy") ||
        lowerTitle.includes("terms of service") ||
        lowerTitle.includes("dmca") ||
        lowerTitle.includes("manhwa") ||
        lowerTitle.includes("partner")
      ) {
        continue;
      }

      const seriesSlug = this.getSeriesSlug(cleanUrl);
      const dedupeKey = groupSeries ? seriesSlug : cleanUrl.toLowerCase();
      if (seenIdentities.has(dedupeKey)) {
        continue;
      }

      let imgSrc = "";
      const coverImg = card.selectFirst("img.cover");
      if (coverImg) {
        imgSrc = coverImg.attr("data-src") || coverImg.attr("src") || "";
      }
      if (!imgSrc) {
        const allImgs = card.select("img");
        for (let j = 0; j < allImgs.length; j++) {
          const candidate = allImgs[j].attr("data-src") || allImgs[j].attr("src") || "";
          const cleaned = this.cleanImageUrl(candidate);
          if (cleaned) {
            imgSrc = cleaned;
            break;
          }
        }
      }

      const finalImg =
        this.cleanImageUrl(imgSrc) || "https://oppai.stream/assets/logo/favicon-32x32.png";
      const displayName = groupSeries
        ? seriesTitle
        : seriesTitle + (epNum ? " EP " + epNum : "");

      seenIdentities.add(dedupeKey);
      list.push({
        name: displayName,
        link: cleanUrl,
        imageUrl: finalImg,
        cover: finalImg,
        headers: this.getHeaders(),
      });
    }

    return list;
  }

  async fetchSearchApi(query, page, order = "recent", groupSeries = false, tags = "") {
    const client = new Client();
    const currentPage = parseInt(page) || 1;
    const limit = 35;
    const apiUrl = "https://oppai.stream/api/search.php";

    const bodyStr =
      `text=${encodeURIComponent(query || "")}` +
      `&tags=${encodeURIComponent(tags || "")}` +
      `&blacklist=&studios=&order=${encodeURIComponent(order)}` +
      `&limit=${limit}&page=${currentPage}` +
      `&classes=smaller-episode-gap&character_filters=%5B%5D`;

    const bodyObj = {
      text: String(query || ""),
      tags: String(tags || ""),
      blacklist: "",
      studios: "",
      order: String(order),
      limit: String(limit),
      page: String(currentPage),
      classes: "smaller-episode-gap",
      character_filters: "[]",
    };

    const headers = this.getHeaders("https://oppai.stream/search");
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    headers["X-Requested-With"] = "XMLHttpRequest";
    headers["Origin"] = "https://oppai.stream";

    const needsFilter = Boolean(query || tags || currentPage > 1);
    const parseTotal = (doc) => {
      const el = doc.selectFirst(".results-num");
      return el ? parseInt(el.text.trim()) : NaN;
    };

    const attempts = [
      () => client.post(apiUrl, headers, bodyStr),
      () => client.post(apiUrl, headers, bodyObj),
      () => client.post(apiUrl, { headers: headers, body: bodyObj }),
      () => client.post(apiUrl, { headers: headers, body: bodyStr }),
      () => client.get(`${apiUrl}?${bodyStr}`, { headers: headers }),
    ];

    let doc = null;
    let total = NaN;

    for (let i = 0; i < attempts.length; i++) {
      try {
        const res = await attempts[i]();
        if (res && res.body) {
          const candidateDoc = new Document(res.body);
          const candidateTotal = parseTotal(candidateDoc);
          doc = candidateDoc;
          total = candidateTotal;
          if (!needsFilter || (!isNaN(candidateTotal) && candidateTotal < 1000)) {
            break;
          }
        }
      } catch (e) {}
    }

    if (!doc) {
      return { list: [], hasNextPage: false };
    }

    const list = this.parseVideoList(doc, groupSeries);
    let hasNext = list.length >= limit;
    if (!isNaN(total)) {
      hasNext = currentPage * limit < total;
    }

    return {
      list: list,
      hasNextPage: hasNext,
    };
  }

  async loadCategoryUrls() {
    if (this._categoryUrls.length > 0) {
      return this._categoryUrls;
    }

    const client = new Client();
    const homeRes = await client.get("https://oppai.stream/", {
      headers: this.getHeaders(),
    });
    const homeDoc = new Document(homeRes.body);

    const catUrls = [];
    const catEls = homeDoc.select("#categories a.category-card, a.category-card");
    for (let i = 0; i < catEls.length; i++) {
      let href = catEls[i].attr("href") || "";
      if (!href) continue;
      if (href.startsWith("/")) href = "https://oppai.stream" + href;
      if (!catUrls.includes(href)) {
        catUrls.push(href);
      }
    }

    this._categoryUrls = catUrls;
    return catUrls;
  }

  // 1. Popular Feed (Rotates and paginates through all homepage category cards)
  async getPopular(page) {
    const client = new Client();
    const currentPage = parseInt(page) || 1;
    const catUrls = await this.loadCategoryUrls();

    if (catUrls.length > 0) {
      const catIndex = (currentPage - 1) % catUrls.length;
      const catPage = Math.floor((currentPage - 1) / catUrls.length) + 1;
      const catUrl = catUrls[catIndex];

      const slugMatch = catUrl.match(/\/category\/([^/?#]+)/i);
      const tagSlug = slugMatch ? decodeURIComponent(slugMatch[1]) : "";

      let list = [];
      if (tagSlug) {
        const apiRes = await this.fetchSearchApi("", catPage, "recent", true, tagSlug);
        list = apiRes.list;
      }

      if (list.length === 0) {
        const sep = catUrl.includes("?") ? "&" : "?";
        const pagedCatUrl = catPage > 1 ? `${catUrl}${sep}page=${catPage}` : catUrl;
        const catRes = await client.get(pagedCatUrl, {
          headers: this.getHeaders("https://oppai.stream/"),
        });
        const catDoc = new Document(catRes.body);
        list = this.parseVideoList(catDoc, true, "a.episode");
      }

      return {
        list: list,
        hasNextPage: list.length > 0,
      };
    }

    const homeRes = await client.get("https://oppai.stream/", {
      headers: this.getHeaders(),
    });
    const homeDoc = new Document(homeRes.body);
    return {
      list: currentPage === 1 ? this.parseVideoList(homeDoc, true, "a.episode") : [],
      hasNextPage: false,
    };
  }

  // 2. Latest Feed (Only Trending Episodes section on homepage)
  async getLatestUpdates(page) {
    const client = new Client();
    const res = await client.get("https://oppai.stream/", {
      headers: this.getHeaders(),
    });
    const doc = new Document(res.body);

    return {
      list: this.parseVideoList(doc, true, "#trending-episodes a.episode"),
      hasNextPage: false,
    };
  }

  // 3. Search Route with Filters
  async search(query, page, filters) {
    let order = "recent";
    const selectedTags = [];

    if (filters && filters.length > 0) {
      for (let i = 0; i < filters.length; i++) {
        const f = filters[i];
        if (f.type === "sort" && f.values && f.values[f.state]) {
          order = f.values[f.state].value;
        } else if (f.type === "tags_text" && f.state && f.state.trim()) {
          const custom = f.state
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
          for (let j = 0; j < custom.length; j++) {
            if (!selectedTags.includes(custom[j])) {
              selectedTags.push(custom[j]);
            }
          }
        } else if (f.type === "tags" && f.state) {
          for (let j = 0; j < f.state.length; j++) {
            const tag = f.state[j];
            if (tag.state && !selectedTags.includes(tag.value)) {
              selectedTags.push(tag.value);
            }
          }
        }
      }
    }

    return await this.fetchSearchApi(query, page, order, false, selectedTags.join(","));
  }

  getFilterList() {
    return [
      {
        type_name: "SelectFilter",
        type: "sort",
        name: "Order",
        state: 0,
        values: [
          { type_name: "SelectOption", name: "Recent", value: "recent" },
          { type_name: "SelectOption", name: "Views", value: "views" },
          { type_name: "SelectOption", name: "Likes", value: "likes" },
          { type_name: "SelectOption", name: "Uploaded", value: "uploaded" },
        ],
      },
      {
        type_name: "TextFilter",
        type: "tags_text",
        name: "Custom Tags (comma-separated)",
        state: "",
      },
      {
        type_name: "GroupFilter",
        type: "tags",
        name: "Tags",
        state: [
          { type_name: "CheckBox", name: "Uncensored", value: "uncensored" },
          { type_name: "CheckBox", name: "Milf", value: "milf" },
          { type_name: "CheckBox", name: "Maid", value: "maid" },
          { type_name: "CheckBox", name: "School Girl", value: "school-girl" },
          { type_name: "CheckBox", name: "Succubus", value: "succubus" },
          { type_name: "CheckBox", name: "Tentacle", value: "tentacle" },
          { type_name: "CheckBox", name: "Big Boobs", value: "big-boobs" },
          { type_name: "CheckBox", name: "BDSM", value: "bdsm" },
          { type_name: "CheckBox", name: "Elf", value: "elf" },
        ],
      },
    ];
  }

  // 4. Detail View with Episode Parsing
  async getDetail(url) {
    const client = new Client();
    const cleanUrl = this.normalizeUrl(url);
    const res = await client.get(cleanUrl, {
      headers: this.getHeaders(),
    });
    const doc = new Document(res.body);
    const currentSlug = this.getSeriesSlug(cleanUrl);

    const titleEl = doc.selectFirst("h1#episode-title, h1, .entry-title");
    let mainTitle = titleEl ? titleEl.text.trim() : "Anime";
    mainTitle = mainTitle
      .replace(/\s+Episode\s*\d+$/i, "")
      .replace(/\s+EP\s*\d+$/i, "")
      .trim();

    let description = "";
    const descEl = doc.selectFirst("#episode-description p:not(.bebas), #episode-description");
    if (descEl) {
      description = descEl.text.trim();
    }

    let author = "";
    let artist = "";
    const studioEl = doc.selectFirst(".wrap-genres a[href*='/studio/'], a[href*='/studio/']");
    if (studioEl) {
      author = studioEl.text.trim();
      artist = author;
    }

    const genres = [];
    const genreEls = doc.select(".wrap-genres a");
    for (let i = 0; i < genreEls.length; i++) {
      const href = genreEls[i].attr("href") || "";
      if (href.includes("/studio/")) continue;
      const gText = genreEls[i].text.trim();
      if (gText && !genres.includes(gText)) {
        genres.push(gText);
      }
    }

    let posterSrc = "";
    const thumbMatch = res.body.match(/var\s+episodeThumbnail\s*=\s*"([^"]+)"/);
    if (thumbMatch) {
      posterSrc = thumbMatch[1];
    }
    if (!posterSrc) {
      const ogImg = doc.selectFirst("meta[property='og:image']");
      if (ogImg) posterSrc = ogImg.attr("content") || "";
    }
    const cleanedPoster = this.cleanImageUrl(posterSrc);

    const rawEpisodes = [];
    const visitedUrls = new Set();

    const epElements = doc.select(
      "a.episode[href*='/from/other-episodes'], a#stats-prevep, a.episode"
    );
    for (let i = 0; i < epElements.length; i++) {
      const el = epElements[i];
      const href = el.attr("href") || "";
      if (!href || href.includes("#") || !href.includes("/watch/")) continue;

      const rawEpHref = href.startsWith("http")
        ? href
        : "https://oppai.stream" + (href.startsWith("/") ? "" : "/") + href;
      const fullEpHref = this.normalizeUrl(rawEpHref);

      const candSlug = this.getSeriesSlug(fullEpHref);
      if (currentSlug && candSlug && currentSlug !== candSlug) {
        continue;
      }

      if (!visitedUrls.has(fullEpHref)) {
        visitedUrls.add(fullEpHref);

        let epNumStr = el.attr("epid") || "";
        if (!epNumStr) {
          const epNumMatch = fullEpHref.match(/-(\d+)$/);
          epNumStr = epNumMatch ? epNumMatch[1] : "";
        }

        const parsed = parseInt(epNumStr, 10);
        const parsedEp = !isNaN(parsed) ? parsed : rawEpisodes.length + 1;
        rawEpisodes.push({
          url: fullEpHref,
          epNumber: parsedEp,
        });
      }
    }

    if (rawEpisodes.length === 0) {
      const epNumMatch = cleanUrl.match(/-(\d+)$/);
      const parsed = epNumMatch ? parseInt(epNumMatch[1], 10) : 1;
      const epNum = !isNaN(parsed) ? parsed : 1;
      rawEpisodes.push({
        url: cleanUrl,
        epNumber: epNum,
      });
    }

    rawEpisodes.sort((a, b) => a.epNumber - b.epNumber);

    // Strip extra fields and guarantee clean "Episode N" naming for auto-numbering
    const chapters = rawEpisodes.map((ep, idx) => ({
      name: "Episode " + (ep.epNumber || idx + 1),
      url: ep.url,
      dateUpload: null,
    }));

    return {
      name: mainTitle,
      description: description,
      author: author,
      artist: artist,
      imageUrl: cleanedPoster,
      cover: cleanedPoster,
      genre: genres,
      status: 0,
      chapters: chapters,
    };
  }

  // 5. Video Stream Resolver
  async getVideoList(url) {
    const client = new Client();
    const cleanUrl = this.normalizeUrl(url);
    const res = await client.get(cleanUrl, {
      headers: this.getHeaders(),
    });

    const body = res.body;
    const doc = new Document(body);
    const videos = [];
    const subtitles = [];

    const storageMatch = body.match(/var\s+storageBase\s*=\s*"([^"]+)"/);
    const folderMatch = body.match(/var\s+folder\s*=\s*"([^"]+)"/);
    const epMatch = body.match(/var\s+ep\s*=\s*"([^"]+)"/);
    const layoutMatch = body.match(/var\s+layout\s*=\s*(\d+)/);
    const resMatch = body.match(/var\s+res\s*=\s*"([^"]+)"/);
    const resListMatch = body.match(/var\s+resList\s*=\s*(\[[^\]]+\])/);

    const streamHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Referer: "https://oppai.stream/",
    };

    if (storageMatch && folderMatch) {
      const storageBase = storageMatch[1].replace(/\\\//g, "/");
      const folder = folderMatch[1].replace(/\\\//g, "/");
      const layout = layoutMatch ? parseInt(layoutMatch[1]) : 1;
      const epStr = epMatch ? epMatch[1].toString() : "1";
      const epPadded = epStr.length < 2 ? "0" + epStr : epStr;

      const tracks = doc.select("track");
      for (let i = 0; i < tracks.length; i++) {
        const subUrl = tracks[i].attr("src");
        if (subUrl) {
          subtitles.push({
            file: this.cleanImageUrl(subUrl),
            label: tracks[i].attr("label") || tracks[i].attr("srclang") || "English",
          });
        }
      }

      if (layout === 2) {
        subtitles.push({
          file: `${storageBase}/${folder}/en_${epPadded}.ass`,
          label: "English (ASS)",
        });
      }

      let ext = "mp4";
      if (resMatch && resMatch[1].includes("-2")) {
        ext = "webm";
      }

      const encodedFolder = folder.split("/").map(encodeURIComponent).join("/");
      const directUrl = `${storageBase}/${encodedFolder}/ep.${ext}`;

      if (layout === 1) {
        videos.push({
          url: directUrl,
          originalUrl: cleanUrl,
          quality: `Direct (${ext.toUpperCase()})`,
          subtitles: subtitles,
          headers: streamHeaders,
        });
      }

      if (layout === 2) {
        let qualities = ["1080", "720"];
        if (resListMatch) {
          try {
            qualities = JSON.parse(resListMatch[1]);
          } catch (e) {}
        }

        for (let i = 0; i < qualities.length; i++) {
          const q = qualities[i].toString().toLowerCase();
          const qFolder = q === "4k" ? "4k" : q.endsWith("p") ? q : q + "p";
          const mpdUrl = `${storageBase}/${folder}/${qFolder}/dash${epPadded}/manifest.mpd`;

          videos.push({
            url: mpdUrl,
            originalUrl: cleanUrl,
            quality: q.toUpperCase() + " (DASH)",
            subtitles: subtitles,
            headers: streamHeaders,
          });
        }

        videos.push({
          url: directUrl,
          originalUrl: cleanUrl,
          quality: `Fallback (${ext.toUpperCase()})`,
          subtitles: subtitles,
          headers: streamHeaders,
        });
      }
    }

    if (videos.length === 0) {
      const videoSource = doc.selectFirst("video source, video");
      if (videoSource) {
        const src = videoSource.attr("src") || videoSource.attr("data-src");
        if (src && !src.startsWith("blob:")) {
          videos.push({
            url: this.cleanImageUrl(src),
            originalUrl: cleanUrl,
            quality: "HD Direct Stream",
            subtitles: subtitles,
            headers: streamHeaders,
          });
        }
      }
    }

    return videos;
  }
}
