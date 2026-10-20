// The contact form has no server: it opens the visitor's own mail app with the message filled
// in. The address is the site's, the subject names the sender, and nothing is sent anywhere else.
export function mailtoFor(to: string, fields: { name: string; email: string; message: string }): string {
  const name = fields.name.trim();
  const from = fields.email.trim();
  const message = fields.message.trim();
  const subject = name ? `Hello from ${name}` : 'Hello from your portfolio';
  const signature = [name ? `— ${name}` : '', from].filter(Boolean).join('\n');
  const body = signature ? `${message}\n\n${signature}` : message;
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
