// "My requests" page: everything this person has sent, and the items they asked to hear about.
// The bell in the header shows how many updates are waiting here.

const MAX_SHOWN = 15;

// Things worth telling the family about right now.
function getUpdates() {
  const updates = [];

  for (const order of entryList(state.myOrders)) {
    if (order.kind !== 'donation' && order.status === 'ready') {
      updates.push({ type: 'bag-ready', order: order });
    }
  }

  for (const request of entryList(state.myTutoring)) {
    const hasTutor = request.status === 'matched' || request.status === 'scheduled';
    if (hasTutor && request.tutor) {
      updates.push({ type: 'tutor-found', request: request });
    }
  }

  for (const itemId in state.myAlerts) {
    const item = findItem(itemId);
    if (item && isBackInStock(item, state.myAlerts[itemId])) {
      updates.push({ type: 'back-in-stock', item: item });
    }
  }

  return updates;
}

// "Better than when they asked": out -> low, out -> in, or low -> in.
function isBackInStock(item, alert) {
  const order = { out: 0, low: 1, in: 2 };
  const whenTheyAsked = (alert && alert.was) || 'out';
  return order[stockStatus(item)] > order[whenTheyAsked];
}

function updateBadge() {
  const count = getUpdates().length;
  const badge = $('#updateCount');
  badge.hidden = count === 0;
  badge.textContent = count;
}

function renderMyRequests() {
  renderUpdates();
  renderFoodHistory();
  renderTutoringHistory();
  renderWatchList();
  updateBadge();
}


// ----- Updates -----

function renderUpdates() {
  const list = $('#updatesList');
  const updates = getUpdates();
  if (updates.length === 0) {
    list.innerHTML = `<li class="muted">${escapeHtml(t('updates_empty'))}</li>`;
    return;
  }
  list.innerHTML = updates.map(updateCard).join('');
}

function updateCard(update) {
  if (update.type === 'bag-ready') {
    const order = update.order;
    let code = '';
    if (order.pickupCode) code = `<span class="pickup-code">${escapeHtml(order.pickupCode)}</span>`;
    return `
      <li class="request-card highlight">
        <strong>${escapeHtml(t('ready_note'))}</strong>
        <span class="request-where">${icon('pin')} ${escapeHtml(placeName(order.pantryId))}</span>
        ${order.slot ? `<span>${escapeHtml(t('sent_when', { time: slotLabel(order.slot) }))}</span>` : ''}
        ${code}
      </li>`;
  }

  if (update.type === 'tutor-found') {
    const request = update.request;
    let session = '';
    if (request.session) session = `<span>${escapeHtml(t('session_is', { time: request.session }))}</span>`;
    return `
      <li class="request-card highlight">
        <strong>${escapeHtml(t('tutor_ready_note', { subject: t('subj_' + request.subject) }))}</strong>
        <span>${escapeHtml(t('tutor_is', { name: request.tutor }))}</span>
        ${session}
      </li>`;
  }

  // back in stock
  const item = update.item;
  const amount = amountOf(item);
  const where = formatNumber(amount) + ' ' + unitName(item.unit, amount) + ' · ' + placeName(item.pantryId);
  return `
    <li class="request-card highlight">
      <strong>${escapeHtml(t('back_in_stock'))}: ${escapeHtml(itemName(item))}</strong>
      <span class="request-where">${escapeHtml(where)}</span>
      <div>${stopWatchingButton(item, t('dismiss'))}</div>
    </li>`;
}

function stopWatchingButton(item, label) {
  return `<button type="button" class="btn btn-small btn-outline" data-action="stop-watching" data-id="${escapeHtml(item.id)}">${escapeHtml(label)}</button>`;
}


// ----- Food requests and donations -----

function renderFoodHistory() {
  const list = $('#foodRequestList');
  const orders = entryList(state.myOrders);
  if (orders.length === 0) {
    list.innerHTML = `<li class="muted">${escapeHtml(t('mine_empty_food'))}</li>`;
    return;
  }
  list.innerHTML = orders.slice(0, MAX_SHOWN).map(foodHistoryCard).join('');
}

