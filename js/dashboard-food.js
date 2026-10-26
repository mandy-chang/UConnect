// Dashboard "Food" tab: food requests and donation offers from families.

const FOOD_LABELS = { new: 'New', packing: 'Packing', ready: 'Ready for pickup', done: 'Picked up' };
const DONATION_LABELS = { new: 'New', confirmed: 'Confirmed', received: 'Received' };

// The one thing to do next on each card, shown as a big button. The dropdown is still
// there for fixing mistakes, but most of the time you just click the button.
const FOOD_NEXT_STEP = {
  new: ['packing', 'Start packing'],
  packing: ['ready', 'Mark ready for pickup'],
  ready: ['done', 'Mark picked up']
};
const DONATION_NEXT_STEP = {
  new: ['confirmed', 'Confirm drop-off'],
  confirmed: ['received', 'Mark received']
};

let foodFilter = 'open';
let shownFoodOrders = []; // the cards on screen, for "Print packing slips"

function isOpenOrder(order) {
  if (order.kind === 'donation') return order.status !== 'received';
  return order.status !== 'done';
}

// Food requests picking up today that aren't done yet, earliest first.
function todaysPickups(orders) {
  const today = dateKey(new Date());
  return orders
    .filter(order => order.kind !== 'donation' && isOpenOrder(order) && order.slot && order.slot.date === today)
    .sort((a, b) => String(a.slot.time).localeCompare(String(b.slot.time)));
}

function renderFoodRequests() {
  const orders = state.allOrders;
  const requests = orders.filter(order => order.kind !== 'donation');
  const donations = orders.filter(order => order.kind === 'donation');

  $('#orderFilters').innerHTML = filterChips('food-filter', [
    ['open', 'Open', orders.filter(isOpenOrder).length],
    ['today', 'Picking up today', todaysPickups(orders).length],
    ['all', 'All', orders.length],
    ['request', 'Requests', requests.length],
    ['donation', 'Donations', donations.length]
  ], foodFilter);

  const box = $('#orderCards');
  if (!state.loaded.orders) {
    box.innerHTML = '<p class="empty">Loading requests…</p>';
    return;
  }

  let shown = orders;
  if (foodFilter === 'open') shown = orders.filter(isOpenOrder);
  if (foodFilter === 'today') shown = todaysPickups(orders);
  if (foodFilter === 'request') shown = requests;
  if (foodFilter === 'donation') shown = donations;

  if (shown.length === 0) {
    const message = orders.length > 0
      ? 'Nothing here. Every request in this view is handled.'
      : 'No requests yet. Food requests and donation offers from the public site land here.';
    box.innerHTML = `<p class="empty">${message}</p>`;
    return;
  }

  box.innerHTML = shown.map(foodRequestCard).join('');
  shownFoodOrders = shown;

  const owners = new Set(shown.map(order => order.owner));
  lookUpNames(Array.from(owners));
}

function foodRequestCard(order) {
  const isDonation = order.kind === 'donation';
  const labels = isDonation ? DONATION_LABELS : FOOD_LABELS;

  let title = personName(order.owner, order.name);
  if (order.pickupCode) title = 'Pickup code ' + order.pickupCode;

  let contact = '';
  if (order.contact) contact = `<p class="contact">${escapeHtml(order.contact)}</p>`;

  let when = ['Best time', order.time];
  if (isDonation) when = ['Date', order.date];
  if (order.slot) when = ['Pickup time', slotLabel(order.slot, 'en')];

  const details = detailsList([
    [isDonation ? 'Drop-off' : 'Pickup', placeName(order.pantryId)],
    when,
    ['Household', order.household],
    ['Notes', order.notes]
  ]);

  return `
    <article class="card ${order.status === 'new' ? 'is-new' : ''}">
      <div class="card-top">
        <span class="pill ${isDonation ? 'pill-sun' : 'pill-plain'}">${isDonation ? 'Donation' : 'Request'}</span>
        <span class="when">${escapeHtml(timeAgo(order.createdAt, 'en'))}</span>
        ${languagePill(order)}
        ${statusSelect('order', order, labels)}
      </div>
      <h3>${escapeHtml(title)}</h3>
      ${contact}
      <ul class="line-items">${orderLines(order)}</ul>
      ${details}
      <div class="card-actions">
        ${nextStepButton(order)}
        ${isDonation ? '' : `<button class="btn btn-small btn-outline" type="button" data-action="print-slip"
          data-owner="${escapeHtml(order.owner)}" data-id="${escapeHtml(order.id)}">Print slip</button>`}
        ${stockButton(order)}
      </div>
    </article>`;
}

function nextStepButton(order) {
  const steps = order.kind === 'donation' ? DONATION_NEXT_STEP : FOOD_NEXT_STEP;
  const next = steps[order.status || 'new'];
  if (!next) return '';
  const [status, label] = next;
  return `
    <button class="btn btn-small btn-primary" type="button" data-action="next-step"
      data-owner="${escapeHtml(order.owner)}" data-id="${escapeHtml(order.id)}" data-status="${status}">${label}</button>`;
}

async function moveToNextStep(button) {
  const order = state.allOrders.find(entry => entry.owner === button.dataset.owner && entry.id === button.dataset.id);
  if (!order) return;
  const labels = order.kind === 'donation' ? DONATION_LABELS : FOOD_LABELS;
  const status = button.dataset.status;

  button.disabled = true;
  try {
    await updateEntry('orders', order.owner, order.id, { status: status });
    toast('Marked as ' + labels[status].toLowerCase());
    rememberStatus(state.allOrders, order.owner, order.id, status);
    saveImpact();
  } catch (error) {
    toast('Couldn\'t update that. Try again.', 'bad');
    button.disabled = false;
  }
}

