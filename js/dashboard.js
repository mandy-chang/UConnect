// Student side: the login page and the frame of the dashboard (tiles and tabs).
// Each tab has its own file: dashboard-food.js, dashboard-tutoring.js, dashboard-stock.js,
// dashboard-volunteers.js and dashboard-locations.js.
//
// The student side is English only. Anyone the page is shared with as an Editor counts as a student.

let dashboardTab = 'orders';
let listeningToStaffData = false;
let redrawWhenDoneTyping = false;

// what was already there when the dashboard opened, so we only announce new things
const alreadySeen = { orders: null, tutoring: null };


// ----- Login -----

function renderLogin() {
  const box = $('#loginBody');

  if (state.connection === 'waiting') {
    box.innerHTML = '<p class="muted">Checking your account…</p>';
    return;
  }
  if (!state.user || !state.userId) {
    box.innerHTML = '<p class="message info">Open UConnect in Claude and sign in to continue.</p>';
    return;
  }

  const me = state.me || {};
  let role = 'Visitor';
  if (me.canEdit) role = 'Student team';
  if (me.isOwner) role = 'Team lead (owner)';

  const who = `
    <div class="who">
      <img src="${escapeHtml(me.avatarUrl || '')}" alt="">
      <div>
        <b>${escapeHtml(me.name || 'Signed in')}</b>
        <span class="muted">${escapeHtml(role)}</span>
      </div>
    </div>`;

  if (!state.isStaff) {
    box.innerHTML = who + `
      <p class="message bad">You're not on the student team yet. Ask the UConnect team lead to share
      this page with you as an Editor, then reload.</p>`;
    return;
  }

  box.innerHTML = who + `
    <button class="btn btn-primary" type="button" id="continueButton">Continue as ${escapeHtml(me.name || 'you')}</button>`;
  $('#continueButton').addEventListener('click', signInAsStaff);
}

function signInAsStaff() {
  state.staffSignedIn = true;
  listenToStaffData();
  showPage('dashboard');
}


// ----- Live data that only students can see -----

function listenToStaffData() {
  if (listeningToStaffData || !state.db) return;
  listeningToStaffData = true;
  const db = state.db;

  db.collection('orders').onSnapshot(snapshot => {
    state.allOrders = allEntries(snapshot);
    state.loaded.orders = true;
    announceNewEntries('orders', state.allOrders);
    saveImpactOnceLoaded();
    refresh();
  }, error => loadProblem('orders', error));

  db.collection('tutoring').onSnapshot(snapshot => {
    state.allTutoring = allEntries(snapshot);
    state.loaded.tutoring = true;
    announceNewEntries('tutoring', state.allTutoring);
    saveImpactOnceLoaded();
    refresh();
  }, error => loadProblem('tutoring', error));

  // hours need both lists: what volunteers logged, and which ones students checked
  let hoursLoaded = false;
  let checksLoaded = false;
  const hoursReady = () => {
    applyHourChecks();
    state.loaded.hours = hoursLoaded && checksLoaded;
    saveImpactOnceLoaded();
    refresh();
  };

  db.collection('hours').onSnapshot(snapshot => {
    state.allHours = allEntries(snapshot);
    hoursLoaded = true;
    hoursReady();
  }, error => loadProblem('hours', error));

  db.collection('hourChecks').onSnapshot(snapshot => {
    const checks = {};
    for (const doc of snapshot.docs) checks[doc.id] = doc.data().entries || {};
    state.hourChecks = checks;
    checksLoaded = true;
    hoursReady();
  }, error => loadProblem('hour checks', error));

  db.collection('volunteers').onSnapshot(snapshot => {
    state.volunteers = snapshot.docs.map(doc => ({ userId: doc.id, ...doc.data() }));
    state.volunteers.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    state.loaded.volunteers = true;
    refresh();
  }, error => loadProblem('volunteers', error));

  // count how many families are waiting on each item
  db.collection('alerts').onSnapshot(snapshot => {
    const counts = {};
    for (const doc of snapshot.docs) {
      const items = doc.data().items || {};
      for (const itemId in items) {
        counts[itemId] = (counts[itemId] || 0) + 1;
      }
    }
    state.waitingCount = counts;
    refresh();
  }, error => loadProblem('alerts', error));
}

// Each logged shift gets its status from the students' checks, never from the volunteer's own copy.
function applyHourChecks() {
  for (const entry of state.allHours) {
    entry.status = hourStatus(state.hourChecks[entry.owner], entry.id);
  }
}

// Every family has one document with many entries inside. This makes one big list, newest first.
function allEntries(snapshot) {
  const list = [];
  for (const doc of snapshot.docs) {
    const entries = doc.data().entries || {};
    for (const entryId in entries) {
      const entry = entries[entryId];
      if (entry && typeof entry === 'object') {
        list.push({ ...entry, id: entryId, owner: doc.id });
      }
    }
  }
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return list;
}

