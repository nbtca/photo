const FORMATTING_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U']);
const DISCARDED_TAGS = 'script, style, textarea, option, noscript, template';

const escape = (text: string) => text
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const parse = (html: string) => {
  const { body } = new DOMParser().parseFromString(html, 'text/html');
  body.querySelectorAll(DISCARDED_TAGS).forEach(node => node.remove());
  return body;
};

const serialize = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) {
    return escape(node.textContent ?? '');
  }
  if (!(node instanceof Element)) { return ''; }
  const children = [...node.childNodes].map(serialize).join('');
  const tag = node.tagName.toLowerCase();
  if (tag === 'br') { return '<br />'; }
  if (FORMATTING_TAGS.has(node.tagName)) {
    return `<${tag}>${children}</${tag}>`;
  }
  if (tag === 'a') {
    const href = node.getAttribute('href') ?? '';
    const safeHref = /^https:/i.test(href.trim())
      ? ` href="${escape(href.trim())}"`
      : '';
    return `<a${safeHref} target="_blank">${children}</a>`;
  }
  return children;
};

export const safelyParseFormattedHtml = (text: string) =>
  serialize(parse(text.replace(/\r\n|\n|\r/g, '<br />')));

export const htmlToPlainText = (html: string) =>
  (parse(html.replace(/<br\s*\/?>/gi, ' ')).textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim();

// Matches two or more <br> or <br /> tags in a row
export const htmlHasBrParagraphBreaks = (text: string) =>
  /(<br\s*\/?>){2}/i.test(text);
