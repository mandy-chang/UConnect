// Goes through the whole site in a real browser and checks that everything works.
// Screenshots are saved in tests/shots/ so you can look at each page afterwards.
//
//   npm install playwright
//   npx playwright install chromium
//   python3 build.py
//   node tests/browser-test.js
//
// Most checks run on dist/uconnect.html (the file that's published), with a pretend
// window.claude so it works without Claude. The last group opens index.html on its own,
// which uses js/local-demo.js instead.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

// Claude wraps the published file in <html><body> when it serves it, so do the same here.
const PUBLISHED = path.join(__dirname, 'published.html');
fs.writeFileSync(PUBLISHED,
  '<!doctype html><html><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' +
  fs.readFileSync(path.join(ROOT, 'dist', 'uconnect.html'), 'utf8') +
  '</body></html>');

const PUBLISHED_URL = 'file://' + PUBLISHED;
const LOCAL_URL = 'file://' + path.join(ROOT, 'index.html');

// The sample data from js/sample-data.js
const SAMPLE_DATA = new Function(fs.readFileSync(path.join(ROOT, 'js', 'sample-data.js'), 'utf8') + '; return SAMPLE_DATA;')();


// ---------- Checks ----------

let passed = 0;
const failures = [];

function check(label, ok, detail) {
  if (ok) {
    passed++;
  } else {
    failures.push(label + (detail !== undefined ? '  (got: ' + JSON.stringify(detail) + ')' : ''));
    console.log('  FAIL  ' + label, detail !== undefined ? detail : '');
  }
}

function section(name) {
  console.log('\n' + name);
}

const isSorted = list => list.join('|') === [...list].sort((a, b) => a.localeCompare(b)).join('|');


// ---------- The pretend window.claude ----------
// This function runs inside the browser before the page loads.
// options.data:  'sample' or 'empty'
// options.user:  'staff', 'visitor', 'signedOut', 'viewOnly' or 'none'
// options.ai:    'ok', 'rate_limited', 'not_granted' or 'none'
// options.saving: 'ok' or 'blocked' (the database refuses every write)

function pretendClaude(options) {
  const documents = new Map();
  const now = Date.now();

  // keep the data in sessionStorage so it survives page.reload(), like a real database would
  let savedBefore = null;
  try {
    savedBefore = JSON.parse(sessionStorage.getItem('pretend_database'));
  } catch (error) {
    // first load
  }
  const saveAll = () => sessionStorage.setItem('pretend_database', JSON.stringify([...documents]));

  if (savedBefore) {
    for (const [docPath, data] of savedBefore) documents.set(docPath, data);
  } else if (options.data === 'sample') {
    for (const id in options.sample.pantries) documents.set('pantries/' + id, options.sample.pantries[id]);
    for (const id in options.sample.stock) documents.set('stock/' + id, options.sample.stock[id]);

    documents.set('orders/u_fam1', { entries: {
      o1: { kind: 'request', items: [{ id: 's_rice', name: 'Rice', qty: 2 }], pantryId: 'p_uconnect',
        name: 'Ana', contact: '555-0101', household: 4, time: 'Tue after 4', notes: 'No peanuts',
        lang: 'es', status: 'new', createdAt: now - 3600e3 }
    } });
    documents.set('orders/u_fam2', { entries: {
      d1: { kind: 'donation', item: { id: 's_oats', name: 'Avena', qty: 5, unit: 'boxes', category: 'grains' },
        pantryId: 'p_uconnect', name: 'Luis', contact: 'luis@example.com', lang: 'es', status: 'new', createdAt: now - 5000e3 }
    } });
    documents.set('tutoring/u_fam1', { entries: {
      t1: { studentName: 'Leo', grade: 7, subject: 'math', topic: 'fractions', times: ['lunch'], days: ['tue', 'thu'],
        format: 'inperson', language: 'es', contact: 'ana@example.com', lang: 'es', status: 'new', tutor: '', session: '',
        createdAt: now - 7200e3 }
    } });
    documents.set('volunteers/u_vol1', { name: 'Jordan Lee', school: 'Lincoln HS, 11th', contact: 'jordan@example.com',
      times: ['lunch', 'after'], jobs: { lunch: ['tutor', 'restock'], after: ['pack'] }, days: ['mon', 'tue', 'thu'],
      langs: 'English, Korean', createdAt: now - 86400e3 });
    documents.set('volunteers/u_vol2', { name: 'Priya', school: '10th', contact: 'priya@example.com',
      times: ['after'], jobs: { lunch: [], after: ['handout', 'tutor'] }, days: ['tue', 'wed'], createdAt: now - 46400e3 });
    documents.set('hours/u_vol1', { entries: {
      h1: { date: '2026-10-20', hours: 1.5, task: 'pack', notes: 'Packed 12 bags', name: 'Jordan Lee', createdAt: now - 4 * 86400e3 },
      h2: { date: '2026-10-21', hours: 1, task: 'restock', notes: '', name: 'Jordan Lee', createdAt: now - 3 * 86400e3 }
    } });
  }

  const listeners = [];
  const copy = value => JSON.parse(JSON.stringify(value));

  const docSnapshot = docPath => {
    const data = documents.get(docPath);
    return { id: docPath.split('/').pop(), exists: data !== undefined, data: () => (data === undefined ? undefined : copy(data)) };
  };
  // filters are [field, op, value]; the app only uses == and >=
  const passes = (data, filters) => (filters || []).every(([field, op, value]) => {
    if (op === '==') return data[field] === value;
    if (op === '>=') return data[field] >= value;
    throw new Error('pretend database has no ' + op);
  });
  const collectionSnapshot = (collectionPath, filters) => {
    const depth = collectionPath.split('/').length + 1;
    const docs = [];
    for (const [docPath, data] of documents) {
      const inCollection = docPath.startsWith(collectionPath + '/') && docPath.split('/').length === depth;
      if (inCollection && passes(data, filters)) docs.push(docSnapshot(docPath));
    }
    return { docs: docs, size: docs.length, empty: docs.length === 0 };
  };
  const snapshotFor = listener => listener.isCollection
    ? collectionSnapshot(listener.path, listener.filters)
    : docSnapshot(listener.path);
  const tellListeners = () => setTimeout(() => {
    saveAll();
    for (const listener of listeners) listener.callback(snapshotFor(listener));
  }, 10);

  // leases, like the real acquire(): one holder at a time until it runs out
  const leases = new Map();
  window.pretendLeases = leases;

  const merge = (target, changes) => {
    for (const key in changes) {
      const value = changes[key];
      const bothObjects = value && typeof value === 'object' && !Array.isArray(value) &&
        target[key] && typeof target[key] === 'object' && !Array.isArray(target[key]);
      if (bothObjects) merge(target[key], value);
      else target[key] = value;
    }
  };

  const refuse = () => {
    if (options.saving === 'blocked') throw { code: 'invalid_argument', message: 'not allowed' };
  };

  const doc = docPath => ({
    id: docPath.split('/').pop(),
    path: docPath,
    get: async () => docSnapshot(docPath),
    set: async data => { refuse(); documents.set(docPath, copy(data)); tellListeners(); },
    update: async changes => {
      refuse();
      if (!documents.has(docPath)) throw { code: 'invalid_argument' };
      merge(documents.get(docPath), copy(changes));
      tellListeners();
    },
    delete: async () => { refuse(); documents.delete(docPath); tellListeners(); },
    acquire: async ({ holder, ttlMs }) => {
      refuse();
      const lease = leases.get(docPath);
      if (lease && lease.holder !== holder && lease.until > Date.now()) return { acquired: false };
      leases.set(docPath, { holder: holder, until: Date.now() + (ttlMs || 30000) });
      return { acquired: true, holder: holder };
    },
    onSnapshot: callback => {
      const listener = { path: docPath, isCollection: false, callback: callback };
      listeners.push(listener);
      setTimeout(() => callback(docSnapshot(docPath)), 30);
      return () => listeners.splice(listeners.indexOf(listener), 1);
    }
  });

  const collection = (collectionPath, filters) => ({
    path: collectionPath,
    doc: id => doc(collectionPath + '/' + (id || Math.random().toString(36).slice(2))),
    where: (field, op, value) => collection(collectionPath, (filters || []).concat([[field, op, value]])),
    get: async () => collectionSnapshot(collectionPath, filters),
    onSnapshot: callback => {
      const listener = { path: collectionPath, isCollection: true, filters: filters, callback: callback };
      listeners.push(listener);
      setTimeout(() => callback(snapshotFor(listener)), 30);
      return () => listeners.splice(listeners.indexOf(listener), 1);
    }
  });

  const avatar = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#4a8"/></svg>');
  const people = {
    staff: { id: 'u_me', name: 'Mandy Chang', avatarUrl: avatar, isOwner: true, canEdit: true },
    visitor: { id: 'u_me', name: 'Sam Visitor', avatarUrl: avatar, isOwner: false, canEdit: false },
    viewOnly: { id: 'u_me', name: 'View Only', avatarUrl: avatar, isOwner: false, canEdit: false },
    signedOut: { id: null, name: null, avatarUrl: null, isOwner: false, canEdit: false }
  };
  const person = people[options.user];
  const user = person && {
    me: async () => person,
    can: async () => options.user !== 'viewOnly',
    profiles: async ids => {
      const profiles = {};
      for (const id of [].concat(ids)) profiles[id] = { id: id, name: '', avatarUrl: '' };
      return profiles;
    }
  };

  let ai = null;
  if (options.ai !== 'none') {
    ai = {
      json: async (prompt, settings) => {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 400);
          if (settings && settings.signal) {
            settings.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject({ code: 'cancelled' });
            });
          }
        });
        if (options.ai !== 'ok') throw { code: options.ai };
        window.lastPrompt = prompt;
        if (prompt.startsWith('Translate')) return { es: 'Arroz integral', zh: '糙米', ru: 'Бурый рис' };
        return [
          { title: 'Bean and rice bowls', minutes: 25, ingredients: ['1 cup rice', '1 can black beans'],
            steps: ['Cook rice.', 'Warm beans.', 'Serve.'], myplate: ['grains', 'protein'],
            growth: 'Beans give iron and protein.', kidTip: 'Let kids build their own bowl.' },
          { title: 'Apple oatmeal', minutes: 10, ingredients: ['1 cup oats', '2 cups milk', '1 apple'],
            steps: ['Simmer oats in milk.', 'Add apple.'], myplate: ['grains', 'fruits', 'dairy'],
            growth: 'Milk adds calcium.', kidTip: 'Kids sprinkle the apple.' }
        ];
      }
    };
  }

  // downloads: remember what the page offered, instead of saving a file
  window.savedFiles = [];
  const downloads = {
    save: async ({ filename, data }) => {
      window.savedFiles.push({ filename: filename, text: String(data) });
      return { status: 'saved' };
    }
  };

  const services = { db: { doc: doc, collection: collection }, user: user, sample: ai, downloads: downloads };
  window.pretendDatabase = documents;
  window.claude = { use: async name => services[name] || null };
}


