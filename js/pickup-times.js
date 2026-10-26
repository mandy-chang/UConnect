// Pickup times at the school pantry, so families don't all show up at once.
//
// Students set them for each place in the dashboard's Locations tab:
//   place.pickup = { days: ['mon', 'tue', ...], start: '15:00', end: '17:00', minutes: 15, perSlot: 4 }
// That means 15-minute pickup times from 3:00 to 4:45, each one open to 4 families.
//
// Which times are taken is kept in slots/<placeId>_<date>:
//   { placeId, date: '2026-10-20', times: { '15:00': { <requestId>: true, ... } } }
// A family claims a time when they send their request. So that two families can't grab
// the last spot at the same moment, they take turns using a short lease (db acquire).

const DAYS_AHEAD = 7;
const TOO_SOON_MINUTES = 15; // students need a little time to pack a bag

let slotsPlaceId = null; // the place whose times we're listening to
let stopListeningToSlots = null;


// ----- Reading the settings -----

// The place's pickup settings, cleaned up, or null if it doesn't use pickup times.
function pickupSettings(place) {
  const pickup = place && place.pickup;
  if (!pickup || !Array.isArray(pickup.days) || pickup.days.length === 0) return null;

  const start = minutesFromTime(pickup.start);
  const end = minutesFromTime(pickup.end);
  const length = Math.max(5, Number(pickup.minutes) || 15);
  if (start === null || end === null || end - start < length) return null;

  return {
    days: pickup.days,
    start: start,
    end: end,
    length: length,
    perSlot: Math.max(1, Math.floor(Number(pickup.perSlot) || 1))
  };
}

// '15:30' -> 930 (minutes after midnight)
function minutesFromTime(text) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(text || ''));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

// 930 -> '15:30'
function timeFromMinutes(minutes) {
  return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
}

// A date as 'YYYY-MM-DD' in the viewer's own time zone
function dateKey(date) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}

function dateFromKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}


// ----- The next week's times -----

// [{ date: '2026-10-20', times: [{ time: '15:00', left: 3 }, ...] }, ...]
// Days the place is closed are skipped, and so are times that are about to start.
function upcomingPickupDays(place) {
  const settings = pickupSettings(place);
  if (!settings) return [];

  const now = new Date();
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const days = [];

  for (let ahead = 0; ahead < DAYS_AHEAD; ahead++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead);
    if (!settings.days.includes(WEEK[date.getDay()])) continue;

    const key = dateKey(date);
    const takenThatDay = state.slotsTaken[key] || {};
    const times = [];

    for (let minutes = settings.start; minutes + settings.length <= settings.end; minutes += settings.length) {
      if (ahead === 0 && minutes < minutesNow + TOO_SOON_MINUTES) continue;
      const time = timeFromMinutes(minutes);
      times.push({ time: time, left: Math.max(0, settings.perSlot - (takenThatDay[time] || 0)) });
    }

    if (times.length > 0) days.push({ date: key, times: times });
  }
  return days;
}


// ----- Showing dates and times -----

// "Today", "Tomorrow", or "Wed, Oct 21"
function dayLabel(key, language) {
  const today = dateKey(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);

  if (!language) language = state.language;
  if (key === today) return tIn(language, 'today');
  if (key === dateKey(tomorrowDate)) return tIn(language, 'tomorrow');
  return formatDate(dateFromKey(key), language, { weekday: 'short', month: 'short', day: 'numeric' });
}

// "3:15 PM" (or "15:15", depending on the language)
function timeLabel(time, language) {
  const minutes = minutesFromTime(time);
  if (minutes === null) return time || '';
  const date = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return formatDate(date, language, { hour: 'numeric', minute: '2-digit' });
}

// "Tue, Oct 20 · 3:15 PM", for a saved { date, time }
function slotLabel(slot, language) {
  if (!slot || !slot.date || !slot.time) return '';
  const day = formatDate(dateFromKey(slot.date), language, { weekday: 'short', month: 'short', day: 'numeric' });
  return day + ' · ' + timeLabel(slot.time, language);
}

