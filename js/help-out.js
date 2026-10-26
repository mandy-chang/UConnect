// "Help out" page. It has two tabs, and each tab has its own file:
//   Donate food -> donate.js
//   Volunteer   -> volunteer.js (the sign-up) and hours.js (logging service hours)

let helpTab = 'donate';

function renderHelpPage(fromScratch) {
  const onDonate = helpTab === 'donate';
  $('#helpTabDonate').setAttribute('aria-selected', onDonate);
  $('#helpTabVolunteer').setAttribute('aria-selected', !onDonate);
  $('#helpDonate').hidden = !onDonate;
  $('#helpVolunteer').hidden = onDonate;

  renderDonateForm();
  renderVolunteerForm(fromScratch);
  renderHoursPanel();
}

function setupHelpOut() {
  for (const tab of $all('[data-help-tab]')) {
    tab.addEventListener('click', () => {
      helpTab = tab.dataset.helpTab;
      renderHelpPage(false);
    });
  }
  setupDonate();
  setupVolunteer();
  setupHours();
}