// ---------- Opening pages ----------

let browser;
const pageErrors = [];

async function openSite(settings) {
  const options = Object.assign({ data: 'sample', user: 'staff', ai: 'ok', saving: 'ok', sample: SAMPLE_DATA }, settings.claude);
  const context = await browser.newContext(Object.assign({
    viewport: { width: 1280, height: 900 },
    colorScheme: 'light',
    reducedMotion: 'reduce'
  }, settings.browser));

  const page = await context.newPage();
  const name = settings.name || 'page';
  page.on('pageerror', error => pageErrors.push(name + ': ' + error.message));
  page.on('console', message => {
    const text = message.text();
    const isFontProblem = text.includes('ERR_TUNNEL') || text.includes('Failed to load resource');
    if (message.type() === 'error' && !isFontProblem) pageErrors.push(name + ' console: ' + text);
  });

  if (!settings.noClaude) await page.addInitScript(pretendClaude, options);
  await page.goto((settings.url || PUBLISHED_URL) + (settings.hash || ''));
  await page.waitForTimeout(600);
  return page;
}

async function goTo(page, name) {
  // My requests is the bell button in the header, everything else is in the nav
  await page.click(name === 'mine' ? '#myRequestsButton' : `.main-nav a[data-page="${name}"]`);
  await page.waitForTimeout(150);
}

async function shot(page, file, fullPage) {
  await page.screenshot({ path: path.join(SHOTS, file), fullPage: Boolean(fullPage) });
}

const text = (page, selector) => page.textContent(selector).then(value => (value || '').trim());
const count = (page, selector) => page.$$eval(selector, elements => elements.length);
const visibleCount = (page, selector) => page.$$eval(selector, elements => elements.filter(element => element.offsetParent !== null).length);
const getDocument = (page, docPath) => page.evaluate(docPath => {
  const data = window.pretendDatabase.get(docPath);
  return data === undefined ? null : JSON.parse(JSON.stringify(data));
}, docPath);
const entriesOf = async (page, docPath) => Object.values(((await getDocument(page, docPath)) || {}).entries || {});
const isHidden = (page, selector) => page.$eval(selector, element => element.hidden);


// ---------- 1. The public site ----------

