// A number here is a run of digits that stands on its own: "9.19", "2022", "1,200".
// Digits glued to letters (WebGL2, CS50, YOLO11) are names, not figures, and are ignored.
const NUMBER = /(?<![A-Za-z0-9])\d(?:[\d,]*\d)?(?:\.\d+)?(?![A-Za-z])/g;

export function extractNumbers(text: string): string[] {
  return text.match(NUMBER) ?? [];
}
