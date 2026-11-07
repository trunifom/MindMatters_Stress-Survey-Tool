/**
 * Small DOM helpers.
 *
 * SAFETY RULE: catalog text is always inserted as text (textContent / Text
 * nodes), never as HTML. This module therefore offers no way to pass HTML, and a
 * test forbids innerHTML, outerHTML, insertAdjacentHTML, document.write and eval
 * anywhere under src/ui (T41).
 */

export type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  /** Event handlers by event name, e.g. { click: fn }. */
  on?: Record<string, (ev: Event) => void>;
  /** Everything else becomes an attribute; false/null/undefined omit it, true sets an empty attribute. */
  [attr: string]: unknown;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === false || value === null || value === undefined) continue;
      if (key === "class") el.className = String(value);
      else if (key === "on") {
        for (const [ev, fn] of Object.entries(value as Record<string, (e: Event) => void>)) el.addEventListener(ev, fn);
      } else if (key === "checked" || key === "disabled" || key === "selected" || key === "readOnly") {
        (el as unknown as Record<string, unknown>)[key] = Boolean(value);
      } else if (key === "value") {
        (el as unknown as { value: string }).value = String(value);
      } else el.setAttribute(key, value === true ? "" : String(value));
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
  }
}

export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Only absolute http(s) URLs are ever turned into links; javascript:, data: etc. never are. */
export function safeHttpUrl(url: string | undefined): string | undefined {
  return url && /^https?:\/\/\S+$/i.test(url.trim()) ? url.trim() : undefined;
}

/**
 * A link opened only by the user's click, in a new tab, without referrer or opener.
 * If the URL is not http(s), plain text is returned instead of a link.
 */
export function externalLink(url: string | undefined, label: string): Node {
  const safe = safeHttpUrl(url);
  if (!safe) return document.createTextNode(label);
  return h("a", { href: safe, target: "_blank", rel: "noopener noreferrer" }, label);
}

/**
 * Plain text to DOM: paragraphs are separated by a blank line, consecutive lines
 * starting with "- " become a list. No HTML is interpreted (spec: note items).
 */
export function richText(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const block of text.split(/\r?\n\s*\r?\n/)) {
    const lines = block.split(/\r?\n/).filter((l) => l.trim() !== "");
    let list: HTMLUListElement | null = null;
    let para: string[] = [];
    const flushPara = () => {
      if (para.length) frag.appendChild(h("p", { class: "rt-p" }, para.join("\n")));
      para = [];
    };
    for (const line of lines) {
      const m = /^\s*-\s+(.*)$/.exec(line);
      if (m) {
        flushPara();
        if (!list) {
          list = h("ul", { class: "rt-ul" });
          frag.appendChild(list);
        }
        list.appendChild(h("li", null, m[1] as string));
      } else {
        list = null;
        para.push(line);
      }
    }
    flushPara();
  }
  return frag;
}

/** Offer a text as a file download (no server, no storage). */
export function downloadText(fileName: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: fileName, class: "visually-hidden" });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Offer binary content (for example a ZIP package) as a download. */
export function downloadBytes(fileName: string, bytes: Uint8Array, mime: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: fileName, class: "visually-hidden" });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read a user-selected file as text (FileReader works in every browser). */
export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error ?? new Error("file could not be read"));
    r.readAsText(file, "utf-8");
  });
}
