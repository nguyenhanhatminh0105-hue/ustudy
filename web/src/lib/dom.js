/**
 * h('div.card', { onclick }, 'text', child) — builds DOM without innerHTML,
 * so user content is always inserted as text and can't become markup.
 */
export function h(tag, props = {}, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = {};
  }
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className += ` ${value}`;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key in el && key !== 'list' && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clear(el) {
  el.replaceChildren();
  return el;
}

/** Reads a form into a plain object; numbers stay strings so the API's validation explains bad input. */
export function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

/** Shows server-side field errors next to the matching inputs. */
export function showFieldErrors(form, errors = {}) {
  for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  for (const el of form.querySelectorAll('.field .error')) el.remove();
  for (const [name, message] of Object.entries(errors)) {
    const input = form.elements.namedItem(name);
    if (!input || !(input instanceof HTMLElement)) continue;
    input.setAttribute('aria-invalid', 'true');
    const id = `${input.id || name}-error`;
    input.setAttribute('aria-describedby', id);
    input.closest('.field')?.append(h('p.error', { id }, message));
  }
  form.querySelector('[aria-invalid="true"]')?.focus();
}

export function busy(button, on = true) {
  if (!button) return;
  button.toggleAttribute('disabled', on);
  button.setAttribute('aria-busy', String(on));
}
