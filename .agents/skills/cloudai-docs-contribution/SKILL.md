---
name: cloudai-docs-contribution
description: Write, edit, or review CloudAI documentation, including Fern pages, README.md, release notes, and docstrings.
---

# CloudAI docs contribution

## Writing

- Write for the reader's task; keep PR history and implementation narration out of product docs.
- Describe behavior in the documented revision. Preserve prose during migrations unless changes are requested.
- Extend the relevant page and link existing explanations. Avoid boilerplate and unnecessary page hierarchies.
- Use concrete examples; distinguish tests, iterations, and DSE steps. Docstrings explain non-obvious behavior.
- Keep user instructions, reference details, and implementation rationale distinct.

## Fern authoring

- Edit `doc/*.mdx` and `doc/workloads/*.mdx`; filenames use lowercase and hyphens.
- `fern/dev.yml` defines navigation and page paths for every version, not just `dev`.
  `fern/docs.yml` holds site settings and version configuration. The root README is separate from Fern.
- Update navigation and incoming links when moving pages. Internal published links use `/cloudai/...`;
  unversioned links lead to the default stable version.
- Only Pydantic field tables are generated. Select models in `fern/reference.yml`; the generator is
  `doc/generate_reference.py`, with its Jinja template in `doc/templates/`.
- Include snippets where needed with `<Markdown src="/generated/<filename>.mdx" />`.
  Edit models or the generator, not `fern/generated/`. Keep methods and non-Pydantic references authored.
- Use model introspection for reference data, not regex-based Markdown conversion. Keep tooling minimal.

## Verification

- Run `make -C doc reference` after changing model references. Pre-commit also regenerates snippets;
  stage changed and newly generated files, then retry. CI runs the same hook.
- Run `uv run --locked --extra dev pre-commit run --files <changed-files>`.
- Use `make -C doc preview` (Python 3.14, uv, Node.js 24) to check affected rendering and links.
  Keep the configured legacy renderer. Do not add rendering tests or new tooling without a concrete need.

For deployment work only, read [publishing instructions](../../../doc/publishing.md).
