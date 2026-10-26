// "Get food" page:
//   1. pick a pickup spot (only places that take UConnect requests, like the school pantry)
//   2. add items from that spot's shelf, with optional allergy and diet filters
//   3. pick a pickup time and send the bag
// The bag only holds items from the chosen spot, so one request always means one pickup spot.

const MOST_OF_ONE_ITEM = 10;

let chosenPlaceId = savedSettings.get('uconnect_place') || '';
let itemSearch = '';
let chosenCategory = 'all';
let bag = loadBag(); // item id -> how many
let lastRequest = null; // the request just sent, for the "Request sent" box

// allergy and diet filters, remembered on this device
let avoidTags = loadTagSet('uconnect_avoid'); // hide items with any of these allergens
let dietTags = loadTagSet('uconnect_diets'); // only food items that fit all of these diets

// the pickup time picked in the form
let slotDay = null; // 'YYYY-MM-DD'
let chosenSlot = null; // { date, time }


// ----- The bag -----

function loadBag() {
  try {
    const saved = JSON.parse(savedSettings.get('uconnect_bag') || '{}');
    if (saved && typeof saved === 'object') return saved;
  } catch (error) {
    // saved bag was broken, start fresh
  }
  return {};
}

function saveBag() {
  savedSettings.set('uconnect_bag', JSON.stringify(bag));
}

function loadTagSet(key) {
  try {
    const saved = JSON.parse(savedSettings.get(key) || '[]');
    if (Array.isArray(saved)) return new Set(saved);
  } catch (error) {
    // broken setting, start with no filters
  }
  return new Set();
}

function saveFilters() {
  savedSettings.set('uconnect_avoid', JSON.stringify(Array.from(avoidTags)));
  savedSettings.set('uconnect_diets', JSON.stringify(Array.from(dietTags)));
}

// Does this item get through the family's allergy and diet filters?
// Diet filters only apply to things you eat, so diapers and toothpaste always show.
function passesFilters(item) {
  const allergens = item.allergens || [];
  if (allergens.some(allergen => avoidTags.has(allergen))) return false;

  if (dietTags.size > 0 && isSomethingYouEat(item)) {
    const diets = item.diets || [];
    for (const diet of dietTags) {
      if (!diets.includes(diet)) return false;
    }
  }
  return true;
}

// Food categories, plus anything tagged with what's in it (like baby formula, which is in "Baby")
function isSomethingYouEat(item) {
  const hasTags = (item.allergens || []).length > 0 || (item.diets || []).length > 0;
  return FOOD_CATEGORIES.includes(item.category) || hasTags;
}

// The most someone can ask for: what's on the shelf, but never more than 10 of one thing.
function mostAllowed(item) {
  return Math.min(MOST_OF_ONE_ITEM, amountOf(item));
}

// Items in the bag that belong to the chosen spot and are still on the shelf, A to Z.
function bagItemIds() {
  const placeId = currentPlaceId();
  const items = [];
  for (const id in bag) {
    const item = findItem(id);
    if (!item || item.pantryId !== placeId) continue;
    if (bag[id] > 0 && mostAllowed(item) > 0) items.push(item);
  }
  return sortByName(items).map(item => item.id);
}

// How many of an item will actually be asked for (in case the shelf went down since).
function amountInBag(id) {
  const item = findItem(id);
  if (!item) return 0;
  return Math.min(bag[id] || 0, mostAllowed(item));
}

function addToBag(id) {
  if (!(bag[id] > 0)) bag[id] = 1;
  saveBag();
}

function changeBagAmount(id, change) {
  const item = findItem(id);
  if (!item) return;
  const newAmount = amountInBag(id) + change;
  if (newAmount <= 0) {
    delete bag[id];
  } else {
    bag[id] = Math.min(newAmount, mostAllowed(item));
  }
  saveBag();
}


// ----- Which pickup spot -----