function formatDate(date, language, options) {
  try {
    return new Intl.DateTimeFormat(localeCode(language || state.language), options).format(date);
  } catch (error) {
    return date.toDateString();
  }
}

// t() for a given language, for the dashboard (English) and the family's own language
function tIn(language, key) {
  const words = TRANSLATIONS[language] || TRANSLATIONS.en;
  return words[key] || TRANSLATIONS.en[key] || key;
}


// ----- Listening to which times are taken -----

// Called when the Get food page shows a place. Listens only once per place.
function listenToSlots(placeId) {
  if (placeId === slotsPlaceId) return;
  slotsPlaceId = placeId;
  if (stopListeningToSlots) stopListeningToSlots();
  stopListeningToSlots = null;
  state.slotsTaken = {};

  const place = findPlace(placeId);
  if (!state.db || !pickupSettings(place)) return;

  const today = dateKey(new Date());
  stopListeningToSlots = state.db.collection('slots')
    .where('placeId', '==', placeId)
    .where('date', '>=', today)
    .onSnapshot(snapshot => {
      const taken = {};
      for (const doc of snapshot.docs) {
        const data = doc.data() || {};
        const counts = {};
        for (const time in data.times || {}) {
          counts[time] = Object.keys(data.times[time] || {}).length;
        }
        taken[data.date] = counts;
      }
      state.slotsTaken = taken;
      if (state.page === 'food') renderFood();
    }, error => loadProblem('pickup times', error));
}


// ----- Claiming a time -----

// Saves this request's spot in a pickup time. Gives back 'ok', 'full' or 'busy'.
async function claimSlot(placeId, slot, requestId) {
  const settings = pickupSettings(findPlace(placeId));
  if (!settings) return 'ok';

  const ref = state.db.doc('slots/' + placeId + '_' + slot.date);
  const gotTurn = await waitForTurn(ref, requestId);
  if (!gotTurn) return 'busy';

  const snapshot = await ref.get();
  const data = snapshot.exists ? snapshot.data() || {} : {};
  const times = data.times || {};
  const alreadyThere = times[slot.time] || {};
  if (Object.keys(alreadyThere).length >= settings.perSlot) return 'full';

  await ref.set({
    placeId: placeId,
    date: slot.date,
    times: { ...times, [slot.time]: { ...alreadyThere, [requestId]: true } },
    updatedAt: Date.now()
  });
  return 'ok';
}

// Gives the spot back, if sending the request failed after the time was claimed.
async function releaseSlot(placeId, slot, requestId) {
  try {
    const ref = state.db.doc('slots/' + placeId + '_' + slot.date);
    await waitForTurn(ref, requestId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return;
    const data = snapshot.data() || {};
    const times = data.times || {};
    const people = { ...(times[slot.time] || {}) };
    delete people[requestId];
    await ref.set({ ...data, times: { ...times, [slot.time]: people }, updatedAt: Date.now() });
  } catch (error) {
    // the spot stays taken; a student can still see the request isn't there
  }
}

// Short lease on the day's document, so only one family changes it at a time.
// The lease runs out by itself after 1.5 seconds (there's no "let go"), so we keep
// trying for a little longer than that before giving up. (Without acquire, just goes ahead.)
const LEASE_MS = 1500;
const TRIES = 12;
const WAIT_BETWEEN_TRIES_MS = 300;

async function waitForTurn(ref, holder) {
  if (typeof ref.acquire !== 'function') return true;
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const lease = await ref.acquire({ holder: holder, ttlMs: LEASE_MS });
    if (lease && lease.acquired) return true;
    await new Promise(resolve => setTimeout(resolve, WAIT_BETWEEN_TRIES_MS));
  }
  return false;
}
