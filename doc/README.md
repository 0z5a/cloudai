# Documentation

Documentation is authored in `doc/*.mdx` and `doc/workloads/*.mdx` and built with Fern.
Keep the root README separate. Site settings and versions live in `fern/docs.yml`;
the `dev` version's navigation lives in `fern/dev.yml`.
Paths and commands below are relative to the repository root.

With Python 3.14, Node.js 24 and uv installed, run `make -C doc check` to generate the Python reference
and validate the documentation, or `make -C doc preview` to start a local preview.
After changing Python docstrings or model fields, rerun `make -C doc reference`.
The preview uses Fern's legacy renderer because the default Astro preview currently returns
404s for compiled MDX modules, causing page content to disappear after loading.

Generated reference snippets live in `fern/generated/` and are not checked in. Add classes
and member exclusions to `fern/reference.yml`; include their snippets in authored pages with
`<Markdown src="/generated/fully.qualified.Class.mdx" />`. The build reads Python objects
and renders `doc/templates/reference.mdx.jinja`; it does not transform authored MDX.

CI validates the docs and produces a Fern source artifact.

## Versioned website

Developers edit current documentation on `main`. CI maintains a separate `release/docs` branch
containing the complete Fern site: `dev`, approved release snapshots, generated references,
and the version dropdown. Do not merge this generated branch back into `main`.

- Every push to `main` updates hosted `dev` after validation succeeds.
- Publishing a non-prerelease GitHub Release freezes the tagged docs and deploys the complete site
  to production. GitHub prereleases do not deploy automatically.
- **Sync Fern Website** accepts a release tag and optional source ref. Its manual mode defaults
  to **preview**; select **production** explicitly to publish or import a historical release.

The snapshot assembler uses YAML and Markdown/MDX syntax trees. Only generated snapshots have
links scoped to their version and snippet paths scoped to their frozen reference files. The
source prose remains unchanged. `fern/snapshots.yml` on `release/docs` records each snapshot's
source ref, resolved commit, and release tag.

## Review and publish a release

1. Run **Sync Fern Website** from `main`, select `channel: release`, enter `release_tag`, and
   optionally set `source_ref` to the branch or commit to review. Leave `mode: preview` selected.
2. Have the writer review the URL in the workflow run summary.
3. Publish the stable GitHub Release to deploy its tagged content automatically. For historical
   imports or other manual deployments, rerun with the reviewed source SHA and `mode: production`.

The highest semantic release version becomes the default automatically (for example, `v1.10.0`
is newer than `v1.9.0`). Older maintenance releases and historical imports do not move it backward.
Non-semantic tags can be imported but do not replace an existing semantic-version default.

A production run assembles and validates the complete site, commits it to `release/docs`, and
publishes it without `--preview`. A preview run builds the same candidate site in a temporary
checkout and publishes with `--preview`; it never updates the branch or the production site.
Existing versions are retained in both cases. Concurrent sync operations are serialized.
GitHub may replace a pending run when several are queued; rerun a skipped release manually.
If publishing fails after the snapshot commit, rerun with the same source SHA to retry.

Release snapshots cannot be replaced with a different source commit. For a reviewed documentation
correction, select a new `version_slug`, such as `v1.2.0-docs-1`. Development snapshots remain mutable.
The repository currently defines `dev` as the default; the generated site's first approved release
becomes the default. Other versions retain their explicit URL slugs.

## Import releases from before the migration

Old Sphinx releases must first be migrated to Fern on a dedicated branch based on that release.
Keep the original release tag unchanged. The migrated branch must contain the Fern configuration,
MDX pages, reference generator, and locked build dependencies for that release's Python models.

Run **Sync Fern Website** with the original `release_tag` and the migrated branch or commit as
`source_ref`. Start with `mode: preview`. After review, rerun with the same resolved commit SHA
and `mode: production`. The workflow generates and freezes that release's Python references alongside
its pages; later `dev` builds do not regenerate them. Importing older releases does not change an
existing newer default.

## GitHub environment setup

Configure these environments before publishing:

| Environment | Secret | Variables |
| --- | --- | --- |
| `docs-staging` | `FERN_TOKEN_PREVIEW` | `FERN_ORGANIZATION` (typically `nvidia-authed`), `FERN_DOCS_URL` |
| `docs-hosted` | `FERN_TOKEN` | `FERN_ORGANIZATION` (`nvidia`), `FERN_DOCS_URL` |

Confirm the instance URLs and writer access with the Fern administrators. Both instance URLs must
use the same path prefix (for example `/cloudai`), because frozen page links include it. The preview
flag alone does not provide authentication; NVIDIA's `nvidia-authed` organization does.

Allow the workflows to create and push `release/docs` using `GITHUB_TOKEN` (`contents: write`).
Automatic hosted dev publishing requires `docs-hosted` to permit `main` without required reviewers.
Allow release tags in `docs-hosted` for automatic release deployments as well. The workflow files
must be on the default branch for manual dispatch. Select `main` as the workflow ref so historical imports
use current automation, while `source_ref` selects the documentation being imported.

Check the snapshot assembler with `node --test tests/doc/test_sync_site.mjs` after `npm --prefix fern ci`.
