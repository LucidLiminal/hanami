const DEFAULT_BASE = 'https://olympusxyz.com';
const BASE = (process.env.OLYMPUS_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
const PANEL = (process.env.OLYMPUS_PANEL_URL || 'https://panel.olympusxyz.com').replace(/\/$/, '');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36 Hanami/1.1';
const pageHeaders = { Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', 'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9,en;q=0.6' };
const apiHeaders = { Accept: 'application/json,*/*', Origin: BASE, Referer: BASE + '/', 'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9,en;q=0.6', 'Cache-Control': 'no-cache' };
const decode = s => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const strip = s => decode(String(s || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, 'i')) || [])[1] || '';
const absolute = (value, base = BASE) => { try { return value ? new URL(decode(value), base).href : ''; } catch { return ''; } };
const cleanTitle = value => { let title = strip(value).replace(/^content\s*=\s*[\"']?/i, '').replace(/[\"']\s*\/?\s*>?\s*$/i, '').trim(); title = title.replace(/\s*(?:\||[-–—])\s*Olympus(?:\s+Scanlation)?\s*$/i, '').trim(); return title; };
const meta = (html, key) => (html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)`, 'i')) || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, 'i')) || [])[1] || '';

function links(html, base) { const out = []; for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) { const tag = '<a ' + m[1] + '>', href = absolute(attr(tag, 'href'), base); if (href) out.push({ href, tag, inner: m[2], text: strip(m[2]) }); } return out; }
function image(inner, base) { const tag = (inner.match(/<img\b[^>]*>/i) || [])[0] || ''; return absolute(attr(tag, 'data-src') || attr(tag, 'data-lazy-src') || attr(tag, 'src'), base); }
function titleOf(link) { const img = (link.inner.match(/<img\b[^>]*>/i) || [])[0] || ''; return strip(attr(link.tag, 'title') || attr(link.tag, 'aria-label') || attr(img, 'alt') || link.text); }
function isSeries(url) { try { return /^\/series\/[^/]+\/?$/i.test(new URL(url).pathname); } catch { return false; } }
function genreValues(value) { const out = new Set(), add = raw => { const values = Array.isArray(raw) ? raw : String(raw || '').split(/[,|;/]/); for (const item of values) { const name = strip(typeof item === 'object' ? item.name || item.title || item.label || item.value || '' : item); if (name && name.length < 80 && !/^(géneros?|genres?|categorías?|tags?)$/i.test(name)) out.add(name); } }; const seen = new Set(), walk = (node, key = '') => { if (node == null) return; if (/^(?:genre|genres|genero|generos|género|géneros|genrelist|comicgenres|mangagenres)$/i.test(String(key).replace(/[_-]/g, ''))) add(node); if (typeof node !== 'object' || seen.has(node)) return; seen.add(node); for (const [k, child] of Object.entries(node)) walk(child, k); }; walk(value); return [...out]; }
function genreList(html, base) { const out = new Set(), add = value => genreValues({ genre: value }).forEach(x => out.add(x)); for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:article:tag|genre|genres)["'][^>]+content=["']([^"']+)/gi)) add(m[1]); for (const l of links(html, base)) { let path = ''; try { path = new URL(l.href).pathname; } catch {} if (/\/(?:generos?|genres?)\//i.test(path) || /(?:genre|genero)/i.test(attr(l.tag, 'class') + ' ' + attr(l.tag, 'rel'))) add(l.text); } for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) try { genreValues(JSON.parse(decode(m[1]))).forEach(x => out.add(x)); } catch {} const embedded = decode(html).replace(/\\u0022/g, '"').replace(/\\"/g, '"').replace(/&quot;/g, '"'); for (const m of embedded.matchAll(/["'](?:genre|genres|genero|generos|género|géneros|genre_list|comic_genres|manga_genres)["']\s*:\s*\[([\s\S]*?)\]/gi)) { const block = m[1]; for (const x of block.matchAll(/["'](?:name|title|label|value)["']\s*:\s*["']([^"']+)|["']([^"'{}\[\]]+)["']/gi)) add(x[1] || x[2]); } const section = html.match(/(?:géneros?|genres?)\s*:?\s*<\/[^>]+>([\s\S]{0,1600}?)(?=<h[1-6]\b|<\/section|<\/article)/i)?.[1] || ''; for (const l of links(section, base)) add(l.text); return [...out]; }
function seriesFrom(html, base) { const seen = new Set(), items = []; for (const l of links(html, base)) { if (!isSeries(l.href) || seen.has(l.href)) continue; const title = cleanTitle(titleOf(l)); if (!title || /^(inicio|series|leer|ver|más|more)$/i.test(title)) continue; seen.add(l.href); items.push({ id: new URL(l.href).pathname.replace(/\/$/, ''), url: l.href, title, thumbnailUrl: image(l.inner, base) || null }); } return items; }
function searchText(value) { return String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function searchScore(item, query) { const q = searchText(query), title = searchText(item?.name), slug = searchText(item?.slug); if (!q) return 0; if (title === q) return 0; if (title.startsWith(q)) return 1; if (title.includes(q)) return 2; const words = q.split(/\s+/).filter(Boolean), haystack = `${title} ${slug}`; if (words.every(word => haystack.includes(word))) return 3 + Math.max(0, title.length - q.length) / 1000; return Infinity; }
function seriesListItem(item) { if (!item || typeof item !== 'object' || !item.slug || !item.name) return null; const prefix = item.type === 'novel' ? 'novela' : 'comic', url = absolute(`/series/${prefix}-${item.slug}`); return { id: new URL(url).pathname, url, remoteWorkId: String(item.id ?? ''), title: cleanTitle(item.name), thumbnailUrl: absolute(item.cover) || null }; }
async function searchSeriesList(query, page = 1) { const result = await jsonResult(`${BASE}/api/series/list`), rows = findArray(result.payload) || [], ranked = rows.map((item, index) => ({ item, index, score: searchScore(item, query) })).filter(x => Number.isFinite(x.score)).sort((a, b) => a.score - b.score || a.index - b.index), start = (Math.max(1, page) - 1) * 20, mangas = ranked.slice(start, start + 20).map(x => seriesListItem(x.item)).filter(Boolean); return { mangas, hasNextPage: start + 20 < ranked.length }; }

function sourceFailure(message, url, extra = {}) {
  return Object.assign(new Error(message), {
    url, kind: 'source_unavailable', statusCode: 502,
    blocksHtmlFallback: true, retryable: false, ...extra,
  });
}
function requestTimeout(options = {}) {
  const remaining = options.deadline == null ? Infinity : options.deadline - Date.now();
  if (remaining <= 0)
    throw sourceFailure('Se agotó el tiempo para consultar Olympus.', '', { statusCode: 504 });
  return Math.max(1, Math.floor(Math.min(options.timeoutMs || 18000, remaining)));
}
async function sourceFetch(url, headers, options = {}) {
  const timeout = requestTimeout(options);
  try {
    return await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
  } catch (cause) {
    const timedOut = /Timeout|Abort/.test(cause?.name || '');
    throw sourceFailure(
      timedOut ? 'Olympus no respondió a tiempo.' : 'No se pudo conectar con Olympus.',
      url, { cause, retryable: true },
    );
  }
}
async function text(url, options = {}) {
  const r = await sourceFetch(url, pageHeaders, options);
  if (!r.ok) {
    const error = new Error(`Olympus respondió HTTP ${r.status}`);
    error.status = r.status; error.url = r.url || url;
    throw error;
  }
  const body = await r.text();
  if (/cf-chl-|just a moment|attention required|challenge-platform|cdn-cgi\/challenge/i.test(body) ||
      (/captcha/i.test(body) && body.length < 30000 && !/<(?:main|article)\b/i.test(body)))
    throw new Error('Olympus exige una verificación anti-bot.');
  return { body, url: r.url || url };
}
async function jsonResult(url, referer = BASE + '/', options = {}) {
  const r = await sourceFetch(url, { ...apiHeaders, Referer: referer }, options);
  if (r.status === 404) return { missing: true, status: 404, url: r.url || url };
  const service = new URL(url).origin === new URL(PANEL).origin ? 'Panel Olympus' : 'API pública de Olympus';
  if (!r.ok) {
    const rawRetry = r.headers.get('retry-after');
    const retryAfterMs = rawRetry == null ? undefined : /^\d+(?:\.\d+)?$/.test(rawRetry)
      ? Number(rawRetry) * 1000 : Math.max(0, Date.parse(rawRetry) - Date.now());
    throw sourceFailure(`${service} respondió HTTP ${r.status}`, r.url || url, {
      status: r.status,
      retryable: [408, 500, 502, 503, 504, 520, 521, 522, 523, 524].includes(r.status),
      retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : undefined,
    });
  }
  if (!/json/i.test(r.headers.get('content-type') || ''))
    throw sourceFailure(`${service} no devolvió JSON.`, r.url || url, {
      status: r.status, kind: 'source_invalid_response', blocksHtmlFallback: false,
    });
  let payload;
  try { payload = await r.json(); }
  catch (cause) {
    const timedOut = /Timeout|Abort/.test(cause?.name || '');
    throw sourceFailure(`${service} devolvió una respuesta incompleta o inválida.`, r.url || url, {
      cause, status: r.status, kind: timedOut ? 'source_unavailable' : 'source_invalid_response',
      retryable: timedOut,
    });
  }
  return { payload, url: r.url || url };
}

let catalogCache = { at: 0, rows: [] };
async function seriesCatalog(options = {}) { if (catalogCache.rows.length && Date.now() - catalogCache.at < 300000) return catalogCache.rows; const result = await jsonResult(`${BASE}/api/series/list`, BASE + '/', options), rows = findArray(result.payload) || []; catalogCache = { at: Date.now(), rows: rows.filter(item => item && item.slug && item.name) }; return catalogCache.rows; }
function slugQuery(value) { try { return decodeURIComponent(new URL(value, BASE).pathname.split('/').filter(Boolean).at(-1) || '').replace(/^(?:comic|novel|novela)-/i, '').replace(/-20\d{6}-\d{9}$/i, '').replace(/[-_]+/g, ' '); } catch { return ''; } }
async function resolveSeriesUrl(ref, requested, options = {}) { const rows = await seriesCatalog(options), rawSlug = slugQuery(requested), exactSlug = (() => { try { return decodeURIComponent(new URL(requested).pathname.split('/').filter(Boolean).at(-1) || '').replace(/^(?:comic|novel|novela)-/i, ''); } catch { return ''; } })(), numericId = Number(ref?.seriesId ?? ref?.remoteId ?? (/^\d+$/.test(String(ref?.id || '')) ? ref.id : NaN)), title = cleanTitle(ref?.title || ''), queries = [title, rawSlug].filter(Boolean); let best = null, bestScore = Infinity; for (const [index, item] of rows.entries()) { let score = item.slug === exactSlug ? -100 : Number(item.id) === numericId ? -90 : Infinity; for (const query of queries) score = Math.min(score, searchScore(item, query)); if (score < bestScore) { best = item; bestScore = score + index / 100000; } } return best && Number.isFinite(bestScore) ? seriesListItem(best)?.url || null : null; }
async function seriesPage(ref, options = {}) {
  const requested = absolute(ref?.url || ref?.id);
  try { return await text(requested, options); }
  catch (error) {
    if (error?.status !== 404) throw error;
    const canonical = await resolveSeriesUrl(ref, requested, options);
    if (canonical && canonical !== requested) {
      const page = await text(canonical, options);
      return { ...page, recoveredFrom: requested };
    }
    const missing = new Error('La obra de Olympus cambió de dirección o ya no está disponible. Actualiza la fuente y vuelve a buscarla.');
    missing.status = 404; missing.url = requested;
    throw missing;
  }
}

function listingPageNumber(value) {
  const page = Number(value);
  return Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
}
function listingEnvelope(value, depth = 0, seen = new Set()) {
  if (!value || typeof value !== 'object' || depth > 8 || seen.has(value)) return null;
  seen.add(value);
  if (!Array.isArray(value) && Array.isArray(value.data) &&
      (value.current_page != null || value.meta?.current_page != null)) return value;
  for (const [key, child] of Object.entries(value)) {
    if (/recommended|slider|popular_comics|notifications/i.test(key)) continue;
    const found = listingEnvelope(child, depth + 1, seen);
    if (found) return found;
  }
  return null;
}
function normalizedListing(payload, requested, url) {
  const envelope = listingEnvelope(payload);
  if (!envelope) throw sourceFailure('Olympus no devolvió un listado paginado válido.', url, { kind: 'source_invalid_response' });
  const info = pageInfo(envelope);
  if (info.current !== requested || !Number.isInteger(info.last) || info.last < 1)
    throw sourceFailure('Olympus devolvió una página distinta de la solicitada.', url, { kind: 'source_invalid_response' });
  const hasNextPage = requested < info.last;
  if (hasNextPage && !envelope.data.length)
    throw sourceFailure('Olympus devolvió una página vacía antes del final del listado.', url, { kind: 'source_invalid_response' });
  if (info.next) {
    let next;
    try { next = new URL(info.next, BASE); } catch {}
    if (!hasNextPage || !next || next.origin !== new URL(BASE).origin || Number(next.searchParams.get('page')) !== requested + 1)
      throw sourceFailure('Olympus devolvió un enlace de paginación incoherente.', url, { kind: 'source_invalid_response' });
  }
  const mangas = envelope.data.map(seriesListItem).filter(Boolean);
  if (envelope.data.length && !mangas.length)
    throw sourceFailure('No se reconocieron las obras del listado de Olympus.', url, { kind: 'source_invalid_response' });
  return {
    mangas, hasNextPage, page: requested, nextPage: hasNextPage ? requested + 1 : null,
    lastPage: info.last, ...(info.total === undefined ? {} : { total: info.total }),
  };
}
function nuxtListing(html) {
  // Decode JSON/devalue references only. Never execute page scripts.
  const script = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .find(match => attr('<script ' + match[1] + '>', 'id') === '__NUXT_DATA__');
  if (!script) return null;
  let table;
  try { table = JSON.parse(script[2]); } catch { return null; }
  if (!Array.isArray(table) || table.length > 100000) return null;
  const memo = new Map(), pending = new Set();
  function at(index, depth = 0) {
    if (!Number.isInteger(index) || index < 0 || index >= table.length) return undefined;
    if (depth > 80 || pending.has(index)) return undefined;
    if (memo.has(index)) return memo.get(index);
    const value = table[index];
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value) && ['Reactive','ShallowReactive','Ref','ShallowRef'].includes(value[0])) {
      pending.add(index); const unwrapped = at(value[1], depth + 1); pending.delete(index);
      memo.set(index, unwrapped); return unwrapped;
    }
    const result = Array.isArray(value) ? [] : Object.create(null);
    memo.set(index, result);
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__','constructor','prototype'].includes(key)) continue;
      result[key] = typeof child === 'number' ? at(child, depth + 1) : child;
    }
    return result;
  }
  return at(0);
}
async function publicListing(mode, value = 1) {
  const page = listingPageNumber(value);
  const route = mode === 'popular' ? '/api/rankings' : mode === 'latest' ? '/api/new-chapters' : '/api/series';
  const pagePath = mode === 'popular' ? '/rankings' : mode === 'latest' ? '/capitulos' : '/series';
  const url = new URL(route, BASE);
  url.searchParams.set('page', String(page));
  if (mode === 'popular') url.searchParams.set('period', 'total_ranking');
  if (mode === 'catalogue') { url.searchParams.set('type', 'comic'); url.searchParams.set('direction', 'asc'); }
  let fallback = false;
  try {
    const result = await jsonResult(url.href);
    if (result.missing) fallback = true;
    else return normalizedListing(result.payload, page, url.href);
  } catch (error) {
    // Compatibility for sites serving HTML at an obsolete JSON route, not a
    // silent substitute for 520/403/429, corrupt data, or an incomplete page.
    if (error.kind === 'source_invalid_response' && error.blocksHtmlFallback === false) fallback = true;
    else throw error;
  }
  if (!fallback) throw sourceFailure('No se pudo consultar el listado de Olympus.', url.href);
  const pageUrl = new URL(pagePath, BASE); pageUrl.searchParams.set('page', String(page));
  const result = await text(pageUrl.href);
  const structured = nuxtListing(result.body);
  if (structured && listingEnvelope(structured)) return normalizedListing(structured, page, result.url);
  const mangas = seriesFrom(result.body, result.url);
  const hasNextPage = links(result.body, result.url).some(link => {
    try {
      const next = new URL(link.href);
      return next.origin === new URL(BASE).origin && next.pathname === pagePath && Number(next.searchParams.get('page')) === page + 1;
    } catch { return false; }
  });
  if (!mangas.length) throw sourceFailure('Olympus respondió, pero no se reconocieron tarjetas de series.', result.url);
  return { mangas, hasNextPage, page, nextPage: hasNextPage ? page + 1 : null };
}
function findArray(value, depth = 0) { if (depth > 5 || value == null) return null; if (Array.isArray(value)) return value; if (typeof value !== 'object') return null; for (const key of ['chapters', 'data', 'items', 'results', 'rows']) { if (key in value) { const found = findArray(value[key], depth + 1); if (found) return found; } } for (const child of Object.values(value)) { const found = findArray(child, depth + 1); if (found?.length && typeof found[0] === 'object') return found; } return null; }
function pageInfo(value, depth = 0) {
  if (depth > 5 || !value || typeof value !== 'object' || Array.isArray(value)) return {};
  const totalValue = value.total ?? value.total_count ?? value.totalCount;
  const total = totalValue == null ? undefined : Number(totalValue);
  const info = {
    last: Number(value.last_page ?? value.lastPage ?? value.total_pages ?? value.totalPages ?? 0) || 0,
    current: Number(value.current_page ?? value.currentPage ?? value.page ?? 0) || 0,
    next: value.next_page_url ?? value.nextPageUrl ?? value.next ?? value.links?.next ?? null,
    total: Number.isInteger(total) && total >= 0 ? total : undefined,
  };
  for (const key of ['meta', 'pagination', 'data']) {
    const nested = pageInfo(value[key], depth + 1);
    info.last ||= nested.last || 0;
    info.current ||= nested.current || 0;
    info.next ||= nested.next || null;
    if (info.total === undefined) info.total = nested.total;
  }
  return info;
}

function numberFrom(value) { if (typeof value === 'number') return value; const m = String(value ?? '').match(/\d+(?:\.\d+)?/); return m ? Number(m[0]) : 0; }
function chapterFromApi(item, publicSlug) { if (!item || typeof item !== 'object') return null; const nested = item.chapter && typeof item.chapter === 'object' ? item.chapter : {}; const value = { ...item, ...nested }; const id = value.chapter_id ?? value.chapterId ?? value.id ?? value._id; const numberValue = value.chapter_number ?? value.chapterNumber ?? value.number ?? value.numero ?? value.num ?? value.chapter ?? value.name ?? value.title; const number = numberFrom(numberValue);
 const raw = value.url ?? value.path ?? value.permalink ?? value.chapter_url ?? value.chapterUrl ?? '';
 let url = absolute(raw, BASE); if ((!url || !/\/capitulo\//i.test(url)) && id != null) url = `${BASE}/capitulo/${encodeURIComponent(String(id))}/${encodeURIComponent(publicSlug)}`;
 if (!url || !Number.isFinite(number) || number < 0 || !/\d/.test(String(numberValue ?? ''))) return null; const p = new URL(url).pathname; return { id: p, url, remoteId: id == null ? "" : String(id), remoteIdScope: "source", name: `Capítulo ${number}`, number, date: value.published_at ?? value.publishedAt ?? value.created_at ?? value.createdAt ?? null }; }
function chapterLinksFromHtml(html, base) { const seen = new Set(), out = []; for (const l of links(html, base)) { let u; try { u = new URL(l.href); } catch { continue; } if (!/\/capitulo\//i.test(u.pathname) || seen.has(u.href)) continue; const number = numberFrom(l.text || u.pathname.split('/').filter(Boolean).at(-1)); if (!number) continue; seen.add(u.href); out.push({ id: u.pathname, url: u.href, name: `Capítulo ${number}`, number, date: null }); } return out.sort((a, b) => b.number - a.number); }
function panelCandidates(seriesUrl, html = '', resolvedUrl = seriesUrl) { const decoded = decode(html).replace(/\\u002[fF]/g, '/').replace(/\\\//g, '/'); const urls = [seriesUrl, resolvedUrl, meta(html, 'og:url'), meta(html, 'twitter:url')].filter(Boolean); const slugs = new Set(), hosts = new Set([PANEL]); for (const value of urls) { try { const u = new URL(value, BASE), slug = u.pathname.split('/').filter(Boolean).at(-1) || ''; if (slug) { slugs.add(slug.replace(/^(?:comic|novel|novela)-/i, '')); slugs.add(slug); slugs.add(slug.replace(/-20\d{6}-\d{9}$/i, '').replace(/^(?:comic|novel|novela)-/i, '')); } } catch {} } for (const m of decoded.matchAll(/https?:\/\/[^"'<>\s]+\/api\/series\/([^\/?#"']+)\/chapters/gi)) { try { const u = new URL(m[0]); hosts.add(u.origin); slugs.add(decodeURIComponent(m[1])); } catch {} } for (const m of decoded.matchAll(/\/api\/series\/([^\/?#"']+)\/chapters/gi)) slugs.add(decodeURIComponent(m[1])); for (const m of decoded.matchAll(/["'](?:api_?slug|series_?slug|slug)["']\s*:\s*["']([^"']+)["']/gi)) { const v = decode(m[1]); if (v && !/[\/\s]/.test(v)) { slugs.add(v); slugs.add(v.replace(/^(?:comic|novel|novela)-/i, '')); } } return { slugs: [...slugs].filter(Boolean), hosts: [...hosts] }; }
function bestSeriesObject(value) { let best = null, score = -1; const seen = new Set(), walk = node => { if (!node || typeof node !== 'object' || seen.has(node)) return; seen.add(node); if (!Array.isArray(node)) { const keys = Object.keys(node).map(x => x.toLowerCase()), n = ['title','name','description','synopsis','author','artist','status','genre','genres'].filter(x => keys.includes(x)).length; if (n > score) { score = n; best = node; } } for (const child of Object.values(node)) walk(child); }; walk(value); return score > 0 ? best : null; }
async function seriesDataFromPanel(seriesUrl, html, resolvedUrl) { const discovered = panelCandidates(seriesUrl, html, resolvedUrl), slugs = discovered.slugs, publicOrigin = new URL(resolvedUrl || seriesUrl || BASE, BASE).origin, hosts = [...new Set([publicOrigin, BASE, ...discovered.hosts])], debug = { adapter: 'olympus-1.6.0', strategy: 'public-api-first', publicUrl: seriesUrl, resolvedUrl, htmlBytes: html.length, slugs, hosts, attempts: [] }; let fallback = null; for (const host of hosts) for (const slug of slugs) for (const suffix of ['?type=comic', '?type=novel']) { const endpoint = `${host}/api/series/${encodeURIComponent(slug)}${suffix}`; try { const result = await jsonResult(endpoint, resolvedUrl || seriesUrl); if (result.missing) { debug.attempts.push({ endpoint, status: 404 }); continue } const found = bestSeriesObject(result.payload), genres = genreValues(found), keys = found && typeof found === 'object' ? Object.keys(found) : []; debug.attempts.push({ endpoint, status: 200, rootKeys: Object.keys(result.payload || {}), selectedKeys: keys, genreCount: genres.length }); if (found && !fallback) fallback = found; if (found && genres.length) return { data: found, debug: { ...debug, selectedEndpoint: endpoint, selectedKeys: keys, genreCount: genres.length } }; } catch (error) { debug.attempts.push({ endpoint, error: String(error?.message || error).slice(0, 180) }) } } return { data: fallback, debug: { ...debug, selectedEndpoint: null, selectedKeys: fallback ? Object.keys(fallback) : [], genreCount: genreValues(fallback).length } }; }
function field(data, names) { if (!data || typeof data !== 'object') return ''; for (const name of names) { const value = data[name]; if (typeof value === 'string' || typeof value === 'number') return String(value); if (Array.isArray(value)) { const joined = value.map(x => typeof x === 'object' ? x.name || x.title || x.value || '' : x).filter(Boolean).join(', '); if (joined) return joined; } if (value && typeof value === 'object') { const nested = value.name || value.title || value.value; if (nested) return String(nested); } } return ''; }
function statusValue(data, html) { const raw = field(data, ['status','state','publication_status']).toLowerCase(); return /finaliz|complet|finished|ended/.test(raw + ' ' + html) ? 'completed' : /paus|hiatus/.test(raw + ' ' + html) ? 'hiatus' : /cancel/.test(raw) ? 'cancelled' : 'ongoing'; }
async function chaptersFromPanel(seriesUrl, html = '', resolvedUrl = seriesUrl, options = {}) {
  const publicSlug = new URL(resolvedUrl || seriesUrl).pathname.split('/').filter(Boolean).at(-1) || '';
  const preferredType = /^(?:novel|novela)-/.test(publicSlug) ? 'novel' : 'comic';
  const discovered = panelCandidates(seriesUrl, html, resolvedUrl);
  if (!discovered.slugs.length) throw new Error('No se pudo obtener el slug de Olympus.');
  const publicOrigin = new URL(resolvedUrl || seriesUrl, BASE).origin;
  const configuredHosts = new Set([publicOrigin, new URL(BASE).origin, new URL(PANEL).origin]);
  // Use the same public route as the current upstream extension. A failing panel
  // is a fallback, never a prerequisite. Do not query unrelated hosts from HTML.
  const hosts = [...new Set([publicOrigin, new URL(BASE).origin, ...discovered.hosts])]
    .filter(host => configuredHosts.has(host));
  const request = { deadline: options.deadline || Date.now() + 26000, timeoutMs: 6000 };
  const failures = [], diagnostics = [];
  const incomplete = (message, url) => sourceFailure(message, url, { kind: 'source_incomplete' });

  async function pageResult(url) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return await jsonResult(url, resolvedUrl || seriesUrl, request); }
      catch (error) {
        const delay = error.retryAfterMs ?? 150;
        if (attempt || !error.retryable || delay > 1000 ||
            request.deadline - Date.now() <= delay + 500) throw error;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async function collect(host, apiSlug, type) {
    const seen = new Set(), out = [];
    let expectedTotal;
    for (let page = 1; page <= 100; page++) {
      const u = new URL(`${host}/api/series/${encodeURIComponent(apiSlug)}/chapters`);
      u.searchParams.set('page', String(page));
      u.searchParams.set('direction', 'desc');
      u.searchParams.set('type', type);
      const result = await pageResult(u.href);
      if (result.missing) {
        diagnostics.push({ endpoint: u.href, status: 404 });
        if (page > 1) throw incomplete('Olympus interrumpió la paginación de capítulos.', u.href);
        return null;
      }
      const rows = findArray(result.payload);
      if (!rows) throw incomplete('Olympus no devolvió una lista de capítulos reconocible.', u.href);
      const info = pageInfo(result.payload);
      if (info.current && info.current !== page)
        throw incomplete('Olympus repitió una página de capítulos.', u.href);
      if (info.last > 100)
        throw incomplete('La paginación de Olympus supera el límite seguro de esta consulta.', u.href);
      if (info.total !== undefined) {
        if (expectedTotal !== undefined && info.total !== expectedTotal)
          throw incomplete('El listado de Olympus cambió durante la consulta. Vuelve a intentarlo.', u.href);
        expectedTotal = info.total;
      }
      const previousSize = seen.size;
      for (const row of rows) {
        const chapter = chapterFromApi(row, publicSlug);
        if (!chapter) throw incomplete('Olympus devolvió un capítulo con datos incompletos.', u.href);
        if (!seen.has(chapter.url)) { seen.add(chapter.url); out.push(chapter); }
      }
      if (page > 1 && rows.length && seen.size === previousSize)
        throw incomplete('Olympus repitió los capítulos de una página anterior.', u.href);
      const done = info.last ? page >= info.last : !info.next;
      if (!rows.length && !done)
        throw incomplete('Olympus devolvió una página vacía antes de completar el listado.', u.href);
      if (done) {
        if (expectedTotal !== undefined && out.length !== expectedTotal)
          throw incomplete('Olympus no entregó todos los capítulos anunciados.', u.href);
        // A confirmed zero is valid; an error or an unrecognized response is not.
        if (out.length || expectedTotal === 0) return out.sort((a, b) => b.number - a.number);
        return null;
      }
    }
    throw incomplete('No se pudo completar la paginación de Olympus.', seriesUrl);
  }

  hostLoop: for (const host of hosts) {
    for (const slug of discovered.slugs) {
      for (const type of [preferredType, preferredType === 'comic' ? 'novel' : 'comic']) {
        try {
          const chapters = await collect(host, slug, type);
          if (chapters !== null) return chapters;
        } catch (error) {
          failures.push(error);
          diagnostics.push({ endpoint: error.url, status: error.status, error: error.message });
          // Do not hammer an unavailable host with every slug/type permutation,
          // or combine a partial page from it with data from another endpoint.
          continue hostLoop;
        }
      }
    }
  }
  const fallback = chapterLinksFromHtml(html, resolvedUrl || seriesUrl);
  if (fallback.length && !failures.some(error => error.blocksHtmlFallback)) return fallback;
  const failure = failures.find(error => error.kind === 'source_unavailable') || failures[0];
  if (failure) {
    const status = failure.status && failure.status !== 200 ? ` (HTTP ${failure.status})` : '';
    const error = sourceFailure(
      `No se pudo obtener la lista completa de capítulos de Olympus${status}. Inténtalo de nuevo más tarde.`,
      failure.url || seriesUrl, {
        cause: failure, status: failure.status,
        kind: failure.kind === 'source_unavailable' ? 'source_unavailable' : 'source_error',
        statusCode: failure.statusCode || 502,
      },
    );
    error.attempts = diagnostics.slice(-8);
    throw error;
  }
  throw new Error(`Olympus cambió la ruta de capítulos y no se pudo resolver automáticamente. Intentos: ${diagnostics.slice(0, 8).map(item => `${new URL(item.endpoint).pathname}=404`).join(', ') || 'sin endpoint descubierto'}.`);
}

function readerImages(html, base) {
  const seen = new Set(), out = [];
  const add = (value, readerPanel = false) => {
    const src = absolute(value, base);
    if (!src || seen.has(src)) return;
    let pathname;
    try { pathname = new URL(src).pathname; } catch { return; }
    if (!/\.(?:avif|jpe?g|png|webp)(?:$|\?)/i.test(src)) return;
    if (!readerPanel && /(logo|avatar|favicon|banner|ads?|icon|emoji|placeholder|loading|cover|portada)/i.test(pathname)) return;
    seen.add(src);
    out.push({ index: out.length, imageUrl: src });
  };
  const imageSource = tag => attr(tag, 'data-src') || attr(tag, 'data-lazy-src') || attr(tag, 'data-original') || attr(tag, 'src');
  const readers = [...html.matchAll(/<main\b([^>]*)>([\s\S]*?)<\/main>/gi)]
    .filter(match => attr('<main' + match[1] + '>', 'class').split(/\s+/).includes('strip'));
  if (readers.length) {
    // Current upstream selector: main.strip div.panel > img. A real page can
    // legitimately be named "portadas.webp"; recommendation covers are outside.
    for (const reader of readers) {
      for (const match of reader[2].matchAll(/<div\b([^>]*)>(?:\s|<!--[\s\S]*?-->)*(<img\b[^>]*>)/gi)) {
        if (attr('<div' + match[1] + '>', 'class').split(/\s+/).includes('panel'))
          add(imageSource(match[2]), true);
      }
    }
    return out;
  }
  // Compatibility for older public reader layouts, retaining the ad/cover filter.
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) add(imageSource(match[0]));
  const embedded = decode(html).replace(/\\u002[fF]/g, '/').replace(/\\\//g, '/').replace(/\\"/g, '"').replace(/\\u0026/g, '&');
  for (const match of embedded.matchAll(/https?:\/\/[^"'<>\s\\]+?\.(?:avif|jpe?g|png|webp)(?:\?[^"'<>\s\\]*)?/gi)) add(match[0]);
  return out;
}

export const manifest = { id: 'hanami.es.olympus', name: 'Olympus Scanlation', version: '1.6.0', lang: 'es', runtime: 'vercel-js', upstream: 'keiyoushi/extensions-source/src/es/olympusscanlation', baseUrl: BASE, status: 'beta' };
export const olympus = { ...manifest,
 popular: ({ page = 1 } = {}) => publicListing('popular', page),
 latest: ({ page = 1 } = {}) => publicListing('latest', page),
 async search({ page = 1, query = '' }) { const q = query.trim(); return q ? searchSeriesList(q, page) : publicListing('catalogue', page); },
 async details(ref) { const requestedUrl = absolute(ref.url || ref.id), r = await seriesPage(ref), url = r.url || requestedUrl, h = r.body, panel = await seriesDataFromPanel(url, h, r.url), data = panel.data; const title = cleanTitle(field(data, ['title','name']) || meta(h, 'og:title') || (h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || ref.title), genre = [...new Set([...genreValues(data), ...genreList(h, r.url)])]; return { ...ref, id: new URL(url).pathname.replace(/\/$/, ''), remoteWorkId: String(data?.series_id ?? data?.seriesId ?? data?.id ?? ref.remoteWorkId ?? ""), url, title, thumbnailUrl: absolute(field(data, ['thumbnailUrl','thumbnail','cover','image']) || meta(h, 'og:image'), r.url) || ref.thumbnailUrl || null, description: field(data, ['description','synopsis','summary']) || strip(meta(h, 'description') || (h.match(/<(?:div|p)[^>]+class=["'][^"']*(?:summary|sinopsis|description)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|p)>/i) || [])[1]), author: field(data, ['author','writer','authors']) || null, artist: field(data, ['artist','artists']) || null, genre, status: statusValue(data, h), _metadataDebug: { ...panel.debug, htmlGenreCount: genreList(h, r.url).length, finalGenreCount: genre.length } }; },
 async chapters(ref) { const options = { deadline: Date.now() + 26000, timeoutMs: 7000 }; const page = await seriesPage(ref, options), url = page.url || absolute(ref.url || ref.id); return chaptersFromPanel(url, page.body, page.url, options); },
 async pages(chapter) { const url = absolute(chapter.url || chapter.id), r = await text(url), items = readerImages(r.body, r.url); if (!items.length) throw new Error('Olympus respondió sin imágenes de lectura.'); return items; },
 imageHeaders() { return { Referer: BASE + '/', Origin: BASE, 'User-Agent': UA }; }
};
export default olympus;
