// Dashboard "Locations" tab: add, edit and delete the places that show on the public map.
// Our own pantry has "takes requests" on, plus its pickup times. The rest are real pantries
// we point families to, with their hours, phone and website.

let editingPlaceId = null;
let pickupDaysChosen = new Set(); // days ticked in the pickup times part of the form

const DEFAULT_PICKUP = { days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '15:00', end: '17:00', minutes: 15, perSlot: 4 };

function renderPlaceCards() {
  const box = $('#placeCards');
  if (!state.loaded.places) {
    box.innerHTML = '<p class="empty">Loading locations…</p>';
    return;
  }
  if (state.places.length === 0) {
    box.innerHTML = '<p class="empty">No locations yet. Add one so families can find you.</p>';
    return;
  }
  box.innerHTML = sortPlaces(state.places).map(placeAdminCard).join('');
}

function placeAdminCard(place) {
  let tags = '';
  if (place.takesRequests) tags += '<span class="pill pill-accent">Takes requests</span>';
  tags += `<span class="pill pill-plain">${escapeHtml(english('type_' + place.type))}</span>`;
  if (place.sample) tags += '<span class="pill pill-sun">Sample</span>';
  if (!hasCoordinates(place)) tags += '<span class="pill pill-out">Not on map</span>';

  const rows = [
    ['Hours', place.hours || '—'],
    ['Phone', place.phone || '—'],
    ['Who', place.note || '—']
  ];
  if (place.takesRequests) {
    rows.push(['Pickup', describePickup(place)]);
    rows.push(['Items', String(itemsAt(place.id).length)]);
  }
  const details = detailsList(rows);

  return `
    <article class="card">
      <div class="card-top">${tags}</div>
      <h3>${escapeHtml(place.name)}</h3>
      <p class="contact">${escapeHtml(place.address || 'No address yet')}</p>
      ${details}
      <div class="row-buttons left">
        <button class="btn btn-small btn-outline" type="button" data-action="edit-place" data-id="${escapeHtml(place.id)}">Edit</button>
        <button class="btn btn-small btn-outline" type="button" data-action="delete-place" data-id="${escapeHtml(place.id)}">Delete</button>
      </div>
    </article>`;
}

// "Mon–Fri 3:00 PM–5:00 PM, every 15 min, 4 families each"
function describePickup(place) {
  const settings = pickupSettings(place);
  if (!settings) return 'No pickup times';
  const days = WEEK.filter(day => settings.days.includes(day)).map(day => english('day_' + day)).join(', ');
  const from = timeLabel(timeFromMinutes(settings.start), 'en');
  const until = timeLabel(timeFromMinutes(settings.end), 'en');
  return `${days} ${from}–${until}, every ${settings.length} min, ${settings.perSlot} per time`;
}

function renderPickupDays() {
  $('#pickupDays').innerHTML = WEEK.slice(1).concat('sun')
    .map(day => chipButton('pickup-day', day, english('day_' + day), pickupDaysChosen.has(day)))
    .join('');
}

// The pickup times part only matters for places that take requests.
function showPickupSettings() {
  $('#pickupSettings').hidden = !$('#placeTakesRequests').checked;
}

function openPlaceForm(placeId) {
  editingPlaceId = placeId || null;
  const place = placeId ? findPlace(placeId) : null;

  $('#placeFormTitle').textContent = place ? 'Edit ' + place.name : 'Add location';
  $('#placeName').value = place ? place.name : '';
  $('#placeType').value = place ? place.type : 'pantry';
  $('#placeAddress').value = (place && place.address) || '';
  $('#placeHours').value = (place && place.hours) || '';
  $('#placePhone').value = (place && place.phone) || '';
  $('#placeLat').value = place && hasCoordinates(place) ? toNumber(place.lat) : '';
  $('#placeLng').value = place && hasCoordinates(place) ? toNumber(place.lng) : '';
  $('#placeSample').checked = Boolean(place && place.sample);
  $('#placeWebsite').value = (place && place.website) || '';
  $('#placeNote').value = (place && place.note) || '';
  $('#placeTakesRequests').checked = Boolean(place && place.takesRequests);

  const pickup = (place && place.pickup) || DEFAULT_PICKUP;
  pickupDaysChosen = new Set(pickup.days || []);
  $('#pickupStart').value = pickup.start || DEFAULT_PICKUP.start;
  $('#pickupEnd').value = pickup.end || DEFAULT_PICKUP.end;
  $('#pickupMinutes').value = String(pickup.minutes || DEFAULT_PICKUP.minutes);
  $('#pickupPerSlot').value = pickup.perSlot || DEFAULT_PICKUP.perSlot;
  renderPickupDays();
  showPickupSettings();

  hideMessage('#placeMessage');
  $('#placeForm').hidden = false;
  $('#placeName').focus();
}

