// Tutoring page: a student or parent asks for a free student tutor.
// The request is saved to tutoring/<userId>, and students match a tutor from the dashboard.

const tutorForm = {
  subject: '',
  times: new Set(),
  days: new Set(),
  format: 'inperson'
};

function renderTutoringPage() {
  // the list of subjects on the left
  $('#subjectList').innerHTML = SUBJECTS
    .map(subject => `<li class="pill pill-plain">${escapeHtml(t('subj_' + subject))}</li>`)
    .join('');

  fillGradeOptions();
  fillLanguageOptions();
  renderTutorChips();
}

// Rebuilding a <select> forgets its value, so remember it and put it back.
function fillGradeOptions() {
  const select = $('#tutorGrade');
  const chosen = select.value;
  select.innerHTML = GRADES
    .map(grade => `<option value="${grade}">${escapeHtml(t('grade_option', { n: grade }))}</option>`)
    .join('');
  if (chosen) select.value = chosen;
}

function fillLanguageOptions() {
  const select = $('#tutorLanguage');
  const chosen = select.value;
  let options = `<option value="">${escapeHtml(t('no_preference'))}</option>`;
  for (const code in LANGUAGE_NAMES) {
    options += `<option value="${code}">${LANGUAGE_NAMES[code]}</option>`;
  }
  select.innerHTML = options;
  select.value = chosen || '';
}

function renderTutorChips() {
  $('#tutorSubjects').innerHTML = SUBJECTS
    .map(subject => chipButton('tutor-subject', subject, t('subj_' + subject), tutorForm.subject === subject))
    .join('');

  $('#tutorTimes').innerHTML = TIMES
    .map(time => chipButton('tutor-time', time, t('time_' + time), tutorForm.times.has(time)))
    .join('');

  $('#tutorFormats').innerHTML = ['inperson', 'online']
    .map(format => chipButton('tutor-format', format, t('format_' + format), tutorForm.format === format))
    .join('');

  $('#tutorDays').innerHTML = DAYS
    .map(day => chipButton('tutor-day', day, t('day_' + day), tutorForm.days.has(day)))
    .join('');
}

function resetTutorForm() {
  $('#tutorForm').reset();
  tutorForm.subject = '';
  tutorForm.times.clear();
  tutorForm.days.clear();
  tutorForm.format = 'inperson';
  renderTutoringPage();
}

async function sendTutoringRequest(event) {
  event.preventDefault();

  const studentName = cleanText($('#tutorStudent').value, 60);
  const contact = cleanText($('#tutorContact').value, 120);

  const missing = [];
  if (!studentName) missing.push('#tutorStudent');
  if (!contact) missing.push('#tutorContact');
  if (missing.length > 0) {
    markMissing(missing);
    showMessage('#tutorMessage', 'fill_required', 'bad');
    return;
  }

  const choseEnough = tutorForm.subject && tutorForm.times.size > 0 && tutorForm.days.size > 0;
  if (!choseEnough) {
    showMessage('#tutorMessage', 'pick_one_subject', 'bad');
    return;
  }

  const request = {
    studentName: studentName,
    grade: Number($('#tutorGrade').value) || null,
    subject: tutorForm.subject,
    topic: cleanText($('#tutorTopic').value, 120),
    times: TIMES.filter(time => tutorForm.times.has(time)),
    days: DAYS.filter(day => tutorForm.days.has(day)),
    format: tutorForm.format,
    language: $('#tutorLanguage').value,
    contact: contact,
    notes: cleanText($('#tutorNotes').value, 500),
    lang: state.language,
    status: 'new',
    tutor: '',
    session: '',
    createdAt: Date.now()
  };

  const button = $('#tutorSubmit');
  button.disabled = true;
  const result = await addEntry('tutoring', request);
  button.disabled = false;

  if (!result.ok) {
    showMessage('#tutorMessage', result.errorKey, 'bad');
    return;
  }

  resetTutorForm();
  showMessage('#tutorMessage', 'tutoring_sent', 'ok');
}

function setupTutoring() {
  $('#tutorForm').addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const value = button.dataset.value;
    const action = button.dataset.action;

    if (action === 'tutor-subject') {
      // tapping the chosen subject again un-chooses it
      tutorForm.subject = tutorForm.subject === value ? '' : value;
    } else if (action === 'tutor-time') {
      toggleInSet(tutorForm.times, value);
    } else if (action === 'tutor-format') {
      tutorForm.format = value;
    } else if (action === 'tutor-day') {
      toggleInSet(tutorForm.days, value);
    } else {
      return;
    }

    redrawAndKeepFocus(button, renderTutorChips);
  });

  $('#tutorForm').addEventListener('submit', sendTutoringRequest);
}
