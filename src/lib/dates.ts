const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "2022-08" → "Aug 2022"; "2024" → "2024".
export function shortDate(when: string): string {
  const [y, m] = when.split('-');
  return m ? `${MONTHS[Number(m) - 1]} ${y}` : y;
}

// "2026-10" → "October 2026".
export function longDate(when: string): string {
  const [y, m] = when.split('-');
  return m ? `${LONG[Number(m) - 1]} ${y}` : y;
}
