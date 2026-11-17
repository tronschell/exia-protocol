# Exia Package Protocol, version 1

An Exia package is one JSON file, `exia.json`, that tells Exia what to install and which questions to ask
first. Exia draws every screen itself with its own controls, so a package only describes the setup. It never
contains code, markup or styling.

A package can install three kinds of item, in any mix:

| Item type    | Installs                                                                 |
| ------------ | ------------------------------------------------------------------------ |
| `repository` | A manga repository in the Aidoku or Paperback format, and optionally some of its extensions |
| `addon`      | A Stremio addon, optionally configured with the person's answers          |
| `metadata`   | Settings for one of Exia's metadata providers (AniList, Kitsu, MyAnimeList, TMDB) |

The words MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119.

## 1. The file

```json
{
  "$schema": "https://raw.githubusercontent.com/tronschell/exia-protocol/main/schema/exia-package.schema.json",
  "exia": 1,
  "id": "org.example.starter",
  "name": "Starter Pack",
  "description": "Comics and films to start with.",
  "version": "1.0.0",
  "icon": "https://example.org/icon.png",
  "fields": [],
  "items": []
}
```

| Property      | Type    | Required | Rules |
| ------------- | ------- | -------- | ----- |
| `exia`        | integer | yes      | The protocol version. This document defines `1`. |
| `id`          | string  | yes      | Reverse-DNS, lowercase: `org.example.starter`. At most 100 characters. Exia uses it to tell an update from a new package. |
| `name`        | string  | yes      | 1 to 40 characters. |
| `description` | string  | no       | 1 to 80 characters, one line. |
| `version`     | string  | yes      | Semantic version: `1.0.0`, `2.1.0-beta.1`. |
| `icon`        | string  | no       | `https` URL of a square PNG or JPEG, at least 128 px. |
| `fields`      | array   | no       | Setup fields shared by every item (section 3). At most 20. |
| `items`       | array   | yes      | What to install (section 2). 1 to 50. |

`$schema` is for editors and is ignored by Exia. Clients MUST ignore properties they don't know, so a
package can carry extra data. Clients MUST refuse a package whose `exia` is higher than the version they
support, and SHOULD tell the person to update the app.

## 2. Items

Every item has these properties:

| Property      | Type    | Required | Rules |
| ------------- | ------- | -------- | ----- |
| `type`        | string  | yes      | `repository`, `addon` or `metadata`. |
| `title`       | string  | yes      | 1 to 40 characters. |
| `description` | string  | no       | 1 to 80 characters, one line. |
| `icon`        | string  | no       | `https` URL of a square image. See 2.4 for the fallback. |
| `required`    | boolean | no       | `true`: always installed. Default `false`: the person can switch the item off. |
| `fields`      | array   | no       | Setup fields for this item only (section 3). At most 20. |

An item that is switched off installs nothing, and its fields are not shown.

### 2.1 `repository`

| Property | Type            | Required | Rules |
| -------- | --------------- | -------- | ----- |
| `url`    | string          | yes      | The repository's URL: its base, or its `index.min.json` (Aidoku) or `versioning.json` (Paperback). Templates allowed (section 4). |
| `ids`    | array of string | no       | Extension ids to install from the repository. Without `ids`, only the repository is added and the person picks extensions later. |

The client works out whether the repository is Aidoku or Paperback. Every id in `ids` MUST exist in the
repository at install time, or the install fails.

### 2.2 `addon`

| Property | Type   | Required | Rules |
| -------- | ------ | -------- | ----- |
| `url`    | string | yes      | The addon's manifest URL, ending in `/manifest.json`. Templates allowed. |
| `config` | object | no       | Settings for addons built on the Stremio addon SDK. Keys are 1 to 64 of `A-Z a-z 0-9 _ . -`; values are strings, booleans or integers. String values may hold templates. |

With `config`, `url` MUST end in `/manifest.json`, and the client installs the SDK's configured URL:

```
<url without /manifest.json>/<encodeURIComponent(JSON of config)>/manifest.json
```

The JSON has its keys sorted, no whitespace, and `/` left unescaped. Entries whose value renders to an
empty string are left out. When `config` is empty after that, `url` is installed as it is.

A `url` that is a template alone (`"{{addonURL}}"`, naming a `text` field with `"format": "url"`) lets the
person paste a personal addon link.

### 2.3 `metadata`

| Property   | Type    | Required | Rules |
| ---------- | ------- | -------- | ----- |
| `provider` | string  | yes      | `anilist`, `kitsu`, `mal` or `tmdb`. |
| `key`      | string  | no       | `tmdb`: an API key. `mal`, `anilist`: a client ID. Not allowed for `kitsu`. Templates allowed. |
| `first`    | boolean | no       | `anilist`, `kitsu`, `mal`: put this provider first for manga and anime. Not allowed for `tmdb`. |

An item needs `key` or `first`. A `key` that renders empty is skipped, so an optional key never clears one
the person already has. Keys belong to the person: a package MUST take them from a field, never ship one.

For a metadata source of your own, publish a Stremio addon with `catalog` and `meta` resources and install
it as an `addon` item.

### 2.4 Icons

The client shows the first of these that loads:

