// Small helpers that every page uses.


// ----- Finding things on the page -----

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}


// ----- Safe text -----

// Anything a person typed must go through this before it goes into innerHTML,
// otherwise someone could type HTML into a form and break the page.
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Trims what someone typed and cuts it to a maximum length.
function cleanText(value, maxLength) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}


// ----- Small utilities -----

function icon(name) {
  return `<svg class="icon"><use href="#icon-${name}"/></svg>`;
}

// A random id like "e1kq2x9abcd" for new database documents.
function makeId(prefix) {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 7);
  return prefix + time + random;
}

// Turns "34.06" into 34.06, and empty values into NaN.
function toNumber(value) {
  if (value === null || value === undefined || value === '') return NaN;
  return Number(value);
}

function hasCoordinates(place) {
  return Number.isFinite(toNumber(place.lat)) && Number.isFinite(toNumber(place.lng));
}

function toggleInSet(set, value) {
  if (set.has(value)) {
    set.delete(value);
  } else {
    set.add(value);
  }
}

// localStorage can throw an error in private browsing, so it's wrapped here.
const savedSettings = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      // the setting just won't be remembered
    }
  }
};


// ----- Translation and formatting -----

// t('see_all', { n: 5 }) looks up "See all {n} items" and fills in the 5.
function t(key, values) {
  const words = TRANSLATIONS[state.language] || TRANSLATIONS.en;
  let text = words[key];
  if (text === undefined) text = TRANSLATIONS.en[key];
  if (text === undefined) text = key;

  if (values) {
    for (const name in values) {
      text = text.split('{' + name + '}').join(String(values[name]));
    }
  }
  return text;
}

// The dashboard is English only, so it uses this instead of t().
function english(key) {
  return TRANSLATIONS.en[key] || key;
}

// Browsers want "zh-CN" for Chinese number and date formats.
function localeCode(language) {
  if (!language) language = state.language;
  return language === 'zh' ? 'zh-CN' : language;
}

function formatNumber(number, language) {
  try {
    return new Intl.NumberFormat(localeCode(language)).format(Number(number) || 0);
  } catch (error) {
    return String(number);
  }
}

function formatMiles(miles) {
  try {
    const format = new Intl.NumberFormat(localeCode(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return format.format(miles);
  } catch (error) {
    return miles.toFixed(1);
  }
}

// "1 can" vs "3 cans". Russian has three forms (1 банка, 2 банки, 5 банок),
// so the browser's plural rules pick the right one.
function unitName(unitCode, amount, language) {
  if (!language) language = state.language;
  const unit = UNITS[unitCode];
  if (!unit) return unitCode || '';

  const forms = unit[language] || unit.en;
  if (typeof forms === 'string') return forms; // Chinese has no plural

  let rule = 'other';
  try {
    rule = new Intl.PluralRules(localeCode(language)).select(Number(amount) || 0);
  } catch (error) {
    // very old browser, use the plural
  }

  if (language === 'ru') {
    if (rule === 'one') return forms[0];
    if (rule === 'many') return forms[2];
    return forms[1];
  }
  return rule === 'one' ? forms[0] : forms[1];
}

// "5 minutes ago", "yesterday", in the right language.
function timeAgo(timestamp, language) {
  if (!timestamp) return '';
  let format;
  try {
    format = new Intl.RelativeTimeFormat(localeCode(language), { numeric: 'auto' });
  } catch (error) {
    return '';
  }

  const seconds = (Number(timestamp) - Date.now()) / 1000;
  const size = Math.abs(seconds);
  if (size < 45) return format.format(0, 'second');
  if (size < 60 * 60) return format.format(Math.round(seconds / 60), 'minute');
  if (size < 60 * 60 * 24) return format.format(Math.round(seconds / 3600), 'hour');
  return format.format(Math.round(seconds / 86400), 'day');
}

// Fills in every element marked with data-i18n, data-i18n-placeholder or data-i18n-label.
function applyTranslations() {
  document.documentElement.lang = localeCode();

  for (const element of $all('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of $all('[data-i18n-placeholder]')) {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  }
  for (const element of $all('[data-i18n-label]')) {
    element.setAttribute('aria-label', t(element.dataset.i18nLabel));
  }
  // form messages that are showing switch language too
  for (const element of $all('[data-message-key]')) {
    element.textContent = t(element.dataset.messageKey);
  }
}


// ----- Pieces of HTML used on several pages -----

// A pill-shaped toggle button. "extra" is for additional attributes like data-time="lunch".
function chipButton(action, value, label, isOn, extra) {
  return `
    <button type="button" class="chip" data-action="${action}" data-value="${escapeHtml(value)}"
      aria-pressed="${isOn ? 'true' : 'false'}" ${extra || ''}>${escapeHtml(label)}</button>`;
}

// The row of steps under a request: Sent → Being packed → Ready → Picked up.
function progressSteps(steps, currentStep, labelPrefix) {
  const currentIndex = Math.max(0, steps.indexOf(currentStep));

  const parts = steps.map((step, index) => {
    let className = '';
    if (index < currentIndex) className = 'done';
    if (index === currentIndex) className = 'current';
    return `<span class="${className}">${escapeHtml(t(labelPrefix + step))}</span>`;
  });

  return `<div class="progress" style="--steps: ${steps.length}">${parts.join('')}</div>`;
}


// ----- Form messages and pop-ups -----

// Shows a translated message under a form. It remembers the key,
// so it switches language if someone changes the language afterwards.
function showMessage(selector, key, kind) {
  const box = $(selector);
  box.hidden = false;
  box.className = 'message ' + kind;
  box.dataset.messageKey = key;
  box.textContent = t(key);
}

// Same as showMessage but for English-only text in the dashboard.
function showPlainMessage(selector, text, kind) {
  const box = $(selector);
  box.hidden = false;
  box.className = 'message ' + kind;
  delete box.dataset.messageKey;
  box.textContent = text;
}

function hideMessage(selector) {
  const box = $(selector);
  box.hidden = true;
  delete box.dataset.messageKey;
  box.textContent = '';
}

// Puts a red outline on fields that need filling in, and moves the cursor to the first one.
function markMissing(selectors) {
  for (const selector of selectors) {
    $(selector).setAttribute('aria-invalid', 'true');
  }
  $(selectors[0]).focus();
}

// A short message in the bottom corner that goes away by itself.
function toast(text, kind) {
  const holder = $('#toasts');
  const box = document.createElement('div');
  box.className = 'toast ' + (kind || '');
  box.textContent = text;
  holder.appendChild(box);

  // never show more than three at once
  while (holder.children.length > 3) {
    holder.firstElementChild.remove();
  }
  setTimeout(() => box.remove(), 5000);
}

// Lists are redrawn after every click, which replaces the buttons.
// This puts the keyboard focus back on the new copy of the button that was clicked,
// so keyboard users don't lose their place.
function redrawAndKeepFocus(button, redraw) {
  const hadFocus = document.activeElement === button;
  const action = button.dataset.action;
  const value = button.dataset.value !== undefined ? button.dataset.value : button.dataset.id;
  const attribute = button.dataset.value !== undefined ? 'data-value' : 'data-id';
  // the list the button is in (like #itemGrid or #bagList), which stays while its insides are redrawn
  const list = button.parentElement && button.parentElement.closest('[id]');

  redraw();

  if (!hadFocus || button.isConnected || value === undefined) return;
  const selector = `[data-action="${action}"][${attribute}="${CSS.escape(value)}"]`;
  const newButton = (list && list.querySelector(selector)) || document.querySelector(selector);
  if (newButton) newButton.focus({ preventScroll: true });
}
