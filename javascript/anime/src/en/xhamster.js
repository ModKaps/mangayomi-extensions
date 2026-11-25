const mangayomiSources = [
  {
    name: "xHamster",
    lang: "en",
    baseUrl: "https://xhamster.desi",
    apiUrl: "",
    iconUrl:
      "https://static.xhmediacdn.com/xh-desktop/images/favicon/favicon-v2-256x256.png?v=1",
    typeSource: "single",
    itemType: 1,
    isManga: false,
    isNsfw: true,
    version: "0.0.9",
    pkgPath: "anime/src/en/xhamster.js",
  },
];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
  }

  getBaseUrl() {
    return (this.source.baseUrl || "https://xhamster.desi").replace(/\/+$/, "");
  }

  normalizeUrl(url) {
    const base = this.getBaseUrl();
    const full = url.startsWith("http")
      ? url
      : `${base}/${url.replace(/^\/+/, "")}`;
    return full.replace(/([^:]\/)\/+/g, "$1");
  }

  getHeaders(referer) {
    return {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Referer: referer || this.getBaseUrl() + "/",
    };
  }

  decipherHex(hexStr) {
    if (!hexStr || hexStr.length < 12 || hexStr.length % 2 !== 0) return null;
    if (!/^[0-9a-fA-F]+$/.test(hexStr)) return null;

    const bytes = new Uint8Array(hexStr.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hexStr.substring(i * 2, i * 2 + 2), 16);
    }

    const algoId = bytes[0];
    let s =
      (bytes[1] |
        (bytes[2] << 8) |
        (bytes[3] << 16) |
        (bytes[4] << 24)) |
      0;

    const nextByte = () => {
      if (algoId === 1) {
        s = (Math.imul(s, 1664525) + 1013904223) | 0;
        return s & 0xff;
      }
      if (algoId === 2) {
        s = (s ^ (s << 13)) | 0;
        s = (s ^ (s >>> 17)) | 0;
        s = (s ^ (s << 5)) | 0;
        return s & 0xff;
      }
      if (algoId === 3) {
        s = (s + 0x9e3779b9) | 0;
        let t = (s ^ (s >>> 16)) | 0;
        t = Math.imul(t, 0x85ebca77 | 0);
        t = (t ^ (t >>> 13)) | 0;
        t = Math.imul(t, 0xc2b2ae3d | 0);
        t = (t ^ (t >>> 16)) | 0;
        return t & 0xff;
      }
      if (algoId === 4) {
        s = (s + 0x6d2b79f5) | 0;
        s = ((s << 7) | (s >>> 25)) | 0;
        s = (s + 0x9e3779b9) | 0;
        s = (s ^ (s >>> 11)) | 0;
        s = Math.imul(s, 0x27d4eb2d) | 0;
        return s & 0xff;
      }
      if (algoId === 5) {
        s = (s ^ (s << 7)) | 0;
        s = (s ^ (s >>> 9)) | 0;
        s = (s ^ (s << 8)) | 0;
        s = (s + (0xa5a5a5a5 | 0)) | 0;
        return s & 0xff;
      }
      return null;
    };

    let out = "";
    for (let i = 5; i < bytes.length; i++) {
      const k = nextByte();
      if (k === null) return null;
      out += String.fromCharCode(bytes[i] ^ k);
    }
    return out;
  }

  decipherUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") return null;
    const trimmed = rawUrl.trim();
    if (/^[0-9a-fA-F]{12,}$/.test(trimmed)) {
      return this.decipherHex(trimmed);
    }
    const pathMatch = /(?:^|\/)([0-9a-fA-F]{12,})([/,].+)$/.exec(trimmed);
    if (pathMatch) {
      const dec = this.decipherHex(pathMatch[1]);
      if (dec) {
        return trimmed.replace(pathMatch[1], dec);
      }
    }
    return trimmed;
  }

  parseInitials(html) {
    try {
      const match = /window\.initials\s*=\s*\{/.exec(html);
      if (!match) return null;
      const startIdx = match.index + match[0].length - 1;
      let depth = 0;
      let inString = false;
      let escape = false;

      for (let i = startIdx; i < html.length; i++) {
        const ch = html[i];
        if (inString) {
          if (escape) {
            escape = false;
          } else if (ch === "\\") {
            escape = true;
          } else if (ch === '"') {
            inString = false;
          }
          continue;
        }
        if (ch === '"') {
          inString = true;
        } else if (ch === "{") {
          depth++;
        } else if (ch === "}") {
          depth--;
          if (depth === 0) {
            return JSON.parse(html.substring(startIdx, i + 1));
          }
        }
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  parseResolutionRank(label, url) {
    const m1 = /(\d{3,4})[pP]/.exec(label || "");
    if (m1) return parseInt(m1[1], 10);
    const m2 = /[._/](\d{3,4})[pP][._/]/.exec(url || "");
    if (m2) return parseInt(m2[1], 10);
    return 0;
  }

  detectCodec(codecHint, url) {
    const combined = `${codecHint || ""} ${url || ""}`.toLowerCase();
    if (combined.includes("av1") || combined.includes("av01")) return "AV1";
    if (combined.includes("vp9") || combined.includes("vp09")) return "VP9";
    if (combined.includes("hevc") || combined.includes("h265") || combined.includes("hvc1")) return "HEVC";
    return "H.264";
  }

  parseVideoList(html) {
    const doc = new Document(html);
    const items = doc.select(".video-thumb--type-video");
    const list = [];

    for (const item of items) {
      const linkEl =
        item.selectFirst("a.video-thumb-info__name") ||
        item.selectFirst("a.video-thumb__image-container");
      if (!linkEl) continue;

      let href = linkEl.attr("href") || "";
      if (!href) continue;
      href = this.normalizeUrl(href);

      const name = (linkEl.text || "").trim();
      const imgEl = item.selectFirst("img");
      const imageUrl = imgEl
        ? imgEl.attr("src") || imgEl.attr("data-src") || ""
        : "";

      if (name && href) {
        list.push({
          name,
          link: href,
          imageUrl,
        });
      }
    }

    const nextBtn = doc.selectFirst(
      'a[data-page="next"], link[rel="next"], .pager-section a.next'
    );
    const hasNextPage = nextBtn !== null || list.length >= 20;

    return {
      list,
      hasNextPage,
    };
  }

  async getPopular(page) {
    const base = this.getBaseUrl();
    const url =
      page > 1 ? `${base}/best/weekly/${page}` : `${base}/best/weekly`;
    const res = await this.client.get(url, this.getHeaders());
    return this.parseVideoList(res.body);
  }

  async getLatestUpdates(page) {
    const base = this.getBaseUrl();
    const url = page > 1 ? `${base}/newest/${page}` : `${base}/newest`;
    const res = await this.client.get(url, this.getHeaders());
    return this.parseVideoList(res.body);
  }

  async search(query, page, filters) {
    const base = this.getBaseUrl();
    let url = "";
    const trimmed = (query || "").trim();

    if (trimmed) {
      const encoded = encodeURIComponent(trimmed);
      url = `${base}/search/${encoded}?page=${page}`;
    } else if (filters && filters.length > 0) {
      const sortFilter = filters[0];
      const selected =
        sortFilter.values && sortFilter.values[sortFilter.state]
          ? sortFilter.values[sortFilter.state].value
          : "best/weekly";
      url = page > 1 ? `${base}/${selected}/${page}` : `${base}/${selected}`;
    } else {
      return await this.getPopular(page);
    }

    const res = await this.client.get(url, this.getHeaders());
    return this.parseVideoList(res.body);
  }

  async getDetail(url) {
    const targetUrl = this.normalizeUrl(url);
    const res = await this.client.get(targetUrl, this.getHeaders());
    const html = res.body;
    const doc = new Document(html);
    const initials = this.parseInitials(html);

    const videoModel = initials && initials.videoModel ? initials.videoModel : {};
    const tagsList =
      initials &&
      initials.videoTagsComponent &&
      Array.isArray(initials.videoTagsComponent.tags)
        ? initials.videoTagsComponent.tags
        : [];

    const name =
      videoModel.title ||
      (doc.selectFirst('meta[property="og:title"]')
        ? doc.selectFirst('meta[property="og:title"]').attr("content")
        : "") ||
      "Untitled";

    const imageUrl =
      videoModel.thumbURL ||
      (doc.selectFirst('meta[property="og:image"]')
        ? doc.selectFirst('meta[property="og:image"]').attr("content")
        : "");

    const description =
      videoModel.description ||
      (doc.selectFirst('meta[property="og:description"]')
        ? doc.selectFirst('meta[property="og:description"]').attr("content")
        : "");

    const author =
      videoModel.author && videoModel.author.name ? videoModel.author.name : "";

    const genre = tagsList
      .filter((t) => t && t.name && !t.isUser)
      .map((t) => t.name);

    const dateUpload = videoModel.created
      ? String(videoModel.created * 1000)
      : null;

    const episodes = [
      {
        name: "Watch / Download Video",
        url: targetUrl,
        dateUpload,
      },
    ];

    return {
      name,
      link: targetUrl,
      imageUrl,
      description,
      author,
      genre,
      status: 1,
      episodes,
      chapters: episodes,
    };
  }

  async getVideoList(url) {
    const base = this.getBaseUrl();
    const targetUrl = this.normalizeUrl(url);
    const pageHeaders = this.getHeaders(targetUrl);
    const cdnHeaders = this.getHeaders(base + "/");
    const res = await this.client.get(targetUrl, pageHeaders);
    const html = res.body;
    const doc = new Document(html);
    const initials = this.parseInitials(html);

    const mp4Videos = [];
    const hlsVideos = [];
    const seenUrls = new Set();
    const subtitles = [];

    const addMp4 = (rawUrl, qualityLabel, codecHint = "") => {
      const decoded = this.decipherUrl(rawUrl);
      if (!decoded || typeof decoded !== "string") return;
      if (decoded.includes(".m3u8")) return;
      const full = decoded.startsWith("//")
        ? "https:" + decoded
        : decoded.startsWith("/")
          ? base + decoded
          : decoded;
      if (!full.startsWith("http") || seenUrls.has(full)) return;
      seenUrls.add(full);

      const rank = this.parseResolutionRank(qualityLabel, full);
      const codec = this.detectCodec(codecHint, full);
      const codecScore = codec === "H.264" ? 2 : codec === "HEVC" ? 1 : 0;
      const cleanLabel =
        rank > 0 ? `${rank}p (MP4 ${codec})` : `${qualityLabel || "MP4"} (${codec})`;

      mp4Videos.push({
        url: full,
        originalUrl: full,
        quality: cleanLabel,
        headers: pageHeaders,
        subtitles,
        _rank: rank,
        _codecScore: codecScore,
      });
    };

    if (
      initials &&
      initials.xplayerSettings &&
      initials.xplayerSettings.subtitles &&
      Array.isArray(initials.xplayerSettings.subtitles.tracks)
    ) {
      for (const track of initials.xplayerSettings.subtitles.tracks) {
        if (track && track.urls && track.urls.vtt) {
          subtitles.push({
            file: track.urls.vtt,
            label: track.label || track.lang || "Subtitles",
          });
        }
      }
    }

    // 1. Direct MP4s from window.initials.videoModel.sources
    const modelSources =
      initials && initials.videoModel && initials.videoModel.sources
        ? initials.videoModel.sources
        : null;
    if (modelSources && typeof modelSources === "object") {
      for (const [formatId, formatsMap] of Object.entries(modelSources)) {
        if (formatId === "download" || !formatsMap) continue;
        if (Array.isArray(formatsMap)) {
          for (const item of formatsMap) {
            if (item && typeof item === "object") {
              addMp4(item.url || item.fallback, item.quality || item.label, formatId);
            }
          }
        } else if (typeof formatsMap === "object") {
          for (const [qKey, qVal] of Object.entries(formatsMap)) {
            if (typeof qVal === "string") {
              addMp4(qVal, qKey, formatId);
            } else if (qVal && typeof qVal === "object") {
              addMp4(qVal.url || qVal.fallback || qVal.link, qVal.quality || qKey, formatId);
            }
          }
        }
      }
    }

    // 2. Direct MP4s from window.initials.xplayerSettings.sources.standard
    const standardSources =
      initials &&
      initials.xplayerSettings &&
      initials.xplayerSettings.sources &&
      initials.xplayerSettings.sources.standard
        ? initials.xplayerSettings.sources.standard
        : null;
    if (standardSources && typeof standardSources === "object") {
      for (const [codecKey, formatsList] of Object.entries(standardSources)) {
        if (Array.isArray(formatsList)) {
          for (const item of formatsList) {
            if (!item || typeof item !== "object") continue;
            const qLabel = item.quality || item.label || codecKey;
            addMp4(item.url, qLabel, codecKey);
            addMp4(item.fallback, qLabel, codecKey);
          }
        } else if (formatsList && typeof formatsList === "object") {
          for (const [qKey, qVal] of Object.entries(formatsList)) {
            if (typeof qVal === "string") {
              addMp4(qVal, qKey, codecKey);
            } else if (qVal && typeof qVal === "object") {
              addMp4(qVal.url || qVal.fallback, qVal.quality || qKey, codecKey);
            }
          }
        }
      }
    }

    // 3. Fallback MP4 from <noscript><video src="..."></noscript>
    const noscriptVideo = doc.selectFirst("noscript video");
    if (noscriptVideo) {
      const mp4Url = noscriptVideo.attr("src");
      if (mp4Url) addMp4(mp4Url, "", "h264");
    }

    mp4Videos.sort((a, b) => b._rank - a._rank || b._codecScore - a._codecScore);

    // Verify top MP4 isn't returning 403 ("Wrong key") to prevent MDownloaderException
    let validMp4Videos = mp4Videos;
    let mp4Status = "none";
    if (mp4Videos.length > 0) {
      try {
        const probe = await this.client.get(mp4Videos[0].url, {
          ...pageHeaders,
          Range: "bytes=0-1",
        });
        mp4Status = String(probe.statusCode);
        if (probe.statusCode >= 400) {
          validMp4Videos = [];
        }
      } catch (_) {
        mp4Status = "err";
        validMp4Videos = [];
      }
    }

    const videos = validMp4Videos.map(({ _rank, _codecScore, ...rest }) => rest);

    // 4. HLS streams (deciphered if needed; H.264 prioritized over AV1)
    const hlsLink = doc.selectFirst('link[rel="preload"][href*=".m3u8"]');
    const hlsSettings =
      initials &&
      initials.xplayerSettings &&
      initials.xplayerSettings.sources &&
      initials.xplayerSettings.sources.hls
        ? initials.xplayerSettings.sources.hls
        : null;

    const m3u8Candidates = [];
    const pushCandidate = (raw) => {
      const u = this.decipherUrl(raw);
      if (u && typeof u === "string" && u.startsWith("http") && !m3u8Candidates.includes(u)) {
        m3u8Candidates.push(u);
      }
    };

    if (hlsSettings && typeof hlsSettings === "object") {
      pushCandidate(hlsSettings.h264?.url);
      pushCandidate(hlsSettings.h264?.fallback);
      pushCandidate(hlsSettings.url);
      pushCandidate(hlsSettings.fallback);
      pushCandidate(hlsSettings.av1?.url);
    }
    if (hlsLink && hlsLink.attr("href")) {
      pushCandidate(hlsLink.attr("href"));
    }

    for (const m3u8Url of m3u8Candidates) {
      try {
        const m3u8Res = await this.client.get(m3u8Url, cdnHeaders);
        const lines = m3u8Res.body.split("\n");
        const basePrefix = m3u8Url.substring(0, m3u8Url.lastIndexOf("/") + 1);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith("#EXT-X-STREAM-INF")) {
            const resMatch = line.match(/RESOLUTION=\d+x(\d+)/);
            const codecsMatch = line.match(/CODECS="([^"]+)"/i);
            const nextLine = (lines[i + 1] || "").trim();
            if (nextLine && !nextLine.startsWith("#")) {
              const streamUrl = nextLine.startsWith("http")
                ? nextLine
                : basePrefix + nextLine;
              if (!seenUrls.has(streamUrl)) {
                seenUrls.add(streamUrl);
                const rank = resMatch
                  ? parseInt(resMatch[1], 10)
                  : this.parseResolutionRank("", streamUrl);
                const codec = this.detectCodec(
                  codecsMatch ? codecsMatch[1] : "",
                  streamUrl
                );
                const codecScore = codec === "H.264" ? 2 : codec === "HEVC" ? 1 : 0;
                const quality =
                  rank > 0 ? `${rank}p (HLS ${codec})` : `HLS (${codec})`;
                hlsVideos.push({
                  url: streamUrl,
                  originalUrl: streamUrl,
                  quality,
                  headers: cdnHeaders,
                  subtitles,
                  _rank: rank,
                  _codecScore: codecScore,
                });
              }
            }
          }
        }
      } catch (_) {
        // Ignore variant parsing errors
      }
    }

    if (hlsVideos.length === 0 && m3u8Candidates.length > 0) {
      const fallbackM3u8 = m3u8Candidates[0];
      if (!seenUrls.has(fallbackM3u8)) {
        hlsVideos.push({
          url: fallbackM3u8,
          originalUrl: fallbackM3u8,
          quality: "Auto (HLS)",
          headers: cdnHeaders,
          subtitles,
          _rank: 0,
          _codecScore: 0,
        });
      }
    }

    hlsVideos.sort((a, b) => b._codecScore - a._codecScore || b._rank - a._rank);
    for (const { _rank, _codecScore, ...rest } of hlsVideos) {
      videos.push(rest);
    }

    console.log(
      `[xHamster] mp4Status=${mp4Status}, validMp4=${validMp4Videos.length}, hls=${hlsVideos.length}`
    );
    return videos;
  }

  getFilterList() {
    return [
      {
        type_name: "SelectFilter",
        name: "Category / Sort",
        state: 0,
        values: [
          { type_name: "SelectOption", name: "Best Weekly", value: "best/weekly" },
          { type_name: "SelectOption", name: "Newest", value: "newest" },
          { type_name: "SelectOption", name: "HD", value: "hd" },
          { type_name: "SelectOption", name: "Indian", value: "categories/indian" },
          { type_name: "SelectOption", name: "Amateur", value: "categories/amateur" },
        ],
      },
    ];
  }
}