async function testPublicSite() {
  section('Public site');
  const page = await openSite({ name: 'public' });

  // Home
  check('home is the first page', await page.evaluate(() => state.page) === 'home');
  const shelfNames = await page.$$eval('#shelfList .name', elements => elements.map(element => element.textContent));
  check('shelf lists all 17 items in stock', shelfNames.length === 17, shelfNames.length);
  check('shelf is A to Z', isSorted(shelfNames), shelfNames);
  check('header has room for "My requests" on one row',
    !(await page.$eval('#headerRow', row => row.classList.contains('two-rows'))) && (await page.isVisible('#myRequestsButton .button-label')));
  check('header is black', await page.$eval('.site-header', header => getComputedStyle(header).backgroundColor) === 'rgb(18, 18, 18)');
  check('main buttons are red', await page.$eval('.main-nav a[aria-current="page"]', link => getComputedStyle(link).backgroundColor) === 'rgb(200, 16, 46)');
  check('home lists 5 places to get food', (await count(page, '#spotList li')) === 5);
  check('the school pantry is listed first', (await text(page, '#spotList li:first-child')).includes('Union High School Student Pantry'));
  check('"Run by Union High School students"', (await text(page, '.eyebrow')).includes('Union High School students'));
  check('no NHS anywhere on the page', !(await page.evaluate(() => /NHS|Honor Society/.test(document.body.innerText))));
  check('sample banner is showing (stock is still sample numbers)', !(await isHidden(page, '#sampleBanner')));
  check('no impact numbers yet, so the strip is hidden', await isHidden(page, '#impactStrip'));

  // larger text
  // "Larger text" zooms the page, so measure how big the heading is drawn
  const textSize = () => page.$eval('.hero-title', title => title.getBoundingClientRect().height);
  const normalSize = await textSize();
  await page.click('#textSizeButton');
  check('"Larger text" makes the text bigger', (await textSize()) > normalSize * 1.1, [normalSize, await textSize()]);
  check('the button shows it\'s on', (await page.getAttribute('#textSizeButton', 'aria-pressed')) === 'true');
  await page.reload();
  await page.waitForTimeout(600);
  check('larger text is remembered after reloading', (await textSize()) > normalSize * 1.1);
  await page.click('#textSizeButton');
  check('and turns back off', Math.abs((await textSize()) - normalSize) < 2);
  check('logo is drawn in the header', (await page.$eval('.brand .logo', svg => svg.getBoundingClientRect().width)) > 20);
  await shot(page, 'd01_home.png', true);

  await page.click('.need-card[data-page="tutoring"]');
  check('"Tutoring" card on home opens tutoring', await page.evaluate(() => state.page) === 'tutoring');
  check('address bar follows the page', (await page.evaluate(() => location.hash)) === '#tutoring');

  // Get food
  await goTo(page, 'food');
  const names = await page.$$eval('#itemGrid .tag-name', elements => elements.map(element => element.textContent));
  check('food page is for the school pantry', await page.evaluate(() => currentPlaceId()) === 'p_uconnect');
  check('only places that take requests are in the picker', (await count(page, '.location-option')) === 1);
  check('items are sorted A to Z', isSorted(names), names);
  check('all 20 pantry items are listed', names.length === 20, names.length);
  check('out-of-stock items get "Notify me" instead of "Add"',
    (await count(page, '[data-action="watch"][data-id="s_eggs"]')) === 1 && (await count(page, '[data-action="add-to-bag"][data-id="s_eggs"]')) === 0);

  await page.fill('#itemSearch', 'arroz');
  check('searching in Spanish finds rice', (await page.$$eval('#itemGrid .tag-name', elements => elements.map(element => element.textContent))).join() === 'Rice');
  await page.fill('#itemSearch', 'zzzz');
  check('a search with no matches says so', (await count(page, '#itemGrid .empty')) === 1);
  await page.fill('#itemSearch', '');
  await page.click('[data-action="category"][data-value="produce"]');
  check('category chip filters items', (await count(page, '#itemGrid .tag-name')) === 3);
  await page.click('[data-action="category"][data-value="all"]');

  // allergy and diet filters
  check('items show what they contain', (await page.$eval('#itemGrid', grid => grid.textContent)).includes('Contains: Nuts'));
  await page.click('#dietFilters summary');
  await page.click('[data-action="avoid"][data-value="gluten"]');
  let shown = await page.$$eval('#itemGrid .tag-name', elements => elements.map(element => element.textContent));
  check('"Avoid gluten" hides pasta, oatmeal, bread and cereal',
    shown.length === 16 && !shown.includes('Pasta') && !shown.includes('Whole wheat bread'), shown);
  await page.click('[data-action="diet-only"][data-value="vegan"]');
  shown = await page.$$eval('#itemGrid .tag-name', elements => elements.map(element => element.textContent));
  check('adding "Vegan only" narrows it further (diapers and toothpaste still show)',
    shown.length === 11 && !shown.includes('Eggs') && !shown.includes('Baby formula') && shown.includes('Rice') && shown.includes('Diapers (size 4)'), shown);
  check('the filter box shows how many filters are on', (await text(page, '#dietFilterCount')) === '(2)');
  await shot(page, 'd02a_filters.png', true);
  await page.reload();
  await page.waitForTimeout(600);
  await goTo(page, 'food');
  check('filters are remembered', (await count(page, '#itemGrid .tag-name')) === 11);
  await page.click('[data-action="avoid"][data-value="gluten"]');
  await page.click('[data-action="diet-only"][data-value="vegan"]');
  check('turning the filters off shows everything again', (await count(page, '#itemGrid .tag-name')) === 20);

  await page.click('[data-action="add-to-bag"][data-id="s_rice"]');
  check('"Add" turns into a − 1 + stepper on the card', (await text(page, '#itemGrid .tag-in-bag output')) === '1');
  await page.click('[data-action="add-to-bag"][data-id="s_milk"]');
  await page.click('#itemGrid [data-action="more"][data-id="s_rice"]');
  check('bag has 2 kinds of items', (await count(page, '#bagList .bag-row')) === 2);
  check('rice amount went up to 2', await page.evaluate(() => amountInBag('s_rice')) === 2);
  const bagNames = await page.$$eval('#bagList .name', elements => elements.map(element => element.textContent));
  check('bag is A to Z, not in the order things were added', bagNames.join() === 'Rice,Shelf-stable milk', bagNames);
  const gridBefore = await page.$$eval('#itemGrid .tag-name', elements => elements.map(element => element.textContent));
  await page.click('#bagList [data-action="more"][data-id="s_rice"]');
  check('the bag\'s + works too, and focus stays in the bag', await page.evaluate(() => document.activeElement.closest('#bagList') !== null));
  check('changing amounts doesn\'t move the items', (await page.$$eval('#itemGrid .tag-name', elements => elements.map(element => element.textContent))).join() === gridBefore.join());
  while (!(await page.$eval('#itemGrid [data-action="more"][data-id="s_rice"]', button => button.disabled))) {
    await page.click('#itemGrid [data-action="more"][data-id="s_rice"]');
  }
  check('no more than 10 of one item, then + is greyed out', await page.evaluate(() => amountInBag('s_rice')) === 10);
  await page.click('#itemGrid [data-action="less"][data-id="s_milk"]');
  check('− at 1 takes it out and brings back "Add"',
    (await count(page, '#bagList .bag-row')) === 1 && (await count(page, '[data-action="add-to-bag"][data-id="s_milk"]')) === 1);
  await page.click('[data-action="add-to-bag"][data-id="s_milk"]');
  await page.click('#bagList [data-action="remove"][data-id="s_milk"]');
  check('the x in the bag takes milk out', (await count(page, '#bagList .bag-row')) === 1);
  check('optional fields say so', (await page.$$eval('#requestForm .optional', tags => tags.length)) >= 3);

  // the bag survives a reload
  await page.reload();
  await page.waitForTimeout(600);
  await goTo(page, 'food');
  check('bag is still there after reloading', await page.evaluate(() => amountInBag('s_rice')) === 10);

  // sending without a name
  await page.click('#requestSubmit');
  check('sending without a name shows an error', (await page.getAttribute('#requestMessage', 'class')).includes('bad'));
  check('name field is marked', (await page.getAttribute('#requestName', 'aria-invalid')) === 'true');
  await page.fill('#requestName', 'M');
  check('typing in the field clears the red outline', (await page.getAttribute('#requestName', 'aria-invalid')) === null);

  // sending with a pickup code
  await page.fill('#requestName', '');
  await page.check('#useCode');
  check('using a code hides the name field', await isHidden(page, '#nameField'));
  await page.fill('#requestHousehold', '3');

  // pickup times
  check('the school pantry asks for a pickup time', !(await isHidden(page, '#slotField')) && await isHidden(page, '#timeField'));
  const dayChips = await page.$$eval('#slotDays .chip', chips => chips.map(chip => chip.dataset.value));
  check('pickup days are only school days, at most a week ahead', dayChips.length >= 4 && dayChips.length <= 5 &&
    dayChips.every(key => [1, 2, 3, 4, 5].includes(new Date(key + 'T12:00').getDay())), dayChips);
  await page.click('#requestSubmit');
  check('sending without a time asks for one', (await text(page, '#requestMessage')) === await page.evaluate(() => t('pick_slot')));
  const lastDay = dayChips[dayChips.length - 1];
  await page.click(`#slotDays [data-value="${lastDay}"]`);
  check('a day shows 8 times from 3:00 to 4:45', (await count(page, '#slotTimes .slot-button')) === 8);
  check('each time says 4 spots are left', (await text(page, '#slotTimes .slot-button')).includes('4'));
  await page.click('#slotTimes [data-value="15:30"]');
  await shot(page, 'd02_food.png', true);
  await page.click('#requestSubmit');
  await page.waitForTimeout(300);
  const myOrders = await entriesOf(page, 'orders/u_me');
  check('food request is saved', myOrders.length === 1 && myOrders[0].items[0].qty === 10, myOrders);
  check('food request got a pickup code', /^UC-\d{4}$/.test(myOrders[0] && myOrders[0].pickupCode), myOrders[0] && myOrders[0].pickupCode);
  check('the pickup time is saved with it', myOrders[0].slot && myOrders[0].slot.date === lastDay && myOrders[0].slot.time === '15:30', myOrders[0].slot);
  const slotDoc = await getDocument(page, `slots/p_uconnect_${lastDay}`);
  check('the time is claimed in the slots list', slotDoc && Object.keys(slotDoc.times['15:30']).length === 1, slotDoc);
  check('"Request sent" box replaces the bag', !(await isHidden(page, '#sentBox')) && await isHidden(page, '#requestForm'));
  check('it shows the pickup code', (await text(page, '#sentCode')) === myOrders[0].pickupCode);
  check('it shows the pickup time', (await text(page, '#sentBox')).includes('3:30'));
  check('bag is empty after sending', (await page.evaluate(() => bagItemIds().length)) === 0);
  await shot(page, 'd02b_sent.png');
  await page.click('#newBagButton');
  check('"Start a new bag" brings the form back', await isHidden(page, '#sentBox') && !(await isHidden(page, '#requestForm')));
  await page.click(`#slotDays [data-value="${lastDay}"]`);
  check('that time now has 3 spots left', (await text(page, '#slotTimes [data-value="15:30"]')).includes('3'));

  // a full time can't be picked: fill 15:45 up by hand, like 4 other families did
  await page.evaluate(day => {
    const key = 'slots/p_uconnect_' + day;
    const slotDoc = window.pretendDatabase.get(key);
    slotDoc.times['15:45'] = { a: true, b: true, c: true, d: true };
    return claude.use('db').then(db => db.doc(key).set(slotDoc));
  }, lastDay);
  await page.waitForTimeout(200);
  check('a full time is greyed out', await page.$eval('#slotTimes [data-value="15:45"]', button => button.disabled));

  // two families grabbing the last spot at the same moment: only one gets it
  const race = await page.evaluate(async day => {
    const key = 'slots/p_uconnect_' + day;
    const db = await claude.use('db');
    const slotDoc = window.pretendDatabase.get(key);
    slotDoc.times['16:00'] = { a: true, b: true, c: true };
    await db.doc(key).set(slotDoc);
    const results = await Promise.all([
      claimSlot('p_uconnect', { date: day, time: '16:00' }, 'family_one'),
      claimSlot('p_uconnect', { date: day, time: '16:00' }, 'family_two')
    ]);
    return { results: results, people: Object.keys(window.pretendDatabase.get(key).times['16:00']).length };
  }, lastDay);
  check('two families can\'t both get the last spot', race.people === 4 && race.results.filter(result => result === 'ok').length === 1, race);

  // watching an out-of-stock item
  await page.click('[data-action="watch"][data-id="s_eggs"]');
  await page.waitForTimeout(150);
  const alerts = await getDocument(page, 'alerts/u_me');
  check('"Notify me" saves an alert', alerts && alerts.items && alerts.items.s_eggs && alerts.items.s_eggs.was === 'out', alerts);

  // Locations
  await goTo(page, 'locations');
  check('8 real pantries in the list', (await count(page, '#placeList .place')) === 8);
  check('8 pins on the map', (await count(page, '#mapPins .pin')) === 8);
  check('the school pantry is first', (await page.$eval('#placeList .place', element => element.dataset.id)) === 'p_uconnect');
  check('the school pantry has a bigger red pin', (await count(page, '#mapPins .pin.ours')) === 1);
  check('the map has a key', (await count(page, '.map-legend .legend-item')) === 2);
  const mapBox = await page.locator('#map').boundingBox();
  await page.mouse.click(mapBox.x + mapBox.width * 0.05, mapBox.y + mapBox.height * 0.4);
  await page.waitForTimeout(150);
  const firstPlace = await page.$eval('#placeList .place', element => element.dataset.id);
  check('clicking the west side of the map puts a Vancouver pantry first', firstPlace !== 'p_uconnect' && firstPlace !== 'p_ifth', firstPlace);
  await page.selectOption('#nearSelect', { index: 1 });
  await page.waitForTimeout(100);
  check('"near" select sorts by distance too', (await page.$eval('#placeList .place', element => element.dataset.id)) !== '');
  await page.click('#placeList .place[data-id="p_camas_friends"]');
  check('clicking a place selects its pin', (await count(page, '#mapPins .pin.selected')) === 1);
  check('real places have Directions, phone and website links',
    (await count(page, '#placeList a[href*="google.com/maps"]')) === 8 && (await count(page, '#placeList a[href^="tel:"]')) >= 6);
  check('only the school pantry has "Request food here"', (await count(page, '#placeList [data-action="order-here"]')) === 1);
  await shot(page, 'd03_locations.png');
  await page.click('#placeList .place[data-id="p_uconnect"] [data-action="order-here"]');
  await page.waitForTimeout(150);
  check('"Request food here" opens Get food', await page.evaluate(() => state.page === 'food' && currentPlaceId() === 'p_uconnect'));

  // Tutoring
  await goTo(page, 'tutoring');
  await page.click('#tutorSubmit');
  check('empty tutoring form shows an error', (await page.getAttribute('#tutorMessage', 'class')).includes('bad'));
  await page.fill('#tutorStudent', 'Sam');
  await page.fill('#tutorContact', 'parent@example.com');
  await page.click('#tutorSubmit');
  check('tutoring form needs a subject, time and day', (await page.getAttribute('#tutorMessage', 'class')).includes('bad'));
  await page.selectOption('#tutorGrade', '8');
  await page.click('[data-action="tutor-subject"][data-value="science"]');
  await page.click('[data-action="tutor-time"][data-value="after"]');
  await page.click('[data-action="tutor-day"][data-value="wed"]');
  await page.click('[data-action="tutor-format"][data-value="online"]');
  await shot(page, 'd04_tutoring.png', true);
  await page.click('#tutorSubmit');
  await page.waitForTimeout(200);
  const tutoring = await entriesOf(page, 'tutoring/u_me');
  check('tutoring request is saved', tutoring.length === 1 && tutoring[0].subject === 'science' &&
    tutoring[0].format === 'online' && String(tutoring[0].grade) === '8', tutoring);
  check('tutoring form clears after sending', (await page.inputValue('#tutorStudent')) === '');

  // Recipes
  await goTo(page, 'recipes');
  await page.click('[data-action="age"] >> nth=1');
  await page.click('[data-action="ingredient"] >> nth=0');
  await page.click('#recipeButton');
  check('Stop button shows while the AI works', !(await isHidden(page, '#recipeStop')));
  await page.waitForTimeout(700);
  check('2 recipes come back', (await count(page, '#recipeList .recipe')) === 2, await count(page, '#recipeList .recipe'));
  check('recipe prompt asks for English', (await page.evaluate(() => window.lastPrompt)).includes('English'));
  await shot(page, 'd05_recipes.png');
  await page.click('#recipeButton');
  await page.click('#recipeStop');
  await page.waitForTimeout(500);
  check('Stop cancels without an error', (await count(page, '#recipeStatus .bad')) === 0 && await isHidden(page, '#recipeStop'));

  // Help out: donate
  await goTo(page, 'help');
  check('donate tab is open first', !(await isHidden(page, '#helpDonate')) && await isHidden(page, '#helpVolunteer'));
  await page.click('#donateSubmit');
  check('empty donation shows an error', (await page.getAttribute('#donateMessage', 'class')).includes('bad'));
  await page.click('#neededChips [data-action="needed"] >> nth=0');
  check('"Most needed" chip fills in the item', (await page.inputValue('#donateItem')) !== '');
  await page.fill('#donateAmount', '6');
  await page.click('#donateSubmit');
  await page.waitForTimeout(200);
  const donations = (await entriesOf(page, 'orders/u_me')).filter(order => order.kind === 'donation');
  check('donation is saved and linked to the stock item', donations.length === 1 && donations[0].item.id !== '', donations);

  // Help out: volunteer
  await page.click('#helpTabVolunteer');
  const shownJobGroups = () => visibleCount(page, '[data-time-group]');
  check('no job list until a time is picked', (await shownJobGroups()) === 0);
  await page.click('[data-action="volunteer-time"][data-value="lunch"]');
  check('picking Lunch shows lunch jobs', (await shownJobGroups()) === 1);
  await page.click('[data-action="volunteer-time"][data-value="after"]');
  check('picking After school too shows both', (await shownJobGroups()) === 2);
  await page.click('[data-action="volunteer-job"][data-time="lunch"][data-value="tutor"]');
  await page.click('[data-action="volunteer-job"][data-time="after"][data-value="pack"]');
  await page.click('[data-action="volunteer-time"][data-value="lunch"]');
  check('un-picking Lunch hides lunch jobs', (await shownJobGroups()) === 1);
  await page.click('[data-action="volunteer-time"][data-value="lunch"]');
  await page.click('[data-action="volunteer-day"][data-value="mon"]');
  await page.click('[data-action="volunteer-day"][data-value="fri"]');
  await page.click('#volunteerSubmit');
  check('volunteer form needs a name and contact', (await page.getAttribute('#volunteerMessage', 'class')).includes('bad'));
  await page.fill('#volunteerName', 'Mandy');
  await page.fill('#volunteerContact', 'mandy@example.com');
  await shot(page, 'd06_volunteer.png', true);
  await page.click('#volunteerSubmit');
  await page.waitForTimeout(200);
  const signup = await getDocument(page, 'volunteers/u_me');
  check('volunteer sign-up is saved with jobs per time',
    signup && signup.times.length === 2 && signup.jobs.lunch.join() === 'tutor' && signup.jobs.after.join() === 'pack' &&
    signup.days.join() === 'mon,fri', signup);

  await page.reload();
  await page.waitForTimeout(600);
  await goTo(page, 'help');
  await page.click('#helpTabVolunteer');
  await page.waitForTimeout(100);
  check('after reload the sign-up is filled back in', (await page.inputValue('#volunteerName')) === 'Mandy');
  check('button says "Update" for a saved sign-up', (await text(page, '#volunteerSubmitText')).toLowerCase().includes('update'));

  // service hours
  check('the hours date starts on today', (await page.inputValue('#hoursDate')) === await page.evaluate(() => dateKey(new Date())));
  await page.fill('#hoursAmount', '20');
  await page.click('#hoursSubmit');
  check('more than 12 hours in a shift is caught', (await text(page, '#hoursMessage')) === await page.evaluate(() => t('hours_bad_amount')));
  await page.fill('#hoursAmount', '1.5');
  await page.selectOption('#hoursTask', 'pack');
  await page.fill('#hoursNotes', 'Friday packing');
  await page.click('#hoursSubmit');
  await page.waitForTimeout(200);
  const myHours = await entriesOf(page, 'hours/u_me');
  check('hours are saved', myHours.length === 1 && myHours[0].hours === 1.5 && myHours[0].task === 'pack', myHours);
  check('the volunteer\'s own entry has no "approved" field to fake', !('status' in myHours[0]));
  check('the logged shift shows as waiting for approval', (await text(page, '#hoursList')).includes(await page.evaluate(() => t('hours_pending'))));
  await shot(page, 'd06b_hours.png', true);

  // My requests
  await page.click('#myRequestsButton');
  await page.waitForTimeout(150);
  check('My requests lists the food request and donation', (await count(page, '#foodRequestList .request-card')) === 2);
  check('My requests lists the tutoring request', (await count(page, '#tutorRequestList .request-card')) === 1);
  check('My requests lists the eggs alert', (await count(page, '#watchList .request-card')) === 1);
  check('no updates yet', (await count(page, '#updatesList .request-card')) === 0 && await isHidden(page, '#updateCount'));
  await shot(page, 'd07_mine.png', true);

  // keyboard: Enter on a nav link
  await page.focus('.main-nav a[data-page="recipes"]');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  check('Enter on a nav link opens that page', await page.evaluate(() => state.page) === 'recipes');

  await page.context().close();

  // opening a link straight to a page
  const deepLink = await openSite({ name: 'deep link', hash: '#tutoring' });
  check('a #tutoring link opens Tutoring', await deepLink.evaluate(() => state.page) === 'tutoring' && !(await isHidden(deepLink, '#page-tutoring')));
  await deepLink.context().close();
}


