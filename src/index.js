// Reference implementation of the Exia Package Protocol, version 1 (see SPEC.md).
// No dependencies: validate(), render(), probes() and installLink().

export const PROTOCOL_VERSION = 1;
export const CALLBACK_URL = 'projectexia://package-login';
export const INSTALL_PAGE = 'https://tronschell.github.io/exia-protocol/install/';

const FIELD_TYPES = ['text', 'secret', 'toggle', 'choice', 'login', 'link'];
const ITEM_TYPES = ['repository', 'addon', 'metadata'];
const PROVIDERS = ['anilist', 'kitsu', 'mal', 'tmdb'];
const KEY_PROVIDERS = ['anilist', 'mal', 'tmdb'];
const LIST_PROVIDERS = ['anilist', 'kitsu', 'mal'];

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;
const FIELD_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const CONFIG_KEY_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
const PARAM_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
const TEMPLATE = /\{\{([^{}]*)\}\}/g;
const WHOLE_TEMPLATE = /^\{\{([A-Za-z][A-Za-z0-9_]{0,31})\}\}$/;

const PACKAGE_KEYS = ['$schema', 'exia', 'id', 'name', 'description', 'version', 'icon', 'fields', 'items'];
const ITEM_KEYS = {
  common: ['type', 'title', 'description', 'icon', 'required', 'fields'],
  repository: ['url', 'ids'],
  addon: ['url', 'config'],
  metadata: ['provider', 'key', 'first'],
};
const FIELD_KEYS = {
  text: ['type', 'id', 'title', 'required', 'default', 'format', 'when'],
  secret: ['type', 'id', 'title', 'required', 'when'],
  toggle: ['type', 'id', 'title', 'default', 'when'],
  choice: ['type', 'id', 'title', 'options', 'default', 'when'],
  login: ['type', 'id', 'title', 'url', 'param', 'required', 'when'],
  link: ['type', 'title', 'url', 'when'],
};

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isString = (v) => typeof v === 'string';
const length = (s) => [...s].length;

