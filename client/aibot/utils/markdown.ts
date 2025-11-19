import { marked, Renderer, Tokens } from "marked";
import hljs from "highlight.js";

marked.use({
  renderer: {
    code(this: Renderer, { text, lang, escaped }: Tokens.Code): string | false {
      const language = (lang || "").trim();

      if (language && hljs.getLanguage(language)) {
        return `<pre><code class="hljs language-${language}">` +
          hljs.highlight(text, { language }).value +
          "</code></pre>";
      }

      return `<pre><code class="hljs">` + hljs.highlightAuto(text).value + "</code></pre>";
    }
  },
  gfm: true,
  breaks: true,
});

export async function renderMarkdown(markdownText: string): Promise<string> {
  return await marked.parse(markdownText);
}
