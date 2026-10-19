// Copy a string, or select it so the visitor can copy it themselves where the clipboard is refused.
export async function copyText(text: string, fallbackNode?: Node): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (fallbackNode && typeof getSelection === 'function') {
      const range = document.createRange();
      range.selectNodeContents(fallbackNode);
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    return false;
  }
}