// Pops up a message for anything that arrived after the dashboard was opened.
function announceNewEntries(kind, list) {
  const keys = list.map(entry => entry.owner + '/' + entry.id);

  if (alreadySeen[kind] === null) {
    alreadySeen[kind] = new Set(keys);
    return;
  }

  const newOnes = list.filter(entry => !alreadySeen[kind].has(entry.owner + '/' + entry.id));
  for (const key of keys) alreadySeen[kind].add(key);

  for (const entry of newOnes.slice(0, 3)) {
    toast(describeNewEntry(kind, entry), 'sun');
  }
}

function describeNewEntry(kind, entry) {
  if (kind === 'tutoring') {
    return `New tutoring request: ${english('subj_' + entry.subject)}, grade ${entry.grade || '?'}`;
  }
  if (entry.kind === 'donation') {
    const item = entry.item || {};
    return `New donation offer: ${item.qty} ${unitName(item.unit, item.qty, 'en')} of ${item.name}`;
  }
  const itemCount = (entry.items || []).length;
  return `New food request: ${itemCount} item(s) at ${placeName(entry.pantryId) || 'a pickup spot'}`;
}

function countNew(list) {
  return list.filter(entry => entry.status === 'new').length;
}

// Shows "(3) UConnect" in the browser tab when requests are waiting.
function updateTitle() {
  if (!state.staffSignedIn) return;
  const waiting = countNew(state.allOrders) + countNew(state.allTutoring);
  document.title = waiting > 0 ? `(${waiting}) UConnect` : 'UConnect';
}

// When someone didn't type a name, show the name on their Claude account instead.
async function lookUpNames(userIds) {
  if (!state.user || userIds.length === 0) return;
  try {
    const profiles = await state.user.profiles(userIds);
    let foundNew = false;
    for (const id of userIds) {
      const name = (profiles[id] && profiles[id].name) || '';
      if (state.names[id] !== name) {
        state.names[id] = name;
        foundNew = true;
      }
    }
    if (foundNew) renderDashboard();
  } catch (error) {
    // they'll just show as "Someone"
  }
}

function personName(userId, typedName) {
  return typedName || state.names[userId] || 'Someone';
}


// ----- Drawing the dashboard -----

function renderDashboard() {
  if (state.page !== 'dashboard') return;
  updateTitle();
  renderTiles();
  renderImpactLine();
  renderTabs();

  // If someone is typing in this tab, redrawing would wipe out what they typed.
  // Wait until they click out of the box (see setupDashboard).
  const panel = $('#panel-' + dashboardTab);
  const focused = document.activeElement;
  if (focused && panel.contains(focused) && focused.matches('input, textarea, select')) {
    redrawWhenDoneTyping = true;
    return;
  }
  redrawWhenDoneTyping = false;

  let firstName = '';
  if (state.me && state.me.name) firstName = state.me.name.split(' ')[0];
  $('#dashboardHello').textContent = firstName ? `Hi, ${firstName}` : 'Welcome back';

  if (dashboardTab === 'orders') renderFoodRequests();
  if (dashboardTab === 'tutoring') renderTutoringRequests();
  if (dashboardTab === 'stock') renderStockTab();
  if (dashboardTab === 'volunteers') renderVolunteers();
  if (dashboardTab === 'locations') renderPlaceCards();
}

function renderTiles() {
  const newOrders = countNew(state.allOrders);
  const newTutoring = countNew(state.allTutoring);
  const lowItems = state.stock.filter(item => stockStatus(item) !== 'in').length;

  // a dash means "still loading"
  const show = (count, isLoaded) => (isLoaded ? formatNumber(count, 'en') : '–');

  $('#tiles').innerHTML =
    tile(show(newOrders, state.loaded.orders), 'New food requests and donations', newOrders > 0 ? 'urgent' : 'good', 'orders') +
    tile(show(newTutoring, state.loaded.tutoring), 'New tutoring requests', newTutoring > 0 ? 'urgent' : 'good', 'tutoring') +
    tile(formatNumber(lowItems, 'en'), 'Items low or out', lowItems > 0 ? 'warning' : 'good', 'low-stock') +
    tile(show(state.volunteers.length, state.loaded.volunteers), 'Volunteers signed up', '', 'volunteers');
}

// Each tile is a shortcut: clicking it opens the tab with those things.
function tile(value, label, style, opens) {
  return `
    <button type="button" class="tile ${style}" data-opens="${opens}">
      <b>${value}</b>
      <span>${escapeHtml(label)}</span>
    </button>`;
}

function openTab(tabName) {
  dashboardTab = tabName;
  renderDashboard();
  const tab = $('#tab-' + tabName);
  tab.focus({ preventScroll: true });
  tab.scrollIntoView({ block: 'nearest' });
}

