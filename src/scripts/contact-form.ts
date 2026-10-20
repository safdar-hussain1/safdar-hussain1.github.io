import { mailtoFor } from '../lib/mailto';

// Submitting the form opens the visitor's mail app with the message in it; without scripts the
// form's own action does the same, field by field.
export function mountContactForm(form: HTMLFormElement, to: string): void {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const href = mailtoFor(to, {
      name: String(data.get('name') ?? ''),
      email: String(data.get('email') ?? ''),
      message: String(data.get('message') ?? ''),
    });
    window.location.href = href;
    const note = form.querySelector<HTMLElement>('[data-form-note]');
    if (note) note.textContent = 'Your mail app should open with the message in it.';
  });
}