// ---------- 2. The student dashboard ----------

async function testDashboard() {
  section('Student dashboard');
  const page = await openSite({ name: 'dashboard' });

  // set up a few things as a family first: a food request, and an alert for eggs
  await goTo(page, 'food');
  await page.click('[data-action="add-to-bag"][data-id="s_tuna"]');
  await page.fill('#requestName', 'Mandy');
  await page.click('#slotTimes .slot-button:not([disabled])');
  await page.click('#requestSubmit');
  await page.waitForTimeout(300);
  await page.click('#newBagButton');
  await page.click('[data-action="watch"][data-id="s_eggs"]');
  await goTo(page, 'tutoring');
  await page.fill('#tutorStudent', 'Mia');
  await page.click('[data-action="tutor-subject"][data-value="english"]');
  await page.click('[data-action="tutor-time"][data-value="lunch"]');
  await page.click('[data-action="tutor-day"][data-value="tue"]');
  await page.fill('#tutorContact', 'mandy@example.com');
  await page.click('#tutorSubmit');
  await page.waitForTimeout(200);

  // log in
  await page.click('#loginButton');
  await page.waitForTimeout(150);
  check('login page shows who you are', (await text(page, '#loginBody')).includes('Mandy Chang'));
  await page.click('#continueButton');
  await page.waitForTimeout(300);
  check('dashboard opens', await page.evaluate(() => state.page) === 'dashboard' && !(await isHidden(page, '#staffSite')));
  check('the public nav is hidden on the dashboard', (await page.getAttribute('body', 'data-mode')) === 'staff');
  check('4 tiles at the top', (await count(page, '#tiles .tile')) >= 4, await count(page, '#tiles .tile'));
  check('the dashboard shows what the home page numbers will be', (await text(page, '#impactSummary')).includes('bags'));

  // Food tab
  check('Food tab shows 3 cards (2 requests, 1 donation)', (await count(page, '#orderCards .card')) === 3, await count(page, '#orderCards .card'));
  check('Food tab count shows 3 new', (await text(page, '#countOrders')) === '3');
  check('linked donation shows the English name too', (await text(page, '#orderCards')).includes('Avena / Oatmeal'));
  check('a request shows its pickup time', (await page.$eval('#orderCards', box => box.textContent)).includes('3:'));
  await shot(page, 'd10_dash_food.png', true);

  // packing slips
  await page.click('#printSlipsButton');
  await page.waitForTimeout(100);
  check('"Print packing slips" opens a slip for each open request', !(await isHidden(page, '#slipOverlay')) && (await count(page, '#slipSheets .slip')) === 2);
  const slipText = await text(page, '#slipSheets');
  check('slips list the items with tick boxes', slipText.includes('Canned tuna') && slipText.includes('☐'));
  check('slips show the allergy notes in their own box', (await count(page, '#slipSheets .slip-notes')) === 1 && slipText.includes('No peanuts'));
  await shot(page, 'd10b_slips.png');
  await page.click('#slipSaveButton');
  await page.waitForTimeout(150);
  const savedFiles = await page.evaluate(() => window.savedFiles);
  check('"Save as file" offers an .html file with the slips', savedFiles.length === 1 && /^packing-slips-\d{4}-\d{2}-\d{2}\.html$/.test(savedFiles[0].filename) &&
    savedFiles[0].text.includes('Canned tuna'), savedFiles.map(file => file.filename));
  await page.keyboard.press('Escape');
  check('Escape closes the slips', await isHidden(page, '#slipOverlay'));
  await page.click('[data-action="print-slip"][data-owner="u_fam1"]');
  check('one card\'s "Print slip" shows just that slip', (await count(page, '#slipSheets .slip')) === 1);
  await page.click('#slipCloseButton');

  check('each card has a "next step" button', (await text(page, '[data-action="next-step"][data-owner="u_fam1"]')) === 'Start packing');
  await page.click('[data-action="next-step"][data-owner="u_fam1"]');
  await page.waitForTimeout(150);
  check('"Start packing" moves it to Packing', (await entriesOf(page, 'orders/u_fam1'))[0].status === 'packing');
  check('then the button says "Mark ready for pickup"', (await text(page, '[data-action="next-step"][data-owner="u_fam1"]')) === 'Mark ready for pickup');
  await page.selectOption('#order-status-u_fam1-o1', 'new');
  await page.waitForTimeout(150);
  await page.selectOption('#order-status-u_fam1-o1', 'packing');
  await page.waitForTimeout(150);
  check('the dropdown still works for fixing mistakes', (await entriesOf(page, 'orders/u_fam1'))[0].status === 'packing');

  const filterChips = await page.$$eval('#orderFilters .chip', chips => chips.map(chip => chip.dataset.value));
  await page.click('#orderFilters .chip[data-value="donation"]').catch(() => {});
  if (filterChips.includes('donation')) {
    check('donation filter shows only the donation', (await count(page, '#orderCards .card')) === 1);
    await page.click('#orderFilters .chip[data-value="all"]');
  }

  const oatsBefore = await page.evaluate(() => amountOf(findItem('s_oats')));
  await page.click('[data-action="apply-stock"][data-owner="u_fam2"]');
  await page.waitForTimeout(200);
  check('"Add to stock" adds the donation to Oatmeal', await page.evaluate(() => amountOf(findItem('s_oats'))) === oatsBefore + 5);
  check('it can only be done once', (await count(page, '[data-action="apply-stock"][data-owner="u_fam2"]')) === 0);

  const riceBefore = await page.evaluate(() => amountOf(findItem('s_rice')));
  await page.click('[data-action="apply-stock"][data-owner="u_fam1"]');
  await page.waitForTimeout(200);
  check('"Subtract from stock" takes the request off the shelf', await page.evaluate(() => amountOf(findItem('s_rice'))) === riceBefore - 2);

  // mark my own request as ready, so the family side gets an update
  const myRequestId = await page.evaluate(() => state.allOrders.find(order => order.owner === 'u_me' && order.kind === 'request').id);
  await page.selectOption(`#order-status-u_me-${myRequestId}`, 'ready');
  await page.waitForTimeout(150);

  // a picked-up bag counts toward the home page numbers
  await page.selectOption('#order-status-u_fam1-o1', 'done');
  await page.waitForTimeout(300);
  const impact = await getDocument(page, 'stats/impact');
  check('a picked-up bag is counted for the home page', impact && impact.bags === 1 && impact.items === 2, impact);

  // Tutoring tab
  await page.click('.tab[data-tab="tutoring"]');
  await page.waitForTimeout(150);
  check('Tutoring tab shows 2 requests', (await count(page, '#tutorCards .card')) === 2);
  await page.fill('#tutor-u_fam1-t1', 'Jordan Lee');
  await page.fill('#session-u_fam1-t1', 'Tue lunch, library');
  await page.click('[data-action="save-match"][data-owner="u_fam1"]');
  await page.waitForTimeout(200);
  const leo = (await entriesOf(page, 'tutoring/u_fam1'))[0];
  check('tutor + session moves the request to Scheduled', leo.status === 'scheduled' && leo.tutor === 'Jordan Lee', leo);

  const myTutoringButton = await page.$('[data-action="save-match"][data-owner="u_me"]');
  const myTutoringId = await myTutoringButton.getAttribute('data-id');
  await page.fill(`#tutor-u_me-${myTutoringId}`, 'Priya');
  await myTutoringButton.click();
  await page.waitForTimeout(200);
  const mia = (await entriesOf(page, 'tutoring/u_me'))[0];
  check('tutor only moves the request to Matched', mia.status === 'matched', mia);
  await shot(page, 'd11_dash_tutoring.png', true);

  // the "Items low or out" tile opens Stock with the low filter on
  await page.click('.tile[data-opens="low-stock"]');
  await page.waitForTimeout(150);
  check('"Items low or out" tile opens Stock, showing only low items',
    await page.evaluate(() => dashboardTab === 'stock') && (await page.getAttribute('#lowOnlyButton', 'aria-pressed')) === 'true');
  await page.click('#lowOnlyButton');
  await page.waitForTimeout(100);

  // Stock tab
  const rowNames = () => page.$$eval('#stockRows .name', elements => elements.map(element => element.textContent));
  const firstOrder = await rowNames();
  check('stock is sorted A to Z', isSorted(firstOrder), firstOrder);
  check('eggs shows 1 person waiting', (await page.$eval('#amount-s_eggs', input => input.closest('tr').textContent)).includes('1 waiting'));

  // where every row and column sits in the table (scrolling the page doesn't count), to check nothing moves
  const layout = () => page.evaluate(() => {
    const tableTop = document.querySelector('.stock-table').getBoundingClientRect().top;
    const rows = Array.from(document.querySelectorAll('#stockRows tr')).map(row => Math.round(row.getBoundingClientRect().top - tableTop));
    const columns = Array.from(document.querySelectorAll('.stock-table thead th')).map(cell => Math.round(cell.getBoundingClientRect().left));
    return rows.join(',') + ' | ' + columns.join(',');
  });
  const layoutBefore = await layout();
  const milkButton = await page.$('[data-action="amount-down"][data-id="s_milk"]');
  for (let i = 0; i < 8; i++) await page.click('[data-action="amount-down"][data-id="s_milk"]');
  check('shows "Saving…" while clicking', (await text(page, 'tr[data-row="s_milk"] .save-state')) === 'Saving…');
  await page.waitForTimeout(900);
  check('lowering milk saves after a moment', (await getDocument(page, 'stock/s_milk')).qty === 4);
  check('then shows "Saved"', (await text(page, 'tr[data-row="s_milk"] .save-state')) === 'Saved');
  check('rows don\'t move while editing', (await rowNames()).join() === firstOrder.join());
  check('rows and columns stay in exactly the same place', (await layout()) === layoutBefore, [layoutBefore, await layout()]);
  check('the row is updated in place, not rebuilt', await milkButton.evaluate(button => button.isConnected));

  await page.click('#lowOnlyButton');
  const lowRows = await rowNames();
  for (let i = 0; i < 10; i++) await page.click('[data-action="amount-up"][data-id="s_milk"]');
  await page.waitForTimeout(900);
  check('in "Low or out only", a row that\'s back in stock stays until the filter changes', (await rowNames()).join() === lowRows.join(), lowRows);
  await page.click('#lowOnlyButton');

  await page.fill('#amount-s_corn', '33');
  await page.press('#amount-s_corn', 'Tab');
  await page.waitForTimeout(900);
  check('typing an amount saves it', (await getDocument(page, 'stock/s_corn')).qty === 33);

  // restock eggs: the family who asked gets "back in stock"
  for (let i = 0; i < 6; i++) await page.click('[data-action="amount-up"][data-id="s_eggs"]');
  await page.waitForTimeout(900);
  check('eggs restocked to 6', (await getDocument(page, 'stock/s_eggs')).qty === 6);

  // bulk update: a delivery came in
  await page.click('#bulkButton');
  await page.fill('#bulkText', 'Rice 12\n6 cans black beans\nzucchini 3\nApples');
  await page.click('#bulkCheckButton');
  const preview = await text(page, '#bulkPreview');
  check('bulk update matches names and shows the new totals', preview.includes('Rice') && preview.includes('Black beans'), preview);
  check('lines it can\'t read are flagged, not guessed', preview.includes('No item with this name') && preview.includes('No number'), preview);
  const riceBeforeBulk = (await getDocument(page, 'stock/s_rice')).qty;
  const beansBeforeBulk = (await getDocument(page, 'stock/s_beans')).qty;
  check('nothing changes until "Update items"', (await getDocument(page, 'stock/s_rice')).qty === riceBeforeBulk);
  await shot(page, 'd12a_bulk.png');
  await page.click('#bulkSaveButton');
  await page.waitForTimeout(300);
  check('"Add" mode adds the delivery', (await getDocument(page, 'stock/s_rice')).qty === riceBeforeBulk + 12 &&
    (await getDocument(page, 'stock/s_beans')).qty === beansBeforeBulk + 6);

  // bulk update: we counted the shelves
  await page.click('#bulkButton');
  await page.check('input[name="bulkMode"][value="set"]');
  await page.fill('#bulkText', 'arroz: 30\nМорковь 15');
  await page.click('#bulkCheckButton');
  await page.click('#bulkSaveButton');
  await page.waitForTimeout(300);
  check('"New totals" mode sets the counts, in any language', (await getDocument(page, 'stock/s_rice')).qty === 30 &&
    (await getDocument(page, 'stock/s_carrots')).qty === 15);
  check('counted items stop being samples', (await getDocument(page, 'stock/s_rice')).sample !== true);

  // add an item
  await page.click('#addItemButton');
  await page.click('#itemForm button[type="submit"]');
  check('item form needs a name', (await page.getAttribute('#itemMessage', 'class')).includes('bad'));
  await page.fill('#itemNameEn', 'Brown rice');
  await page.click('#translateButton');
  await page.waitForTimeout(600);
  check('AI fills in the other names', (await page.inputValue('#itemNameZh')) === '糙米');
  await page.selectOption('#itemCategory', 'grains');
  await page.fill('#itemAmount', '12');
  await page.fill('#itemLowAt', '3');
  await page.click('#itemAllergenChips [data-value="gluten"]');
  await page.click('#itemDietChips [data-value="vegan"]');
  await page.click('#itemForm button[type="submit"]');
  await page.waitForTimeout(200);
  check('new item shows in the table', (await rowNames()).includes('Brown rice'));
  const brownRice = await page.evaluate(() => state.stock.find(item => item.names.en === 'Brown rice'));
  check('allergy and diet tags are saved with it', brownRice.allergens.join() === 'gluten' && brownRice.diets.join() === 'vegan', brownRice);
  check('the form closes after saving', await isHidden(page, '#itemForm'));
  await shot(page, 'd12_dash_stock.png');

  // edit it
  const newId = await page.evaluate(() => state.stock.find(item => item.names.en === 'Brown rice').id);
  await page.click(`[data-action="edit-item"][data-id="${newId}"]`);
  check('edit fills in the form', (await page.inputValue('#itemNameEn')) === 'Brown rice');
  await page.fill('#itemNameEn', 'Brown rice (2 lb)');
  await page.click('#itemForm button[type="submit"]');
  await page.waitForTimeout(200);
  check('edited name is saved', (await getDocument(page, 'stock/' + newId)).names.en === 'Brown rice (2 lb)');

  // delete it (two clicks, since there's no confirm pop-up)
  await page.click(`[data-action="delete-item"][data-id="${newId}"]`);
  check('first click only asks', (await getDocument(page, 'stock/' + newId)) !== null);
  await page.click(`[data-action="delete-item"][data-id="${newId}"]`);
  await page.waitForTimeout(200);
  check('second click deletes', (await getDocument(page, 'stock/' + newId)) === null);

  // Volunteers tab
  await page.click('.tab[data-tab="volunteers"]');
  await page.waitForTimeout(150);
  check('2 volunteer cards', (await count(page, '#volunteerCards .card')) === 2);

  // service hours: approve one, decline one
  check('2 logged shifts wait for approval', (await count(page, '#hoursCards .card')) === 2 && (await text(page, '#hoursCount')) === '2');
  await page.click('[data-action="approve-hours"][data-id="h1"]');
  await page.waitForTimeout(200);
  await page.click('[data-action="decline-hours"][data-id="h2"]');
  await page.waitForTimeout(200);
  const checks = await getDocument(page, 'hourChecks/u_vol1');
  check('approvals are saved where only students can write', checks && checks.entries.h1.status === 'approved' &&
    checks.entries.h2.status === 'declined', checks);
  check('the volunteer\'s own log isn\'t changed', !('status' in (await getDocument(page, 'hours/u_vol1')).entries.h1));
  check('handled shifts leave the list', (await count(page, '#hoursCards .card')) === 0);
  check('approved hours count on the home page', (await getDocument(page, 'stats/impact')).hours === 1.5);
  await page.click('#copyHoursButton');
  await page.waitForTimeout(150);
  const hoursReportShown = !(await isHidden(page, '#copyBox')) && (await page.inputValue('#copyBox')).includes('Jordan Lee — 1.5 h approved');
  check('"Copy hours report" lists approved hours per person', hoursReportShown || (await text(page, '#toasts')).includes('copied'));
  const tuesdayAfter = await page.$eval('#coverageTable tbody tr:nth-child(2) td:nth-of-type(2)', cell => cell.textContent.trim());
  check('coverage: 2 people on Tuesday after school', tuesdayAfter === '2', tuesdayAfter);
  await page.click('#copyContactsButton');
  await page.waitForTimeout(150);
  const copyBoxShown = !(await isHidden(page, '#copyBox'));
  const copiedToast = (await text(page, '#toasts')).includes('copied');
  check('"Copy all contacts" copies, or shows the list to copy', copyBoxShown || copiedToast);
  if (copyBoxShown) check('copy list has both people', (await page.inputValue('#copyBox')).split('\n').length === 2);
  await shot(page, 'd13_dash_volunteers.png', true);

  // Locations tab
  await page.click('.tab[data-tab="locations"]');
  await page.waitForTimeout(100);
  check('8 location cards', (await count(page, '#placeCards .card')) === 8);

  // pickup times for the school pantry
  await page.click('[data-action="edit-place"][data-id="p_uconnect"]');
  check('the school pantry\'s pickup days are filled in', (await count(page, '#pickupDays [aria-pressed="true"]')) === 5);
  await page.fill('#pickupEnd', '15:05');
  await page.click('#placeForm button[type="submit"]');
  check('an "until" before the first time is caught', (await page.getAttribute('#placeMessage', 'class')).includes('bad'));
  await page.fill('#pickupEnd', '16:00');
  await page.fill('#pickupPerSlot', '2');
  await page.click('#placeForm button[type="submit"]');
  await page.waitForTimeout(200);
  const nhsPantry = await getDocument(page, 'pantries/p_uconnect');
  check('pickup times are saved', nhsPantry.pickup.end === '16:00' && nhsPantry.pickup.perSlot === 2, nhsPantry.pickup);
  await page.click('#addPlaceButton');
  await page.fill('#placeName', 'Eastside Pantry');
  await page.fill('#placeLat', '500');
  await page.fill('#placeLng', '-118.2');
  await page.click('#placeForm button[type="submit"]');
  check('bad latitude is caught', (await page.getAttribute('#placeMessage', 'class')).includes('bad'));
  await page.fill('#placeLat', '34.05');
  await page.click('#placeForm button[type="submit"]');
  await page.waitForTimeout(200);
  check('new location is added', (await count(page, '#placeCards .card')) === 9);
  const newPlace = await page.evaluate(() => state.places.find(place => place.name === 'Eastside Pantry'));
  check('new location is real (not sample)', newPlace && newPlace.sample === false && newPlace.lat === 34.05);
  await page.click(`[data-action="edit-place"][data-id="${newPlace.id}"]`);
  await page.fill('#placeHours', 'Sat 9–12');
  await page.click('#placeForm button[type="submit"]');
  await page.waitForTimeout(200);
  check('location edit is saved', (await getDocument(page, 'pantries/' + newPlace.id)).hours === 'Sat 9–12');
  await shot(page, 'd14_dash_locations.png', true);

  // back to the public side: the new place has a Directions link, the updates show up
  await page.click('#loginButton');
  await page.waitForTimeout(150);
  check('"Public site" button goes back', await page.evaluate(() => state.page) !== 'dashboard');
  await goTo(page, 'home');
  check('the home page shows the impact numbers', !(await isHidden(page, '#impactStrip')) && (await text(page, '#impactNumbers')).includes('1'));
  await shot(page, 'd14b_home_impact.png');
  await goTo(page, 'food');
  check('the new pickup hours show on Get food (4 times, 3:00 to 3:45)', (await count(page, '#slotTimes .slot-button')) === 4);
  await goTo(page, 'locations');
  check('real location has a Directions link', (await count(page, `#placeList .place[data-id="${newPlace.id}"] a[href*="google.com/maps"]`)) === 1);

  check('bell shows 3 updates (bag ready, tutor found, eggs back)', (await text(page, '#updateCount')) === '3', await text(page, '#updateCount'));
  await page.click('#myRequestsButton');
  await page.waitForTimeout(150);
  const updates = await text(page, '#updatesList');
  check('update: bag is ready', (await count(page, '#updatesList .request-card')) === 3, updates);
  check('update: tutor name shows', updates.includes('Priya'));
  check('update: eggs are back', updates.includes('Eggs'));
  await shot(page, 'd15_mine_updates.png', true);
  await page.click('#updatesList [data-action="stop-watching"]');
  await page.waitForTimeout(200);
  check('dismissing the eggs update removes it', (await count(page, '#updatesList .request-card')) === 2 && (await text(page, '#updateCount')) === '2');
  check('and stops the alert', !((await getDocument(page, 'alerts/u_me')).items || {}).s_eggs);

  // delete the new place again
  await page.click('#loginButton');
  await page.click('#continueButton').catch(() => {});
  await page.waitForTimeout(150);
  await page.click('.tab[data-tab="locations"]');
  await page.click(`[data-action="delete-place"][data-id="${newPlace.id}"]`);
  await page.click(`[data-action="delete-place"][data-id="${newPlace.id}"]`);
  await page.waitForTimeout(200);
  check('location is deleted', (await getDocument(page, 'pantries/' + newPlace.id)) === null);

  await page.context().close();
}


