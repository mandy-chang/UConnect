// Dashboard "Stock" tab: a table of everything on the shelves, with +/- buttons,
// and a form to add or edit items.
//
// Nothing in this table moves while you change amounts:
//   - rows are always A to Z by name
//   - the list of rows is only worked out again when a filter changes or an item is
//     added, renamed or deleted, so a row never jumps or vanishes (even with "Low or out only" on)
//   - when only numbers change, the numbers are updated inside the rows already on screen
//   - the columns have fixed widths, so "14 days ago" turning into "just now" doesn't shift them

let stockSearch = '';
let stockPlaceFilter = 'all';
let lowOnly = false;
let rowIds = null; // ids of the rows on screen, in order
let rowsMadeFrom = ''; // what the stock looked like when rowIds was worked out
let editingItemId = null;
let itemTagsChosen = new Set(); // allergy and diet tags ticked in the item form

// amounts wait a moment before saving, so clicking + five times is one save, not five
const SAVE_DELAY = 600;
const saveTimers = {};
const savingNow = {};
const justSaved = {}; // item id -> true for a couple of seconds after saving, to show "Saved"

// "6 items still have sample amounts" with a button to keep them as they are
function renderSampleNote() {
  const samples = state.stock.filter(item => item.sample);
  $('#sampleNote').hidden = samples.length === 0;
  $('#sampleNoteText').textContent = samples.length === 1
    ? '1 item still has a sample amount.'
    : `${samples.length} items still have sample amounts.`;
}

// For when the sample numbers happen to be right: marks every item as counted.
async function markAllCounted() {
  const button = $('#markCountedButton');
  button.disabled = true;
  const samples = state.stock.filter(item => item.sample);
  try {
    for (const item of samples) {
      await state.db.doc('stock/' + item.id).update({ sample: false, updatedAt: Date.now(), updatedBy: state.userId });
    }
    toast('All items marked as counted');
  } catch (error) {
    toast('Couldn\'t update them all. Try again.', 'bad');
  }
  button.disabled = false;
}

function renderStockTab() {
  renderSampleNote();
  const placeOptions = [['all', 'All locations']];
  for (const place of sortPlaces(state.places)) {
    placeOptions.push([place.id, place.name]);
  }
  fillSelect('#stockPlace', placeOptions);

  if (stockPlaceFilter !== 'all' && !findPlace(stockPlaceFilter)) stockPlaceFilter = 'all';
  $('#stockPlace').value = stockPlaceFilter;
  $('#lowOnlyButton').setAttribute('aria-pressed', lowOnly);

  renderStockRows();
}

function chooseRows() {
  const search = stockSearch.trim().toLowerCase();

  const rows = state.stock.filter(item => {
    if (stockPlaceFilter !== 'all' && item.pantryId !== stockPlaceFilter) return false;
    if (lowOnly && stockStatus(item) === 'in') return false;
    if (!search) return true;
    return matchesSearch(item, search) || placeName(item.pantryId).toLowerCase().includes(search);
  });

  return sortByName(rows, 'en').map(item => item.id);
}

// A short description of the stock that changes when an item is added, deleted or renamed,
// but not when only an amount changes.
function stockShape() {
  return state.stock
    .map(item => item.id + ':' + itemName(item, 'en') + ':' + item.pantryId)
    .sort()
    .join('|');
}

function renderStockRows() {
  const body = $('#stockRows');
  if (!state.loaded.stock) {
    body.innerHTML = '<tr><td colspan="7" class="muted">Loading stock…</td></tr>';
    return;
  }

  const shape = stockShape();
  if (rowIds === null || shape !== rowsMadeFrom) {
    rowIds = chooseRows();
    rowsMadeFrom = shape;
  }

  const items = rowIds.map(findItem).filter(Boolean);
  if (items.length === 0) {
    const message = state.stock.length > 0 ? 'No items match.' : 'No stock yet. Add the first item with Add item.';
    body.innerHTML = `<tr><td colspan="7" class="muted">${message}</td></tr>`;
    body.dataset.rows = '';
    return;
  }

  // Same rows as last time: just put the new numbers into them.
  const rowList = items.map(item => item.id).join('|');
  if (body.dataset.rows === rowList) {
    items.forEach(updateStockRow);
    return;
  }

  body.innerHTML = items.map(stockRow).join('');
  body.dataset.rows = rowList;
}

