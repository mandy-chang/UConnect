// Starts the app. This file loads last, after everything it uses.

// Called whenever new data arrives from the database.
// Only the page you're looking at is redrawn; other pages redraw when you open them.
function refresh() {
  $('#sampleBanner').hidden = !hasSampleData();

  updateBadge();
  updateLoginButton();
  updateTitle();
  drawCurrentPage();
}

// Use the language picked last time, or the browser's language if we have it.
function pickLanguage() {
  const saved = savedSettings.get('uconnect_language');
  if (saved && TRANSLATIONS[saved]) return saved;

  const browserLanguage = String(navigator.language || 'en').slice(0, 2).toLowerCase();
  if (TRANSLATIONS[browserLanguage]) return browserLanguage;
  return 'en';
}

function setLanguage(language) {
  if (!TRANSLATIONS[language]) return;
  state.language = language;
  savedSettings.set('uconnect_language', language);

  applyTranslations();
  setTextSize(largeTextIsOn()); // its label is translated too
  updateLoginButton();
  updateBadge();
  drawCurrentPage({ fromScratch: true });
  fitHeader();
}

function start() {
  state.language = pickLanguage();
  $('#languageSelect').value = state.language;
  applyTranslations();

  setupPages();
  setupHome();
  setupFood();
  setupLocations();
  setupTutoring();
  setupRecipes();
  setupHelpOut();
  setupMyRequests();
  setupDashboard();
  setupPackingSlips();
  setupImpact();

  $('#languageSelect').addEventListener('change', event => setLanguage(event.target.value));

  // take the red outline off a field as soon as someone starts fixing it
  document.addEventListener('input', event => {
    if (event.target.getAttribute && event.target.getAttribute('aria-invalid') === 'true') {
      event.target.removeAttribute('aria-invalid');
    }
  });

  showPage(pageFromAddress());
  connect();

  // keep "5 minutes ago" up to date on the My requests page
  setInterval(() => {
    if (state.page === 'mine') renderMyRequests();
  }, 60 * 1000);
}

start();