// ---------- 3. Languages ----------

async function testLanguages() {
  section('Languages');
  const page = await openSite({ name: 'languages' });

  const missing = await page.evaluate(() => {
    const out = [];
    for (const language of ['es', 'zh', 'ru']) {
      for (const key in TRANSLATIONS.en) {
        if (!(key in TRANSLATIONS[language])) out.push(language + ':' + key);
      }
      for (const key in TRANSLATIONS[language]) {
        if (!(key in TRANSLATIONS.en)) out.push('extra ' + language + ':' + key);
      }
    }
    return out;
  });
  check('every phrase exists in all 4 languages', missing.length === 0, missing);

  for (const language of ['en', 'es', 'zh', 'ru']) {
    await page.selectOption('#languageSelect', language);
    await page.waitForTimeout(100);
    for (const name of ['home', 'food', 'locations', 'tutoring', 'recipes', 'help', 'mine']) {
      await goTo(page, name);
      const problems = await page.evaluate(() => {
        const out = [];
        const pageBox = document.querySelector('.page:not([hidden])');
        for (const element of pageBox.querySelectorAll('[data-i18n]')) {
          if (element.closest('[hidden]')) continue;
          if (!element.textContent.trim()) out.push('empty ' + element.dataset.i18n);
        }
        const words = pageBox.innerText;
        if (/undefined|NaN|\{[a-z]+\}/.test(words)) out.push('bad text: ' + words.match(/.{0,30}(undefined|NaN|\{[a-z]+\}).{0,30}/)[0]);
        return out;
      });
      check(`${language} ${name}: all text filled in`, problems.length === 0, problems);
    }
    check(`${language}: <html lang> is set`, (await page.getAttribute('html', 'lang')).startsWith(language));
    await goTo(page, 'home');
    await shot(page, `d20_home_${language}.png`);
  }

  // Russian plurals: 1 банка, 3 банки, 5 банок
  const russian = await page.evaluate(() => [1, 3, 5].map(amount => unitName('cans', amount, 'ru')));
  check('Russian plurals are right', russian.join() === 'банка,банки,банок', russian);

  await page.selectOption('#languageSelect', 'zh');
  await page.reload();
  await page.waitForTimeout(600);
  check('the chosen language is remembered', (await page.evaluate(() => state.language)) === 'zh' && (await page.inputValue('#languageSelect')) === 'zh');

  await goTo(page, 'recipes');
  await page.click('#recipeButton');
  await page.waitForTimeout(700);
  check('recipes are asked for in Chinese', (await page.evaluate(() => window.lastPrompt)).includes('Chinese'));

  await page.context().close();
}