// Copies the new numbers into a row that's already on screen. The row and its buttons stay put,
// so a click or a half-armed Delete button isn't lost when someone else's change arrives.
function updateStockRow(item) {
  const row = $('#stockRows').querySelector(`tr[data-row="${CSS.escape(item.id)}"]`);
  if (!row) return;

  const fresh = document.createElement('tbody');
  fresh.innerHTML = stockRow(item);
  const freshCells = fresh.firstElementChild.children;

  Array.from(row.children).forEach((cell, index) => {
    if (cell.classList.contains('actions-cell')) return;

    if (cell.classList.contains('amount-td')) {
      const box = cell.querySelector('input');
      const amount = String(amountOf(item));
      if (document.activeElement !== box && box.value !== amount) box.value = amount;
      cell.querySelector('.unit').textContent = freshCells[index].querySelector('.unit').textContent;
      cell.querySelector('.save-state').outerHTML = freshCells[index].querySelector('.save-state').outerHTML;
      return;
    }

    if (cell.innerHTML !== freshCells[index].innerHTML) cell.innerHTML = freshCells[index].innerHTML;
  });
}

// Shows a new filter's rows straight away.
function refilterStock() {
  rowIds = null;
  renderStockRows();
}

// Used by the "Items low or out" tile at the top of the dashboard.
function showOnlyLowStock() {
  lowOnly = true;
  stockSearch = '';
  stockPlaceFilter = 'all';
  $('#stockSearch').value = '';
  rowIds = null;
}

// "Saving…" while the clicking hasn't been saved yet, then "Saved" for a moment.
// The same line also says "Sample number" until a student counts the item. Keeping all of these
// on one line under the amount means the row never changes height.
function saveState(itemId) {
  if (state.unsavedAmounts[itemId] !== undefined) {
    return '<span class="save-state saving">Saving…</span>';
  }
  if (justSaved[itemId]) {
    return `<span class="save-state saved">${icon('check')}Saved</span>`;
  }
  const item = findItem(itemId);
  if (item && item.sample) {
    return '<span class="save-state sample">Sample number</span>';
  }
  return '<span class="save-state"></span>';
}

function stockRow(item) {
  const status = stockStatus(item);
  const amount = amountOf(item);
  const names = item.names || {};
  const name = names.en || '—';
  const id = escapeHtml(item.id);

  // under the English name: the other languages, or which ones are missing
  const missing = ['es', 'zh', 'ru'].filter(language => !names[language]);
  let translations = [names.es, names.zh, names.ru].join(' · ');
  if (missing.length > 0) {
    translations = 'Missing ' + missing.map(language => LANGUAGE_NAMES[language]).join(', ');
  }

  const statusLabels = { in: 'In stock', low: 'Low', out: 'Out' };

  let waiting = '—';
  const waitingCount = state.waitingCount[item.id] || 0;
  if (waitingCount > 0) waiting = `<span class="pill pill-sun">${waitingCount} waiting</span>`;

  return `
    <tr data-row="${id}">
      <td>
        <div class="name">${escapeHtml(name)}</div>
        <div class="translations">${escapeHtml(translations)}</div>
      </td>
      <td>${escapeHtml(placeName(item.pantryId) || '—')}</td>
      <td class="amount-td">
        <div class="amount-cell">
          <div class="stepper">
            <button type="button" data-action="amount-down" data-id="${id}" aria-label="One less ${escapeHtml(name)}">${icon('minus')}</button>
            <input type="number" min="0" inputmode="numeric" id="amount-${id}" data-amount="${id}"
              value="${amount}" aria-label="How many ${escapeHtml(name)}">
            <button type="button" data-action="amount-up" data-id="${id}" aria-label="One more ${escapeHtml(name)}">${icon('plus')}</button>
          </div>
          <span class="muted unit">${escapeHtml(unitName(item.unit, amount, 'en'))}</span>
        </div>
        ${saveState(item.id)}
      </td>
      <td>
        <span class="pill pill-${status}">${statusLabels[status]}</span>
        <small class="low-at">Low at ${formatNumber(Number(item.lowAt) || 0, 'en')}</small>
      </td>
      <td>${waiting}</td>
      <td class="muted one-line">${escapeHtml(timeAgo(item.updatedAt, 'en'))}</td>
      <td class="actions-cell">
        <div class="row-buttons">
          <button class="btn btn-small btn-outline" type="button" data-action="edit-item" data-id="${id}">Edit</button>
          <button class="btn btn-small btn-outline" type="button" data-action="delete-item" data-id="${id}">Delete</button>
        </div>
      </td>
    </tr>`;
}


// ----- Changing amounts -----

// Shows the new amount right away and saves it once the clicking stops.
function setAmount(itemId, newAmount) {
  state.unsavedAmounts[itemId] = Math.max(0, Math.min(100000, newAmount));
  renderStockRows();
  renderTiles();

  clearTimeout(saveTimers[itemId]);
  saveTimers[itemId] = setTimeout(() => saveAmount(itemId), SAVE_DELAY);
}

