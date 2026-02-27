import { convert } from "html-to-text";
import type { ArticleDocument } from "../core/types.js";

const REQUEST_TIMEOUT_MS = 8000;

export class ArticleService {
  public async render(url: string): Promise<ArticleDocument> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "user-agent": "hnclient/0.1 (+terminal)"
        }
      });
      if (!res.ok) {
        return {
          title: "Article unavailable",
          url,
          body: `Could not load article. HTTP ${res.status}.`,
          status: "fallback"
        };
      }

      const html = await res.text();
      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
      const title = titleMatch?.[1]?.trim() || "Untitled";

      const body = convert(html, {
        wordwrap: 100,
        selectors: [
          { selector: "a", options: { ignoreHref: false } },
          { selector: "img", format: "skip" }
        ]
      });

      return {
        title,
        url,
        body,
        status: "ok"
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      return {
        title: "Article unavailable",
        url,
        body: `Could not load article in-terminal: ${message}`,
        status: "fallback"
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