function currentPlaceId() {
  const places = requestPlaces();
  if (places.some(place => place.id === chosenPlaceId)) return chosenPlaceId;

  // nothing picked yet, so start with the spot that has the most on its shelves
  let bestPlace = null;
  let bestCount = 0;
  for (const place of places) {
    const count = itemsAt(place.id).filter(item => amountOf(item) > 0).length;
    if (count > bestCount) {
      bestPlace = place;
      bestCount = count;
    }
  }
  if (bestPlace) return bestPlace.id;
  if (places.length > 0) return places[0].id;
  return '';
}

function choosePlace(placeId) {
  chosenPlaceId = placeId;
  chosenCategory = 'all';
  slotDay = null;
  chosenSlot = null;
  savedSettings.set('uconnect_place', placeId);
}

// Used by the Locations page's "Request food here" link.
function openFoodAt(placeId) {
  choosePlace(placeId);
  showPage('food');
}


// ----- Drawing the page -----

function renderFood() {
  listenToSlots(currentPlaceId()); // only starts listening when the place changes
  renderPlacePicker();
  renderCategoryChips();
  renderFilterChips();
  renderItems();
  renderBag();
  renderSlotPicker();
  updateBagBar();
}

function renderPlacePicker() {
  const box = $('#locationPicker');

  const waiting = loadingText('places');
  if (waiting) {
    box.innerHTML = `<p class="muted">${escapeHtml(waiting)}</p>`;
    return;
  }
  const places = requestPlaces();
  if (places.length === 0) {
    box.innerHTML = `<p class="muted">${escapeHtml(t(state.places.length ? 'no_request_places' : 'no_locations'))}</p>`;
    return;
  }

  const selectedId = currentPlaceId();
  box.innerHTML = places
    .map(place => placeOption(place, place.id === selectedId))
    .join('');
}

function placeOption(place, isSelected) {
  const inStock = itemsAt(place.id).filter(item => amountOf(item) > 0).length;
  let countText = t('no_items_listed');
  if (inStock > 0) countText = t('in_stock_count', { n: formatNumber(inStock) });

  let hours = '';
  if (place.hours) hours = `<span>${escapeHtml(place.hours)}</span>`;

  return `
    <button type="button" class="location-option ${inStock === 0 ? 'is-empty' : ''}" data-action="pick-place"
      data-id="${escapeHtml(place.id)}" aria-pressed="${isSelected}">
      <strong>${escapeHtml(place.name)}</strong>
      ${hours}
      <span>${escapeHtml(countText)}</span>
    </button>`;
}

function renderCategoryChips() {
  const items = itemsAt(currentPlaceId());
  const usedCategories = CATEGORIES.filter(category => items.some(item => item.category === category));

  if (!usedCategories.includes(chosenCategory)) chosenCategory = 'all';

  if (items.length === 0) {
    $('#categoryChips').innerHTML = '';
    return;
  }

  let chips = chipButton('category', 'all', t('all'), chosenCategory === 'all');
  for (const category of usedCategories) {
    chips += chipButton('category', category, t('cat_' + category), chosenCategory === category);
  }
  $('#categoryChips').innerHTML = chips;
}

// "Allergies and diets": two rows of chips, tucked in a box that opens when tapped
function renderFilterChips() {
  const activeCount = avoidTags.size + dietTags.size;
  const box = $('#dietFilters');
  $('#dietFilterCount').textContent = activeCount > 0 ? '(' + formatNumber(activeCount) + ')' : '';
  if (activeCount > 0) box.open = true;

  $('#avoidChips').innerHTML = ITEM_ALLERGENS
    .map(allergen => chipButton('avoid', allergen, t('allergen_' + allergen), avoidTags.has(allergen)))
    .join('');
  $('#onlyDietChips').innerHTML = ITEM_DIETS
    .map(diet => chipButton('diet-only', diet, t('diet_tag_' + diet), dietTags.has(diet)))
    .join('');
}