async function saveAmount(itemId) {
  // if the last save of this item is still going, try again in a moment
  if (savingNow[itemId]) {
    saveTimers[itemId] = setTimeout(() => saveAmount(itemId), 400);
    return;
  }

  const amount = state.unsavedAmounts[itemId];
  if (amount === undefined) return;

  savingNow[itemId] = true;
  try {
    await state.db.doc('stock/' + itemId).update({
      qty: amount,
      sample: false, // a student counted it, so it's not a sample number anymore
      updatedAt: Date.now(),
      updatedBy: state.userId
    });
    // only forget the unsaved amount if nobody changed it again while saving
    if (state.unsavedAmounts[itemId] === amount) {
      delete state.unsavedAmounts[itemId];
      justSaved[itemId] = true;
      setTimeout(() => {
        delete justSaved[itemId];
        if (state.page === 'dashboard' && dashboardTab === 'stock') renderStockRows();
      }, 2500);
    }
  } catch (error) {
    toast('Couldn\'t save the new count. Try again.', 'bad');
    delete state.unsavedAmounts[itemId];
  }
  savingNow[itemId] = false;
  renderStockRows();
}


// ----- Add / edit form -----

function openItemForm(itemId) {
  editingItemId = itemId || null;
  const item = itemId ? findItem(itemId) : null;
  const names = (item && item.names) || {};

  $('#itemFormTitle').textContent = item ? 'Edit ' + (names.en || 'item') : 'Add item';
  $('#itemNameEn').value = names.en || '';
  $('#itemNameEs').value = names.es || '';
  $('#itemNameZh').value = names.zh || '';
  $('#itemNameRu').value = names.ru || '';

  // only our own pantry has a shelf (other pantries' stock isn't tracked here)
  const shelves = requestPlaces().length > 0 ? requestPlaces() : sortPlaces(state.places);
  fillSelect('#itemPlace', shelves.map(place => [place.id, place.name]));
  itemTagsChosen = new Set([].concat((item && item.allergens) || [], (item && item.diets) || []));
  renderItemTagChips();

  if (item) {
    $('#itemCategory').value = item.category;
    $('#itemPlace').value = item.pantryId;
    $('#itemAmount').value = amountOf(item);
    $('#itemUnit').value = item.unit;
    $('#itemLowAt').value = Number(item.lowAt) || 0;
  } else {
    $('#itemCategory').value = 'grains';
    if (stockPlaceFilter !== 'all') $('#itemPlace').value = stockPlaceFilter;
    $('#itemAmount').value = '';
    $('#itemUnit').value = 'items';
    $('#itemLowAt').value = 5;
  }

  hideMessage('#itemMessage');
  $('#itemForm').hidden = false;
  $('#itemNameEn').focus();
}

// "Contains" and "Fits these diets" chips in the item form
function renderItemTagChips() {
  $('#itemAllergenChips').innerHTML = ITEM_ALLERGENS
    .map(tag => chipButton('item-tag', tag, english('allergen_' + tag), itemTagsChosen.has(tag)))
    .join('');
  $('#itemDietChips').innerHTML = ITEM_DIETS
    .map(tag => chipButton('item-tag', tag, english('diet_tag_' + tag), itemTagsChosen.has(tag)))
    .join('');
}

function closeItemForm() {
  $('#itemForm').hidden = true;
  editingItemId = null;
}

async function saveItem(event) {
  event.preventDefault();

  const englishName = cleanText($('#itemNameEn').value, 80);
  if (!englishName) {
    markMissing(['#itemNameEn']);
    showPlainMessage('#itemMessage', 'Add an English name.', 'bad');
    return;
  }

  // only keep translations that were filled in
  const names = { en: englishName };
  const spanish = cleanText($('#itemNameEs').value, 80);
  const chinese = cleanText($('#itemNameZh').value, 80);
  const russian = cleanText($('#itemNameRu').value, 80);
  if (spanish) names.es = spanish;
  if (chinese) names.zh = chinese;
  if (russian) names.ru = russian;

  const oldItem = editingItemId ? findItem(editingItemId) : null;
  const itemId = editingItemId || makeId('i');

  const item = {
    names: names,
    category: $('#itemCategory').value,
    pantryId: $('#itemPlace').value,
    qty: Math.max(0, parseInt($('#itemAmount').value, 10) || 0),
    unit: $('#itemUnit').value,
    lowAt: Math.max(0, parseInt($('#itemLowAt').value, 10) || 0),
    allergens: ITEM_ALLERGENS.filter(tag => itemTagsChosen.has(tag)),
    diets: ITEM_DIETS.filter(tag => itemTagsChosen.has(tag)),
    sample: false, // a student checked this item, so it's real now
    createdAt: oldItem && oldItem.createdAt ? oldItem.createdAt : Date.now(),
    updatedAt: Date.now(),
    updatedBy: state.userId
  };

  try {
    delete state.unsavedAmounts[itemId]; // the form's amount wins
    await state.db.doc('stock/' + itemId).set(item);
    closeItemForm();
    toast(oldItem ? 'Item updated' : 'Item added');
  } catch (error) {
    let message = 'Couldn\'t save. Try again.';
    if (error && error.code === 'invalid_argument') {
      message = 'Your account can\'t change stock. Ask the team lead to make you an Editor.';
    }
    showPlainMessage('#itemMessage', message, 'bad');
  }
}

