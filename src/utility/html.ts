import {
  escapeHtmlAttribute,
  isMentionType,
  parseMentionId,
  pathForMention,
} from '@/mention';

const FORMATTING_TAGS = new Set(['b', 'strong', 'i', 'em', 'u']);
const DISCARDED_TAGS = 'script, style, textarea, option, noscript, template';

const parse = (html: string) => {
  const { body } = new DOMParser().parseFromString(html, 'text/html');
  body.querySelectorAll(DISCARDED_TAGS).forEach(node => node.remove());
  return body;
};

const serialize = (node: Node, preserveMentions: boolean): string => {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtmlAttribute(node.textContent ?? '');
  }
  if (!(node instanceof Element)) { return ''; }
  const children = [...node.childNodes]
    .map(child => serialize(child, preserveMentions))
    .join('');
  const tag = node.tagName.toLowerCase();
  if (tag === 'br') { return '<br />'; }
  if (FORMATTING_TAGS.has(tag)) {
    return `<${tag}>${children}</${tag}>`;
  }
  if (tag === 'a') {
    const href = node.getAttribute('href')?.trim() ?? '';
    const safeHref = /^https:/i.test(href)
      ? ` href="${escapeHtmlAttribute(href)}"`
      : '';
    return `<a${safeHref} target="_blank">${children}</a>`;
  }
  // Mentions without a valid id fall back to their plain text title
  const id = parseMentionId(node.getAttribute('id'));
  if (isMentionType(tag) && id) {
    return preserveMentions
      ? `<${tag} id="${escapeHtmlAttribute(id)}">${children}</${tag}>`
      : `<a href="${escapeHtmlAttribute(pathForMention({ type: tag, id }))}">` +
        `${children}</a>`;
  }
  return children;
};

const sanitizeFormattedHtml = (text: string, preserveMentions: boolean) =>
  serialize(parse(text.replace(/\r\n|\n|\r/g, '<br />')), preserveMentions);

export const safelyParseFormattedHtml = (text: string) =>
  sanitizeFormattedHtml(text, false);

export type FormattedHtmlNode = string | {
  tag: string
  attributes: Record<string, string>
  children: FormattedHtmlNode[]
};

const convertDomNodes = (nodes: NodeListOf<ChildNode>): FormattedHtmlNode[] =>
  [...nodes].flatMap((node): FormattedHtmlNode[] =>
    node.nodeType === Node.TEXT_NODE
      ? [node.textContent ?? '']
      : node instanceof Element
        ? [{
          tag: node.tagName.toLowerCase(),
          attributes: Object.fromEntries(
            [...node.attributes].map(({ name, value }) => [name, value])),
          children: convertDomNodes(node.childNodes),
        }]
        : []);

// Sanitized formatting with mentions preserved for rendering as entities
export const safelyParseFormattedHtmlNodes = (text: string) =>
  convertDomNodes(parse(sanitizeFormattedHtml(text, true)).childNodes);

export const htmlToPlainText = (html: string) =>
  (parse(html.replace(/<br\s*\/?>/gi, ' ')).textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim();

// Matches two or more <br> or <br /> tags in a row
export const htmlHasBrParagraphBreaks = (text: string) =>
  /(<br\s*\/?>){2}/i.test(text);