function renderItems() {
  const grid = $('#itemGrid');

  const waiting = loadingText('stock');
  if (waiting) {
    grid.innerHTML = `<p class="empty">${escapeHtml(waiting)}</p>`;
    return;
  }

  const placeId = currentPlaceId();
  if (!placeId) {
    grid.innerHTML = `<p class="empty">${escapeHtml(t('pick_location_first'))}</p>`;
    return;
  }

  let items = itemsAt(placeId);
  if (items.length === 0) {
    grid.innerHTML = `<p class="empty">${escapeHtml(t('no_stock_here'))}</p>`;
    return;
  }

  if (chosenCategory !== 'all') {
    items = items.filter(item => item.category === chosenCategory);
  }

  const search = itemSearch.trim().toLowerCase();
  if (search) {
    items = items.filter(item => matchesSearch(item, search));
  }

  const beforeFilters = items.length;
  items = items.filter(passesFilters);
  const hiddenCount = beforeFilters - items.length;

  let hiddenNote = '';
  if (hiddenCount > 0) {
    hiddenNote = `
      <p class="hidden-note">
        ${escapeHtml(t('hidden_by_filters', { n: formatNumber(hiddenCount) }))}
        <button type="button" class="link-button" data-action="clear-filters">${escapeHtml(t('clear_filters'))}</button>
      </p>`;
  }

  if (items.length === 0) {
    grid.innerHTML = `<p class="empty">${escapeHtml(t('no_matches'))}</p>` + hiddenNote;
    return;
  }

  grid.innerHTML = sortByName(items).map(shelfTag).join('') + hiddenNote;
}

// Searching "arroz" finds rice too, because every language's name is checked.
function matchesSearch(item, search) {
  const names = Object.values(item.names || {});
  return names.some(name => String(name).toLowerCase().includes(search));
}

// One item, drawn like a grocery shelf tag.
function shelfTag(item) {
  const status = stockStatus(item);
  const amount = amountOf(item);

  let category = '';
  if (CATEGORIES.includes(item.category)) category = t('cat_' + item.category);

  return `
    <article class="shelf-tag ${status}">
      <div class="tag-top">
        <span class="tag-category">${escapeHtml(category)}</span>
        <span class="pill pill-${status}">${escapeHtml(t('st_' + status))}</span>
      </div>
      <h3 class="tag-name">${escapeHtml(itemName(item))}</h3>
      <div class="tag-amount">
        <span class="number">${formatNumber(amount)}</span>
        <span class="unit">${escapeHtml(unitName(item.unit, amount))}</span>
      </div>
      ${itemTagsLine(item)}
      <div class="tag-buttons">
        ${addButton(item, status)}
        ${notifyButton(item, status)}
      </div>
    </article>`;
}

// "Contains: Gluten, Soy" and "Vegetarian · Halal" under the amount
function itemTagsLine(item) {
  const allergens = (item.allergens || []).filter(allergen => ITEM_ALLERGENS.includes(allergen));
  const diets = (item.diets || []).filter(diet => ITEM_DIETS.includes(diet));
  let html = '';
  if (allergens.length > 0) {
    const list = allergens.map(allergen => t('allergen_' + allergen)).join(', ');
    html += `<p class="tag-contains">${escapeHtml(t('contains', { list: list }))}</p>`;
  }
  if (diets.length > 0) {
    html += `<p class="tag-diets">${escapeHtml(diets.map(diet => t('diet_tag_' + diet)).join(' · '))}</p>`;
  }
  return html;
}

// "Add" until it's in the bag, then a − 1 + stepper right on the card.
function addButton(item, status) {
  if (status === 'out') return '';
  const id = escapeHtml(item.id);
  const name = itemName(item);

  if (!(amountInBag(item.id) > 0)) {
    return `
      <button type="button" class="btn btn-small btn-primary" data-action="add-to-bag" data-id="${id}">
        ${icon('plus')}<span>${escapeHtml(t('add'))}</span>
      </button>`;
  }

  const count = amountInBag(item.id);
  const atMost = count >= mostAllowed(item);
  return `
    <div class="tag-in-bag" role="group" aria-label="${escapeHtml(t('in_bag') + ': ' + name)}">
      <span class="tag-in-bag-label">${icon('check')}${escapeHtml(t('in_bag'))}</span>
      <div class="stepper">
        <button type="button" data-action="less" data-id="${id}" aria-label="${escapeHtml(t('less') + ': ' + name)}">${icon('minus')}</button>
        <output>${formatNumber(count)}</output>
        <button type="button" data-action="more" data-id="${id}" aria-label="${escapeHtml(t('more') + ': ' + name)}"
          ${atMost ? 'disabled' : ''}>${icon('plus')}</button>
      </div>
    </div>`;
}

