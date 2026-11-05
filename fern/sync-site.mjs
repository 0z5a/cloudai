// SPDX-FileCopyrightText: NVIDIA CORPORATION & AFFILIATES
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import remarkStringify from 'remark-stringify';
import YAML from 'yaml';

const markdown = unified().use(remarkParse).use(remarkMdx).use(remarkGfm)
  .use(remarkFrontmatter).use(remarkStringify);
const readYaml = async (file) => YAML.parse(await fs.readFile(file, 'utf8'));
const writeYaml = async (file, value) => fs.writeFile(file, YAML.stringify(value));

async function exists(file) {
  try { await fs.access(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

function inside(root, file) {
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path outside source tree: ${file}`);
  }
  return relative.split(path.sep).join('/');
}

async function walk(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Snapshot input must not contain symlinks: ${file}`);
    if (entry.isDirectory()) files.push(...await walk(file));
    else files.push(file);
  }
  return files;
}

function visit(node, callback) {
  callback(node);
  for (const child of node.children ?? []) visit(child, callback);
}

export function snapshotMarkdown(content, slug, basePath) {
  const tree = markdown.parse(content);
  const pageUrl = (url) => url.startsWith('/') && !url.startsWith('//')
    ? `${basePath}/${slug}${url}` : url;
  visit(tree, (node) => {
    if (node.type === 'link' || node.type === 'definition') node.url = pageUrl(node.url);
    if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
      for (const attribute of node.attributes ?? []) {
        if (attribute.type !== 'mdxJsxAttribute' || typeof attribute.value !== 'string') continue;
        if (attribute.name === 'href') attribute.value = pageUrl(attribute.value);
        if (attribute.name === 'src' && attribute.value.startsWith('/') && !attribute.value.startsWith('//')) {
          attribute.value = `/snapshots/${slug}/fern${attribute.value}`;
        }
      }
    }
  });
  return markdown.stringify(tree);
}