function parseURL(value, { https = false } = {}) {
  try {
    const url = new URL(value);
    if (https ? url.protocol !== 'https:' : !['http:', 'https:'].includes(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

/** Template names in a string, in order (may repeat). */
export function templates(value) {
  return isString(value) ? [...value.matchAll(TEMPLATE)].map((m) => m[1]) : [];
}

/**
 * Checks a parsed exia.json against every rule in SPEC.md.
 * Returns { valid, errors: [{ path, message }], warnings: [{ path, message }] }.
 */
export function validate(pkg) {
  const errors = [];
  const warnings = [];
  const error = (path, message) => errors.push({ path, message });
  const warn = (path, message) => warnings.push({ path, message });

  if (!isObject(pkg)) {
    error('', 'the package must be a JSON object');
    return { valid: false, errors, warnings };
  }

  const unknown = (object, allowed, path) => {
    for (const key of Object.keys(object)) {
      if (!allowed.includes(key)) warn(path ? `${path}.${key}` : key, `unknown property "${key}" is ignored`);
    }
  };
  const text = (value, path, max, required) => {
    if (value === undefined) {
      if (required) error(path, 'is required');
      return;
    }
    if (!isString(value) || value.trim() === '') return error(path, 'must be a non-empty string');
    if (length(value) > max) error(path, `must be at most ${max} characters`);
    if (/[\r\n]/.test(value)) error(path, 'must be one line');
  };
  const iconURL = (value, path) => {
    if (value === undefined) return;
    if (!isString(value) || !parseURL(value, { https: true })) error(path, 'must be an https URL');
  };

  // Package
  unknown(pkg, PACKAGE_KEYS, '');
  if (pkg.exia === undefined) error('exia', 'is required');
  else if (!Number.isInteger(pkg.exia) || pkg.exia < 1) error('exia', 'must be a positive integer');
  else if (pkg.exia > PROTOCOL_VERSION) error('exia', `needs protocol version ${pkg.exia}; this validator supports ${PROTOCOL_VERSION}`);

  if (pkg.id === undefined) error('id', 'is required');
  else if (!isString(pkg.id) || !ID_PATTERN.test(pkg.id) || pkg.id.length > 100) {
    error('id', 'must be a lowercase reverse-DNS id like "org.example.pack", at most 100 characters');
  }
  text(pkg.name, 'name', 40, true);
  text(pkg.description, 'description', 80, false);
  if (pkg.version === undefined) error('version', 'is required');
  else if (!isString(pkg.version) || !VERSION_PATTERN.test(pkg.version)) error('version', 'must be a semantic version like "1.0.0"');
  iconURL(pkg.icon, 'icon');

  // Fields
  const declared = new Map(); // id -> field, across the package
  const checkFields = (fields, path, scope) => {
    // scope: Map of ids visible to this list, in declaration order (package fields first).
    if (fields === undefined) return;
    if (!Array.isArray(fields)) return error(path, 'must be an array');
    if (fields.length > 20) error(path, 'can have at most 20 fields');
    fields.forEach((field, index) => {
      const at = `${path}[${index}]`;
      if (!isObject(field)) return error(at, 'must be an object');
      if (!FIELD_TYPES.includes(field.type)) {
        return error(`${at}.type`, `must be one of ${FIELD_TYPES.join(', ')}`);
      }
      unknown(field, FIELD_KEYS[field.type], at);
      text(field.title, `${at}.title`, 40, true);

      if (field.type === 'link') {
        if (field.id !== undefined) error(`${at}.id`, 'a link has no id');
      } else if (field.id === undefined) {
        error(`${at}.id`, 'is required');
      } else if (!isString(field.id) || !FIELD_ID_PATTERN.test(field.id)) {
        error(`${at}.id`, 'must be 1 to 32 characters: a letter, then letters, digits or _');
      } else if (field.id === 'callback') {
        error(`${at}.id`, '"callback" is reserved');
      } else if (declared.has(field.id)) {
        error(`${at}.id`, `"${field.id}" is already used by another field`);
      }

      if (field.required !== undefined && typeof field.required !== 'boolean') error(`${at}.required`, 'must be true or false');

      switch (field.type) {
        case 'text':
          if (field.default !== undefined && !isString(field.default)) error(`${at}.default`, 'must be a string');
          if (field.format !== undefined && !['url', 'email', 'number'].includes(field.format)) {
            error(`${at}.format`, 'must be url, email or number');
          }
          break;
        case 'toggle':
          if (field.default !== undefined && typeof field.default !== 'boolean') error(`${at}.default`, 'must be true or false');
          break;
        case 'choice': {
          if (!Array.isArray(field.options)) {
            error(`${at}.options`, 'is required and must be an array');
            break;
          }
          if (field.options.length < 2 || field.options.length > 50) error(`${at}.options`, 'must have 2 to 50 options');
          const values = new Set();
          field.options.forEach((option, i) => {
            const op = `${at}.options[${i}]`;
            if (!isObject(option)) return error(op, 'must be an object with value and title');
            unknown(option, ['value', 'title'], op);
            if (!isString(option.value) || option.value === '' || length(option.value) > 64) {
              error(`${op}.value`, 'must be a string of 1 to 64 characters');
            } else if (values.has(option.value)) {
              error(`${op}.value`, `"${option.value}" is listed twice`);
            } else {
              values.add(option.value);
            }
            text(option.title, `${op}.title`, 40, true);
          });
          if (field.default !== undefined && !values.has(field.default)) error(`${at}.default`, 'must be one of the option values');
          break;
        }
        case 'login': {
          if (field.url === undefined) error(`${at}.url`, 'is required');
          else if (!isString(field.url) || !parseURL(field.url.replaceAll('{{callback}}', 'x'), { https: true })) {
            error(`${at}.url`, 'must be an https URL');
          } else {
            if (!field.url.includes('{{callback}}')) error(`${at}.url`, 'must contain {{callback}}');
            for (const name of templates(field.url)) {
              if (name !== 'callback') error(`${at}.url`, `only {{callback}} is allowed here, not {{${name}}}`);
            }
          }
          if (field.param !== undefined && (!isString(field.param) || !PARAM_PATTERN.test(field.param))) {
            error(`${at}.param`, 'must be 1 to 64 of A-Z a-z 0-9 _ . -');
          }
          break;
        }
        case 'link':
          if (field.url === undefined) error(`${at}.url`, 'is required');
          else if (!isString(field.url) || !parseURL(field.url)) error(`${at}.url`, 'must be an http or https URL');
          else if (!parseURL(field.url, { https: true })) warn(`${at}.url`, 'should use https');
          break;
        default:
          break;
      }

      if (field.when !== undefined) {
        if (!isObject(field.when) || Object.keys(field.when).length === 0) {
          error(`${at}.when`, 'must be an object naming at least one field');
        } else {
          for (const [ref, expected] of Object.entries(field.when)) {
            const target = scope.get(ref);
            const wp = `${at}.when.${ref}`;
            if (!target) {
              error(wp, `"${ref}" isn't a field declared earlier in this scope`);
            } else if (target.type === 'toggle') {
              if (typeof expected !== 'boolean') error(wp, 'must be true or false for a toggle');
            } else if (target.type === 'choice') {
              const options = new Set((Array.isArray(target.options) ? target.options : []).map((o) => o?.value));
              const list = Array.isArray(expected) ? expected : [expected];
              if (list.length === 0 || !list.every(isString)) error(wp, 'must be a string or a list of strings for a choice');
              else for (const v of list) if (!options.has(v)) error(wp, `"${v}" isn't one of ${ref}'s options`);
            } else {
              error(wp, `"${ref}" must be a toggle or a choice`);
            }
          }
        }
      }

      if (field.type !== 'link' && isString(field.id) && FIELD_ID_PATTERN.test(field.id) && field.id !== 'callback' && !declared.has(field.id)) {
        declared.set(field.id, field);
        scope.set(field.id, field);
      }
    });
  };

  const packageScope = new Map();
  checkFields(pkg.fields, 'fields', packageScope);

  // Template references
  const checkTemplates = (value, path, scope) => {
    for (const name of templates(value)) {
      if (name === 'callback') error(path, '{{callback}} is only allowed in a login url');
      else if (!scope.has(name)) error(path, `{{${name}}} doesn't name a field this item can use`);
    }
  };
  const checkURL = (value, path, scope) => {
    if (value === undefined) return error(path, 'is required');
    if (!isString(value) || value === '') return error(path, 'must be a URL');
    checkTemplates(value, path, scope);
    const whole = value.match(WHOLE_TEMPLATE);
    if (whole) {
      const target = scope.get(whole[1]);
      if (target && !(target.type === 'text' && target.format === 'url')) {
        error(path, `a url that is only {{${whole[1]}}} needs a text field with "format": "url"`);
      }
      return;
    }
    const sample = value.replace(TEMPLATE, 'x');
    if (!parseURL(sample)) error(path, 'must be an http or https URL');
    else if (!parseURL(sample, { https: true })) warn(path, 'should use https');
  };

  // Items
  if (pkg.items === undefined) error('items', 'is required');
  else if (!Array.isArray(pkg.items)) error('items', 'must be an array');
  else {
    if (pkg.items.length < 1 || pkg.items.length > 50) error('items', 'must have 1 to 50 items');
    pkg.items.forEach((item, index) => {
      const at = `items[${index}]`;
      if (!isObject(item)) return error(at, 'must be an object');
      if (!ITEM_TYPES.includes(item.type)) return error(`${at}.type`, `must be one of ${ITEM_TYPES.join(', ')}`);
      unknown(item, [...ITEM_KEYS.common, ...ITEM_KEYS[item.type]], at);
      text(item.title, `${at}.title`, 40, true);
      text(item.description, `${at}.description`, 80, false);
      iconURL(item.icon, `${at}.icon`);
      if (item.required !== undefined && typeof item.required !== 'boolean') error(`${at}.required`, 'must be true or false');

      const scope = new Map(packageScope);
      checkFields(item.fields, `${at}.fields`, scope);

      switch (item.type) {
        case 'repository':
          checkURL(item.url, `${at}.url`, scope);
          if (item.ids !== undefined) {
            if (!Array.isArray(item.ids) || item.ids.length === 0) error(`${at}.ids`, 'must be a non-empty array of extension ids');
            else {
              const seen = new Set();
              item.ids.forEach((id, i) => {
                if (!isString(id) || id === '') error(`${at}.ids[${i}]`, 'must be a non-empty string');
                else if (seen.has(id)) error(`${at}.ids[${i}]`, `"${id}" is listed twice`);
                else seen.add(id);
              });
            }
          }
          break;
        case 'addon': {
          checkURL(item.url, `${at}.url`, scope);
          const literal = isString(item.url) && templates(item.url).length === 0;
          if (isString(item.url) && (literal || item.config !== undefined) && !item.url.endsWith('/manifest.json')) {
            error(`${at}.url`, item.config !== undefined ? 'must end in /manifest.json when config is set' : 'must end in /manifest.json');
          }
          if (item.config !== undefined) {
            if (!isObject(item.config)) error(`${at}.config`, 'must be an object');
            else {
              for (const [key, value] of Object.entries(item.config)) {
                const cp = `${at}.config.${key}`;
                if (!CONFIG_KEY_PATTERN.test(key)) error(cp, 'key must be 1 to 64 of A-Z a-z 0-9 _ . -');
                if (isString(value)) checkTemplates(value, cp, scope);
                else if (typeof value !== 'boolean' && !Number.isInteger(value)) error(cp, 'must be a string, boolean or integer');
              }
            }
          }
          break;
        }
        case 'metadata': {
          if (!PROVIDERS.includes(item.provider)) {
            error(`${at}.provider`, `must be one of ${PROVIDERS.join(', ')}`);
            break;
          }
          if (item.key !== undefined) {
            if (!KEY_PROVIDERS.includes(item.provider)) error(`${at}.key`, `${item.provider} takes no key`);
            else if (!isString(item.key) || item.key === '') error(`${at}.key`, 'must be a non-empty string');
            else {
              checkTemplates(item.key, `${at}.key`, scope);
              if (templates(item.key).length === 0) warn(`${at}.key`, 'is written into the package; keys belong to the person, so take it from a field');
            }
          }
          if (item.first !== undefined) {
            if (typeof item.first !== 'boolean') error(`${at}.first`, 'must be true or false');
            else if (!LIST_PROVIDERS.includes(item.provider)) error(`${at}.first`, `${item.provider} has no lists to put first`);
          }
          if (item.key === undefined && item.first !== true) error(at, 'a metadata item needs key or first');
          break;
        }
        default:
          break;
      }
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

// MARK: Rendering

/** Percent-encodes like JavaScript's encodeURIComponent (also the spec's rule for Swift and other clients). */
export function encode(value) {
  return encodeURIComponent(String(value));
}

/** JSON with keys sorted, no whitespace and "/" left unescaped (JSON.stringify never escapes it). */
export function canonicalJSON(object) {
  const sorted = {};
  for (const key of Object.keys(object).sort()) sorted[key] = object[key];
  return JSON.stringify(sorted);
}

function allFields(pkg) {
  const list = (pkg.fields ?? []).map((field) => ({ field, item: null }));
  (pkg.items ?? []).forEach((item, index) => {
    for (const field of item.fields ?? []) list.push({ field, item: index });
  });
  return list.filter(({ field }) => field.type !== 'link');
}

function defaultValue(field) {
  switch (field.type) {
    case 'toggle': return field.default ?? false;
    case 'choice': return field.default ?? field.options?.[0]?.value ?? '';
    case 'text': return field.default ?? '';
    default: return '';
  }
}

const emptyValue = (field) => (field.type === 'toggle' ? false : '');

function matches(when, values) {
  return Object.entries(when).every(([ref, expected]) => {
    const value = values[ref];
    return Array.isArray(expected) ? expected.includes(value) : value === expected;
  });
}

/**
 * Works out what an install would do with the given answers.
 * options.values: { fieldId: value }; options.enabled: { itemIndex: boolean } (items default to on).
 * Returns { fields: [{ id, item, visible, value }], missing: [{ id, item }], items: [...] }.
 * Each item: { index, type, title, enabled, url?, ids?, provider?, key?, first?, probe?, skipped? }.
 */
export function render(pkg, { values = {}, enabled = {} } = {}) {
  const itemOn = (index) => pkg.items[index].required === true || enabled[index] !== false;
  const effective = {};
  const fields = [];
  for (const { field, item } of allFields(pkg)) {
    const given = Object.hasOwn(values, field.id) ? values[field.id] : defaultValue(field);
    const shown = (item === null || itemOn(item)) && (!field.when || matches(field.when, effective));
    const value = shown ? given : emptyValue(field);
    effective[field.id] = value;
    fields.push({ id: field.id, item, visible: shown, value });
  }

  const missing = [];
  for (const entry of fields) {
    const field = allFields(pkg).find((f) => f.field.id === entry.id).field;
    if (!entry.visible || !field.required) continue;
    if (entry.value === '' || entry.value === undefined || entry.value === null) missing.push({ id: entry.id, item: entry.item });
  }
  // Package fields only count when at least one item is on.
  const anyOn = pkg.items.some((_, i) => itemOn(i));
  const relevantMissing = anyOn ? missing : missing.filter((m) => m.item !== null);

  const asText = (value) => (typeof value === 'boolean' ? String(value) : String(value ?? ''));
  // A url that is one template alone is the person's own link, inserted as typed.
  const inURL = (template) => (WHOLE_TEMPLATE.test(template)
    ? asText(effective[template.match(WHOLE_TEMPLATE)[1]])
    : template.replace(TEMPLATE, (_, name) => encode(asText(effective[name]))));
  const raw = (template) => template.replace(TEMPLATE, (_, name) => asText(effective[name]));
  const filled = (template) => templates(template).every((name) => asText(effective[name]) !== '');

  const items = pkg.items.map((item, index) => {
    const base = { index, type: item.type, title: item.title, enabled: itemOn(index) };
    if (item.type === 'repository') {
      const url = inURL(item.url);
      return { ...base, url, ids: item.ids ?? [], probe: filled(item.url) ? url : null };
    }
    if (item.type === 'addon') {
      let url = inURL(item.url);
      let probe = filled(item.url) ? url : null;
      if (item.config) {
        const config = {};
        for (const [key, value] of Object.entries(item.config)) {
          let result = value;
          if (isString(value)) {
            const whole = value.match(WHOLE_TEMPLATE);
            result = whole ? effective[whole[1]] : raw(value);
          }
          if (result !== '' && result !== undefined) config[key] = result;
        }
        if (Object.keys(config).length > 0) {
          url = `${url.slice(0, -'/manifest.json'.length)}/${encode(canonicalJSON(config))}/manifest.json`;
        }
      }
      return { ...base, url, probe };
    }
    // metadata
    const key = item.key === undefined ? '' : raw(item.key);
    const result = { ...base, provider: item.provider, first: item.first === true };
    if (key !== '') result.key = key;
    if (key === '' && !result.first) result.skipped = true;
    return result;
  });

  return { fields, missing: relevantMissing, items };
}

/** The URLs to check for each item's reachable status (null: nothing to check yet). */
export function probes(pkg, options) {
  return render(pkg, options).items.map((item) => {
    if (item.type === 'metadata') return null;
    if (!item.probe) return null;
    if (item.type === 'addon') return [item.probe];
    const url = item.probe.replace(/\/+$/, '');
    if (/\.json$/i.test(url)) return [url];
    return [`${url}/index.min.json`, `${url}/versioning.json`];
  });
}

/** The two install links for a hosted exia.json: the app link and the web page that opens it. */
export function installLink(packageURL) {
  const encoded = encode(packageURL);
  return { app: `projectexia://add?url=${encoded}`, web: `${INSTALL_PAGE}?url=${encoded}` };
}