// "Notify me" shows on items that are low or out.
function notifyButton(item, status) {
  if (status === 'in') return '';

  const watching = Boolean(state.myAlerts[item.id]);
  const label = watching ? t('notifying') : t('notify_me');

  return `
    <button type="button" class="btn btn-small btn-outline ${watching ? 'is-on' : ''}" data-action="watch"
      data-id="${escapeHtml(item.id)}" aria-pressed="${watching}">
      ${icon('bell')}<span>${escapeHtml(label)}</span>
    </button>`;
}

function renderBag() {
  renderSentBox();

  const list = $('#bagList');
  const placeId = currentPlaceId();
  $('#bagPlace').textContent = placeId ? t('bag_place', { place: placeName(placeId) }) : '';

  const ids = bagItemIds();
  if (ids.length === 0) {
    list.innerHTML = `<li class="bag-empty muted">${escapeHtml(t('bag_empty'))}</li>`;
    return;
  }
  list.innerHTML = ids.map(bagRow).join('');
}

// After sending, the bag is swapped for a box saying what happens next.
function renderSentBox() {
  const showSent = lastRequest !== null;
  $('#sentBox').hidden = !showSent;
  $('#bagPanel').hidden = showSent;
  $('#requestForm').hidden = showSent;
  if (!showSent) return;

  $('#sentWhere').textContent = t('sent_where', { place: placeName(lastRequest.pantryId) });
  $('#sentWhen').hidden = !lastRequest.slot;
  $('#sentWhen').textContent = lastRequest.slot ? t('sent_when', { time: slotLabel(lastRequest.slot) }) : '';
  $('#sentCodeBox').hidden = !lastRequest.pickupCode;
  $('#sentCode').textContent = lastRequest.pickupCode;
}

function startNewBag() {
  lastRequest = null;
  renderFood();
}

function bagRow(id) {
  const item = findItem(id);
  const count = amountInBag(id);
  return `
    <li class="bag-row">
      <div>
        <div class="name">${escapeHtml(itemName(item))}</div>
        <div class="unit">${escapeHtml(unitName(item.unit, count))}</div>
      </div>
      <div class="stepper">
        <button type="button" data-action="less" data-id="${escapeHtml(id)}" aria-label="${escapeHtml(t('less'))}">${icon('minus')}</button>
        <output>${formatNumber(count)}</output>
        <button type="button" data-action="more" data-id="${escapeHtml(id)}" aria-label="${escapeHtml(t('more'))}"
          ${count >= mostAllowed(item) ? 'disabled' : ''}>${icon('plus')}</button>
      </div>
      <button type="button" class="remove-button" data-action="remove" data-id="${escapeHtml(id)}" aria-label="${escapeHtml(t('remove'))}">${icon('x')}</button>
    </li>`;
}

// ----- Pickup time -----