export async function syncSite({ source, site, slug, sourceRef, sourceSha, releaseTag, makeDefault = false,
  basePath = '' }) {
  if (!slug || ![...slug].every(c => 'abcdefghijklmnopqrstuvwxyz0123456789-._'.includes(c))
      || slug === '.' || slug === '..' || Object.hasOwn(Object.prototype, slug)) {
    throw new Error('Use a lowercase version slug containing letters, digits, -, . or _.');
  }
  if ((slug === 'dev') === Boolean(releaseTag)) throw new Error('Release snapshots require a tag; dev must not have one.');
  source = path.resolve(source);
  site = path.resolve(site);
  const fern = path.join(site, 'fern');
  await fs.mkdir(fern, { recursive: true });
  const basePathFile = path.join(fern, 'base-path.txt');
  if (await exists(basePathFile) && (await fs.readFile(basePathFile, 'utf8')) !== basePath) {
    throw new Error('Preview and production instance URLs must use the same base path as the saved snapshots.');
  }
  await fs.writeFile(basePathFile, basePath);
  const manifestPath = path.join(fern, 'snapshots.yml');
  const manifest = await exists(manifestPath) ? await readYaml(manifestPath) : {};
  if (Object.hasOwn(manifest, slug) && slug !== 'dev' && manifest[slug].sourceSha !== sourceSha) {
    throw new Error(`Release ${slug} is frozen at ${manifest[slug].sourceSha}; use a new documentation revision slug.`);
  }
  if (Object.hasOwn(manifest, slug) && slug !== 'dev') {
    if (makeDefault) {
      const file = path.join(fern, 'docs.yml');
      const config = await readYaml(file);
      config.versions.sort((a, b) => Number(b.slug === slug) - Number(a.slug === slug));
      await writeYaml(file, config);
    }
    return;
  }
  const config = await readYaml(path.join(source, 'fern/docs.yml'));
  const version = config.versions?.find(v => v.default) ?? config.versions?.[0];
  const navigationPath = version ? path.resolve(source, 'fern', version.path ?? '') : path.join(source, 'fern/docs.yml');
  if (version && !version.path) throw new Error('Snapshot source must have working-tree navigation, not a git ref.');
  inside(source, navigationPath);
  const navigation = version ? await readYaml(navigationPath) : { navigation: config.navigation };
  if (!navigation.navigation) throw new Error('Source has no Fern navigation. Migrate the selected release first.');
  const snapshot = path.join(fern, 'snapshots', slug);
  await fs.rm(snapshot, { recursive: true, force: true });
  await fs.mkdir(snapshot, { recursive: true });
  for (const folder of ['doc', 'fern/generated', 'fern/assets', 'fern/components']) {
    const from = path.join(source, folder);
    if (await exists(from)) {
      await walk(from); // Reject symlinks before copying files outside the snapshot boundary.
      await fs.cp(from, path.join(snapshot, folder), { recursive: true,
        filter: file => !path.basename(file).startsWith('.') && path.basename(file) !== '__pycache__' });
    }
  }
  for (const file of await walk(snapshot)) {
    if (file.endsWith('.mdx') || file.endsWith('.md')) {
      await fs.writeFile(file, snapshotMarkdown(await fs.readFile(file, 'utf8'), slug, basePath));
    }
  }
  const rewriteNavigation = async (value) => {
    if (Array.isArray(value)) { for (const child of value) await rewriteNavigation(child); }
    else if (value && typeof value === 'object') {
      if (typeof value.path === 'string') {
        const relative = inside(source, path.resolve(path.dirname(navigationPath), value.path));
        if (!await exists(path.join(snapshot, relative))) throw new Error(`Missing snapshot page: ${relative}`);
        value.path = `../snapshots/${slug}/${relative}`;
      }
      for (const child of Object.values(value)) await rewriteNavigation(child);
    }
  };
  await rewriteNavigation(navigation);
  await fs.mkdir(path.join(fern, 'versions'), { recursive: true });
  await writeYaml(path.join(fern, 'versions', `${slug}.yml`), navigation);
  const configPath = path.join(fern, 'docs.yml');
  const previous = await exists(configPath) ? await readYaml(configPath) : null;
  const currentDefault = previous?.versions?.find(v => v.default)?.slug ?? previous?.versions?.[0]?.slug;
  // Development owns shared site settings; release imports only add their content.
  const output = slug === 'dev' || !previous ? config : previous;
  delete output.navigation;
  delete output.tabs;
  manifest[slug] = { sourceRef, sourceSha, releaseTag: releaseTag ?? null };
  const slugs = Object.keys(manifest).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const defaultSlug = makeDefault || !currentDefault || (currentDefault === 'dev' && slug !== 'dev')
    ? slug : currentDefault;
  output.versions = [defaultSlug, ...slugs.filter(s => s !== defaultSlug)].map(s => ({
    'display-name': s, path: `./versions/${s}.yml`, slug: s,
    availability: s === 'dev' ? 'beta' : 'stable',
  }));
  await writeYaml(configPath, output);
  await writeYaml(manifestPath, manifest);
  await fs.copyFile(path.join(source, 'fern/fern.config.json'), path.join(fern, 'fern.config.json'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    source: { type: 'string' }, site: { type: 'string' }, slug: { type: 'string' },
    'source-ref': { type: 'string' }, 'source-sha': { type: 'string' }, 'release-tag': { type: 'string' },
    'make-default': { type: 'boolean', default: false }, 'base-path': { type: 'string', default: '' },
  } });
  for (const key of ['source', 'site', 'slug', 'source-ref', 'source-sha']) {
    if (!values[key]) throw new Error(`Missing --${key}`);
  }
  await syncSite({ source: values.source, site: values.site, slug: values.slug,
    sourceRef: values['source-ref'], sourceSha: values['source-sha'], releaseTag: values['release-tag'],
    makeDefault: values['make-default'], basePath: values['base-path'] });
}
