import DOMPurify from 'dompurify';

/** Keep UI HTML/SVG, but remove executable markup before inserting it into the DOM. */
export function setSafeHtml(target: Element, markup: string): void {
  const fragment = DOMPurify.sanitize(markup, {
    RETURN_DOM_FRAGMENT: true,
    USE_PROFILES: { html: true, svg: true },
    FORBID_TAGS: ['style', 'foreignObject', 'animate', 'animateMotion', 'animateTransform', 'set'],
    // Existing UI IDs are queried by the components after rendering.
    SANITIZE_DOM: true,
  });
  target.replaceChildren(fragment);
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]!));
}