// Day buttons, then that day's times. If the place doesn't use pickup times (or none are open
// this week), the plain "Best time to pick up" box shows instead.
function renderSlotPicker() {
  const place = findPlace(currentPlaceId());
  const usesSlots = Boolean(pickupSettings(place));
  const days = usesSlots ? upcomingPickupDays(place) : [];

  $('#slotField').hidden = !usesSlots;
  $('#timeField').hidden = usesSlots && days.length > 0;
  if (!usesSlots) return;

  if (days.length === 0) {
    $('#slotDays').innerHTML = '';
    $('#slotTimes').innerHTML = `<p class="muted">${escapeHtml(t('no_slots'))}</p>`;
    return;
  }

  // start on the first day with room, and stay on the day they picked
  if (!days.some(day => day.date === slotDay)) {
    const dayWithRoom = days.find(day => day.times.some(slot => slot.left > 0)) || days[0];
    slotDay = dayWithRoom.date;
  }
  if (chosenSlot && !days.some(day => day.date === chosenSlot.date)) chosenSlot = null;

  $('#slotDays').innerHTML = days.map(day => {
    const isOn = day.date === slotDay;
    return `
      <button type="button" class="chip" data-action="slot-day" data-value="${day.date}" aria-pressed="${isOn}">
        ${escapeHtml(dayLabel(day.date))}
      </button>`;
  }).join('');

  const today = days.find(day => day.date === slotDay);
  $('#slotTimes').innerHTML = today.times.map(slot => {
    const isChosen = Boolean(chosenSlot && chosenSlot.date === slotDay && chosenSlot.time === slot.time);
    const isFull = slot.left === 0 && !isChosen;
    const note = isFull ? t('slot_full') : t('slot_left', { n: formatNumber(slot.left) });
    return `
      <button type="button" class="slot-button" data-action="slot-time" data-value="${slot.time}"
        aria-pressed="${isChosen}" ${isFull ? 'disabled' : ''}>
        <strong>${escapeHtml(timeLabel(slot.time))}</strong>
        <small>${escapeHtml(note)}</small>
      </button>`;
  }).join('');
}

// True when the form needs a pickup time picked before sending.
function needsSlot() {
  const place = findPlace(currentPlaceId());
  return Boolean(pickupSettings(place)) && upcomingPickupDays(place).length > 0;
}


// On phones the bag is below the items, so a bar at the bottom of the screen jumps to it.
function updateBagBar() {
  let total = 0;
  for (const id of bagItemIds()) {
    total += amountInBag(id);
  }
  $('#bagBar').classList.toggle('has-items', state.page === 'food' && total > 0);
  $('#bagBarText').textContent = t('bag_bar', { n: formatNumber(total) });
}


// ----- Sending the request -----

function makePickupCode() {
  const number = Math.floor(1000 + Math.random() * 9000);
  return 'UC-' + number;
}

async function sendFoodRequest(event) {
  event.preventDefault();

  const ids = bagItemIds();
  if (ids.length === 0) {
    showMessage('#requestMessage', 'add_one_item', 'bad');
    return;
  }

  // can't send at all (signed out, view only)? say so before asking them to fix anything else
  const problem = whyCantSave();
  if (problem) {
    showMessage('#requestMessage', problem, 'bad');
    return;
  }

  const useCode = $('#useCode').checked;
  const name = cleanText($('#requestName').value, 80);
  if (!useCode && !name) {
    markMissing(['#requestName']);
    showMessage('#requestMessage', 'fill_required', 'bad');
    return;
  }

  const slot = needsSlot() ? chosenSlot : null;
  if (needsSlot() && !slot) {
    markMissing(['#slotField']);
    showMessage('#requestMessage', 'pick_slot', 'bad');
    return;
  }

  let household = parseInt($('#requestHousehold').value, 10);
  if (!(household > 0)) household = null;
  if (household > 20) household = 20;

  const items = ids.map(id => {
    const item = findItem(id);
    return { id: id, name: itemName(item, 'en'), qty: amountInBag(id), unit: item.unit || '' };
  });

  const request = {
    kind: 'request',
    items: items,
    pantryId: currentPlaceId(),
    name: useCode ? '' : name,
    pickupCode: useCode ? makePickupCode() : '',
    household: household,
    slot: slot,
    time: slot ? slotLabel(slot, 'en') : cleanText($('#requestTime').value, 80),
    contact: cleanText($('#requestContact').value, 120),
    notes: cleanText($('#requestNotes').value, 500),
    lang: state.language,
    status: 'new',
    createdAt: Date.now()
  };

  const button = $('#requestSubmit');
  button.disabled = true;
  const requestId = makeId('e');

  // claim the pickup time first, so nobody else gets the last spot
  if (slot) {
    let claim;
    try {
      claim = await claimSlot(request.pantryId, slot, requestId);
    } catch (error) {
      claim = 'error';
      showMessage('#requestMessage', errorMessageKey(error), 'bad');
    }
    if (claim !== 'ok') {
      button.disabled = false;
      if (claim === 'full' || claim === 'busy') {
        chosenSlot = null;
        renderSlotPicker();
        showMessage('#requestMessage', 'slot_taken_now', 'bad');
      }
      return;
    }
  }

  const result = await addEntry('orders', request, requestId);
  button.disabled = false;

  if (!result.ok) {
    if (slot) releaseSlot(request.pantryId, slot, requestId);
    showMessage('#requestMessage', result.errorKey, 'bad');
    return;
  }

  for (const id of ids) {
    delete bag[id];
  }
  saveBag();
  $('#requestForm').reset();
  $('#nameField').hidden = false;
  hideMessage('#requestMessage');

  lastRequest = request;
  chosenSlot = null;
  renderFood();
  $('#sentBox').scrollIntoView({ block: 'nearest' });
  $('#sentBox').focus({ preventScroll: true });
}


