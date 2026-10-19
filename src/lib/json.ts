// JSON for a <script type="application/json"> block. The characters that could end the
// block or open a tag are escaped, so the data can never break out of the script element.
export function jsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/ /g, '\\u2028')
    .replace(/ /g, '\\u2029');
}
