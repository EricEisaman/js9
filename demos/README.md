# demos/data — READ ME, do not re-add a symlink here

## What happened
Upstream JS9 keeps demo data in a separate repo:

- `https://github.com/ericmandel/js9data` — “where to get the data files used by JS9 demo pages”

In the `js9` repo, `demos/data` was a symlink to that external data.
In a fork, that target does not exist in the checkout, so GitHub Pages / Jekyll fails:

```
No such file or directory @ rb_check_realpath_internal - /github/workspace/demos/data
```

## Fix in this fork
1. `demos/data` is now a real directory, not a symlink.
2. `.nojekyll` at repo root tells Pages to serve files as-is.
3. `.github/workflows/pages-static_v1.yml` deploys with `upload-pages-artifact` + `deploy-pages` — no Jekyll, no `jekyll-build-pages`.

Do NOT commit a symlink at `demos/data` again. Pages / Jekyll cannot follow symlinks to files outside the publishing source.

## If you want working demos
Option A — download the data tar from js9.org / `js9data` and copy real files into `demos/data/` (real files, not a symlink).
Option B — leave `demos/data/` empty. Core JS9 + NSO / Olympiad pages still work; demo pages that need those files will 404 for those files only.

## Local check before push
```bash
ls -l demos/data   # must show a directory, NOT: demos/data -> ...
test -L demos/data && echo "BROKEN: still a symlink" || echo "OK: not a symlink"
ls -l .nojekyll     # must exist
```
