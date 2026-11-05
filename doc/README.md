# Documentation

Documentation is authored in `doc/*.mdx` and `doc/workloads/*.mdx` and built with Fern.
Keep the root README separate. Navigation lives in `fern/docs.yml`.
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

## Staging for writer review

The **Stage Fern Documentation** workflow deploys a preview when a GitHub Release is published
without the pre-release flag. It checks out the release tag, generates the Python reference,
validates the docs, and publishes a preview URL in the workflow run summary.
Each tag has a separate preview; rerunning the same tag updates its existing preview.

To stage a version manually, open **Actions → Stage Fern Documentation → Run workflow** and
enter its existing tag in `tag`. The tag must contain the Fern documentation and build files;
versions from before the migration cannot use this workflow. Manual dispatch requires the
workflow to be present on the default branch.

Configure the GitHub environment **docs-staging** before running the workflow:

- Secret `FERN_TOKEN_PREVIEW`: a Fern token authorized for the staging organization.
- Variable `FERN_ORGANIZATION`: the assigned staging organization (for example, `nvidia-authed`
  for authenticated previews). The workflow overrides the organization in its checkout only.
- Variable `FERN_DOCS_URL`: the provisioned Fern instance URL. The local validation default
  is not a deployment destination.

Confirm the staging organization, instance URL, and writer access with the Fern administrators.
The preview flag alone does not make a site private. Production publishing remains a separate,
manual operation; this workflow only publishes previews.