1. the item's `icon`;
2. the addon manifest's `logo`, or for a `repository` with one id, that extension's icon;
3. `https://<host>/apple-touch-icon.png`, then `https://<host>/favicon.ico`, where host is the item URL's host
   (for `metadata`, the provider's own logo).

### 2.5 Reachable status

Before installing, the client checks each item and shows whether it's reachable:

- `repository`: the repository index loads (`index.min.json` or `versioning.json`).
- `addon`: the manifest loads. With `config`, the plain `url` is checked. A `url` that still has empty
  templates is checked once they are filled in.
- `metadata`: no check.

An unreachable item can still be installed: the install fails cleanly if it's still down.

## 3. Fields

Fields are the setup questions. Package `fields` are shown first, on one page titled with the package name.
Then each item that is switched on and has `fields` gets its own page, titled with the item's title, in item
order. The last page installs.

Every field has a `type` and a `title` (1 to 40 characters). Every type except `link` has an `id`: 1 to 32
characters, a letter then letters, digits or `_`. Ids are unique across the whole package. `callback` is
reserved.

| Type     | Shows as | Value | Extra properties |
| -------- | -------- | ----- | ---------------- |
| `text`   | A text field | string | `required`, `default` (string), `format`: `url`, `email` or `number` |
| `secret` | A hidden text field | string | `required` |
| `toggle` | A switch | boolean | `default` (boolean, default `false`) |
| `choice` | A menu | string | `options` (required), `default` (one of the option values; default the first) |
| `login`  | A sign-in button | string | `url` (required), `param`, `required` |
| `link`   | A row that opens a web page | none | `url` (required) |

Every field may have `when` (3.2).

`choice` options are objects `{ "value": "en", "title": "English" }`, 2 to 50 of them, with unique values
of 1 to 64 characters.

`format` sets the keyboard and checks the answer: `url` must be an `http` or `https` URL, `email` must
contain `@`, `number` must be digits.

A field with `required: true` must be filled in before the person can continue. `secret` has no
`default`, so a package never carries a secret.

### 3.1 `login`

`url` is an `https` page that signs the person in. It MUST contain `{{callback}}`, which the client
replaces with its own callback URL, percent-encoded. When sign-in finishes, the page redirects to that
callback with the token in the query or fragment, under the name in `param` (default `token`):

```
projectexia://package-login?token=abc123
```

The token is the field's value. Exia opens the page in the system's web sign-in sheet.

### 3.2 `when`

`when` shows a field only while other fields have certain values:

```json
{ "type": "secret", "id": "apiKey", "title": "API Key", "required": true, "when": { "plan": ["pro", "team"] } }
```

Each key names a `toggle` or `choice` field declared earlier in the same scope (the package fields, then
the item's own fields). The value is a boolean for a toggle, and a string or a list of strings for a choice.
Every key must match. A hidden field is not required, and its value is empty (`""` or `false`).

## 4. Templates

`{{fieldId}}` in an item's `url`, `key` or a `config` string is replaced with that field's value. An item
can use the package fields and its own fields.

- In `url`, the value is percent-encoded like JavaScript's `encodeURIComponent`. A `url` that is one
  template alone is inserted as it is; that template must name a `text` field with `"format": "url"`.
- In `key` and `config`, it is inserted as it is.
- A `config` value that is exactly one template (`"{{hd}}"`) takes the field's type, so a toggle gives
  `true` or `false`.
- Booleans in text become `true` or `false`.

`{{callback}}` is only allowed in a `login` field's `url`.

## 5. Installing

1. The person opens the package: a link, a pasted URL, or the Install in Exia button (section 7).
2. The client shows the package: its icon, name, description and version, then every item with its icon,
   title, description, reachable status and a switch (none for `required` items).
3. The setup pages follow, as in section 3.
4. The client renders every item that is on, then fetches and checks all of them before saving anything.
   If one fails, nothing is installed and the failing item is named.
5. Items are added in order. An addon with the same id as one already installed replaces it in place.

The client remembers the package URL, which items were on, and the answers. Answers to `secret` and
`login` fields MUST be kept in secure storage, never with the other settings.

Opening an installed package fetches the latest `exia.json` and shows the same pages filled in. Saving
installs the new result and removes what the package installed before but no longer does. Uninstalling a
package removes the repositories, extensions and addons it added. Metadata settings stay.

## 6. Hosting

Serve `exia.json` over `https` with any JSON content type. GitHub Pages works. A client given a URL that
doesn't end in `.json` tries `<url>/exia.json`.

## 7. Install links

```
projectexia://add?url=<percent-encoded exia.json URL>
```

`exia://add?url=…` works too. Custom schemes are stripped from many sites (GitHub READMEs among them), so
the Install in Exia button links to a web page that opens the app:

```
https://tronschell.github.io/exia-protocol/install/?url=<percent-encoded exia.json URL>
```

The badges and a copy-paste snippet are in [`badges/`](badges/).

## 8. What a client checks

A package that fails any rule in this document MUST NOT be installed. The rules that JSON Schema can't
express are:

- field ids are unique across the package and `callback` isn't one of them;
- every template names a field in scope that isn't a `link`;
- `when` names an earlier `toggle` or `choice` in scope, with values it can take;
- a `choice` default is one of its options, and option values are unique;
- `ids` has no duplicates;
- a `metadata` item has `key` or `first`, and only where the provider allows it.

The reference validator in [`src/`](src/) checks all of it.
