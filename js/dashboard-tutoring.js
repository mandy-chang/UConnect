// Dashboard "Tutoring" tab: match each tutoring request with a tutor and a time.

const TUTORING_LABELS = { new: 'New', matched: 'Tutor found', scheduled: 'Scheduled', done: 'Done' };

let tutoringFilter = 'open';

function renderTutoringRequests() {
  const requests = state.allTutoring;

  $('#tutorFilters').innerHTML = filterChips('tutoring-filter', [
    ['open', 'Open', requests.filter(request => request.status !== 'done').length],
    ['new', 'Needs a tutor', countNew(requests)],
    ['all', 'All', requests.length]
  ], tutoringFilter);

  // suggestions for the Tutor box: volunteers who picked "Peer tutoring"
  $('#tutorNames').innerHTML = tutorNames()
    .map(name => `<option value="${escapeHtml(name)}"></option>`)
    .join('');

  const box = $('#tutorCards');
  if (!state.loaded.tutoring) {
    box.innerHTML = '<p class="empty">Loading tutoring requests…</p>';
    return;
  }

  let shown = requests;
  if (tutoringFilter === 'open') shown = requests.filter(request => request.status !== 'done');
  if (tutoringFilter === 'new') shown = requests.filter(request => request.status === 'new');

  if (shown.length === 0) {
    const message = requests.length > 0
      ? 'Nothing here right now.'
      : 'No tutoring requests yet. They land here from the Tutoring page.';
    box.innerHTML = `<p class="empty">${message}</p>`;
    return;
  }

  box.innerHTML = shown.map(tutoringCard).join('');
}

function tutorNames() {
  const names = [];
  for (const volunteer of state.volunteers) {
    const jobs = volunteer.jobs || {};
    const tutors = (jobs.lunch || []).includes('tutor') || (jobs.after || []).includes('tutor');
    if (tutors && volunteer.name) names.push(volunteer.name);
  }
  return names;
}

function tutoringCard(request) {
  const key = request.owner + '-' + request.id;

  const whenParts = [];
  for (const time of request.times || []) whenParts.push(english('time_' + time));
  for (const day of request.days || []) whenParts.push(english('day_' + day));

  let grade = '';
  if (request.grade) grade = ', grade ' + request.grade;

  let contact = '';
  if (request.contact) contact = `<p class="contact">${escapeHtml(request.contact)}</p>`;

  const details = detailsList([
    ['Topic', request.topic],
    ['When', whenParts.join(', ')],
    ['Where', request.format ? english('format_' + request.format) : ''],
    ['Language', request.language ? LANGUAGE_NAMES[request.language] : ''],
    ['Notes', request.notes]
  ]);

  return `
    <article class="card ${request.status === 'new' ? 'is-new' : ''}">
      <div class="card-top">
        <span class="pill pill-plain">${escapeHtml(english('subj_' + request.subject))}</span>
        <span class="when">${escapeHtml(timeAgo(request.createdAt, 'en'))}</span>
        ${languagePill(request)}
        ${statusSelect('tutoring', request, TUTORING_LABELS)}
      </div>
      <h3>${escapeHtml((request.studentName || 'Student') + grade)}</h3>
      ${contact}
      ${details}
      <div class="match-fields">
        <div class="field">
          <label for="tutor-${escapeHtml(key)}">Tutor</label>
          <input id="tutor-${escapeHtml(key)}" list="tutorNames" maxlength="80"
            value="${escapeHtml(request.tutor || '')}" placeholder="Pick or type a name">
        </div>
        <div class="field">
          <label for="session-${escapeHtml(key)}">Session</label>
          <input id="session-${escapeHtml(key)}" maxlength="80"
            value="${escapeHtml(request.session || '')}" placeholder="e.g. Tue lunch, library">
        </div>
      </div>
      <div class="card-actions">
        <button class="btn btn-small btn-primary" type="button" data-action="save-match"
          data-owner="${escapeHtml(request.owner)}" data-id="${escapeHtml(request.id)}">Save</button>
        <span>The family sees the tutor's name and session time.</span>
      </div>
    </article>`;
}

async function saveTutoringMatch(button) {
  const ownerId = button.dataset.owner;
  const requestId = button.dataset.id;
  const key = ownerId + '-' + requestId;
  const tutor = cleanText(document.getElementById('tutor-' + key).value, 80);
  const session = cleanText(document.getElementById('session-' + key).value, 80);
  const request = state.allTutoring.find(entry => entry.owner === ownerId && entry.id === requestId);

  const changes = { tutor: tutor, session: session };

  // filling in the boxes moves the request along, so nobody has to change the status by hand
  const status = request ? request.status : 'new';
  if (tutor && session && (status === 'new' || status === 'matched')) {
    changes.status = 'scheduled';
  } else if (tutor && status === 'new') {
    changes.status = 'matched';
  }

  button.disabled = true;
  try {
    await updateEntry('tutoring', ownerId, requestId, changes);
    toast('Saved');
  } catch (error) {
    toast('Couldn\'t save. Try again.', 'bad');
  }
  button.disabled = false;
}

function setupDashboardTutoring() {
  const panel = $('#panel-tutoring');

  panel.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;

    if (button.dataset.action === 'tutoring-filter') {
      tutoringFilter = button.dataset.value;
      redrawAndKeepFocus(button, renderTutoringRequests);
    }
    if (button.dataset.action === 'save-match') {
      saveTutoringMatch(button);
    }
  });

  panel.addEventListener('change', event => {
    if (event.target.dataset.change === 'tutoring-status') {
      changeStatus('tutoring', event.target, TUTORING_LABELS);
    }
  });
}
