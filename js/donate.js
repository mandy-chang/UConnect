// The "Donate food" tab on the Help out page.
// A donation offer is saved with the person's food requests (orders/<userId>), with kind: 'donation'.

const NEEDED_LIST_LENGTH = 8;

function renderDonateForm() {
  fillSelect('#donateCategory', CATEGORIES.map(category => [category, t('cat_' + category)]));
  fillSelect('#donateUnit', UNIT_CODES.map(unit => [unit, unitName(unit, 5)]));
  fillSelect('#donatePlace', sortPlaces(state.places).map(place => [place.id, place.name]));
  renderMostNeeded();
}

// Fills a <select> with [value, label] pairs and keeps whatever was chosen before.
function fillSelect(selector, options) {
  const select = $(selector);
  const chosen = select.value;
  select.innerHTML = options
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join('');
  if (chosen) select.value = chosen;
}

// Items that are low or out, as buttons that fill in the form.
function renderMostNeeded() {
  const box = $('#neededBox');
  box.hidden = state.connection !== 'live' || !state.loaded.stock;
  if (box.hidden) return;

  const needed = sortByName(state.stock.filter(item => stockStatus(item) !== 'in'));
  if (needed.length === 0) {
    $('#neededChips').innerHTML = `<p class="muted">${escapeHtml(t('need_none'))}</p>`;
    return;
  }

  $('#neededChips').innerHTML = needed.slice(0, NEEDED_LIST_LENGTH).map(neededChip).join('');
}

function neededChip(item) {
  return `
    <button type="button" class="chip" data-action="needed" data-id="${escapeHtml(item.id)}">
      ${escapeHtml(itemName(item))}
    </button>`;
}

function fillDonationFor(itemId) {
  const item = findItem(itemId);
  if (!item) return;

  $('#donateItem').value = itemName(item);
  if (CATEGORIES.includes(item.category)) $('#donateCategory').value = item.category;
  if (UNIT_CODES.includes(item.unit)) $('#donateUnit').value = item.unit;
  if (findPlace(item.pantryId)) $('#donatePlace').value = item.pantryId;
  $('#donateAmount').focus();
}

async function sendDonation(event) {
  event.preventDefault();

  const itemText = cleanText($('#donateItem').value, 80);
  const amount = parseInt($('#donateAmount').value, 10);

  const missing = [];
  if (!itemText) missing.push('#donateItem');
  if (!(amount > 0)) missing.push('#donateAmount');
  if (!$('#donatePlace').value) missing.push('#donatePlace');
  if (missing.length > 0) {
    markMissing(missing);
    showMessage('#donateMessage', 'fill_required', 'bad');
    return;
  }

  // If it's something we already stock there, remember which item, so "Add to stock" on the
  // dashboard adds to it even when the name was typed in Spanish, Chinese or Russian.
  const placeId = $('#donatePlace').value;
  const sameItem = stockItemCalled(itemText, placeId);

  const donation = {
    kind: 'donation',
    item: {
      id: sameItem ? sameItem.id : '',
      name: itemText,
      qty: Math.min(amount, 100000),
      unit: $('#donateUnit').value,
      category: $('#donateCategory').value
    },
    pantryId: placeId,
    date: cleanText($('#donateDate').value, 20),
    name: cleanText($('#donateName').value, 80),
    contact: cleanText($('#donateContact').value, 120),
    notes: cleanText($('#donateNotes').value, 500),
    lang: state.language,
    status: 'new',
    createdAt: Date.now()
  };

  const button = $('#donateSubmit');
  button.disabled = true;
  const result = await addEntry('orders', donation);
  button.disabled = false;

  if (!result.ok) {
    showMessage('#donateMessage', result.errorKey, 'bad');
    return;
  }
  $('#donateForm').reset();
  showMessage('#donateMessage', 'donation_sent', 'ok');
}

// An item at this place with this name in any language, or nothing.
function stockItemCalled(name, placeId) {
  const lowerName = name.toLowerCase();
  return itemsAt(placeId).find(item => {
    const names = Object.values(item.names || {});
    return names.some(itemName => String(itemName).toLowerCase() === lowerName);
  });
}

function setupDonate() {
  $('#neededChips').addEventListener('click', event => {
    const button = event.target.closest('[data-action="needed"]');
    if (button) fillDonationFor(button.dataset.id);
  });

  $('#donateForm').addEventListener('submit', sendDonation);
}
