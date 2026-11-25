const mangayomiSources = [{
    "name": "Hstream",
    "lang": "en",
    "baseUrl": "https://hstream.moe",
    "apiUrl": "",
    "iconUrl": "https://hstream.moe/images/cropped-HS-1-192x192.png",
    "typeSource": "single",
    "itemType": 1,
    "isManga": false,
    "isNsfw": true,
    "version": "0.1.3",
    "pkgPath": "anime/src/en/hstream.js"
}];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
    this._categoryUrls = [];
  }

  getHeaders() {
    return {
      Referer: this.source.baseUrl,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };
  }

  toAbsoluteUrl(url) {
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    if (url.startsWith("//")) return "https:" + url;
    return this.source.baseUrl + (url.startsWith("/") ? url : "/" + url);
  }

  extractFromCardElements(elements) {
    const list = [];
    if (!elements) return list;

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const linkEl = el.selectFirst("a");
      if (!linkEl) continue;

      const rawHref = linkEl.attr("href") || linkEl.getHref || "";
      if (!rawHref || !rawHref.includes("/hentai/")) continue;

      const link = this.toAbsoluteUrl(rawHref);
      const imgEl = el.selectFirst("img");
      const titleEl = el.selectFirst("h3");

      const name = (
        (titleEl ? titleEl.text : "") ||
        (imgEl ? imgEl.attr("alt") || "" : "") ||
        linkEl.attr("title") ||
        ""
      ).trim();

      let rawSrc = "";
      if (imgEl) {
        rawSrc =
          imgEl.attr("src") ||
          imgEl.attr("data-src") ||
          imgEl.attr("data-lazy-src") ||
          "";
        if (!rawSrc) {
          const srcset = imgEl.attr("srcset") || "";
          if (srcset) {
            rawSrc = srcset.split(",")[0].trim().split(" ")[0];
          }
        }
      }
      const imageUrl = this.toAbsoluteUrl(rawSrc);

      if (name && link) {
        list.push({
          name,
          imageUrl,
          link,
        });
      }
    }
    return list;
  }

  extractSearchVideos(doc) {
    let items = this.extractFromCardElements(doc.select("div.group.w-full.p-1"));
    if (items.length === 0) {
      items = this.extractFromCardElements(doc.select(".episode-item"));
    }

    const seen = {};
    const unique = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!seen[item.link]) {
        seen[item.link] = true;
        unique.push(item);
      }
    }
    return unique;
  }

  async loadCategoryUrls() {
    if (this._categoryUrls.length > 0) {
      return this._categoryUrls;
    }

    const res = await this.client.get(this.source.baseUrl, this.getHeaders());
    const doc = new Document(res.body);

    let cards = doc.select("a.group.relative.overflow-hidden.rounded-2xl");
    if (!cards || cards.length === 0) {
      cards = doc.select('a[href*="/search?order=recently-uploaded&tags"]');
    }

    const seen = {};
    const urls = [];
    if (cards) {
      for (let i = 0; i < cards.length; i++) {
        const rawHref = cards[i].attr("href") || cards[i].getHref || "";
        const link = this.toAbsoluteUrl(rawHref);
        if (link && link.includes("/search") && !seen[link]) {
          seen[link] = true;
          urls.push(link);
        }
      }
    }

    if (urls.length === 0) {
      const defaultTags = [
        "uncensored",
        "milf",
        "maid",
        "school-girl",
        "succubus",
        "tentacle",
        "big-boobs",
        "bdsm",
        "elf",
        "4k-48fps",
      ];
      for (let i = 0; i < defaultTags.length; i++) {
        urls.push(
          `${this.source.baseUrl}/search?order=recently-uploaded&tags%5B0%5D=${defaultTags[i]}`
        );
      }
    }

    this._categoryUrls = urls;
    return urls;
  }

  async getPopular(page) {
    const categoryUrls = await this.loadCategoryUrls();
    const catIndex = (page - 1) % categoryUrls.length;
    const catPage = Math.floor((page - 1) / categoryUrls.length) + 1;
    const baseCatUrl = categoryUrls[catIndex];
    const separator = baseCatUrl.includes("?") ? "&" : "?";
    const url = `${baseCatUrl}${separator}page=${catPage}`;

    const res = await this.client.get(url, this.getHeaders());
    const doc = new Document(res.body);
    const list = this.extractSearchVideos(doc);

    return {
      list,
      hasNextPage: list.length > 0,
    };
  }

  async getLatestUpdates(page) {
    if (page === 1) {
      const res = await this.client.get(this.source.baseUrl, this.getHeaders());
      const doc = new Document(res.body);

      const selectors = [
        "#tabs-recently-uploaded .episode-item",
        "#tabs-recently-released .episode-item",
        "#tabs-trending .episode-item",
      ];

      const seen = {};
      const list = [];

      for (let i = 0; i < selectors.length; i++) {
        const items = this.extractFromCardElements(doc.select(selectors[i]));
        for (let j = 0; j < items.length; j++) {
          const item = items[j];
          if (!seen[item.link]) {
            seen[item.link] = true;
            list.push(item);
          }
        }
      }

      if (list.length < 5) {
        const fallback = this.extractSearchVideos(doc);
        for (let j = 0; j < fallback.length; j++) {
          if (!seen[fallback[j].link]) {
            seen[fallback[j].link] = true;
            list.push(fallback[j]);
          }
        }
      }

      return {
        list,
        hasNextPage: list.length > 0,
      };
    }

    const url = `${this.source.baseUrl}/search?order=recently-uploaded&page=${page}`;
    const res = await this.client.get(url, this.getHeaders());
    const doc = new Document(res.body);
    const list = this.extractSearchVideos(doc);

    return {
      list,
      hasNextPage: list.length > 0,
    };
  }

  async search(query, page, filters) {
    let order = "recently-uploaded";
    const selectedTags = [];

    if (filters && filters.length > 0) {
      for (let i = 0; i < filters.length; i++) {
        const filter = filters[i];
        if (filter.type === "sort" && filter.values && filter.values[filter.state]) {
          order = filter.values[filter.state].value;
        } else if (filter.type === "tags" && filter.state) {
          for (let j = 0; j < filter.state.length; j++) {
            const tag = filter.state[j];
            if (tag.state) {
              selectedTags.push(tag.value);
            }
          }
        }
      }
    }

    const params = [`order=${encodeURIComponent(order)}`, `page=${page}`];
    if (query && query.trim().length > 0) {
      params.push(`search=${encodeURIComponent(query.trim())}`);
    }
    selectedTags.forEach((tag, idx) => {
      params.push(`tags%5B${idx}%5D=${encodeURIComponent(tag)}`);
    });

    const url = `${this.source.baseUrl}/search?${params.join("&")}`;
    const res = await this.client.get(url, this.getHeaders());
    const doc = new Document(res.body);

    const list = this.extractSearchVideos(doc);
    const hasNextPage =
      doc.selectFirst('a[wire:click="nextPage"], button[wire:click="nextPage"]') != null ||
      list.length >= 25;

    return {
      list,
      hasNextPage,
    };
  }

  async getDetail(url) {
    const targetUrl = this.toAbsoluteUrl(url);
    const res = await this.client.get(targetUrl, this.getHeaders());
    const doc = new Document(res.body);

    const titleEl = doc.selectFirst("h1");
    const ogTitle = doc.selectFirst('meta[property="og:title"]');
    const name = (
      titleEl ? titleEl.text : ogTitle ? ogTitle.attr("content") : ""
    ).trim();

    const ogImage = doc.selectFirst('meta[property="og:image"]');
    const coverImg = doc.selectFirst("img[src*='/images/hentai/']");
    const imageUrl = this.toAbsoluteUrl(
      ogImage ? ogImage.attr("content") : coverImg ? coverImg.attr("src") : ""
    );

    const metaDesc = doc.selectFirst('meta[name="description"]');
    const description = metaDesc ? metaDesc.attr("content").trim() : "";

    const genre = [];
    const tagEls = doc.select('a[href*="tags"]');
    for (let i = 0; i < tagEls.length; i++) {
      const t = tagEls[i].text.trim();
      if (t && !genre.includes(t)) genre.push(t);
    }

    const slugPart = (targetUrl.split("/hentai/")[1] || "").split("?")[0];
    const isEpisodePage = /-\d+$/.test(slugPart);
    const seriesSlug = slugPart.replace(/-\d+$/, "");
    const seriesPrefix = seriesSlug ? `${this.source.baseUrl}/hentai/${seriesSlug}-` : "";

    const rawEpisodes = [];
    const seenEp = {};

    if (isEpisodePage) {
      seenEp[targetUrl] = true;
      rawEpisodes.push({
        name: name || "Episode 1",
        url: targetUrl,
      });
    }

    const epCards = doc.select("div.group.w-full.p-1");
    for (let i = 0; i < epCards.length; i++) {
      const aEl = epCards[i].selectFirst("a");
      if (!aEl) continue;
      const epUrl = this.toAbsoluteUrl(aEl.attr("href") || aEl.getHref || "");
      if (
        !epUrl ||
        seenEp[epUrl] ||
        !epUrl.startsWith(this.source.baseUrl + "/hentai/") ||
        (seriesPrefix && !epUrl.startsWith(seriesPrefix))
      ) {
        continue;
      }

      const h3El = epCards[i].selectFirst("h3");
      const epName = (h3El ? h3El.text : aEl.text || "").trim();
      if (epName) {
        seenEp[epUrl] = true;
        rawEpisodes.push({
          name: epName,
          url: epUrl,
        });
      }
    }

    if (rawEpisodes.length === 0 && targetUrl.includes("/hentai/")) {
      rawEpisodes.push({
        name: name || "Episode 1",
        url: targetUrl,
      });
    }

    // Sort episodes by episode number ascending (1, 2, 3...)
    rawEpisodes.sort((a, b) => {
      const numA = parseInt((a.url.match(/-(\d+)$/) || [])[1] || "0", 10);
      const numB = parseInt((b.url.match(/-(\d+)$/) || [])[1] || "0", 10);
      return numA - numB;
    });

    // Guarantee clean "Episode N - Title" format so Mangayomi auto-numbering never fails
    const episodes = rawEpisodes.map((ep, idx) => {
      const m = ep.url.match(/-(\d+)$/);
      const epNum = m ? parseInt(m[1], 10) : idx + 1;
      const cleanName = ep.name ? `Episode ${epNum} - ${ep.name}` : `Episode ${epNum}`;
      return {
        name: cleanName,
        url: ep.url,
      };
    });

    return {
      name,
      imageUrl,
      description,
      genre,
      status: 1,
      episodes,
    };
  }

  extractCookies(headers) {
    if (!headers) return { cookieHeader: "", xsrfToken: "" };
    const rawCookie = headers["set-cookie"] || headers["Set-Cookie"] || "";
    if (!rawCookie) return { cookieHeader: "", xsrfToken: "" };

    const parts = Array.isArray(rawCookie)
      ? rawCookie
      : String(rawCookie).split(/,(?=[^;]+=[^;]+)/);
    const pairs = [];
    let xsrfToken = "";

    for (let i = 0; i < parts.length; i++) {
      const kv = parts[i].split(";")[0].trim();
      if (!kv) continue;
      pairs.push(kv);
      if (kv.startsWith("XSRF-TOKEN=")) {
        try {
          xsrfToken = decodeURIComponent(kv.substring("XSRF-TOKEN=".length));
        } catch (e) {
          xsrfToken = kv.substring("XSRF-TOKEN=".length);
        }
      }
    }

    return {
      cookieHeader: pairs.join("; "),
      xsrfToken,
    };
  }

  extractInputVal(doc, body, idOrName, isId) {
    const selector = isId ? `#${idOrName}` : `input[name="${idOrName}"]`;
    const el = doc.selectFirst(selector);
    if (el) {
      const val = el.attr("value") || el.attr("content") || "";
      if (val) return val;
    }
    if (body) {
      const attr = isId ? "id" : "name";
      const m1 = body.match(
        new RegExp(`${attr}=["']${idOrName}["'][^>]*value=["']([^"']+)["']`, "i")
      );
      if (m1) return m1[1];
      const m2 = body.match(
        new RegExp(`value=["']([^"']+)["'][^>]*${attr}=["']${idOrName}["']`, "i")
      );
      if (m2) return m2[1];
    }
    return "";
  }

  async getVideoList(url) {
    let targetUrl = this.toAbsoluteUrl(url);
    let res = await this.client.get(targetUrl, this.getHeaders());
    let doc = new Document(res.body);

    let episodeId = this.extractInputVal(doc, res.body, "e_id", true);

    if (!episodeId && targetUrl.includes("/hentai/") && !/-\d+$/.test(targetUrl)) {
      const ep1Url = `${targetUrl}-1`;
      const ep1Res = await this.client.get(ep1Url, this.getHeaders());
      const ep1Doc = new Document(ep1Res.body);
      const ep1Id = this.extractInputVal(ep1Doc, ep1Res.body, "e_id", true);
      if (ep1Id) {
        targetUrl = ep1Url;
        res = ep1Res;
        doc = ep1Doc;
        episodeId = ep1Id;
      }
    }

    if (!episodeId) {
      console.log("Hstream: e_id not found on " + targetUrl + " (may require login)");
      return [];
    }

    let csrfToken = this.extractInputVal(doc, res.body, "_token", false);
    if (!csrfToken) {
      const metaEl = doc.selectFirst('meta[name="csrf-token"]');
      if (metaEl) csrfToken = metaEl.attr("content") || "";
    }

    const { cookieHeader, xsrfToken } = this.extractCookies(res.headers);

    const apiHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: this.source.baseUrl,
      Referer: targetUrl,
      "User-Agent": this.getHeaders()["User-Agent"],
    };
    if (csrfToken) apiHeaders["X-CSRF-TOKEN"] = csrfToken;
    if (xsrfToken) apiHeaders["X-XSRF-TOKEN"] = xsrfToken;
    if (cookieHeader) apiHeaders["Cookie"] = cookieHeader;

    const apiUrl = `${this.source.baseUrl}/player/api`;
    let apiRes = await this.client.post(apiUrl, apiHeaders, {
      episode_id: String(episodeId),
    });

    if (!apiRes || apiRes.statusCode !== 200) {
      apiRes = await this.client.post(
        apiUrl,
        apiHeaders,
        JSON.stringify({ episode_id: String(episodeId) })
      );
    }

    console.log("Hstream player/api status:", apiRes ? apiRes.statusCode : "null");
    if (!apiRes || !apiRes.body) {
      return [];
    }

    let data = null;
    try {
      data = JSON.parse(apiRes.body);
    } catch (e) {
      console.log("Hstream player/api parse error:", apiRes.body.substring(0, 200));
      return [];
    }

    if (!data || !data.stream_url) {
      return [];
    }

    const streamPath = data.stream_url.replace(/^\/+|\/+$/g, "");
    const domains = []
      .concat(data.stream_domains || [])
      .concat(data.asia_stream_domains || []);

    const has4k =
      doc.selectFirst('a[href*="tags%5B0%5D=4k"], a[href*="tags[0]=4k"]') != null ||
      (res.body && res.body.includes("4K"));
    const resolutions = has4k ? ["2160", "1080", "720"] : ["1080", "720"];

    const streamHeaders = {
      Referer: `${this.source.baseUrl}/`,
      Origin: this.source.baseUrl,
      "User-Agent": this.getHeaders()["User-Agent"],
    };

    const videos = [];
    for (let i = 0; i < domains.length; i++) {
      const domain = (domains[i] || "").replace(/\/+$/, "");
      if (!domain) continue;

      const serverLabel = domain
        .replace(/^https?:\/\//, "")
        .split(".")[0];

      const subtitles = [
        {
          file: `${domain}/${streamPath}/eng.ass`,
          label: "English",
        },
      ];
      if (Array.isArray(data.extra_subtitles)) {
        for (let k = 0; k < data.extra_subtitles.length; k++) {
          const sub = data.extra_subtitles[k];
          if (sub && (sub.url || sub.file)) {
            subtitles.push({
              file: this.toAbsoluteUrl(sub.url || sub.file),
              label: sub.label || sub.lang || "Subtitle",
            });
          }
        }
      }

      for (let j = 0; j < resolutions.length; j++) {
        const resLabel = resolutions[j];
        const mpdUrl = `${domain}/${streamPath}/${resLabel}/manifest.mpd`;
        videos.push({
          url: mpdUrl,
          originalUrl: mpdUrl,
          quality: `${resLabel}p - ${serverLabel}`,
          headers: streamHeaders,
          subtitles,
        });
      }
    }

    return videos;
  }

  getFilterList() {
    return [
      {
        type_name: "SelectFilter",
        type: "sort",
        name: "Order",
        state: 2,
        values: [
          { type_name: "SelectOption", name: "A-Z", value: "az" },
          { type_name: "SelectOption", name: "Z-A", value: "za" },
          { type_name: "SelectOption", name: "Recently Uploaded", value: "recently-uploaded" },
          { type_name: "SelectOption", name: "Recently Released", value: "recently-released" },
          { type_name: "SelectOption", name: "Oldest Uploads", value: "oldest-uploads" },
          { type_name: "SelectOption", name: "Oldest Releases", value: "oldest-releases" },
          { type_name: "SelectOption", name: "View Count", value: "view-count" },
        ],
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
          { type_name: "CheckBox", name: "4K 48FPS", value: "4k-48fps" },
        ],
      },
    ];
  }

  getSourcePreferences() {
    return [];
  }
}