// ----- Buttons -----

function setupFood() {
  $('#page-food').addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const id = button.dataset.id;
    const action = button.dataset.action;

    if (action === 'pick-place') {
      choosePlace(id);
      hideMessage('#requestMessage');
      redrawAndKeepFocus(button, renderFood);
    }
    if (action === 'category') {
      chosenCategory = button.dataset.value;
      redrawAndKeepFocus(button, renderFood);
    }
    if (action === 'add-to-bag') {
      const hadFocus = document.activeElement === button;
      addToBag(id);
      lastRequest = null; // starting a new bag
      renderFood();
      // the Add button turned into − 1 +, so keep the keyboard on the +
      const plus = $(`#itemGrid [data-action="more"][data-id="${CSS.escape(id)}"]`);
      if (hadFocus && plus) plus.focus({ preventScroll: true });
    }
    if (action === 'watch') {
      redrawAndKeepFocus(button, () => toggleAlert(id));
    }
    if (action === 'more') {
      changeBagAmount(id, 1);
      redrawAndKeepFocus(button, renderFood);
    }
    if (action === 'less') {
      const hadFocus = document.activeElement === button;
      changeBagAmount(id, -1);
      redrawAndKeepFocus(button, renderFood);
      // at zero the stepper on the card turns back into Add
      const addButtonNow = $(`#itemGrid [data-action="add-to-bag"][data-id="${CSS.escape(id)}"]`);
      if (hadFocus && !button.isConnected && document.activeElement === document.body && addButtonNow) {
        addButtonNow.focus({ preventScroll: true });
      }
    }
    if (action === 'remove') {
      delete bag[id];
      saveBag();
      renderFood();
    }
    if (action === 'avoid' || action === 'diet-only') {
      toggleInSet(action === 'avoid' ? avoidTags : dietTags, button.dataset.value);
      saveFilters();
      redrawAndKeepFocus(button, renderFood);
    }
    if (action === 'clear-filters') {
      avoidTags.clear();
      dietTags.clear();
      saveFilters();
      renderFood();
    }
    if (action === 'slot-day') {
      slotDay = button.dataset.value;
      redrawAndKeepFocus(button, renderSlotPicker);
    }
    if (action === 'slot-time') {
      chosenSlot = { date: slotDay, time: button.dataset.value };
      $('#slotField').removeAttribute('aria-invalid');
      hideMessage('#requestMessage');
      redrawAndKeepFocus(button, renderSlotPicker);
    }
  });

  $('#itemSearch').addEventListener('input', event => {
    itemSearch = event.target.value;
    renderItems();
  });

  // with a pickup code, the name isn't needed
  $('#useCode').addEventListener('change', event => {
    $('#nameField').hidden = event.target.checked;
  });

  $('#requestForm').addEventListener('submit', sendFoodRequest);
  $('#newBagButton').addEventListener('click', startNewBag);

  $('#bagBarButton').addEventListener('click', () => {
    $('#bag').scrollIntoView({ block: 'start' });
  });
}
