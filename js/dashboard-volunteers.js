// Dashboard "Volunteers" tab: service hours waiting for approval, a weekly grid showing which
// days need people, and everyone who signed up.

function renderVolunteers() {
  renderHoursToApprove();
  renderCoverage();

  const count = state.volunteers.length;
  $('#volunteerSummary').textContent = state.loaded.volunteers
    ? `${count} ${count === 1 ? 'person' : 'people'} signed up`
    : 'Loading…';

  const box = $('#volunteerCards');
  if (!state.loaded.volunteers) {
    box.innerHTML = '';
    return;
  }
  if (count === 0) {
    box.innerHTML = '<p class="empty">No sign-ups yet. They show up here when someone uses the Volunteer form.</p>';
    return;
  }

  box.innerHTML = state.volunteers.map(volunteerCard).join('');
  lookUpNames(state.volunteers.map(volunteer => volunteer.userId));
}


// ----- Service hours -----

// Approved hours for one person
function approvedHours(userId) {
  let total = 0;
  for (const entry of state.allHours) {
    if (entry.owner === userId && entry.status === 'approved') total += Number(entry.hours) || 0;
  }
  return total;
}

function renderHoursToApprove() {
  const waiting = state.allHours.filter(entry => entry.status === 'pending');
  $('#hoursCount').textContent = state.loaded.hours ? String(waiting.length) : '–';

  const box = $('#hoursCards');
  if (!state.loaded.hours) {
    box.innerHTML = '<p class="empty">Loading hours…</p>';
    return;
  }
  if (waiting.length === 0) {
    box.innerHTML = '<p class="empty">No hours waiting. Volunteers log hours on the Help out page.</p>';
    return;
  }

  // oldest first, so nobody waits forever
  waiting.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  box.innerHTML = waiting.map(hoursApprovalCard).join('');
  lookUpNames(Array.from(new Set(waiting.map(entry => entry.owner))));
}

