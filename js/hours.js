// "Your service hours" on the Volunteer tab: volunteers log each shift, and a student
// coordinator approves it on the dashboard for their service record.
// Saved in hours/<userId> as { entries: { <id>: { date, hours, task, notes } } }.
// Whether it's approved is kept separately in hourChecks/<userId>, which only students can write.

const HOURS_TASKS = Array.from(new Set(JOBS.lunch.concat(JOBS.after))).concat('other');

function renderHoursPanel() {
  const taskSelect = $('#hoursTask');
  const chosenTask = taskSelect.value;
  taskSelect.innerHTML = HOURS_TASKS.map(task => {
    const label = task === 'other' ? t('hours_task_other') : t('job_' + task);
    return `<option value="${task}">${escapeHtml(label)}</option>`;
  }).join('');
  if (chosenTask) taskSelect.value = chosenTask;

  if (!$('#hoursDate').value) $('#hoursDate').value = dateKey(new Date());

  renderHoursList();
}

function renderHoursList() {
  const entries = entryList(state.myHours);
  const list = $('#hoursList');

  let approved = 0;
  let waiting = 0;
  for (const entry of entries) {
    entry.status = hourStatus(state.myHourChecks, entry.id);
    if (entry.status === 'approved') approved += Number(entry.hours) || 0;
    if (entry.status === 'pending') waiting += Number(entry.hours) || 0;
  }
  $('#hoursTotal').hidden = entries.length === 0;
  $('#hoursTotal').textContent = t('hours_total', { a: formatNumber(approved), w: formatNumber(waiting) });

  if (entries.length === 0) {
    list.innerHTML = `<li class="muted">${escapeHtml(t('hours_empty'))}</li>`;
    return;
  }

  // newest shift first
  entries.sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0));
  list.innerHTML = entries.slice(0, 20).map(hoursCard).join('');
}

function hoursCard(entry) {
  const status = entry.status;
  const statusStyle = { approved: 'pill-in', declined: 'pill-out', pending: 'pill-plain' }[status];
  const task = entry.task === 'other' ? t('hours_task_other') : t('job_' + entry.task);
  const day = entry.date ? formatDate(dateFromKey(entry.date), state.language, { weekday: 'short', month: 'short', day: 'numeric' }) : '';

  return `
    <li class="request-card hours-card">
      <div class="request-top">
        <strong>${formatNumber(entry.hours)} h</strong>
        <span class="pill ${statusStyle}">${escapeHtml(t('hours_' + status))}</span>
        <span class="when">${escapeHtml(day)}</span>
      </div>
      <div class="request-what">${escapeHtml(task)}${entry.notes ? ' · ' + escapeHtml(entry.notes) : ''}</div>
    </li>`;
}

async function sendHours(event) {
  event.preventDefault();

  const date = $('#hoursDate').value;
  const hours = Math.round(parseFloat(String($('#hoursAmount').value).replace(',', '.')) * 4) / 4;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    markMissing(['#hoursDate']);
    showMessage('#hoursMessage', 'fill_required', 'bad');
    return;
  }
  if (!(hours >= 0.25 && hours <= 12)) {
    markMissing(['#hoursAmount']);
    showMessage('#hoursMessage', 'hours_bad_amount', 'bad');
    return;
  }

  const entry = {
    date: date,
    hours: hours,
    task: $('#hoursTask').value,
    notes: cleanText($('#hoursNotes').value, 200),
    name: cleanText((state.myVolunteer && state.myVolunteer.name) || (state.me && state.me.name) || '', 80),
    createdAt: Date.now()
  };

  const button = $('#hoursSubmit');
  button.disabled = true;
  const result = await addEntry('hours', entry);
  button.disabled = false;

  if (!result.ok) {
    showMessage('#hoursMessage', result.errorKey, 'bad');
    return;
  }
  $('#hoursAmount').value = '';
  $('#hoursNotes').value = '';
  showMessage('#hoursMessage', 'hours_logged', 'ok');
}

function setupHours() {
  $('#hoursForm').addEventListener('submit', sendHours);
}
