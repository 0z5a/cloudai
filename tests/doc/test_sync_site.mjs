// SPDX-FileCopyrightText: NVIDIA CORPORATION & AFFILIATES
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { snapshotMarkdown, syncSite } from '../../fern/sync-site.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cloudai-docs-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  const site = path.join(root, 'site');
  await fs.mkdir(path.join(source, 'doc'), { recursive: true });
  await fs.mkdir(path.join(source, 'fern/generated'), { recursive: true });
  await fs.writeFile(path.join(source, 'doc/index.mdx'), '# Original\n\n[Guide](/guide)\n\n<Markdown src="/generated/model.mdx" />\n');
  await fs.writeFile(path.join(source, 'fern/generated/model.mdx'), 'Original field description\n');
  await fs.writeFile(path.join(source, 'fern/docs.yml'), 'instances:\n  - url: ${FERN_DOCS_URL}\nversions:\n  - display-name: dev\n    path: ./dev.yml\n');
  await fs.writeFile(path.join(source, 'fern/dev.yml'), 'navigation:\n  - page: Home\n    path: ../doc/index.mdx\n    slug: /\n');
  await fs.writeFile(path.join(source, 'fern/fern.config.json'), '{"organization":"nvidia","version":"5.176.0"}');
  return { source, site, sourceRef: 'main', sourceSha: 'a'.repeat(40) };
}

test('dev updates retain frozen release pages, references and navigation', async t => {
  const args = await fixture(t);
  await syncSite({ ...args, slug: 'v1.0.0', releaseTag: 'v1.0.0' });
  const frozen = path.join(args.site, 'fern/snapshots/v1.0.0');
  const before = await fs.readFile(path.join(frozen, 'doc/index.mdx'), 'utf8');
  await fs.writeFile(path.join(args.source, 'doc/index.mdx'), '# New development docs\n');
  await fs.writeFile(path.join(args.source, 'fern/generated/model.mdx'), 'New field\n');
  await syncSite({ ...args, slug: 'dev', sourceSha: 'b'.repeat(40) });
  assert.equal(await fs.readFile(path.join(frozen, 'doc/index.mdx'), 'utf8'), before);
  assert.equal(await fs.readFile(path.join(frozen, 'fern/generated/model.mdx'), 'utf8'), 'Original field description\n');
  const config = await fs.readFile(path.join(args.site, 'fern/docs.yml'), 'utf8');
  assert.ok(config.indexOf('display-name: v1.0.0') < config.indexOf('display-name: dev'));
  assert.ok(before.includes('/v1.0.0/guide'));
  assert.ok(before.includes('/snapshots/v1.0.0/fern/generated/model.mdx'));
});

test('same source can be retried, but releases cannot be overwritten', async t => {
  const args = await fixture(t);
  const release = { ...args, slug: 'v1.0.0', releaseTag: 'v1.0.0' };
  await syncSite(release);
  const file = path.join(args.site, 'fern/snapshots/v1.0.0/doc/index.mdx');
  const original = await fs.readFile(file, 'utf8');
  await fs.writeFile(path.join(args.source, 'doc/index.mdx'), '# Different build output\n');
  await syncSite(release);
  assert.equal(await fs.readFile(file, 'utf8'), original);
  await assert.rejects(syncSite({ ...release, sourceSha: 'b'.repeat(40) }), /frozen/);
});

test('historical imports preserve the default unless explicitly promoted', async t => {
  const args = await fixture(t);
  await syncSite({ ...args, slug: 'v2.0.0', releaseTag: 'v2.0.0' });
  await syncSite({ ...args, slug: 'v1.0.0', releaseTag: 'v1.0.0' });
  const config = path.join(args.site, 'fern/docs.yml');
  assert.ok((await fs.readFile(config, 'utf8')).indexOf('v2.0.0') < (await fs.readFile(config, 'utf8')).indexOf('v1.0.0'));
  await syncSite({ ...args, slug: 'v1.0.0', releaseTag: 'v1.0.0', makeDefault: true });
  assert.ok((await fs.readFile(config, 'utf8')).indexOf('v1.0.0') < (await fs.readFile(config, 'utf8')).indexOf('v2.0.0'));
});

test('MDX parsing scopes links and snippets without changing code examples', () => {
  const code = '<Markdown src="/generated/example.mdx" />';
  const text = `[Home](/guide#setup)\n\n[External](https://example.com)\n\n\`\`\`mdx\n${code}\n\`\`\`\n\n${code}\n`;
  const result = snapshotMarkdown(text, 'dev', '/cloudai');
  assert.ok(result.includes('/cloudai/dev/guide#setup'));
  assert.ok(result.includes('https://example.com'));
  assert.ok(result.includes(`\n${code}\n`));
  assert.ok(result.includes('/snapshots/dev/fern/generated/example.mdx'));
});

test('reject traversal and symlink inputs', async t => {
  const args = await fixture(t);
  await assert.rejects(syncSite({ ...args, slug: '../outside' }), /slug/);
  await fs.symlink('/etc/passwd', path.join(args.source, 'doc/outside'));
  await assert.rejects(syncSite({ ...args, slug: 'dev' }), /symlinks/);
});

test('candidate assembly does not modify the source checkout', async t => {
  const args = await fixture(t);
  const original = await fs.readFile(path.join(args.source, 'fern/docs.yml'), 'utf8');
  await syncSite({ ...args, slug: 'dev' });
  assert.equal(await fs.readFile(path.join(args.source, 'fern/docs.yml'), 'utf8'), original);
  assert.ok(!await fs.stat(path.join(args.site, '.git')).catch(() => false));
});

test('preview and production cannot use incompatible base paths', async t => {
  const args = await fixture(t);
  await syncSite({ ...args, slug: 'dev', basePath: '/cloudai' });
  await assert.rejects(syncSite({ ...args, slug: 'v1.0.0', releaseTag: 'v1.0.0' }), /same base path/);
});
