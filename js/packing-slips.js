// Packing slips: one page per food request, for the students packing bags.
// The Food tab opens them in a preview with two buttons:
//   Print         the browser's print dialog
//   Save as file  an .html file to open and print anywhere (for when printing is blocked here)
// Slips are in English, since the student team packs in English.

let slipOrders = [];

function openSlips(orders) {
  slipOrders = orders.filter(order => order.kind !== 'donation');
  if (slipOrders.length === 0) {
    toast('No food requests to print.');
    return;
  }

  $('#slipSheets').innerHTML = slipOrders.map(slipHtml).join('');
  $('#slipTitle').textContent = slipOrders.length === 1 ? 'Packing slip' : `${slipOrders.length} packing slips`;
  $('#slipSaveButton').hidden = !state.downloads;
  $('#slipOverlay').hidden = false;
  document.body.classList.add('showing-slips');
  $('#slipPrintButton').focus();
}

function closeSlips() {
  $('#slipOverlay').hidden = true;
  document.body.classList.remove('showing-slips');
}

// One slip: who it's for, when they're coming, a checklist of items, notes, and a "packed by" line.
function slipHtml(order) {
  let who = personName(order.owner, order.name) || 'Family';
  if (order.pickupCode) who = 'Pickup code ' + order.pickupCode;

  const when = order.slot ? slotLabel(order.slot, 'en') : order.time || 'Any time';
  const language = order.lang && order.lang !== 'en' ? LANGUAGE_NAMES[order.lang] : '';

  const rows = (order.items || []).map(line => {
    const item = findItem(line.id);
    const name = item ? itemName(item, 'en') : line.name;
    const unit = item ? unitName(item.unit, line.qty, 'en') : line.unit || '';
    return `
      <tr>
        <td class="slip-box">☐</td>
        <td>${escapeHtml(name)}</td>
        <td class="slip-qty">${formatNumber(line.qty, 'en')} ${escapeHtml(unit)}</td>
      </tr>`;
  }).join('');

  const facts = [
    ['Pickup', placeName(order.pantryId)],
    ['Time', when],
    ['Household', order.household ? String(order.household) : ''],
    ['Contact', order.contact || ''],
    ['Speaks', language]
  ].filter(([, value]) => value)
    .map(([label, value]) => `<div><span>${label}</span><b>${escapeHtml(value)}</b></div>`)
    .join('');

  let notes = '';
  if (order.notes) {
    notes = `<div class="slip-notes"><span>Notes (check for allergies)</span><p>${escapeHtml(order.notes)}</p></div>`;
  }

  return `
    <section class="slip">
      <header class="slip-head">
        <span>UConnect · Union High School</span>
        <span>Sent ${escapeHtml(new Date(order.createdAt || Date.now()).toLocaleDateString('en-US'))}</span>
      </header>
      <h2 class="slip-who">${escapeHtml(who)}</h2>
      <div class="slip-facts">${facts}</div>
      <table class="slip-items">
        <thead><tr><th></th><th>Item</th><th class="slip-qty">How many</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${notes}
      <footer class="slip-foot">
        <span>Packed by: ____________________</span>
        <span>☐ Double-checked</span>
      </footer>
    </section>`;
}

function printSlips() {
  try {
    window.print();
  } catch (error) {
    toast('Printing isn\'t allowed here. Use "Save as file" and print that.', 'bad');
  }
}

// A stand-alone page with the same slips, one per sheet of paper.
async function saveSlipsFile() {
  if (!state.downloads) return;

  const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>UConnect packing slips</title>
<style>
  body { font-family: system-ui, sans-serif; color: #121212; margin: 24px; }
  ${SLIP_STYLES}
</style></head>
<body>${slipOrders.map(slipHtml).join('')}</body></html>`;

  const today = dateKey(new Date());
  try {
    await state.downloads.save({ filename: `packing-slips-${today}.html`, data: page });
    toast('Slips saved. Open the file and print it.');
  } catch (error) {
    if (error && error.code === 'declined') return;
    toast('Couldn\'t save the file. Try Print instead.', 'bad');
  }
}

// The slip styles, shared by the saved file. (The page itself has the same rules in styles.css.)
const SLIP_STYLES = `
  .slip { border: 1px solid #ccc; border-radius: 8px; padding: 20px; margin-bottom: 24px; page-break-after: always; break-after: page; }
  .slip-head { display: flex; justify-content: space-between; font-size: 12px; color: #555; border-bottom: 2px solid #121212; padding-bottom: 8px; }
  .slip-who { font-size: 26px; margin: 12px 0; }
  .slip-facts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 16px; margin-bottom: 14px; }
  .slip-facts span { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #555; }
  .slip-items { width: 100%; border-collapse: collapse; font-size: 16px; }
  .slip-items th, .slip-items td { border-bottom: 1px solid #ddd; padding: 8px 6px; text-align: left; }
  .slip-box { width: 28px; font-size: 20px; }
  .slip-qty { text-align: right !important; white-space: nowrap; }
  .slip-notes { margin-top: 14px; padding: 10px; border: 2px solid #C8102E; border-radius: 6px; }
  .slip-notes span { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #C8102E; font-weight: 700; }
  .slip-foot { display: flex; justify-content: space-between; margin-top: 24px; font-size: 14px; }
`;

function setupPackingSlips() {
  $('#slipCloseButton').addEventListener('click', closeSlips);
  $('#slipPrintButton').addEventListener('click', printSlips);
  $('#slipSaveButton').addEventListener('click', saveSlipsFile);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('#slipOverlay').hidden) closeSlips();
  });
}