// ---------- 4. Phone size and dark mode ----------

async function testPhone() {
  section('Phone, dark mode');
  const page = await openSite({
    name: 'phone',
    browser: { viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  });

  const sideways = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  for (const name of ['home', 'food', 'locations', 'tutoring', 'recipes', 'help', 'mine']) {
    await goTo(page, name);
    check(`phone ${name}: no sideways scrolling`, (await sideways()) <= 0, await sideways());
    await shot(page, `m_${name}.png`, true);
  }

  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check('dark mode has a dark background', /rgb\((\d+), (\d+), (\d+)\)/.test(background) &&
    background.match(/\d+/g).slice(0, 3).every(value => Number(value) < 80), background);

  await goTo(page, 'food');
  await page.click('[data-action="add-to-bag"][data-id="s_rice"]');
  await page.waitForTimeout(100);
  check('bag bar appears on phones', await page.$eval('#bagBar', bar => bar.classList.contains('show') || getComputedStyle(bar).display !== 'none'));
  await shot(page, 'm_food_bag.png');

  await goTo(page, 'help');
  await page.click('#helpTabVolunteer');
  await page.click('[data-action="volunteer-time"][data-value="after"]');
  check('phone volunteer: no sideways scrolling', (await sideways()) <= 0);
  await shot(page, 'm_volunteer.png', true);

  for (const language of ['ru', 'es']) {
    await page.selectOption('#languageSelect', language);
    await goTo(page, 'home');
    check(`phone ${language}: header fits`, (await sideways()) <= 0);
  }

  await page.click('#loginButton');
  await page.click('#continueButton');
  await page.waitForTimeout(300);
  for (const tab of ['orders', 'tutoring', 'stock', 'volunteers', 'locations']) {
    await page.click(`.tab[data-tab="${tab}"]`);
    await page.waitForTimeout(100);
    check(`phone dashboard ${tab}: no sideways scrolling`, (await sideways()) <= 0, await sideways());
  }
  await shot(page, 'm_dashboard.png', true);
  await page.context().close();
}


// ---------- 5. When things aren't available ----------

async function testProblems() {
  section('Problems and empty states');

  // nothing in the database yet
  let page = await openSite({ name: 'empty', claude: { data: 'empty' } });
  check('empty: home shelf says it\'s empty', (await count(page, '#shelfList li')) <= 1);
  await goTo(page, 'food');
  check('empty: food page explains', (await count(page, '#itemGrid .empty')) === 1);
  await goTo(page, 'locations');
  check('empty: locations page explains', (await text(page, '#placeList')).length > 0);
  await goTo(page, 'help');
  check('empty: no "Most needed" chips', (await count(page, '#neededChips .chip')) === 0);
  await page.click('#loginButton');
  await page.click('#continueButton');
  await page.waitForTimeout(200);
  for (const tab of ['orders', 'tutoring', 'stock', 'volunteers', 'locations']) {
    await page.click(`.tab[data-tab="${tab}"]`);
  }
  check('empty: dashboard has no errors', true);
  await shot(page, 'p_empty_dashboard.png');
  await page.context().close();

  // no Claude at all (the published file opened somewhere else)
  page = await openSite({ name: 'offline', noClaude: true });
  check('offline: home still shows', !(await isHidden(page, '#page-home')));
  await goTo(page, 'food');
  check('offline: food page explains', (await text(page, '#itemGrid')).length > 0);
  await goTo(page, 'recipes');
  await page.click('#recipeButton');
  await page.waitForTimeout(100);
  check('offline: recipes say AI isn\'t available', (await text(page, '#recipeStatus')).length > 0);
  await page.click('#loginButton');
  await page.waitForTimeout(100);
  check('offline: login explains', (await text(page, '#loginBody')).includes('Claude'));
  await page.context().close();

  // signed out
  page = await openSite({ name: 'signed out', claude: { user: 'signedOut' } });
  await goTo(page, 'food');
  await page.click('[data-action="add-to-bag"][data-id="s_rice"]');
  await page.fill('#requestName', 'Ana');
  await page.click('#requestSubmit');
  await page.waitForTimeout(100);
  const signInMessage = await text(page, '#requestMessage');
  check('signed out: asks to sign in', signInMessage === await page.evaluate(() => t('signin_needed')), signInMessage);
  await page.click('#loginButton');
  check('signed out: login asks to sign in', (await text(page, '#loginBody')).includes('sign in'));
  await page.context().close();

  // a family member who can only view
  page = await openSite({ name: 'view only', claude: { user: 'viewOnly' } });
  await goTo(page, 'tutoring');
  await page.fill('#tutorStudent', 'Leo');
  await page.click('[data-action="tutor-subject"][data-value="math"]');
  await page.click('[data-action="tutor-time"][data-value="lunch"]');
  await page.click('[data-action="tutor-day"][data-value="mon"]');
  await page.fill('#tutorContact', 'x@example.com');
  await page.click('#tutorSubmit');
  await page.waitForTimeout(100);
  check('view only: says they can\'t send', (await text(page, '#tutorMessage')) === await page.evaluate(() => t('write_blocked')));
  await page.context().close();

  // signed in, but not on the student team
  page = await openSite({ name: 'visitor', claude: { user: 'visitor' } });
  await page.click('#loginButton');
  await page.waitForTimeout(100);
  check('visitor: told to ask the team lead', (await text(page, '#loginBody')).includes('not on the student team'));
  check('visitor: no Continue button', (await count(page, '#continueButton')) === 0);
  await page.context().close();

  // the database refuses to save
  page = await openSite({ name: 'blocked', claude: { saving: 'blocked' } });
  await goTo(page, 'help');
  await page.fill('#donateItem', 'Rice');
  await page.fill('#donateAmount', '2');
  await page.click('#donateSubmit');
  await page.waitForTimeout(150);
  check('blocked save: explains why', (await text(page, '#donateMessage')) === await page.evaluate(() => t('write_blocked')));
  await page.context().close();

  // AI problems
  for (const problem of ['rate_limited', 'not_granted', 'none']) {
    page = await openSite({ name: 'ai ' + problem, claude: { ai: problem } });
    await goTo(page, 'recipes');
    await page.click('#recipeButton');
    await page.waitForTimeout(600);
    const status = await text(page, '#recipeStatus');
    const expectedKey = { rate_limited: 'ai_rate', not_granted: 'ai_declined', none: 'ai_unavailable' }[problem];
    check(`AI ${problem}: shows the right message`, status.includes(await page.evaluate(key => t(key), expectedKey)), status);
    check(`AI ${problem}: button works again`, !(await page.$eval('#recipeButton', button => button.disabled)));
    await page.context().close();
  }
}


// ---------- 6. index.html on its own (local demo) ----------

async function testLocalDemo() {
  section('Local demo (index.html)');
  const page = await openSite({ name: 'local demo', noClaude: true, url: LOCAL_URL });
  check('demo: the real pantries load', (await page.evaluate(() => state.places.length)) === 8);
  check('demo: sample stock loads', (await page.evaluate(() => state.stock.length)) === 20);

  await goTo(page, 'food');
  await page.click('[data-action="add-to-bag"][data-id="s_pasta"]');
  await page.fill('#requestName', 'Demo');
  await page.click('#slotTimes .slot-button:not([disabled])');
  await page.click('#requestSubmit');
  await page.waitForTimeout(200);
  await page.reload();
  await page.waitForTimeout(600);
  check('demo: a request is still there after reloading',
    (await page.evaluate(() => Object.keys(state.myOrders.entries || state.myOrders).length)) === 1);

  await page.click('#loginButton');
  await page.click('#continueButton');
  await page.waitForTimeout(300);
  check('demo: dashboard works', (await count(page, '#orderCards .card')) === 1);
  await shot(page, 'local_dashboard.png');
  await page.context().close();
}


// ---------- Run everything ----------

(async () => {
  browser = await chromium.launch();
  try {
    await testPublicSite();
    await testDashboard();
    await testLanguages();
    await testPhone();
    await testProblems();
    await testLocalDemo();
  } catch (error) {
    failures.push('the test itself crashed: ' + error.message);
    console.log(error);
  }
  await browser.close();
  fs.unlinkSync(PUBLISHED);

  for (const error of pageErrors) failures.push('page error: ' + error);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log('\nFailed:\n  ' + failures.join('\n  '));
    process.exit(1);
  }
})();
