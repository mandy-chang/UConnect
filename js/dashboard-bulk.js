// Dashboard "Stock" tab: Bulk update.
// Paste a delivery list or a count sheet, one item per line ("Rice 12", "12 cans black beans",
// "Avena: 6"). Nothing is saved until you've checked the list: each line shows which item it
// matched and what the new amount will be.
//
// Two ways to read the numbers:
//   add  a delivery came in, add these to what's on the shelf
//   set  we counted the shelves, these are the new totals

let bulkPlan = []; // [{ item, amount }] ready to save, from the last "Check list"

function openBulkForm() {
  closeItemForm();
  const shelves = requestPlaces().length > 0 ? requestPlaces() : sortPlaces(state.places);
  fillSelect('#bulkPlace', shelves.map(place => [place.id, place.name]));
  if (stockPlaceFilter !== 'all' && findPlace(stockPlaceFilter)) $('#bulkPlace').value = stockPlaceFilter;

  bulkPlan = [];
  $('#bulkPreview').innerHTML = '';
  $('#bulkSaveButton').hidden = true;
  hideMessage('#bulkMessage');
  $('#bulkForm').hidden = false;
  $('#bulkText').focus();
}

function closeBulkForm() {
  $('#bulkForm').hidden = true;
  bulkPlan = [];
}

function bulkMode() {
  const chosen = document.querySelector('input[name="bulkMode"]:checked');
  return chosen ? chosen.value : 'add';
}


// ----- Reading the list -----

// Every unit word in every language ("cans", "банки", "latas"...), so "12 cans rice" finds "rice".
function unitWords() {
  const words = new Set(['x', 'of', 'de', 'pcs', 'pc', 'ea', 'each']);
  for (const code in UNITS) {
    words.add(code.toLowerCase());
    for (const language in UNITS[code]) {
      [].concat(UNITS[code][language]).forEach(word => words.add(String(word).toLowerCase()));
    }
  }
  return words;
}

// "12 cans black beans" -> { name: 'black beans', amount: 12 }
function readBulkLine(line, units) {
  const text = line.trim();
  if (!text) return null;

  const number = text.match(/\d+(?:[.,]\d+)?/);
  if (!number) return { line: text, problem: 'No number on this line' };
  const amount = Math.round(parseFloat(number[0].replace(',', '.')));

  const rest = (text.slice(0, number.index) + ' ' + text.slice(number.index + number[0].length))
    .toLowerCase()
    .replace(/[,:;=×*•\-–—]+/g, ' ')
    .split(/\s+/)
    .filter(word => word && !units.has(word))
    .join(' ');

  if (!rest) return { line: text, problem: 'No item name on this line' };
  return { line: text, name: rest, amount: amount };
}

// Finds the item at this place with this name in any language.
// Tries an exact name first, then "starts with", then "contains". Only a single match counts.
function findItemNamed(name, placeId) {
  const items = itemsAt(placeId);
  const namesOf = item => Object.values(item.names || {}).map(value => String(value).toLowerCase());

  const tests = [
    candidate => candidate === name || candidate === name + 's' || candidate + 's' === name,
    candidate => candidate.startsWith(name) || name.startsWith(candidate),
    candidate => candidate.includes(name) || name.includes(candidate)
  ];

  for (const test of tests) {
    const matches = items.filter(item => namesOf(item).some(test));
    if (matches.length === 1) return { item: matches[0] };
    if (matches.length > 1) return { problem: 'Matches more than one item: ' + matches.map(item => itemName(item, 'en')).join(', ') };
  }
  return { problem: 'No item with this name here. Add it with "Add item" first.' };
}