function hoursApprovalCard(entry) {
  const task = entry.task === 'other' ? 'Something else' : english('job_' + entry.task);
  const day = entry.date ? formatDate(dateFromKey(entry.date), 'en', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  const owner = escapeHtml(entry.owner);
  const id = escapeHtml(entry.id);
  return `
    <article class="card">
      <div class="card-top">
        <span class="pill pill-plain">${escapeHtml(day)}</span>
        <span class="when">${escapeHtml(timeAgo(entry.createdAt, 'en'))}</span>
      </div>
      <h3>${escapeHtml(personName(entry.owner, entry.name))} · ${formatNumber(entry.hours, 'en')} h</h3>
      <p>${escapeHtml(task)}${entry.notes ? ' · ' + escapeHtml(entry.notes) : ''}</p>
      <p class="hint">Approved so far: ${formatNumber(approvedHours(entry.owner), 'en')} h</p>
      <div class="card-actions">
        <button class="btn btn-small btn-primary" type="button" data-action="approve-hours" data-owner="${owner}" data-id="${id}">Approve</button>
        <button class="btn btn-small btn-outline" type="button" data-action="decline-hours" data-owner="${owner}" data-id="${id}">Not approved</button>
      </div>
    </article>`;
}

// Approvals go in hourChecks/<volunteer>, which only students can write.
async function setHoursStatus(button, status) {
  const ownerId = button.dataset.owner;
  const entryId = button.dataset.id;
  const check = { status: status, by: state.userId, at: Date.now() };

  button.disabled = true;
  try {
    const ref = state.db.doc('hourChecks/' + ownerId);
    const existing = await ref.get();
    if (existing.exists) {
      await ref.update({ entries: { [entryId]: check } });
    } else {
      await ref.set({ entries: { [entryId]: check } });
    }
    toast(status === 'approved' ? 'Hours approved' : 'Marked as not approved');
    rememberStatus(state.allHours, ownerId, entryId, status);
    saveImpact();
  } catch (error) {
    toast('Couldn\'t update that. Try again.', 'bad');
    button.disabled = false;
  }
}

// "Name — 12.5 h approved", one line per person, for the advisor
async function copyHoursReport() {
  const owners = Array.from(new Set(state.allHours.map(entry => entry.owner)));
  const lines = owners
    .map(owner => {
      const entry = state.allHours.find(item => item.owner === owner);
      const signup = state.volunteers.find(volunteer => volunteer.userId === owner);
      const name = personName(owner, (signup && signup.name) || entry.name);
      return { name: name, hours: approvedHours(owner) };
    })
    .filter(person => person.hours > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(person => `${person.name} — ${formatNumber(person.hours, 'en')} h approved`);

  if (lines.length === 0) {
    toast('No approved hours yet.');
    return;
  }
  await copyText(lines.join('\n'), 'Hours report');
}

// Lunch and After school down the side, Monday to Friday across the top.
// Each box shows how many volunteers can come then: red is nobody, amber is one, green is two or more.
function renderCoverage() {
  let header = '<thead><tr><th scope="col"></th>';
  for (const day of DAYS) {
    header += `<th scope="col">${english('day_' + day)}</th>`;
  }
  header += '</tr></thead>';

  let body = '<tbody>';
  for (const time of TIMES) {
    body += `<tr><th scope="row">${english('time_' + time)}</th>`;
    for (const day of DAYS) {
      const count = volunteersAt(time, day);
      let level = 'good';
      if (count === 0) level = 'none';
      if (count === 1) level = 'few';
      body += `<td><span class="slot ${level}">${count}</span></td>`;
    }
    body += '</tr>';
  }
  body += '</tbody>';

  $('#coverageTable').innerHTML = header + body;
}

function volunteersAt(time, day) {
  return state.volunteers.filter(volunteer => {
    const times = volunteer.times || [];
    const days = volunteer.days || [];
    return times.includes(time) && days.includes(day);
  }).length;
}

function volunteerCard(volunteer) {
  const jobs = volunteer.jobs || {};

  // one line per time, like "Lunch — Peer tutoring, Restock shelves"
  const timeLines = (volunteer.times || []).map(time => {
    const jobNames = (jobs[time] || []).map(job => english('job_' + job)).join(', ');
    return `<li><span>${english('time_' + time)}</span><span>${escapeHtml(jobNames || '—')}</span></li>`;
  }).join('');

  const days = (volunteer.days || []).map(day => english('day_' + day)).join(', ');
  const schoolAndContact = [volunteer.school, volunteer.contact].filter(Boolean).join(' · ');

  let daysLine = '';
  if (days) daysLine = `<p><span class="muted">Days:</span> ${escapeHtml(days)}</p>`;

  let languagesLine = '';
  if (volunteer.langs) languagesLine = `<p><span class="muted">Languages:</span> ${escapeHtml(volunteer.langs)}</p>`;

  return `
    <article class="card">
      <h3>${escapeHtml(personName(volunteer.userId, volunteer.name))}</h3>
      <p class="contact">${escapeHtml(schoolAndContact)}</p>
      ${timeLines ? `<ul class="line-items job-lines">${timeLines}</ul>` : ''}
      ${daysLine}
      ${languagesLine}
      <p><span class="muted">Approved hours:</span> ${formatNumber(approvedHours(volunteer.userId), 'en')}</p>
      <p class="hint">Signed up ${escapeHtml(timeAgo(volunteer.createdAt, 'en'))}</p>
    </article>`;
}

// Copies "Name — contact" for everyone, one per line, ready to paste into an email.
async function copyContacts() {
  const lines = state.volunteers.map(volunteer => {
    const name = personName(volunteer.userId, volunteer.name);
    return volunteer.contact ? name + ' — ' + volunteer.contact : name;
  });

  if (lines.length === 0) {
    toast('No contacts to copy yet.');
    return;
  }

  await copyText(lines.join('\n'), 'Contacts');
}

// Copies text, or if the browser won't allow it here, shows it selected so it can be copied by hand.
async function copyText(text, what) {
  try {
    await navigator.clipboard.writeText(text);
    toast(what + ' copied');
  } catch (error) {
    const box = $('#copyBox');
    box.hidden = false;
    box.value = text;
    box.focus();
    box.select();
    toast('Press Ctrl+C (or ⌘C) to copy the selected list.');
  }
}

function setupDashboardVolunteers() {
  $('#copyContactsButton').addEventListener('click', copyContacts);
  $('#copyHoursButton').addEventListener('click', copyHoursReport);
  $('#hoursCards').addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'approve-hours') setHoursStatus(button, 'approved');
    if (button.dataset.action === 'decline-hours') setHoursStatus(button, 'declined');
  });
}
