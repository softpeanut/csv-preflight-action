# CSV Preflight Action

[简体中文](README.zh-CN.md)

Check one UTF-8 CSV for structural problems in GitHub Actions. The composite Action runs entirely
on the GitHub runner, requires no API key, and has no runtime dependency beyond Node.js 20 or later.

It detects:

- invalid UTF-8 and UTF-16 input;
- unclosed quoted fields;
- empty or duplicate headers;
- rows with the wrong number of columns; and
- duplicate rows.

The Action writes a normalized CSV when parsing succeeds and always writes an issue report. It
returns exit code 1 when it finds structural issues, so the workflow fails without silently
repairing ambiguous rows.

## Usage

```yaml
name: CSV preflight

on:
  pull_request:
    paths:
      - "data/import.csv"

permissions:
  contents: read

jobs:
  csv-preflight:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check CSV structure
        uses: softpeanut/csv-preflight-action@v1
        with:
          path: data/import.csv
          normalized_path: ${{ runner.temp }}/import.normalized.csv
          report_path: ${{ runner.temp }}/import.issues.csv
      - name: Preserve evidence
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: csv-preflight
          if-no-files-found: warn
          path: |
            ${{ runner.temp }}/import.normalized.csv
            ${{ runner.temp }}/import.issues.csv
```

For stronger supply-chain pinning, replace `v1` with the full commit SHA from the release you have
reviewed.

## Inputs

| Input | Required | Description |
| --- | --- | --- |
| `path` | yes | One CSV path, relative to the workspace or absolute. Maximum size: 10 MiB. |
| `normalized_path` | no | Normalized CSV destination. Defaults to the runner temporary directory. |
| `report_path` | no | Issue-report CSV destination. Defaults to the runner temporary directory. |

The input, normalized output, and report paths must be different. Existing output files are never
overwritten.

## Boundaries

This checks CSV structure, not importer-specific schemas or business rules. A clean result does not
guarantee that Shopify, an ERP, or another target system accepts the file. The Action itself makes
no network request, but your runner and later artifact steps remain part of your trust boundary.
Do not commit or upload secrets or regulated data merely because this validator is local to the
runner.

## Source and support

The implementation is dependency-free and MIT licensed. The browser checker, detailed workflow
guide, and test fixtures live in the [CSV Preflight project](https://github.com/softpeanut/csv-preflight).
Use [GitHub Issues](https://github.com/softpeanut/csv-preflight-action/issues) for reproducible bugs.

If the free Action saved you time, an optional Lightning tip can be sent to
[`softpeanut@stacker.news`](lightning:softpeanut@stacker.news). A tip buys no support, feature,
service, or import guarantee.

For teams that want this exact workflow configured against one public repository or sanitized
minimal reproduction, the optional [fixed-scope USD 99 setup terms](https://softpeanut.github.io/csv-preflight/ci-setup-terms.html)
define the deliverables, exclusions, and payment sequence before any work begins.
