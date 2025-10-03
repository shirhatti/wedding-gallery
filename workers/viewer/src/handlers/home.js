// Home page handler
import { getPageHTML } from '../templates/gallery';

export function handleHomePage() {
  const html = getPageHTML();
  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}
