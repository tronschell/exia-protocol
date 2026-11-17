# Install in Exia badges

Two badges: black for light pages, white for dark pages. Use the SVG where you can; the PNGs come in 1x, 2x
and 3x (216 × 48 at 1x).

| Black | White |
| ----- | ----- |
| ![Install in Exia, black](install-in-exia-black.svg) | ![Install in Exia, white](install-in-exia-white.svg) |

## Snippet

Replace `PACKAGE_URL` with your `exia.json` URL, percent-encoded (`node bin/exia-package.js link <url>` prints
it ready to paste).

```html
<a href="https://tronschell.github.io/exia-protocol/install/?url=PACKAGE_URL">
  <img src="https://raw.githubusercontent.com/tronschell/exia-protocol/main/badges/install-in-exia-black.svg"
       alt="Install in Exia" height="48">
</a>
```

Markdown, for a README:

```markdown
[![Install in Exia](https://raw.githubusercontent.com/tronschell/exia-protocol/main/badges/install-in-exia-black.svg)](https://tronschell.github.io/exia-protocol/install/?url=PACKAGE_URL)
```

The link goes to a small page that shows your package and opens Exia with
`projectexia://add?url=PACKAGE_URL`. On a page you control you can link to that app link directly.

## Rules

- Keep the badge's shape, colors and wording. Scale it, but no smaller than 32 px high.
- Leave at least 8 px of space around it.
- Use it only for links that install an Exia package.