function orderLines(order) {
  if (order.kind === 'donation') {
    const item = order.item || {};
    let category = '';
    if (CATEGORIES.includes(item.category)) {
      category = ` <span class="muted">(${escapeHtml(english('cat_' + item.category))})</span>`;
    }
    // if the donor typed it in another language, show our English name too
    let name = item.name || 'Item';
    const stockItem = findItem(item.id);
    if (stockItem && itemName(stockItem, 'en').toLowerCase() !== name.toLowerCase()) {
      name += ' / ' + itemName(stockItem, 'en');
    }

    const amount = formatNumber(item.qty, 'en') + ' ' + unitName(item.unit, item.qty, 'en');
    return `<li><span>${escapeHtml(name)}${category}</span><span>${escapeHtml(amount)}</span></li>`;
  }

  return (order.items || []).map(line => {
    const item = findItem(line.id);
    const name = item ? itemName(item, 'en') : line.name;
    return `<li><span>${escapeHtml(name)}</span><span>×${formatNumber(line.qty, 'en')}</span></li>`;
  }).join('');
}

// "Subtract from stock" for requests and "Add to stock" for donations. Each can only be done once.
function stockButton(order) {
  if (order.stockApplied) {
    return `<span>${icon('check')} Stock updated</span>`;
  }
  const isDonation = order.kind === 'donation';
  const label = isDonation ? 'Add to stock' : 'Subtract from stock';
  const hint = isDonation ? 'when the donation arrives' : 'when the bag is packed';
  return `
    <button class="btn btn-small btn-outline" type="button" data-action="apply-stock"
      data-owner="${escapeHtml(order.owner)}" data-id="${escapeHtml(order.id)}">${label}</button>
    <span>${hint}</span>`;
}

async function applyToStock(ownerId, orderId, button) {
  const order = state.allOrders.find(entry => entry.owner === ownerId && entry.id === orderId);
  if (!order || order.stockApplied) return;

  button.disabled = true;
  try {
    if (order.kind === 'donation') {
      await addDonationToStock(order);
    } else {
      await takeRequestFromStock(order);
    }
    await updateEntry('orders', ownerId, orderId, { stockApplied: true });
    toast('Stock updated');
  } catch (error) {
    toast('Couldn\'t update stock. Try again.', 'bad');
    button.disabled = false;
  }
}

// Adds to an item with the same English name at the same place, or makes a new item.
async function addDonationToStock(order) {
  const donated = order.item || {};
  const name = cleanText(donated.name, 80);
  const amount = Math.max(0, Number(donated.qty) || 0);
  if (!name) throw new Error('This donation has no item name');

  // the donor's form links it to an item when the name matched one, otherwise match the English name
  let sameItem = findItem(donated.id);
  if (!sameItem || sameItem.pantryId !== order.pantryId) {
    sameItem = state.stock.find(item => {
      const englishName = (item.names && item.names.en) || '';
      return englishName.toLowerCase() === name.toLowerCase() && item.pantryId === order.pantryId;
    });
  }

  if (sameItem) {
    await state.db.doc('stock/' + sameItem.id).update({
      qty: amountOf(sameItem) + amount,
      updatedAt: Date.now(),
      updatedBy: state.userId
    });
    return;
  }

  await state.db.doc('stock/' + makeId('i')).set({
    names: { en: name },
    category: CATEGORIES.includes(donated.category) ? donated.category : 'other',
    qty: amount,
    unit: UNIT_CODES.includes(donated.unit) ? donated.unit : 'items',
    lowAt: 5,
    pantryId: order.pantryId || '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    updatedBy: state.userId
  });
}

async function takeRequestFromStock(order) {
  for (const line of order.items || []) {
    const item = findItem(line.id);
    if (!item) continue; // the item was deleted since
    const left = Math.max(0, amountOf(item) - (Number(line.qty) || 0));
    await state.db.doc('stock/' + item.id).update({
      qty: left,
      updatedAt: Date.now(),
      updatedBy: state.userId
    });
  }
}

function setupDashboardFood() {
  const panel = $('#panel-orders');

  panel.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;

    if (button.dataset.action === 'food-filter') {
      foodFilter = button.dataset.value;
      redrawAndKeepFocus(button, renderFoodRequests);
    }
    if (button.dataset.action === 'apply-stock') {
      applyToStock(button.dataset.owner, button.dataset.id, button);
    }
    if (button.dataset.action === 'next-step') {
      moveToNextStep(button);
    }
    if (button.dataset.action === 'print-slip') {
      const order = state.allOrders.find(entry => entry.owner === button.dataset.owner && entry.id === button.dataset.id);
      if (order) openSlips([order]);
    }
  });

  $('#printSlipsButton').addEventListener('click', () => {
    openSlips(shownFoodOrders.filter(order => order.kind !== 'donation' && order.status !== 'done'));
  });

  panel.addEventListener('change', event => {
    const select = event.target;
    if (select.dataset.change !== 'order-status') return;
    const order = state.allOrders.find(entry => entry.owner === select.dataset.owner && entry.id === select.dataset.id);
    const labels = order && order.kind === 'donation' ? DONATION_LABELS : FOOD_LABELS;
    changeStatus('orders', select, labels);
  });
}
