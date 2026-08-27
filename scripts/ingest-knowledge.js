/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const root = path.join(__dirname, '..');
const knowledgeRoot = path.join(root, 'docs', 'agronomia');
const CATEGORIES = new Set(['plant', 'tree', 'crop', 'mushroom', 'insect', 'fish', 'bird']);

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(resolved) : [resolved];
  });
}

function slugFor(file) {
  return path.relative(knowledgeRoot, file).replace(/\\/g, '/').replace(/\.md$/i, '').replace(/\//g, '-');
}

function scopesFor(slug) {
  if (/^grupos-peixes-/.test(slug)) return ['fish'];
  if (/^grupos-aves-/.test(slug)) return ['bird'];
  if (/^grupos-cogumelos-/.test(slug)) return ['mushroom'];
  if (/^grupos-insetos-/.test(slug)) return ['insect'];
  if (/^grupos-lavouras-/.test(slug)) return ['crop'];
  if (/^grupos-arvores-/.test(slug)) return ['tree'];
  if (/^grupos-/.test(slug)) return ['plant', 'tree'];
  if (/^comestibilidade-/.test(slug)) return ['plant', 'tree', 'mushroom'];
  if (/^ecologia-/.test(slug)) return ['plant', 'tree', 'crop', 'insect', 'bird'];
  return ['plant', 'tree', 'crop'];
}

function sourceUrls(markdown) {
  const found = markdown.match(/https:\/\/[^\s)>\]]+/g) || [];
  return [...new Set(found.map((url) => url.replace(/[.,;:]+$/g, '')).filter((url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
    } catch (e) {
      return false;
    }
  }))].slice(0, 12);
}

function scientificNames(markdown) {
  const names = [];
  for (const match of markdown.matchAll(/(?<!\*)\*([A-Z][a-z]{2,}\s+[a-z][a-z-]{2,}(?:\s+[a-z][a-z-]{2,})?)\*(?!\*)/g)) {
    names.push(match[1]);
  }
  return [...new Set(names)].slice(0, 40);
}

function cleanMarkdown(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitLongSection(text, max = 3200) {
  const paragraphs = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (paragraph.length > max) {
      if (current) chunks.push(current);
      for (let offset = 0; offset < paragraph.length; offset += max) {
        chunks.push(paragraph.slice(offset, offset + max));
      }
      current = '';
      continue;
    }
    const joined = current ? `${current}\n\n${paragraph}` : paragraph;
    if (joined.length > max) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = joined;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function chunksFor(markdown, fallbackTitle) {
  const sections = markdown.split(/(?=^##?\s+)/gm);
  const chunks = [];
  for (const section of sections) {
    const headingMatch = section.match(/^##?\s+(.+)$/m);
    const heading = (headingMatch?.[1] || fallbackTitle).trim().slice(0, 240);
    if (/^(fontes|refer[eê]ncias|sources)\b/i.test(heading)) continue;
    const rawBody = section.replace(/^##?\s+.+$/m, '').trim();
    if (cleanMarkdown(rawBody).length < 80) continue;
    for (const rawChunk of splitLongSection(rawBody)) {
      const content = cleanMarkdown(rawChunk);
      if (content.length < 80) continue;
      const urls = sourceUrls(rawChunk);
      // Um paragrafo sem fonte direta nao entra como evidencia. Vincular a
      // bibliografia geral do arquivo fingiria saber qual fonte sustenta o fato.
      if (!urls.length) continue;
      chunks.push({
        heading,
        content,
        scientific_names: scientificNames(rawChunk),
        source_urls: urls,
      });
    }
  }
  return chunks.slice(0, 999);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!dryRun && (!url || !key)) throw new Error('Supabase admin environment is not configured.');

  const files = filesUnder(knowledgeRoot).filter((file) => /\.md$/i.test(file)).sort();
  if (!files.length) throw new Error('No curated knowledge documents found.');
  const admin = dryRun ? null : createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let chunkCount = 0;

  for (const file of files) {
    const relative = path.relative(root, file).replace(/\\/g, '/');
    if (!relative.startsWith('docs/agronomia/')) throw new Error(`Untrusted knowledge path: ${relative}`);
    const markdown = fs.readFileSync(file, 'utf8');
    const slug = slugFor(file);
    const title = (markdown.match(/^#\s+(.+)$/m)?.[1] || slug).trim().slice(0, 240);
    const categoryScopes = scopesFor(slug).filter((category) => CATEGORIES.has(category));
    const chunks = chunksFor(markdown, title);
    if (!chunks.length) throw new Error(`No usable chunks in ${relative}`);

    const document = {
      slug,
      title,
      language: 'pt',
      category_scopes: categoryScopes,
      topic: slug.split('-').slice(-4).join('-').slice(0, 120),
      source_path: relative,
      content_hash: crypto.createHash('sha256').update(markdown).digest('hex'),
      status: 'published',
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (dryRun) {
      chunkCount += chunks.length;
      continue;
    }
    const { data: saved, error: documentError } = await admin
      .from('knowledge_documents')
      .upsert(document, { onConflict: 'slug' })
      .select('id')
      .single();
    if (documentError || !saved?.id) throw documentError || new Error(`Document upsert failed: ${slug}`);

    const { error: deleteError } = await admin.from('knowledge_chunks').delete().eq('document_id', saved.id);
    if (deleteError) throw deleteError;
    const rows = chunks.map((chunk, ordinal) => ({ ...chunk, document_id: saved.id, ordinal }));
    const { error: chunkError } = await admin.from('knowledge_chunks').insert(rows);
    if (chunkError) throw chunkError;
    chunkCount += rows.length;
  }

  console.log(`Knowledge ${dryRun ? 'dry run' : 'ingestion'} complete: ${files.length} documents, ${chunkCount} chunks.`);
}

if (require.main === module) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { chunksFor, cleanMarkdown, scientificNames, scopesFor, sourceUrls };
