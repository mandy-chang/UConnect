// The map on the Locations page.
// Real map pictures can't load inside Claude, so we draw a simple street grid on a <canvas>,
// the Columbia River where it really is, and put the pantry pins on top as buttons.
// The grid is only decoration; the pins and the river are in their real places.

// The middle of the Columbia River from downtown Vancouver to past Washougal, as [lat, lng].
// (Close enough for a sketch map, not for navigation.)
const COLUMBIA_RIVER = [
  [45.625, -122.76], [45.620, -122.70], [45.611, -122.66], [45.600, -122.62],
  [45.592, -122.58], [45.585, -122.54], [45.577, -122.50], [45.572, -122.46],
  [45.570, -122.42], [45.570, -122.38], [45.568, -122.34], [45.560, -122.30], [45.552, -122.25]
];

const STREET_TILT = -0.14; // radians, so the grid isn't perfectly straight

let mapArea = null; // the latitude/longitude box the map is showing


// ----- Turning latitude and longitude into a spot on the map -----

// Finds a box around all the pantries, with some room around the edges,
// stretched to the same shape as the map so nothing looks squashed.
function findMapArea() {
  const places = state.places.filter(hasCoordinates);
  if (places.length === 0) return null;

  const lats = places.map(place => toNumber(place.lat));
  const lngs = places.map(place => toNumber(place.lng));
  const middleLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const middleLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

  // add room around the pins (and make sure one lonely pin still gets a small area)
  let latSize = Math.max(Math.max(...lats) - Math.min(...lats), 0.01) * 1.5;
  let lngSize = Math.max(Math.max(...lngs) - Math.min(...lngs), 0.01) * 1.35;

  // away from the equator, a degree of longitude is shorter than a degree of latitude
  const longitudeShrink = Math.cos(middleLat * Math.PI / 180) || 1;

  const map = $('#map');
  const mapShape = (map.clientWidth || 500) / (map.clientHeight || 400);
  const areaShape = (lngSize * longitudeShrink) / latSize;
  if (areaShape < mapShape) {
    lngSize = (latSize * mapShape) / longitudeShrink;
  } else {
    latSize = (lngSize * longitudeShrink) / mapShape;
  }

  // shift down a little so the tops of the pins aren't cut off
  const shift = latSize * 0.04;
  return {
    north: middleLat + latSize / 2 + shift,
    south: middleLat - latSize / 2 + shift,
    west: middleLng - lngSize / 2,
    east: middleLng + lngSize / 2
  };
}

// lat/lng -> { x, y } from 0 to 1 across the map
function toMapSpot(lat, lng) {
  return {
    x: (lng - mapArea.west) / (mapArea.east - mapArea.west),
    y: (mapArea.north - lat) / (mapArea.north - mapArea.south)
  };
}

// a click on the map -> lat/lng
function fromMapSpot(x, y) {
  return {
    lat: mapArea.north - y * (mapArea.north - mapArea.south),
    lng: mapArea.west + x * (mapArea.east - mapArea.west)
  };
}