function renderTabs() {
  for (const tab of $all('.tab')) {
    const isActive = tab.dataset.tab === dashboardTab;
    tab.setAttribute('aria-selected', isActive);
    $('#panel-' + tab.dataset.tab).hidden = !isActive;
  }

  setTabCount('#countOrders', countNew(state.allOrders), true);
  setTabCount('#countTutoring', countNew(state.allTutoring), true);
  setTabCount('#countStock', state.stock.length, false);
  setTabCount('#countVolunteers', state.volunteers.length, false);
  setTabCount('#countLocations', state.places.length, false);
}

// Red counts mean "new things to handle".
function setTabCount(selector, count, redWhenAboveZero) {
  const badge = $(selector);
  badge.textContent = count;
  badge.classList.toggle('urgent', redWhenAboveZero && count > 0);
}


// ----- Pieces shared by several tabs -----

// The row of filter chips above a list, like "Open 3 | All 5".
function filterChips(action, filters, current) {
  return filters.map(([value, label, count]) => `
    <button type="button" class="chip" data-action="${action}" data-value="${value}" aria-pressed="${current === value}">
      ${label}<span class="count">${count}</span>
    </button>`).join('');
}

// A status dropdown for a request card.
function statusSelect(kind, entry, labels) {
  const selectId = `${kind}-status-${entry.owner}-${entry.id}`;
  const options = Object.keys(labels)
    .map(value => `<option value="${value}" ${entry.status === value ? 'selected' : ''}>${labels[value]}</option>`)
    .join('');
  return `
    <label class="sr-only" for="${escapeHtml(selectId)}">Status</label>
    <select id="${escapeHtml(selectId)}" data-change="${kind}-status"
      data-owner="${escapeHtml(entry.owner)}" data-id="${escapeHtml(entry.id)}">${options}</select>`;
}

// A "Label: value" list. Empty values are skipped.
function detailsList(pairs) {
  const rows = pairs
    .filter(([, value]) => value)
    .map(([label, value]) => `<dt>${label}</dt><dd>${escapeHtml(value)}</dd>`);
  if (rows.length === 0) return '';
  return `<dl class="details">${rows.join('')}</dl>`;
}

function languagePill(entry) {
  if (!entry.lang || entry.lang === 'en') return '';
  return `<span class="pill pill-in">Speaks ${escapeHtml(LANGUAGE_NAMES[entry.lang] || entry.lang)}</span>`;
}

async function changeStatus(collection, select, labels) {
  const status = select.value;
  select.disabled = true;
  try {
    await updateEntry(collection, select.dataset.owner, select.dataset.id, { status: status });
    toast('Marked as ' + labels[status].toLowerCase());
    // picked up, received or done changes the numbers on the home page
    rememberStatus(collection === 'orders' ? state.allOrders : state.allTutoring, select.dataset.owner, select.dataset.id, status);
    saveImpact();
  } catch (error) {
    toast('Couldn\'t update that. Try again.', 'bad');
  }
  select.disabled = false;
  select.blur();
}

// There's no confirm() pop-up inside Claude, so a Delete button has to be clicked twice.
function confirmThenRun(button, action) {
  if (button.dataset.armed === 'yes') {
    button.dataset.armed = '';
    action();
    return;
  }

  button.dataset.armed = 'yes';
  const originalLabel = button.innerHTML;
  button.textContent = 'Click again to delete';
  button.classList.add('btn-danger');

  // if they don't click again within 4 seconds, put the button back
  setTimeout(() => {
    if (button.isConnected && button.dataset.armed === 'yes') {
      button.dataset.armed = '';
      button.innerHTML = originalLabel;
      button.classList.remove('btn-danger');
    }
  }, 4000);
}


// ----- Buttons -----

function setupDashboard() {
  const dashboard = $('#page-dashboard');

  for (const tab of $all('.tab')) {
    tab.addEventListener('click', () => {
      dashboardTab = tab.dataset.tab;
      renderDashboard();
    });
  }

  $('#tiles').addEventListener('click', event => {
    const tileButton = event.target.closest('[data-opens]');
    if (!tileButton) return;
    const opens = tileButton.dataset.opens;
    if (opens === 'low-stock') {
      showOnlyLowStock();
      openTab('stock');
    } else {
      openTab(opens);
    }
  });

  // catch up on anything that changed while someone was typing
  dashboard.addEventListener('focusout', () => {
    setTimeout(() => {
      const focused = document.activeElement;
      const stillTyping = focused && dashboard.contains(focused) && focused.matches('input, textarea, select');
      if (redrawWhenDoneTyping && !stillTyping) renderDashboard();
    }, 0);
  });

  setupDashboardFood();
  setupDashboardTutoring();
  setupDashboardStock();
  setupDashboardVolunteers();
  setupDashboardLocations();
  setupDashboardBulk();
}