function foodHistoryCard(order) {
  const isDonation = order.kind === 'donation';
  const steps = isDonation ? DONATION_STEPS : FOOD_STEPS;
  const labelPrefix = isDonation ? 'donation_' : 'food_';
  const status = steps.includes(order.status) ? order.status : 'new';
  const kindLabel = t(isDonation ? 'kind_donation' : 'kind_request');
  const kindStyle = isDonation ? 'pill-sun' : 'pill-plain';

  let where = '';
  if (placeName(order.pantryId)) {
    where = `<div class="request-where">${icon('pin')} ${escapeHtml(placeName(order.pantryId))}</div>`;
  }

  let code = '';
  if (order.pickupCode) {
    code = `<div class="pickup-code">${escapeHtml(t('pickup_code', { code: order.pickupCode }))}</div>`;
  }

  let pickupTime = '';
  if (order.slot) {
    pickupTime = `<div class="request-where">${escapeHtml(t('sent_when', { time: slotLabel(order.slot) }))}</div>`;
  }

  return `
    <li class="request-card">
      <div class="request-top">
        <span class="pill ${kindStyle}">${escapeHtml(kindLabel)}</span>
        <span class="pill pill-in">${escapeHtml(t(labelPrefix + status))}</span>
        <span class="when">${escapeHtml(timeAgo(order.createdAt))}</span>
      </div>
      <div class="request-what">${escapeHtml(describeOrder(order))}</div>
      ${where}
      ${pickupTime}
      ${code}
      ${progressSteps(steps, status, labelPrefix)}
    </li>`;
}

// "Rice ×2, Milk ×1" or "Canned corn · 24 cans"
function describeOrder(order) {
  if (order.kind === 'donation') {
    const donated = order.item || {};
    return donated.name + ' · ' + formatNumber(donated.qty) + ' ' + unitName(donated.unit, donated.qty);
  }

  const lines = (order.items || []).map(line => {
    const item = findItem(line.id);
    const name = item ? itemName(item) : line.name;
    return name + ' ×' + formatNumber(line.qty);
  });
  return lines.join(', ');
}


// ----- Tutoring -----

function renderTutoringHistory() {
  const list = $('#tutorRequestList');
  const requests = entryList(state.myTutoring);
  if (requests.length === 0) {
    list.innerHTML = `<li class="muted">${escapeHtml(t('mine_empty_tutor'))}</li>`;
    return;
  }
  list.innerHTML = requests.slice(0, MAX_SHOWN).map(tutoringHistoryCard).join('');
}

function tutoringHistoryCard(request) {
  const status = TUTORING_STEPS.includes(request.status) ? request.status : 'new';

  const whenParts = [];
  for (const time of request.times || []) whenParts.push(t('time_' + time));
  for (const day of request.days || []) whenParts.push(t('day_' + day));

  const who = [request.studentName, request.topic].filter(Boolean).join(' · ');

  let when = '';
  if (whenParts.length > 0) when = `<div class="request-where">${escapeHtml(whenParts.join(', '))}</div>`;

  let tutor = '';
  if (request.tutor) tutor = `<div><strong>${escapeHtml(t('tutor_is', { name: request.tutor }))}</strong></div>`;

  let session = '';
  if (request.session) session = `<div>${escapeHtml(t('session_is', { time: request.session }))}</div>`;

  return `
    <li class="request-card">
      <div class="request-top">
        <span class="pill pill-plain">${escapeHtml(t('subj_' + request.subject))}</span>
        <span class="pill pill-in">${escapeHtml(t('tutoring_' + status))}</span>
        <span class="when">${escapeHtml(timeAgo(request.createdAt))}</span>
      </div>
      <div class="request-what">${escapeHtml(who)}</div>
      ${when}
      ${tutor}
      ${session}
      ${progressSteps(TUTORING_STEPS, status, 'tutoring_')}
    </li>`;
}


// ----- Restock alerts -----

function renderWatchList() {
  const list = $('#watchList');
  const watched = Object.keys(state.myAlerts).map(findItem).filter(Boolean);
  if (watched.length === 0) {
    list.innerHTML = `<li class="muted">${escapeHtml(t('watch_empty'))}</li>`;
    return;
  }
  list.innerHTML = sortByName(watched).map(watchCard).join('');
}

function watchCard(item) {
  const status = stockStatus(item);
  return `
    <li class="request-card">
      <div class="request-top">
        <strong>${escapeHtml(itemName(item))}</strong>
        <span class="pill pill-${status}">${escapeHtml(t('st_' + status))}</span>
      </div>
      <div class="request-where">${icon('pin')} ${escapeHtml(placeName(item.pantryId))}</div>
      <div>${stopWatchingButton(item, t('stop_watching'))}</div>
    </li>`;
}

// "Notify me" on the Get food page and "Stop alerts" here both come through this.
function toggleAlert(itemId) {
  const problem = whyCantSave();
  if (problem) {
    toast(t(problem), 'bad');
    return;
  }

  const item = findItem(itemId);
  const alerts = { ...state.myAlerts };

  if (alerts[itemId]) {
    delete alerts[itemId];
  } else if (item) {
    // remember how the item looked when they asked, so we can tell when it gets better
    alerts[itemId] = { since: Date.now(), was: stockStatus(item) };
  } else {
    return;
  }
  saveAlerts(alerts);
}

function setupMyRequests() {
  $('#page-mine').addEventListener('click', event => {
    const button = event.target.closest('[data-action="stop-watching"]');
    if (button) toggleAlert(button.dataset.id);
  });
}
