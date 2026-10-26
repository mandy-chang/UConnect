// Locations page: the map (drawn in map.js) and the list of pantries next to it.
// Tap the map, or pick "I'm near...", and the list sorts from closest to farthest.
// Until then it starts with the school pantry and the pantries closest to Union High.

let youAreHere = null; // { lat, lng } once someone taps the map
let nearPlaceId = '';
let selectedPlaceId = null;

function renderLocations() {
  drawMap();
  renderPlaceList();
  renderNearSelect();
}

function distanceTo(place) {
  if (!youAreHere || !hasCoordinates(place)) return null;
  return milesBetween(youAreHere, { lat: toNumber(place.lat), lng: toNumber(place.lng) });
}

// The school pantry and the places closest to it, or closest to you once we know where you are.
function placesInOrder() {
  if (!youAreHere) return placesNearSchool();

  const places = state.places.slice();
  places.sort((a, b) => {
    const distanceA = distanceTo(a);
    const distanceB = distanceTo(b);
    // places without coordinates go last
    return (distanceA === null ? Infinity : distanceA) - (distanceB === null ? Infinity : distanceB);
  });
  return places;
}

function renderPlaceList() {
  const list = $('#placeList');

  const waiting = loadingText('places');
  if (waiting) {
    list.innerHTML = `<li class="empty">${escapeHtml(waiting)}</li>`;
    return;
  }
  if (state.places.length === 0) {
    list.innerHTML = `<li class="empty">${escapeHtml(t('no_locations'))}</li>`;
    return;
  }

  list.innerHTML = placesInOrder().map(placeCard).join('');
}

function placeCard(place, index) {
  const miles = distanceTo(place);
  const isSelected = place.id === selectedPlaceId;

  // number in the circle once we know distances, otherwise a pin icon
  const rank = miles === null ? icon('pin') : index + 1;

  let distance = '';
  if (miles !== null) {
    distance = `<span class="distance">${escapeHtml(t('distance', { d: formatMiles(miles) }))}</span>`;
  }

  let tags = '';
  if (place.takesRequests) {
    tags += `<span class="pill pill-accent">${escapeHtml(t('takes_requests'))}</span>`;
  }
  if (PLACE_TYPES.includes(place.type)) {
    tags += `<span class="pill pill-plain">${escapeHtml(t('type_' + place.type))}</span>`;
  }
  if (place.sample) {
    tags += `<span class="pill pill-sun">${escapeHtml(t('sample'))}</span>`;
  }

  let details = '';
  if (place.address) {
    details += `<p class="place-detail">${escapeHtml(place.address)}</p>`;
  }
  if (place.hours) {
    details += `<p class="place-detail"><b>${escapeHtml(t('hours'))}</b>${escapeHtml(place.hours)}</p>`;
  }
  if (place.note) {
    details += `<p class="place-detail"><b>${escapeHtml(t('who_can_come'))}</b>${escapeHtml(place.note)}</p>`;
  }

  return `
    <li class="place ${isSelected ? 'selected' : ''}" data-action="select-place" data-id="${escapeHtml(place.id)}">
      <span class="place-rank">${rank}</span>
      <div>
        <div class="place-top">
          <h3>${escapeHtml(place.name)}</h3>
          ${distance}
        </div>
        <p class="place-tags">${tags}</p>
        ${details}
        <div class="place-links">
          ${requestHereLink(place)}
          ${phoneLink(place)}
          ${websiteLink(place)}
          ${directionsLink(place)}
        </div>
      </div>
    </li>`;
}

// Only for the school pantry (places that take UConnect requests), and only when something's on the shelf.
function requestHereLink(place) {
  if (!place.takesRequests) return '';
  const hasFood = itemsAt(place.id).some(item => amountOf(item) > 0);
  if (!hasFood) return '';
  return `<button type="button" class="btn btn-small btn-primary" data-action="order-here" data-id="${escapeHtml(place.id)}">${escapeHtml(t('request_here'))}</button>`;
}

// "Call (360) 256-2440", which dials on a phone
function phoneLink(place) {
  if (!place.phone) return '';
  const digits = String(place.phone).replace(/[^0-9+]/g, '');
  if (digits.length < 7) return '';
  return `<a href="tel:${escapeHtml(digits)}">${escapeHtml(t('call'))} ${escapeHtml(place.phone)}</a>`;
}

function websiteLink(place) {
  if (!/^https?:\/\//i.test(place.website || '')) return '';
  return `<a href="${escapeHtml(place.website)}" target="_blank" rel="noopener">${escapeHtml(t('website'))} ↗</a>`;
}

// Sample places are made up, so they don't get a Google Maps link.
function directionsLink(place) {
  if (place.sample) return '';

  let searchFor = place.address;
  if (!searchFor && hasCoordinates(place)) searchFor = place.lat + ',' + place.lng;
  if (!searchFor) return '';

  const url = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(searchFor);
  return `<a href="${url}" target="_blank" rel="noopener">${escapeHtml(t('directions'))} ↗</a>`;
}

// "I'm near ___" dropdown, for people who'd rather not tap the map.
function renderNearSelect() {
  const select = $('#nearSelect');
  let options = `<option value="">${escapeHtml(t('near_choose'))}</option>`;
  for (const place of state.places.filter(hasCoordinates)) {
    options += `<option value="${escapeHtml(place.id)}">${escapeHtml(place.name)}</option>`;
  }
  select.innerHTML = options;
  select.value = findPlace(nearPlaceId) ? nearPlaceId : '';
}

function setupLocations() {
  const map = $('#map');

  // redraw when the map changes size, which also happens the first time its page opens
  if ('ResizeObserver' in window) {
    new ResizeObserver(drawMap).observe(map);
  }

  // redraw the streets in the right colors when light/dark mode changes
  const darkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  if (darkMode && darkMode.addEventListener) {
    darkMode.addEventListener('change', drawStreets);
  }
  new MutationObserver(drawStreets).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });

  // tapping an empty part of the map means "I'm here"
  map.addEventListener('click', event => {
    if (event.target.closest('.pin') || !mapArea) return;
    const box = map.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    youAreHere = fromMapSpot(x, y);
    nearPlaceId = '';
    renderLocations();
  });

  $('#nearSelect').addEventListener('change', event => {
    nearPlaceId = event.target.value;
    const place = findPlace(nearPlaceId);
    if (place && hasCoordinates(place)) {
      youAreHere = { lat: toNumber(place.lat), lng: toNumber(place.lng) };
      selectedPlaceId = place.id;
    }
    renderLocations();
  });

  $('#page-locations').addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    if (target.dataset.action === 'order-here') {
      openFoodAt(target.dataset.id);
      return;
    }

    if (target.dataset.action === 'select-place') {
      selectedPlaceId = target.dataset.id;
      renderPins();
      renderPlaceList();

      // on a wide screen, clicking a pin scrolls the list to that place
      const clickedPin = target.classList.contains('pin');
      if (clickedPin && window.innerWidth > 860) {
        const card = $(`.place[data-id="${CSS.escape(selectedPlaceId)}"]`);
        if (card) card.scrollIntoView({ block: 'nearest' });
      }
    }
  });
}
