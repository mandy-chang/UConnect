// The app's data: the lists it uses, and everything that reads from or writes to the database.
//
// Inside Claude, window.claude.use('db') gives us a shared database with these collections:
//
//   pantries/<id>          places to get food                   students edit
//   stock/<id>             items on the shelf                   students edit
//   stats/impact           the numbers on the home page         students' dashboards keep it current
//   slots/<place>_<date>   which pickup times are taken         families claim a time when they send
//   orders/<userId>        { entries: { <id>: request or donation } }
//   tutoring/<userId>      { entries: { <id>: tutoring request } }
//   volunteers/<userId>    one volunteer sign-up per person
//   hours/<userId>         { entries: { <id>: service hours logged } }
//   hourChecks/<userId>    { entries: { <id>: { status, by, at } } }  students approve hours here
//   alerts/<userId>        { items: { <itemId>: { since, was } } }  for "Notify me"
//
// Families can only read their own orders, tutoring, volunteers, hours, hour checks and alerts,
// and can't write hour checks at all. Students (people the page is shared with as Editors)
// can read and write everyone's.


// ----- Lists the whole app uses -----

const CATEGORIES = ['produce', 'protein', 'grains', 'dairy', 'canned', 'baby', 'hygiene', 'other'];
const FOOD_CATEGORIES = ['produce', 'protein', 'grains', 'dairy', 'canned', 'other'];
const PLACE_TYPES = ['school', 'foodbank', 'pantry', 'mobile'];
const UNIT_CODES = Object.keys(UNITS);
const LANGUAGE_NAMES = { en: 'English', es: 'Español', zh: '中文', ru: 'Русский' };

// Allergy and diet tags students can put on items, and families can filter by
const ITEM_ALLERGENS = ['nuts', 'dairy', 'eggs', 'gluten', 'soy', 'fish'];
const ITEM_DIETS = ['vegetarian', 'vegan', 'halal'];

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri']; // school days, for volunteers and tutoring
const WEEK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']; // in the order Date.getDay() counts
const TIMES = ['lunch', 'after'];
const JOBS = {
  lunch: ['restock', 'table', 'tutor', 'sort', 'posters'],
  after: ['pack', 'handout', 'tutor', 'count', 'drive', 'translate']
};
const SUBJECTS = ['math', 'english', 'science', 'history', 'language', 'cs', 'test', 'homework'];
const GRADES = [6, 7, 8, 9, 10, 11, 12];

// The steps each kind of request goes through
const FOOD_STEPS = ['new', 'packing', 'ready', 'done'];
const DONATION_STEPS = ['new', 'confirmed', 'received'];
const TUTORING_STEPS = ['new', 'matched', 'scheduled', 'done'];


// ----- Everything the app knows right now -----

const state = {
  language: 'en',
  page: 'home',
  connection: 'waiting', // 'waiting' until we hear back, then 'live' or 'offline'

  // services from Claude
  db: null,
  user: null,
  ai: null,
  downloads: null, // for saving packing slips as a file

  // who is looking at the page
  me: null,
  userId: null,
  isStaff: false,
  canWrite: null, // null means "we weren't told", so we try and see
  staffSignedIn: false,

  // shared lists
  places: [],
  stock: [],
  impact: null, // the home page numbers (stats/impact)
  slotsTaken: {}, // 'YYYY-MM-DD' -> { '15:00': how many families } for the place on the Get food page
  loaded: { places: false, stock: false, orders: false, tutoring: false, volunteers: false, hours: false },

  // this person's own things
  myOrders: {},
  myTutoring: {},
  myAlerts: {},
  myVolunteer: null,
  myHours: {},
  myHourChecks: {},

  // students only
  allOrders: [],
  allTutoring: [],
  volunteers: [],
  allHours: [],
  hourChecks: {}, // user id -> { entry id -> { status, by, at } }
  waitingCount: {}, // item id -> how many families asked to be notified
  names: {}, // user id -> name from their Claude account

  // amounts typed in the dashboard that haven't been saved yet
  unsavedAmounts: {}
};


// ----- Looking things up -----

function findItem(id) {
  return state.stock.find(item => item.id === id);
}

function findPlace(id) {
  return state.places.find(place => place.id === id);
}

function placeName(id) {
  const place = findPlace(id);
  return place ? place.name : '';
}

// Items have a name in each language. Fall back to English if a translation is missing.
function itemName(item, language) {
  if (!item) return '';
  if (!language) language = state.language;
  const names = item.names || {};
  return names[language] || names.en || '—';
}

function itemsAt(placeId) {
  return state.stock.filter(item => item.pantryId === placeId);
}

