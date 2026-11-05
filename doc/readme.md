# Documentation

Write pages in `doc/*.mdx` and `doc/workloads/*.mdx`. Use lowercase filenames with hyphens.
Navigation lives in `fern/dev.yml`; shared site settings live in `fern/docs.yml`.
The root README is separate from the Fern site.

## Authoring and references

Install Python 3.14, uv, and Node.js 24. Run `make -C doc preview` for a local preview.
The preview uses Fern's legacy renderer because the Astro renderer currently loses page content
when compiled MDX modules return 404s.

Pydantic field tables in `fern/generated/` are committed alongside the source code. The pre-commit
hook regenerates them automatically using Griffe, Pydantic, and the Jinja template in `doc/templates/`.
When the hook changes files, stage those changes and commit again. Existing CI runs the same hook;
there is no separate rendering test suite. New generated files also cause the hook to fail until staged.

To regenerate explicitly, run `make -C doc reference`. Configure included classes in
`fern/reference.yml`. Only model fields are generated: types, defaults, descriptions, aliases,
and constraints. Methods and non-Pydantic classes stay in authored pages. Include a table where needed:
`<Markdown src="/generated/cloudai.workloads.sleep.sleep.sleepcmdargs.mdx" />`.
Authored pages are used directly, without generated copies. Internal Markdown links use published
paths such as `/cloudai/user-guide`; Fern's unversioned URLs lead to the default stable version.

## Publishing flow

| Event | Source | Destination |
| --- | --- | --- |
| Push to `main` | Exact triggering commit | Production `dev`, without approval |
| Push to `release/**` (except `release/docs`) | Exact triggering commit | Branch-specific preview |
| Published non-prerelease GitHub Release | Exact tagged commit | Release preview, then production after approval |
| Published prerelease | None | No deployment |
| Manual **Publish Fern Documentation** | Selected branch, tag, or SHA | Preview by default; production can be selected |

Manual production releases require `release_tag` and a `source_ref` resolving to that exact tag.
Manual development publishing accepts commits from `main`. Already published release versions
cannot be replaced with another commit. The highest numeric release version is the default;
maintenance releases do not move the default backward. All published releases remain listed.

For release approval, review the preview job's URL, then approve the release approval job in GitHub Actions.
The production job uses the same resolved source SHA and verifies that the release tag still points
there. The other versions are read afresh when production publishing starts, preserving any main
updates or other releases published during review.

## Where version state lives

The CI-managed `release/docs` branch contains only `fern/docs.yml` and `fern/fern.config.json`.
Its version entries pin source commit SHAs, which already contain the generated Python references.
It does not contain copies of pages. Do not merge this branch into development branches.

Each production run reads the latest configuration, updates one entry, publishes, and only then
commits the successful configuration to `release/docs`. Failed publishing leaves the registry
unchanged. If publication succeeds but saving the registry fails, rerun that job before approving
another production deployment; the Git push and Fern publication are not one atomic operation.

Preview runs read that registry and prepend a temporary candidate entry, making it the preview default. Existing production versions,
including the published `dev` SHA, remain unchanged. Each release branch has its own stable preview
URL. The run summary records the source SHA and URL; workflow artifacts retain the candidate
configuration and publish log. GitHub's artifact retention policy applies to this preview history.

GitHub Actions serializes production jobs with the `fern-production` concurrency group and
`queue: max`. Previews use separate groups per branch/ref. Approval happens in a separate job before acquiring the production slot, so waiting for a writer
does not block `dev` updates. No custom lock is needed. The stale-dev
check prevents an older queued commit from rolling production `dev` backward.

Fern checks out the pinned source refs to assemble the site. Publishing never runs historical
Python generators or creates generated-documentation commits on source branches.

## One-time GitHub setup

- Set the repository secret `FERN_TOKEN` for the `nvidia` organization. It serves both preview
  and production publishing.
- Set repository variable `FERN_DOCS_URL` to the provisioned Fern instance URL, including `/cloudai`.
  Confirm the hostname with the Fern administrators. The public custom domain is `docs.nvidia.com/cloudai`.
- Create `docs-preview` and `docs-hosted` environments without required reviewers.
- Create `docs-release` with the documentation reviewer(s) as required reviewers. This is the release
  approval gate; without that environment protection GitHub will publish automatically.
- Permit the appropriate workflow branches/tags in those environments. Allow workflows to create
  and update `release/docs` using `GITHUB_TOKEN` (`contents: write`).
- Merge publishing tools into `main` before using them. Every deployment reads tools and shared
  site settings from `main`; source documentation comes from the selected revision. Release branches
  need the trigger workflows, Fern configuration, and committed generated references.

The first production run creates the configuration branch. Until a stable release is published,
`dev` is the site's default version. Backfilling pre-Fern releases requires migrating their docs first.
