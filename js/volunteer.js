// The "Volunteer" tab on the Help out page. It works in three steps:
//   1. pick Lunch, After school, or both
//   2. the jobs for those times appear, pick the ones you want
//   3. pick the days you can come
// Each person has one sign-up, saved to volunteers/<userId>.

const volunteerForm = {
  times: new Set(),
  jobs: { lunch: new Set(), after: new Set() },
  days: new Set(),
  loadedSavedSignup: false
};

// If this person signed up before, start the form with their old answers (only once).
function loadSavedSignup() {
  const saved = state.myVolunteer;
  if (!saved || volunteerForm.loadedSavedSignup) return false;
  volunteerForm.loadedSavedSignup = true;

  $('#volunteerName').value = saved.name || '';
  $('#volunteerGrade').value = saved.school || '';
  $('#volunteerContact').value = saved.contact || '';
  $('#volunteerLanguages').value = saved.langs || '';

  const savedJobs = saved.jobs || {};
  volunteerForm.times = new Set(saved.times || []);
  volunteerForm.jobs.lunch = new Set(savedJobs.lunch || []);
  volunteerForm.jobs.after = new Set(savedJobs.after || []);
  volunteerForm.days = new Set(saved.days || []);
  return true;
}

// Builds the time cards, both job groups and the day chips.
// Rebuilding restarts the job groups' slide-in, so after the first time
// it only rebuilds when it has to (language change, or a saved sign-up arrived).
let volunteerFormBuilt = false;

function renderVolunteerForm(fromScratch) {
  const gotSavedSignup = loadSavedSignup();
  if (volunteerFormBuilt && !fromScratch && !gotSavedSignup) return;
  volunteerFormBuilt = true;

  $('#timeOptions').innerHTML = TIMES.map(timeCard).join('');
  $('#jobGroups').innerHTML = `
    <p class="muted" id="pickTimeFirst">${escapeHtml(t('pick_time_first'))}</p>
    <div class="job-group-list">${TIMES.map(jobGroup).join('')}</div>`;
  $('#volunteerDays').innerHTML = DAYS
    .map(day => chipButton('volunteer-day', day, t('day_' + day), volunteerForm.days.has(day)))
    .join('');

  showWhichJobs();
  updateSignupButton();
}

function timeCard(time) {
  return `
    <button type="button" class="time-option" data-action="volunteer-time" data-value="${time}"
      aria-pressed="${volunteerForm.times.has(time)}">
      <strong>${escapeHtml(t('time_' + time))}</strong>
      <span>${escapeHtml(t('time_' + time + '_hint'))}</span>
    </button>`;
}

// Both groups are always on the page. Picking a time just shows or hides its group.
function jobGroup(time) {
  const chips = JOBS[time]
    .map(job => chipButton('volunteer-job', job, t('job_' + job), volunteerForm.jobs[time].has(job), `data-time="${time}"`))
    .join('');
  return `
    <div class="job-group" data-time-group="${time}" hidden>
      <h4>${escapeHtml(t('jobs_' + time))}</h4>
      <div class="chips">${chips}</div>
    </div>`;
}

// Matches the page to what's chosen, without rebuilding anything.
function showWhichJobs() {
  for (const card of $all('[data-action="volunteer-time"]')) {
    card.setAttribute('aria-pressed', volunteerForm.times.has(card.dataset.value));
  }

  for (const group of $all('[data-time-group]')) {
    const time = group.dataset.timeGroup;
    group.hidden = !volunteerForm.times.has(time);
    for (const jobChip of group.querySelectorAll('.chip')) {
      jobChip.setAttribute('aria-pressed', volunteerForm.jobs[time].has(jobChip.dataset.value));
    }
  }

  $('#pickTimeFirst').hidden = volunteerForm.times.size > 0;
}

function updateSignupButton() {
  const alreadySignedUp = Boolean(state.myVolunteer);
  $('#volunteerSubmitText').textContent = t(alreadySignedUp ? 'update_signup' : 'sign_up');

  const message = $('#volunteerMessage');
  const showingSignedUp = message.dataset.messageKey === 'signed_up';
  if (alreadySignedUp && (message.hidden || showingSignedUp)) {
    showMessage('#volunteerMessage', 'signed_up', 'ok');
  }
}

async function sendVolunteerSignup(event) {
  event.preventDefault();

  const name = cleanText($('#volunteerName').value, 80);
  const contact = cleanText($('#volunteerContact').value, 120);

  const missing = [];
  if (!name) missing.push('#volunteerName');
  if (!contact) missing.push('#volunteerContact');
  if (missing.length > 0) {
    markMissing(missing);
    showMessage('#volunteerMessage', 'fill_required', 'bad');
    return;
  }

  // only keep jobs for times that are still picked
  const times = TIMES.filter(time => volunteerForm.times.has(time));
  const jobs = { lunch: [], after: [] };
  for (const time of times) {
    jobs[time] = JOBS[time].filter(job => volunteerForm.jobs[time].has(job));
  }
  if (times.length === 0 || jobs.lunch.length + jobs.after.length === 0) {
    showMessage('#volunteerMessage', 'need_time_and_job', 'bad');
    return;
  }

  const problem = whyCantSave();
  if (problem) {
    showMessage('#volunteerMessage', problem, 'bad');
    return;
  }

  let createdAt = Date.now();
  if (state.myVolunteer && state.myVolunteer.createdAt) createdAt = state.myVolunteer.createdAt;

  const signup = {
    name: name,
    school: cleanText($('#volunteerGrade').value, 80),
    contact: contact,
    times: times,
    jobs: jobs,
    days: DAYS.filter(day => volunteerForm.days.has(day)),
    langs: cleanText($('#volunteerLanguages').value, 120),
    lang: state.language,
    createdAt: createdAt,
    updatedAt: Date.now()
  };

  const button = $('#volunteerSubmit');
  button.disabled = true;
  try {
    await state.db.doc('volunteers/' + state.userId).set(signup);
    volunteerForm.loadedSavedSignup = true; // their answers are already on screen
    $('#volunteerSubmitText').textContent = t('update_signup');
    showMessage('#volunteerMessage', 'signed_up', 'ok');
  } catch (error) {
    showMessage('#volunteerMessage', errorMessageKey(error), 'bad');
  }
  button.disabled = false;
}

function setupVolunteer() {
  $('#volunteerForm').addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const value = button.dataset.value;
    const action = button.dataset.action;

    if (action === 'volunteer-time') {
      // un-picking a time hides its jobs but remembers them, in case it was a mis-click
      // (only jobs for picked times get saved)
      toggleInSet(volunteerForm.times, value);
      showWhichJobs();
    }

    if (action === 'volunteer-job') {
      const jobs = volunteerForm.jobs[button.dataset.time];
      toggleInSet(jobs, value);
      button.setAttribute('aria-pressed', jobs.has(value));
    }

    if (action === 'volunteer-day') {
      toggleInSet(volunteerForm.days, value);
      button.setAttribute('aria-pressed', volunteerForm.days.has(value));
    }
  });

  $('#volunteerForm').addEventListener('submit', sendVolunteerSignup);
}
