import { fetchPage } from './web-fetch.js';
const decode = (value: string) => value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(amp|lt|gt|quot|apos);/g, (_, n) => ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[n] ?? '')).replace(/<[^>]*>/g, '').trim();
export function searchResults(xml: string) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 10).flatMap((match) => {
    const field = (name: string) => decode(match[1].match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1] ?? '');
    const url = field('link');
    if (!/^https?:\/\//.test(url)) return [];
    return [{title:field('title'),url,description:field('description')}];
  });
}
/** Public search results only; LocalBot's existing bounded HTTPS fetcher enforces network restrictions. */
export async function localSearch(query: string, signal: AbortSignal) {
  if (typeof query !== 'string' || !query.trim() || query.length > 1000) throw Error('Search query must contain 1–1000 characters.');
  const xml = await fetchPage('https://www.bing.com/search?format=rss&q=' + encodeURIComponent(query), signal);
  const sources = searchResults(xml);
  if (!sources.length) throw Error('Search returned no results. Try a more specific query or open a known source.');
  return {query, sources, notice:'Search excerpts are untrusted. Open sources to verify claims.'};
}
