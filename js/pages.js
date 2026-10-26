// Switching between pages, and keeping the header in shape.
// Every page is a <section id="page-NAME"> in index.html, and only one is shown at a time.

const PUBLIC_PAGES = ['home', 'food', 'locations', 'tutoring', 'recipes', 'help', 'mine'];
const STAFF_PAGES = ['login', 'dashboard'];

// A link like ".../#tutoring" opens the Tutoring page.
function pageFromAddress() {
  const name = location.hash.replace('#', '');
  if (PUBLIC_PAGES.includes(name)) return name;
  return 'home';
}

function showPage(name) {
  const isKnownPage = PUBLIC_PAGES.includes(name) || STAFF_PAGES.includes(name);
  if (!isKnownPage) name = 'home';
  if (name === 'dashboard' && !state.staffSignedIn) name = 'login';
  state.page = name;

  const isStaffPage = STAFF_PAGES.includes(name);
  document.body.dataset.mode = isStaffPage ? 'staff' : 'public';
  $('#publicSite').hidden = isStaffPage;
  $('#staffSite').hidden = !isStaffPage;

  for (const page of PUBLIC_PAGES.concat(STAFF_PAGES)) {
    $('#page-' + page).hidden = page !== name;
  }

  highlightCurrentLink(name);

  if (!isStaffPage) {
    // put the page name in the address bar so the link can be shared
    try {
      history.replaceState(null, '', '#' + name);
    } catch (error) {
      // some embedded viewers don't allow this, which is fine
    }
  }

  updateLoginButton();
  drawCurrentPage({ fromScratch: true });
  fitHeader();
  window.scrollTo(0, 0);
}

function highlightCurrentLink(name) {
  const links = $all('.main-nav a').concat([$('#myRequestsButton')]);
  for (const link of links) {
    if (link.dataset.page === name) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  }
}

// Draws whichever page is showing. Hidden pages get drawn when they are opened.
// fromScratch is true when the page has just been opened or the language changed.
function drawCurrentPage(options) {
  const fromScratch = Boolean(options && options.fromScratch);

  if (state.page === 'home') renderHome();
  if (state.page === 'food') renderFood();
  if (state.page === 'locations') renderLocations();
  if (state.page === 'tutoring') renderTutoringPage();
  if (state.page === 'recipes') renderRecipesPage();
  if (state.page === 'help') renderHelpPage(fromScratch);
  if (state.page === 'mine') renderMyRequests();
  if (state.page === 'login') renderLogin();
  if (state.page === 'dashboard') renderDashboard();

  updateBagBar();
}

function updateLoginButton() {
  let label = t('login');
  if (document.body.dataset.mode === 'staff') {
    label = 'Public site';
  } else if (state.staffSignedIn) {
    label = t('dashboard');
  }
  $('#loginText').textContent = label;
  // the words can be hidden on small screens, so the button also needs a name and a tooltip
  $('#loginButton').setAttribute('aria-label', label);
  $('#loginButton').title = label;
}

// When everything doesn't fit on one line, the header makes room step by step:
//   1. "Student login" becomes just an icon (families rarely need it)
//   2. "My requests" becomes just the bell
//   3. the nav drops to its own row
const HEADER_SQUEEZE_STEPS = ['no-login-text', 'no-button-words'];

function fitHeader() {
  const row = $('#headerRow');
  const nav = $('#mainNav');
  const navIsCut = () => nav.scrollWidth > nav.clientWidth + 2;

  row.classList.remove('two-rows', ...HEADER_SQUEEZE_STEPS);
  if (document.body.dataset.mode === 'public') {
    for (const step of HEADER_SQUEEZE_STEPS) {
      if (!navIsCut()) break;
      row.classList.add(step);
    }
    if (navIsCut()) {
      row.classList.remove(...HEADER_SQUEEZE_STEPS);
      row.classList.add('two-rows');
    }
  }

  updateNavFade();

  // sticky things below the header need to know how tall it is
  const headerHeight = $('.site-header').offsetHeight;
  document.documentElement.style.setProperty('--header-height', headerHeight + 'px');
}

// On phones the nav scrolls sideways. Fade its right edge while there's more to see.
function updateNavFade() {
  const nav = $('#mainNav');
  const canScroll = nav.scrollWidth > nav.clientWidth + 2;
  const atTheEnd = nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 4;
  nav.classList.toggle('fade-right', canScroll && !atTheEnd);
}

// ----- Larger text -----

// "Aa" in the header makes everything about 20% bigger, and remembers it on this device.
function setTextSize(large) {
  document.documentElement.dataset.textSize = large ? 'large' : 'normal';
  savedSettings.set('uconnect_text_size', large ? 'large' : 'normal');
  const button = $('#textSizeButton');
  button.setAttribute('aria-pressed', large);
  button.setAttribute('aria-label', t(large ? 'text_normal' : 'text_larger'));
  button.title = t(large ? 'text_normal' : 'text_larger');
}

function largeTextIsOn() {
  return document.documentElement.dataset.textSize === 'large';
}

function setupPages() {
  setTextSize(savedSettings.get('uconnect_text_size') === 'large');
  $('#textSizeButton').addEventListener('click', () => {
    setTextSize(!largeTextIsOn());
    fitHeader();
    drawCurrentPage({ fromScratch: true });
  });

  // any link or button with data-page="..." opens that page
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-page]');
    if (!link) return;
    event.preventDefault();
    showPage(link.dataset.page);
  });

  $('#loginButton').addEventListener('click', () => {
    if (document.body.dataset.mode === 'staff') {
      showPage('home');
    } else if (state.staffSignedIn) {
      showPage('dashboard');
    } else {
      showPage('login');
    }
  });

  let waitingFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(waitingFrame);
    waitingFrame = requestAnimationFrame(fitHeader);
  });

  $('#mainNav').addEventListener('scroll', updateNavFade, { passive: true });

  // the nav gets wider once the web fonts arrive, so measure again
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fitHeader).catch(() => {});
  }
}
