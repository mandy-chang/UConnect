// The numbers on the home page: bags given out, items, tutoring sessions, donations and
// volunteer hours, counted from a start date (the start of the school year unless students pick another).
//
// Families can't read everyone's requests, so the numbers are added up on the students'
// dashboard and saved to stats/impact, which everyone can read. They're saved when a student
// changes something that counts (a bag picked up, hours approved...), and once when the
// dashboard opens, and only if a number actually changed.

const IMPACT_DOC = 'stats/impact';
const IMPACT_NUMBERS = ['bags', 'items', 'tutoring', 'donations', 'hours'];
let impactSavedOnOpen = false;


// ----- Home page -----

function renderImpact() {
  const box = $('#impactStrip');
  const numbers = state.impact;
  const shown = numbers ? IMPACT_NUMBERS.filter(name => Number(numbers[name]) > 0) : [];
  box.hidden = shown.length === 0;
  if (box.hidden) return;

  const since = formatDate(dateFromKey(numbers.since || schoolYearStart()), state.language, { month: 'long', day: 'numeric' });
  $('#impactTitle').textContent = t('impact_title', { date: since });
  $('#impactNumbers').innerHTML = shown.map(name => `
    <div class="impact-number">
      <b>${formatNumber(numbers[name])}</b>
      <span>${escapeHtml(t('impact_' + name))}</span>
    </div>`).join('');
}


// ----- Counting (students' dashboard) -----

// August 1st of this school year
function schoolYearStart() {
  const now = new Date();
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return dateKey(new Date(year, 7, 1));
}

function impactSince() {
  return (state.impact && state.impact.since) || schoolYearStart();
}

function countImpact(since) {
  const from = dateFromKey(since).getTime();
  const sentSince = entry => (entry.createdAt || 0) >= from;

  const pickedUp = state.allOrders.filter(order => order.kind !== 'donation' && order.status === 'done' && sentSince(order));
  let items = 0;
  for (const order of pickedUp) {
    for (const line of order.items || []) items += Number(line.qty) || 0;
  }

  const donations = state.allOrders.filter(order => order.kind === 'donation' && order.status === 'received' && sentSince(order));
  const sessions = state.allTutoring.filter(request => request.status === 'done' && sentSince(request));

  let hours = 0;
  for (const entry of state.allHours) {
    const day = entry.date || dateKey(new Date(entry.createdAt || 0));
    if (entry.status === 'approved' && day >= since) hours += Number(entry.hours) || 0;
  }

  return {
    since: since,
    bags: pickedUp.length,
    items: items,
    tutoring: sessions.length,
    donations: donations.length,
    hours: Math.round(hours * 4) / 4
  };
}

// Saves the numbers if any of them changed. Needs everything loaded first, or it would undercount.
async function saveImpact(since) {
  if (!state.isStaff || !state.db) return;
  if (!state.loaded.orders || !state.loaded.tutoring || !state.loaded.hours) return;

  const numbers = countImpact(since || impactSince());
  const old = state.impact || {};
  const unchanged = ['since'].concat(IMPACT_NUMBERS).every(name => old[name] === numbers[name]);
  if (unchanged) return;

  try {
    await state.db.doc(IMPACT_DOC).set({ ...numbers, updatedAt: Date.now() });
  } catch (error) {
    console.warn('UConnect could not save the home page numbers', error);
  }
}

// Once per visit, when the dashboard has everything it needs to count.
function saveImpactOnceLoaded() {
  if (impactSavedOnOpen || !state.loaded.orders || !state.loaded.tutoring || !state.loaded.hours) return;
  impactSavedOnOpen = true;
  saveImpact();
}

// After a student changes a status, update the copy we have right away,
// so the count includes it even before the database sends it back.
function rememberStatus(list, ownerId, entryId, status) {
  const entry = list.find(item => item.owner === ownerId && item.id === entryId);
  if (entry) entry.status = status;
}

// The line under the tiles: "Home page shows: 12 bags · 3 tutoring sessions ... counted since [date]"
function renderImpactLine() {
  const numbers = countImpact(impactSince());
  const parts = [
    `${numbers.bags} bags (${numbers.items} items)`,
    `${numbers.tutoring} tutoring sessions`,
    `${numbers.donations} donations`,
    `${numbers.hours} volunteer hours`
  ];
  $('#impactSummary').textContent = parts.join(' · ');
  if (document.activeElement !== $('#impactSince')) $('#impactSince').value = impactSince();
}

function setupImpact() {
  $('#impactSince').addEventListener('change', event => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) {
      saveImpact(event.target.value);
      toast('Home page numbers now count from ' + timeLabelForDate(event.target.value));
    }
  });
}

function timeLabelForDate(key) {
  return formatDate(dateFromKey(key), 'en', { month: 'long', day: 'numeric', year: 'numeric' });
}