function milesBetween(a, b) {
  const earthRadiusMiles = 3958.8;
  const toRadians = Math.PI / 180;
  const latChange = (b.lat - a.lat) * toRadians;
  const lngChange = (b.lng - a.lng) * toRadians;
  const h = Math.sin(latChange / 2) ** 2 +
    Math.cos(a.lat * toRadians) * Math.cos(b.lat * toRadians) * Math.sin(lngChange / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}


// ----- Drawing -----

function drawMap() {
  mapArea = findMapArea();
  drawStreets();
  renderPins();
}

function drawStreets() {
  const map = $('#map');
  const canvas = $('#mapCanvas');
  const width = map.clientWidth;
  const height = map.clientHeight;
  if (!width || !height) return; // the Locations page is hidden right now

  // draw at double size on sharp screens so lines aren't blurry
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';

  const pen = canvas.getContext('2d');
  if (!pen) return;
  pen.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  // colors come from the CSS variables, so the map matches light and dark mode
  const styles = getComputedStyle(document.documentElement);
  const color = name => styles.getPropertyValue(name).trim() || '#cccccc';

  // ground
  pen.fillStyle = color('--map-land');
  pen.fillRect(0, 0, width, height);

  const blockSize = Math.max(26, Math.round(width / 18));

  // small streets
  drawStreetGrid(pen, width, height, blockSize, 1, 1, color('--map-minor'), 1.5);

  // bigger streets
  drawStreetGrid(pen, width, height, blockSize, 5, 4, color('--map-road'), 5);

  if (mapArea) drawRiver(pen, width, height, color('--map-water'), color('--muted'));
}

// The Columbia River, about 1 km wide, with its name on it.
function drawRiver(pen, width, height, waterColor, labelColor) {
  const points = COLUMBIA_RIVER.map(([lat, lng]) => {
    const spot = toMapSpot(lat, lng);
    return [spot.x * width, spot.y * height];
  });
  const kilometer = height / ((mapArea.north - mapArea.south) * 111);

  pen.strokeStyle = waterColor;
  pen.lineCap = 'round';
  pen.lineJoin = 'round';
  pen.lineWidth = Math.max(10, kilometer * 1.1);
  pen.beginPath();
  points.forEach(([x, y], index) => (index === 0 ? pen.moveTo(x, y) : pen.lineTo(x, y)));
  pen.stroke();

  // the name, along the part of the river closest to the middle of the map
  const onScreen = points.filter(([x, y]) => x > width * 0.1 && x < width * 0.9 && y > 0 && y < height);
  if (onScreen.length < 2) return;
  const [x1, y1] = onScreen[Math.floor(onScreen.length / 2) - 1];
  const [x2, y2] = onScreen[Math.floor(onScreen.length / 2)];
  pen.save();
  pen.translate((x1 + x2) / 2, (y1 + y2) / 2);
  pen.rotate(Math.atan2(y2 - y1, x2 - x1));
  pen.fillStyle = labelColor;
  pen.font = 'italic 600 12px system-ui, sans-serif';
  pen.textAlign = 'center';
  pen.textBaseline = 'middle';
  pen.fillText('Columbia River', 0, 0);
  pen.restore();
}

// Draws a tilted grid of lines. "every" picks every 1st, 4th, 5th... street.
function drawStreetGrid(pen, width, height, blockSize, everyColumn, everyRow, strokeColor, lineWidth) {
  const reach = Math.hypot(width, height);

  pen.save();
  pen.translate(width / 2, height / 2);
  pen.rotate(STREET_TILT);
  pen.strokeStyle = strokeColor;
  pen.lineWidth = lineWidth;

  for (let x = -reach; x <= reach; x += blockSize * everyColumn) {
    drawLine(pen, x, -reach, x, reach);
  }
  for (let y = -reach; y <= reach; y += blockSize * everyRow) {
    drawLine(pen, -reach, y, reach, y);
  }
  pen.restore();
}

function drawLine(pen, x1, y1, x2, y2) {
  pen.beginPath();
  pen.moveTo(x1, y1);
  pen.lineTo(x2, y2);
  pen.stroke();
}

function asPercent(fraction) {
  return (fraction * 100).toFixed(2) + '%';
}

// The pins are buttons placed on top of the canvas.
function renderPins() {
  const pinBox = $('#mapPins');
  const message = $('#mapMessage');

  let note = loadingText('places');
  if (!note && state.places.length === 0) note = t('no_locations');
  message.hidden = !note;
  if (note) message.textContent = note;

  if (!mapArea) {
    pinBox.innerHTML = '';
    return;
  }

  // once we know where you are, pins show 1, 2, 3... from closest to farthest
  const order = placesInOrder().map(place => place.id);

  let html = '';
  for (const place of state.places.filter(hasCoordinates)) {
    const spot = toMapSpot(toNumber(place.lat), toNumber(place.lng));
    const isSelected = place.id === selectedPlaceId;

    let label = '<span class="dot"></span>';
    if (youAreHere) label = `<span>${order.indexOf(place.id) + 1}</span>`;

    html += `
      <button type="button" class="pin ${isSelected ? 'selected' : ''} ${place.takesRequests ? 'ours' : ''}"
        style="left: ${asPercent(spot.x)}; top: ${asPercent(spot.y)}"
        data-action="select-place" data-id="${escapeHtml(place.id)}" aria-label="${escapeHtml(place.name)}">
        <span class="pin-head">${label}</span>
        <span class="pin-label">${escapeHtml(place.name)}</span>
      </button>`;
  }

  if (youAreHere) {
    const spot = toMapSpot(youAreHere.lat, youAreHere.lng);
    html += `
      <div class="you-marker" style="left: ${asPercent(spot.x)}; top: ${asPercent(spot.y)}">
        <span class="you-dot"></span>
        <span class="you-label">${escapeHtml(t('you'))}</span>
      </div>`;
  }

  pinBox.innerHTML = html;
}
