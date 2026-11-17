# Changelog

Changes to the protocol (SPEC.md) and the `exia-package` tools. Protocol version stays `exia: 1` unless noted.

## 1.1.0 - 2026-11-17

### Added
- `probe` on `repository` and `addon` items: a URL that answers now, so Exia shows reachable status and the
  icon before the person fills in templates. `validate` warns when a templated `url` has no `probe`.
- Clients may load packages over `http` from private network addresses while testing.
- Compatibility rules (SPEC.md section 9).
- `exia-package serve`: hosts your package on your Wi-Fi with a QR code that opens it in Exia, and checks it
  again on every save.
- `exia-package init`: writes a starter `exia.json`.
- `validate` gives the line and column of every problem, suggests the right word for typos, and marks lines in
  GitHub Actions. `--json` prints machine-readable results.
- A GitHub Action: `uses: tronschell/exia-protocol@v1`.
- Published to npm as `exia-package`.

## 1.0.0 - 2026-11-17

### Added
- Exia Package Protocol version 1: repositories, addons, metadata, setup fields, templates, install links.
