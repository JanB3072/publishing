// 轻量 Markdown → HTML，供编写页实时预览使用。
// 先转义 HTML 再替换语法，且对链接/图片地址做白名单校验，避免注入。

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[c];
  });
}

function safeUrl(raw: string): string {
  const u = raw.trim();
  if (/^(https?:\/\/|\/|\.\/|#|data:image\/(png|jpe?g|gif|webp|svg\+xml);)/i.test(u)) return u;
  return '#';
}

function inline(src: string): string {
  let t = escapeHtml(src);
  t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => `<img src="${safeUrl(url)}" alt="${alt}" />`);
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => `<a href="${safeUrl(url)}" target="_blank" rel="noreferrer">${text}</a>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  return t;
}

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  let list: 'ul' | 'ol' | null = null;
  let inCode = false;
  let codeLines: string[] = [];

  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  const flushCode = () => {
    if (inCode) out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    inCode = false;
    codeLines = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      closeList();
      if (inCode) flushCode();
      else {
        inCode = true;
        codeLines = [];
      }
      i++;
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      i++;
      continue;
    }
    if (!line.trim()) {
      closeList();
      i++;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      closeList();
      const lv = heading[1].length;
      out.push(`<h${lv}>${inline(heading[2])}</h${lv}>`);
      i++;
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      closeList();
      out.push('<hr />');
      i++;
      continue;
    }

    const ul = /^\s*[-*+]\s+(.+)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (ul || ol) {
      const want: 'ul' | 'ol' = ul ? 'ul' : 'ol';
      if (list !== want) {
        closeList();
        out.push(`<${want}>`);
        list = want;
      }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
      i++;
      continue;
    }

    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      closeList();
      out.push(`<blockquote>${inline(quote[1])}</blockquote>`);
      i++;
      continue;
    }

    // 连续普通行合并为一段，换行用 <br>
    closeList();
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s/.test(lines[i]) && !/^\s*[-*+]\s/.test(lines[i]) && !/^\s*\d+[.)]\s/.test(lines[i]) && !/^\s*>/.test(lines[i]) && !lines[i].trim().startsWith('```')) {
      paragraph.push(inline(lines[i]));
      i++;
    }
    if (paragraph.length) out.push(`<p>${paragraph.join('<br />')}</p>`);
  }

  closeList();
  flushCode();
  return out.join('\n');
}

export function wordCount(src: string): number {
  const cjk = (src.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const words = (src.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[A-Za-z0-9]+/g) ?? []).length;
  return cjk + words;
}

export function readingMinutes(src: string): number {
  return Math.max(1, Math.ceil(wordCount(src) / 400));
}
