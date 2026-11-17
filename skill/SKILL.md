---
name: exia-package
description: Build, validate and publish Exia packages (exia.json) that install manga repositories, Stremio addons and metadata settings in the Exia app with a native setup flow. Use when asked to make an Exia package, an "Install in Exia" link or button, or to bundle sources and addons for Exia.
---

# Building Exia packages

An Exia package is one `exia.json` file. Exia reads it, shows each item with its icon, description and
reachable status, asks the setup questions on native pages, then installs everything at once. The package
never contains code or styling: Exia draws every screen.

The full rules are in `SPEC.md` at https://github.com/tronschell/exia-protocol. Read it when something
below doesn't cover the case.

## Steps

1. **List what to install.** Each thing is one item:
   - `repository`: an Aidoku or Paperback manga repository (`url`), optionally with extension `ids` to install.
   - `addon`: a Stremio addon (`url` ending in `/manifest.json`), optionally with `config`.
   - `metadata`: `provider` `anilist`, `kitsu`, `mal` or `tmdb`, with a `key` and/or `first: true`.
2. **Find the real URLs and ids.** Open the repository's `index.min.json` (Aidoku) or `versioning.json`
   (Paperback) and copy the extension `id`s. Open each addon's `manifest.json` to confirm it loads.
3. **Write each item's `title` (≤ 40 characters) and `description` (≤ 80, one line).** Say what it gives the
   person, plainly. Add `icon` (https, square) if the site's favicon isn't good.
4. **Ask only what's needed, as fields.** Put a field on the item that uses it; put shared fields in the
   package's `fields`. Templates `{{fieldId}}` carry answers into `url`, `key` and `config`.
   - API keys and tokens: `secret`, `required: true` if the item can't work without it, plus a `link`
     field titled like "Get an API Key" pointing at the page where the person makes one.
   - On/off options: `toggle`. One of several: `choice` with `options`.
   - A personal addon link: `text` with `format: "url"`, and `"url": "{{thatField}}"` on the addon.
   - Sign-in: `login` with a `url` containing `{{callback}}`; the page redirects to the callback with
     `?token=…`.
   - Show a field only sometimes: `when: { "otherField": value }` (other field must be an earlier toggle or choice).
   - If an item's `url` has templates, add `probe`: a URL without templates that answers now (for an addon,
     usually its plain `https://host/manifest.json`), so Exia can show it's reachable and its icon before
     the person types anything.
5. **Mark must-have items `required: true`.** Everything else gets a switch, on by default.
6. **Validate**, then fix every error and warning (each has a line, a column and usually a fix):
   ```sh
   npx exia-package validate exia.json
   npx exia-package render exia.json --set apiKey=test   # see the exact URLs
   npx exia-package check exia.json                      # reachable status
   ```
   Start from scratch with `npx exia-package init`. To try it on a phone, `npx exia-package serve` prints a
   QR code that opens the package in Exia over Wi-Fi.
7. **Publish.** Host `exia.json` over https. The quickest way is the template repository
   https://github.com/tronschell/exia-package-template ("Use this template", then Settings › Pages ›
   Source: GitHub Actions): every push is checked and published, and the run summary has the install link.
   Otherwise make the link and badge yourself:
   ```sh
   npx exia-package link https://you.github.io/pack/exia.json
   ```
   Put the printed HTML or Markdown badge on the page. In CI, `uses: tronschell/exia-protocol@v1` checks the file.

## Rules

- Never put a key, token or password in the package. Keys belong to the person: take them from a
  `secret` field. `secret` fields can't have a `default`.
- No descriptions anywhere except the package and item `description`. Field titles are short labels like
  "API Key", "Quality", "Sign In with Example".
- Field ids are unique across the whole package; `callback` is reserved.
- Bump `version` whenever the file changes; keep `id` the same forever, or Exia treats it as a new package.
- Unknown properties are ignored by Exia but flagged by the validator: treat the warning as a typo.

## Skeleton

```json
{
  "$schema": "https://raw.githubusercontent.com/tronschell/exia-protocol/main/schema/exia-package.schema.json",
  "exia": 1,
  "id": "io.github.you.pack",
  "name": "My Pack",
  "description": "What this pack sets up, in one line.",
  "version": "1.0.0",
  "items": [
    {
      "type": "repository",
      "title": "Example Comics",
      "description": "Webcomics in English.",
      "url": "https://comics.example.org/sources",
      "ids": ["org.example.comics.en"]
    },
    {
      "type": "addon",
      "title": "Example Films",
      "description": "Classic films, with your account.",
      "url": "https://films.example.org/{{filmsKey}}/manifest.json",
      "probe": "https://films.example.org/manifest.json",
      "fields": [
        { "type": "link", "title": "Get an API Key", "url": "https://films.example.org/keys" },
        { "type": "secret", "id": "filmsKey", "title": "API Key", "required": true }
      ]
    }
  ]
}
```

More examples: `examples/` in the repository.
