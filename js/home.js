// Home page: "On the shelf today", the impact numbers (impact.js) and places to get food.
// The four big "What do you need?" buttons are plain links in index.html.

const SPOTS_ON_HOME = 5;

function renderHome() {
  renderShelf();
  renderImpact();
  renderPickupSpots();
}

function renderShelf() {
  const list = $('#shelfList');
  const footer = $('#shelfFoot');
  $('#liveDot').hidden = state.connection !== 'live';

  const waiting = loadingText('stock');
  if (waiting) {
    list.innerHTML = `<li class="muted">${escapeHtml(waiting)}</li>`;
    footer.innerHTML = '';
    return;
  }

  // A to Z, so nothing jumps around when an amount goes up or down
  const available = sortByName(state.stock.filter(item => amountOf(item) > 0));

  if (available.length === 0) {
    list.innerHTML = `<li class="muted">${escapeHtml(t('shelf_empty'))}</li>`;
    footer.innerHTML = '';
    return;
  }

  list.innerHTML = available.map(shelfLine).join('');
  updateShelfFade();

  const summary = t('shelf_foot', {
    n: formatNumber(available.length),
    m: formatNumber(state.places.length)
  });
  const seeAll = t('see_all', { n: formatNumber(state.stock.length) });
  footer.innerHTML = `
    <span>${escapeHtml(summary)}</span>
    <button class="link-button" type="button" data-page="food">${escapeHtml(seeAll)}</button>`;
}

// The list scrolls when it's long. Its bottom edge fades while there's more to see.
function updateShelfFade() {
  const list = $('#shelfList');
  const moreBelow = list.scrollTop + list.clientHeight < list.scrollHeight - 4;
  list.classList.toggle('more-below', moreBelow);
}

function setupHome() {
  $('#shelfList').addEventListener('scroll', updateShelfFade);
}

// One line like "Rice ........ 24 bags"
function shelfLine(item) {
  const amount = amountOf(item);
  return `
    <li class="${stockStatus(item)}">
      <span class="name">${escapeHtml(itemName(item))}</span>
      <span class="dots"></span>
      <span class="amount">${formatNumber(amount)}<small>${escapeHtml(unitName(item.unit, amount))}</small></span>
    </li>`;
}

function renderPickupSpots() {
  const list = $('#spotList');

  const waiting = loadingText('places');
  if (waiting) {
    list.innerHTML = `<li class="muted">${escapeHtml(waiting)}</li>`;
    return;
  }
  if (state.places.length === 0) {
    list.innerHTML = `<li class="muted">${escapeHtml(t('no_locations'))}</li>`;
    return;
  }

  // the school pantry first, then the pantries closest to Union High
  list.innerHTML = placesNearSchool().slice(0, SPOTS_ON_HOME).map(spotLine).join('');
}

function spotLine(place) {
  let typeTag = '';
  if (PLACE_TYPES.includes(place.type)) {
    typeTag = `<span class="pill pill-plain">${escapeHtml(t('type_' + place.type))}</span>`;
  }
  // "Order ahead on UConnect" for the school pantry, "2.1 mi from Union High" for the others
  let extra = '';
  const miles = milesFromSchool(place);
  if (place.takesRequests) {
    extra = `<span class="spot-extra accent">${escapeHtml(t('takes_requests'))}</span>`;
  } else if (miles !== null) {
    extra = `<span class="spot-extra">${escapeHtml(t('miles_from_school', { d: formatMiles(miles) }))}</span>`;
  }

  return `
    <li class="spot">
      <strong>${escapeHtml(place.name)}</strong>
      <span class="hours">${escapeHtml(place.hours || '')}</span>
      ${extra}
      ${typeTag}
    </li>`;
}