function closePlaceForm() {
  $('#placeForm').hidden = true;
  editingPlaceId = null;
}

async function savePlace(event) {
  event.preventDefault();

  const name = cleanText($('#placeName').value, 100);
  if (!name) {
    markMissing(['#placeName']);
    showPlainMessage('#placeMessage', 'Add a name.', 'bad');
    return;
  }

  // latitude and longitude are optional, but if they're typed in they have to make sense
  const latText = $('#placeLat').value.trim();
  const lngText = $('#placeLng').value.trim();
  const lat = parseFloat(latText);
  const lng = parseFloat(lngText);
  const coordinatesOk = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  if ((latText || lngText) && !coordinatesOk) {
    markMissing(['#placeLat', '#placeLng']);
    showPlainMessage('#placeMessage', 'Latitude must be between -90 and 90, and longitude between -180 and 180.', 'bad');
    return;
  }

  const website = cleanText($('#placeWebsite').value, 300);
  if (website && !/^https?:\/\//i.test(website)) {
    markMissing(['#placeWebsite']);
    showPlainMessage('#placeMessage', 'The website has to start with https://', 'bad');
    return;
  }

  // pickup times: "until" has to be after "from"
  const takesRequests = $('#placeTakesRequests').checked;
  const pickup = {
    days: WEEK.filter(day => pickupDaysChosen.has(day)),
    start: $('#pickupStart').value,
    end: $('#pickupEnd').value,
    minutes: Number($('#pickupMinutes').value) || 15,
    perSlot: Math.max(1, Math.min(50, parseInt($('#pickupPerSlot').value, 10) || 1))
  };
  const startMinutes = minutesFromTime(pickup.start);
  const endMinutes = minutesFromTime(pickup.end);
  if (takesRequests && pickup.days.length > 0 &&
      (startMinutes === null || endMinutes === null || endMinutes - startMinutes < pickup.minutes)) {
    markMissing(['#pickupStart', '#pickupEnd']);
    showPlainMessage('#placeMessage', 'Pickup "until" has to be at least one pickup time after "from".', 'bad');
    return;
  }

  const oldPlace = editingPlaceId ? findPlace(editingPlaceId) : null;
  const placeId = editingPlaceId || makeId('p');

  const place = {
    name: name,
    type: $('#placeType').value,
    address: cleanText($('#placeAddress').value, 160),
    hours: cleanText($('#placeHours').value, 120),
    phone: cleanText($('#placePhone').value, 40),
    lat: coordinatesOk ? lat : null,
    lng: coordinatesOk ? lng : null,
    website: website,
    note: cleanText($('#placeNote').value, 160),
    takesRequests: takesRequests,
    pickup: takesRequests && pickup.days.length > 0 ? pickup : null,
    sample: $('#placeSample').checked,
    createdAt: oldPlace && oldPlace.createdAt ? oldPlace.createdAt : Date.now(),
    updatedAt: Date.now()
  };

  try {
    await state.db.doc('pantries/' + placeId).set(place);
    closePlaceForm();
    toast(oldPlace ? 'Location updated' : 'Location added');
  } catch (error) {
    let message = 'Couldn\'t save. Try again.';
    if (error && error.code === 'invalid_argument') {
      message = 'Your account can\'t change locations. Ask the team lead to make you an Editor.';
    }
    showPlainMessage('#placeMessage', message, 'bad');
  }
}

async function deletePlace(placeId) {
  try {
    await state.db.doc('pantries/' + placeId).delete();
    toast('Location deleted');
  } catch (error) {
    toast('Couldn\'t delete. Try again.', 'bad');
  }
}

function setupDashboardLocations() {
  fillSelect('#placeType', PLACE_TYPES.map(type => [type, english('type_' + type)]));

  $('#placeCards').addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'edit-place') openPlaceForm(button.dataset.id);
    if (button.dataset.action === 'delete-place') {
      confirmThenRun(button, () => deletePlace(button.dataset.id));
    }
  });

  $('#pickupDays').addEventListener('click', event => {
    const chip = event.target.closest('[data-action="pickup-day"]');
    if (!chip) return;
    toggleInSet(pickupDaysChosen, chip.dataset.value);
    chip.setAttribute('aria-pressed', pickupDaysChosen.has(chip.dataset.value));
  });
  $('#placeTakesRequests').addEventListener('change', showPickupSettings);

  $('#addPlaceButton').addEventListener('click', () => openPlaceForm(null));
  $('#cancelPlaceButton').addEventListener('click', closePlaceForm);
  $('#placeForm').addEventListener('submit', savePlace);
}