// How many we have, counting a change that's still being saved.
function amountOf(item) {
  let amount = item.qty;
  if (state.unsavedAmounts[item.id] !== undefined) {
    amount = state.unsavedAmounts[item.id];
  }
  return Math.max(0, Number(amount) || 0);
}

// 'in', 'low' or 'out'
function stockStatus(item) {
  const amount = amountOf(item);
  const lowAt = Number(item.lowAt) || 0;
  if (amount <= 0) return 'out';
  if (amount <= lowAt) return 'low';
  return 'in';
}

// Items are always listed A to Z, so rows never jump around when an amount changes.
function sortByName(items, language) {
  if (!language) language = state.language;
  const sorted = items.slice();
  sorted.sort((a, b) => itemName(a, language).localeCompare(itemName(b, language), localeCode(language)));
  return sorted;
}

function sortPlaces(places) {
  const sorted = places.slice();
  sorted.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return sorted;
}

// Places where families can send a request through UConnect (the school pantry).
// The other places are real pantries we only point people to.
function requestPlaces() {
  return sortPlaces(state.places.filter(place => place.takesRequests));
}

// The school pantry at Union High, which distances on the home page are measured from.
function homeBase() {
  return requestPlaces().find(hasCoordinates) || null;
}

// Miles from the school pantry, or null if we can't tell.
function milesFromSchool(place) {
  const base = homeBase();
  if (!base || !hasCoordinates(place)) return null;
  return milesBetween(
    { lat: toNumber(base.lat), lng: toNumber(base.lng) },
    { lat: toNumber(place.lat), lng: toNumber(place.lng) }
  );
}

// The school pantry first, then the closest to it.
function placesNearSchool() {
  return sortPlaces(state.places).sort((a, b) => {
    if (Boolean(a.takesRequests) !== Boolean(b.takesRequests)) return a.takesRequests ? -1 : 1;
    const milesA = milesFromSchool(a);
    const milesB = milesFromSchool(b);
    return (milesA === null ? Infinity : milesA) - (milesB === null ? Infinity : milesB);
  });
}

// True while any place or shelf item is still made-up sample data.
function hasSampleData() {
  return state.places.some(place => place.sample) || state.stock.some(item => item.sample);
}

// Turns { id1: {...}, id2: {...} } into a list, newest first.
function entryList(entriesById) {
  const list = [];
  for (const id in entriesById) {
    const entry = entriesById[id];
    if (entry && typeof entry === 'object') {
      list.push({ id: id, ...entry });
    }
  }
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return list;
}

// Text to show while something is loading or can't load. Null when it's ready.
function loadingText(what) {
  if (state.connection === 'offline') return t('offline');
  if (state.connection === 'waiting') return t('loading');
  if (!state.loaded[what]) return t('loading');
  return null;
}


// ----- Connecting to Claude -----

async function connect() {
  const claude = window.claude;
  if (!claude || typeof claude.use !== 'function') {
    // opened outside Claude with no demo backend
    state.connection = 'offline';
    refresh();
    return;
  }

  // ask for them all at once instead of waiting for each one
  const services = await Promise.all([
    getService(claude, 'db'),
    getService(claude, 'user'),
    getService(claude, 'sample'),
    getService(claude, 'downloads')
  ]);
  state.db = services[0];
  state.user = services[1];
  state.ai = services[2];
  state.downloads = services[3];

  if (state.user) {
    try {
      const me = await state.user.me();
      state.me = me;
      state.userId = me.id || null;
      state.isStaff = Boolean(me.canEdit);
    } catch (error) {
      // not signed in
    }
    try {
      state.canWrite = await state.user.can('data.write');
    } catch (error) {
      state.canWrite = null;
    }
  }

  state.connection = state.db ? 'live' : 'offline';
  refresh();
  if (state.db) listenForChanges();
}

// Asks Claude for a service. Gives back null if it isn't available here.
async function getService(claude, name) {
  try {
    return await claude.use(name);
  } catch (error) {
    return null;
  }
}