// Asks the AI for the Spanish, Chinese and Russian names. Only fills boxes that are empty.
async function translateItemNames() {
  const button = $('#translateButton');
  const englishName = cleanText($('#itemNameEn').value, 80);

  if (!englishName) {
    markMissing(['#itemNameEn']);
    showPlainMessage('#itemMessage', 'Type the English name first.', 'bad');
    return;
  }
  if (!state.ai) {
    showPlainMessage('#itemMessage', 'AI translation works when this page is open in Claude.', 'bad');
    return;
  }

  const label = button.querySelector('span');
  button.disabled = true;
  label.textContent = 'Translating…';

  const prompt =
    'Translate this food pantry item name for a shelf label in a multilingual community pantry. ' +
    'Item: ' + JSON.stringify(englishName) + '. ' +
    'Reply with only JSON like {"es": "Spanish name", "zh": "Simplified Chinese name", "ru": "Russian name"}. ' +
    'Keep each one short.';

  try {
    const answer = await state.ai.json(prompt, { modelTier: 'quick' });
    if (answer && typeof answer === 'object') {
      fillIfEmpty('#itemNameEs', answer.es);
      fillIfEmpty('#itemNameZh', answer.zh);
      fillIfEmpty('#itemNameRu', answer.ru);
      hideMessage('#itemMessage');
    }
  } catch (error) {
    let message = 'Couldn\'t translate right now. Type the names or try again.';
    if (error && error.code === 'not_granted') {
      message = 'AI is turned off for this page, so type the names yourself.';
    }
    showPlainMessage('#itemMessage', message, 'bad');
  }

  button.disabled = false;
  label.textContent = 'Translate names with AI';
}

function fillIfEmpty(selector, value) {
  const box = $(selector);
  if (box.value.trim() === '' && typeof value === 'string') {
    box.value = value.slice(0, 80);
  }
}

async function deleteItem(itemId) {
  try {
    await state.db.doc('stock/' + itemId).delete();
    toast('Item deleted');
  } catch (error) {
    toast('Couldn\'t delete. Try again.', 'bad');
  }
}


// ----- Buttons -----

function setupDashboardStock() {
  // dropdown options for the form
  fillSelect('#itemCategory', CATEGORIES.map(category => [category, english('cat_' + category)]));
  fillSelect('#itemUnit', UNIT_CODES.map(unit => [unit, UNITS[unit].en[1]]));

  const panel = $('#panel-stock');

  panel.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const itemId = button.dataset.id;
    const item = findItem(itemId);

    if (button.dataset.action === 'amount-up' && item) {
      redrawAndKeepFocus(button, () => setAmount(itemId, amountOf(item) + 1));
    }
    if (button.dataset.action === 'amount-down' && item) {
      redrawAndKeepFocus(button, () => setAmount(itemId, amountOf(item) - 1));
    }
    if (button.dataset.action === 'edit-item') {
      openItemForm(itemId);
    }
    if (button.dataset.action === 'delete-item') {
      confirmThenRun(button, () => deleteItem(itemId));
    }
  });

  // typing a number into the amount box
  panel.addEventListener('change', event => {
    const box = event.target;
    if (box.dataset.amount) setAmount(box.dataset.amount, parseInt(box.value, 10) || 0);
  });

  // Enter in an amount box saves it instead of doing anything else
  panel.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.dataset.amount) {
      event.preventDefault();
      event.target.blur();
    }
  });

  $('#stockSearch').addEventListener('input', event => {
    stockSearch = event.target.value;
    refilterStock();
  });

  $('#stockPlace').addEventListener('change', event => {
    stockPlaceFilter = event.target.value;
    refilterStock();
  });

  $('#lowOnlyButton').addEventListener('click', () => {
    lowOnly = !lowOnly;
    $('#lowOnlyButton').setAttribute('aria-pressed', lowOnly);
    refilterStock();
  });

  $('#itemForm').addEventListener('click', event => {
    const chip = event.target.closest('[data-action="item-tag"]');
    if (!chip) return;
    toggleInSet(itemTagsChosen, chip.dataset.value);
    chip.setAttribute('aria-pressed', itemTagsChosen.has(chip.dataset.value));
  });
  $('#markCountedButton').addEventListener('click', markAllCounted);

  $('#addItemButton').addEventListener('click', () => openItemForm(null));
  $('#cancelItemButton').addEventListener('click', closeItemForm);
  $('#translateButton').addEventListener('click', translateItemNames);
  $('#itemForm').addEventListener('submit', saveItem);
}