// "Check list": reads every line and shows what would change.
function checkBulkList() {
  const placeId = $('#bulkPlace').value;
  const mode = bulkMode();
  const units = unitWords();
  const lines = $('#bulkText').value.split('\n').map(line => readBulkLine(line, units)).filter(Boolean);

  if (lines.length === 0) {
    markMissing(['#bulkText']);
    showPlainMessage('#bulkMessage', 'Paste at least one line, like "Rice 12".', 'bad');
    return;
  }

  // the same item twice: add mode adds both, set mode keeps the last
  const plan = new Map(); // item id -> { item, amount }
  const rows = [];
  for (const line of lines) {
    if (line.problem) {
      rows.push({ line: line.line, problem: line.problem });
      continue;
    }
    const found = findItemNamed(line.name, placeId);
    if (!found.item) {
      rows.push({ line: line.line, problem: found.problem });
      continue;
    }
    const before = plan.has(found.item.id) ? plan.get(found.item.id).amount : amountOf(found.item);
    const after = mode === 'add' ? before + line.amount : line.amount;
    plan.set(found.item.id, { item: found.item, amount: Math.max(0, Math.min(100000, after)) });
    rows.push({ line: line.line, item: found.item, now: amountOf(found.item), after: after });
  }

  bulkPlan = Array.from(plan.values());
  renderBulkPreview(rows);
}

function renderBulkPreview(rows) {
  const body = rows.map(row => {
    if (row.problem) {
      return `
        <tr class="bulk-problem">
          <td>${escapeHtml(row.line)}</td>
          <td colspan="3">${escapeHtml(row.problem)}</td>
        </tr>`;
    }
    return `
      <tr>
        <td>${escapeHtml(row.line)}</td>
        <td>${escapeHtml(itemName(row.item, 'en'))}</td>
        <td class="number">${formatNumber(row.now, 'en')}</td>
        <td class="number"><b>${formatNumber(row.after, 'en')}</b> ${escapeHtml(unitName(row.item.unit, row.after, 'en'))}</td>
      </tr>`;
  }).join('');

  $('#bulkPreview').innerHTML = `
    <div class="table-wrap">
      <table class="bulk-table">
        <thead><tr><th scope="col">Your line</th><th scope="col">Item</th><th scope="col">Now</th><th scope="col">New amount</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;

  const problems = rows.filter(row => row.problem).length;
  const button = $('#bulkSaveButton');
  button.hidden = bulkPlan.length === 0;
  button.textContent = bulkPlan.length === 1 ? 'Update 1 item' : `Update ${bulkPlan.length} items`;

  if (problems > 0) {
    const skipped = problems === 1 ? '1 line can\'t be used' : `${problems} lines can't be used`;
    showPlainMessage('#bulkMessage', `${skipped} (in red). Fix them and check again, or update the rest.`, 'bad');
  } else {
    hideMessage('#bulkMessage');
  }
}


// ----- Saving -----

async function saveBulkPlan() {
  const button = $('#bulkSaveButton');
  button.disabled = true;
  let saved = 0;
  try {
    for (const { item, amount } of bulkPlan) {
      await state.db.doc('stock/' + item.id).update({
        qty: amount,
        sample: false,
        updatedAt: Date.now(),
        updatedBy: state.userId
      });
      saved++;
    }
    toast(saved === 1 ? '1 item updated' : `${saved} items updated`);
    closeBulkForm();
    $('#bulkText').value = '';
  } catch (error) {
    showPlainMessage('#bulkMessage', `Saved ${saved} of ${bulkPlan.length}. Check the list and try again.`, 'bad');
  }
  button.disabled = false;
}

function setupDashboardBulk() {
  $('#bulkButton').addEventListener('click', openBulkForm);
  $('#cancelBulkButton').addEventListener('click', closeBulkForm);
  $('#bulkCheckButton').addEventListener('click', checkBulkList);
  $('#bulkSaveButton').addEventListener('click', saveBulkPlan);
  // a new list or mode means the old check doesn't count anymore
  $('#bulkForm').addEventListener('input', () => {
    bulkPlan = [];
    $('#bulkSaveButton').hidden = true;
  });
}