// onSnapshot runs our function now, and again every time the data changes.
function listenForChanges() {
  const db = state.db;

  db.collection('pantries').onSnapshot(snapshot => {
    state.places = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    state.loaded.places = true;
    refresh();
  }, error => loadProblem('pantries', error));

  db.collection('stock').onSnapshot(snapshot => {
    state.stock = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    state.loaded.stock = true;
    refresh();
  }, error => loadProblem('stock', error));

  db.doc('stats/impact').onSnapshot(doc => {
    state.impact = doc.exists ? doc.data() : null;
    refresh();
  }, error => loadProblem('impact numbers', error));

  // the rest is this person's own data, so we need to know who they are
  if (!state.userId) return;
  const me = state.userId;

  db.doc('orders/' + me).onSnapshot(doc => {
    const before = state.myOrders;
    state.myOrders = doc.exists ? doc.data().entries || {} : {};
    tellFamilyAboutReadyBags(before, state.myOrders);
    refresh();
  }, error => loadProblem('my orders', error));

  db.doc('tutoring/' + me).onSnapshot(doc => {
    const before = state.myTutoring;
    state.myTutoring = doc.exists ? doc.data().entries || {} : {};
    tellFamilyAboutTutors(before, state.myTutoring);
    refresh();
  }, error => loadProblem('my tutoring', error));

  db.doc('alerts/' + me).onSnapshot(doc => {
    state.myAlerts = doc.exists ? doc.data().items || {} : {};
    refresh();
  }, error => loadProblem('my alerts', error));

  db.doc('volunteers/' + me).onSnapshot(doc => {
    state.myVolunteer = doc.exists ? doc.data() : null;
    refresh();
  }, error => loadProblem('my sign-up', error));

  db.doc('hours/' + me).onSnapshot(doc => {
    state.myHours = doc.exists ? doc.data().entries || {} : {};
    refresh();
  }, error => loadProblem('my hours', error));

  // approvals live in their own document that only students can write,
  // so nobody can approve their own hours
  db.doc('hourChecks/' + me).onSnapshot(doc => {
    state.myHourChecks = doc.exists ? doc.data().entries || {} : {};
    refresh();
  }, error => loadProblem('my hour approvals', error));
}

// 'approved', 'declined' or 'pending', from a student's check (never from the volunteer's own entry)
function hourStatus(checks, entryId) {
  const check = checks && checks[entryId];
  return check && ['approved', 'declined'].includes(check.status) ? check.status : 'pending';
}

function tellFamilyAboutReadyBags(before, now) {
  for (const id in now) {
    const wasReady = before[id] && before[id].status === 'ready';
    if (before[id] && !wasReady && now[id].status === 'ready') {
      toast(t('ready_note') + ' · ' + placeName(now[id].pantryId), 'sun');
    }
  }
}

function tellFamilyAboutTutors(before, now) {
  for (const id in now) {
    if (before[id] && before[id].status === 'new' && now[id].status !== 'new') {
      toast(t('tutor_ready_note', { subject: t('subj_' + now[id].subject) }), 'sun');
    }
  }
}

function loadProblem(what, error) {
  console.warn('UConnect could not load ' + what, error);
  // these two mean we lost access, so stop showing live data
  if (error && (error.code === 'revoked' || error.code === 'not_granted')) {
    state.connection = 'offline';
    refresh();
  }
}


// ----- Saving -----

// If this person can't send forms right now, returns the translation key that explains why.
function whyCantSave() {
  if (state.connection !== 'live' || !state.db) return 'offline';
  if (!state.userId) return 'signin_needed';
  if (state.canWrite === false) return 'write_blocked';
  return null;
}

function errorMessageKey(error) {
  const code = error && error.code;
  if (code === 'invalid_argument' || code === 'not_granted' || code === 'revoked') {
    // the database said no, so this person can only look
    state.canWrite = false;
    return 'write_blocked';
  }
  return 'error_generic';
}

// Adds a food request, donation, tutoring request or service hours to the person's own document.
// Pass an id if you already made one (a food request claims its pickup time first).
// Returns { ok: true, id } or { ok: false, errorKey }.
async function addEntry(collection, entry, entryId) {
  const problem = whyCantSave();
  if (problem) return { ok: false, errorKey: problem };

  if (!entryId) entryId = makeId('e');
  const docRef = state.db.doc(collection + '/' + state.userId);

  try {
    const existing = await docRef.get();
    if (existing.exists) {
      // update() merges, so the person's older entries stay
      await docRef.update({ entries: { [entryId]: entry } });
    } else {
      await docRef.set({ entries: { [entryId]: entry } });
    }
    return { ok: true, id: entryId };
  } catch (error) {
    return { ok: false, errorKey: errorMessageKey(error) };
  }
}

// Students use this to change one request inside someone's document (status, tutor...).
function updateEntry(collection, ownerId, entryId, changes) {
  changes.updatedAt = Date.now();
  return state.db.doc(collection + '/' + ownerId).update({ entries: { [entryId]: changes } });
}

// Saves the list of items this person wants to hear about.
// The saves go one after another, so tapping two "Notify me" buttons quickly works.
let alertSaving = Promise.resolve();

function saveAlerts(items) {
  state.myAlerts = items;
  refresh();

  const userId = state.userId;
  alertSaving = alertSaving
    .then(() => state.db.doc('alerts/' + userId).set({ items: items, updatedAt: Date.now() }))
    .catch(error => toast(t(errorMessageKey(error)), 'bad'));
}
