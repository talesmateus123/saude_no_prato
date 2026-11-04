const state = { dashboard: null, report: null };
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const mealTypes = [{ id: 'cafe-da-manha', label: 'Café da manhã' }, { id: 'almoco', label: 'Almoço' }, { id: 'jantar', label: 'Jantar' }];
const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function weekDates(startDate) {
    return Array.from({ length: 5 }, (_, index) => {
        const date = new Date(`${startDate}T12:00:00`);
        date.setDate(date.getDate() + index);
        return localDate(date);
    });
}

function getWeekStart(date = new Date()) {
    const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return localDate(monday);
}

function groupedMenu(menu) {
    return menu.reduce((days, item) => {
        const day = days[item.date] || (days[item.date] = {});
        day[item.mealType || 'almoco'] = item;
        return days;
    }, {});
}

async function request(url, options = {}) {
    const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
    return data;
}

function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3200);
}

function renderMenu(menu) {
    const formatDay = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase();
    const formatDate = (date) => new Date(`${date}T12:00:00`).getDate();
    const grouped = groupedMenu(menu);
    const today = localDate();
    const todayMenu = grouped[today] || {};
    $('#today-menu-list').innerHTML = mealTypes.map((type) => {
        const item = todayMenu[type.id];
        return `<article class="today-meal"><strong>${type.label}</strong>${item ? `<p>${escapeHtml(item.meal)}</p><small>${item.allergens.length ? `Alérgenos: ${escapeHtml(item.allergens.join(', '))}` : 'Sem alérgenos informados'}</small>` : '<p class="empty-meal">Ainda não publicado</p>'}</article>`;
    }).join('');
    const dates = weekDates($('#week-start').value || getWeekStart());
    const renderMeals = (date) => mealTypes.map((type) => {
        const item = (grouped[date] || {})[type.id];
        return `<div class="week-meal-line"><strong>${type.label}</strong><span>${item ? escapeHtml(item.meal) : 'Não publicado'}</span><small>${item?.allergens.length ? `Alérgenos: ${escapeHtml(item.allergens.join(', '))}` : item ? 'Sem alérgenos informados' : ''}</small></div>`;
    }).join('');
    $('#menu-list').innerHTML = dates.map((date) => `<div class="menu-row week-menu-row"><div class="menu-day"><strong>${formatDate(date)}</strong><small>${formatDay(date)}</small></div><div class="menu-copy">${renderMeals(date)}</div></div>`).join('');
    $('#full-menu-list').innerHTML = dates.map((date) => `<section class="full-menu-day"><div class="full-menu-day-heading"><strong>${formatDate(date)} ${formatDay(date)}</strong><small>${date}</small></div><div>${renderMeals(date)}</div></section>`).join('');
    renderWeeklyEditor(grouped, dates);
}

function renderWeeklyEditor(grouped, dates) {
    const formatDate = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
    $('#weekly-menu-days').innerHTML = dates.map((date, dayIndex) => `<fieldset class="weekly-day"><legend>${formatDate(date)}</legend><div class="weekly-day-meals">${mealTypes.map((type) => {
        const item = (grouped[date] || {})[type.id] || {};
        return `<div class="weekly-meal-editor"><h3>${type.label}</h3><label>Refeição<input name="days[${dayIndex}][${type.id}][meal]" value="${escapeHtml(item.meal || '')}" required></label><label>Alérgenos, separados por vírgula<input name="days[${dayIndex}][${type.id}][allergens]" value="${escapeHtml((item.allergens || []).join(', '))}" placeholder="Ex.: leite, ovos"></label></div>`;
    }).join('')}</div></fieldset>`).join('');
}

function renderNotifications(items) {
    $('#notification-list').innerHTML = items.slice(0, 3).map((item) => `<div class="notification-item ${item.read ? 'read' : ''}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.text)}</p><small>${escapeHtml(item.date)}</small></div>`).join('');
}

function renderAttendance(items) {
    const list = $('#attendance-list');
    $('#attendance-total').textContent = `${items.length} hoje`;
    list.innerHTML = items.length ? items.map((item) => `<div class="attendance-row"><div><strong>${escapeHtml(item.student?.name || 'Aluno')}</strong><small>${escapeHtml(item.student?.className || '')}</small></div><time>${escapeHtml(item.time || '')}</time><span>${item.meals.length ? escapeHtml(item.meals.map((id) => mealTypes.find((type) => type.id === id)?.label || id).join(', ')) : 'Sem refeições selecionadas'}</span></div>`).join('') : '<p class="attendance-empty">Nenhuma presença confirmada hoje.</p>';
}

function renderStudents(students) {
    $('#student-total').textContent = `${students.length} alunos cadastrados`;
    if (!students.length) {
        $('#students-list').innerHTML = '<p class="students-empty">cadastre aqui</p>';
        updateRemoveStudentsButton();
        return;
    }
    const statusLabel = { ativo: 'Ativo', inativo: 'Inativo', transferido: 'Transferido' };
    $('#students-list').innerHTML = students.map((student) => `<div class="student-row"><label class="student-select"><input type="checkbox" data-student-select="${student.id}" aria-label="Selecionar ${escapeHtml(student.name)}"><span></span></label><div class="student-name"><span class="student-avatar">${student.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><div><strong>${escapeHtml(student.name)}</strong><small>Matrícula: ${escapeHtml(student.enrollment)} · Código: ${escapeHtml(student.accessCode)}</small></div></div><span>${escapeHtml(student.className)}</span><span>${student.restrictions.length ? student.restrictions.map((restriction) => `<span class="restriction">${escapeHtml(restriction)}</span>`).join('') : '<span class="no-restriction">Nenhuma restrição</span>'}</span><label class="student-status-control"><select data-student-status="${student.id}" aria-label="Status de ${escapeHtml(student.name)}">${Object.entries(statusLabel).map(([value, label]) => `<option value="${value}" ${student.status === value || (!student.status && value === 'ativo') ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>`).join('');
    document.querySelectorAll('[data-student-select]').forEach((checkbox) => checkbox.addEventListener('change', updateRemoveStudentsButton));
    document.querySelectorAll('[data-student-status]').forEach((select) => select.addEventListener('change', async (event) => {
        try { await request(`/api/students/${event.target.dataset.studentStatus}/status`, { method: 'PATCH', body: JSON.stringify({ status: event.target.value }) }); showToast('Status do aluno atualizado.'); } catch (error) { showToast(error.message); await loadDashboard(); }
    }));
    updateRemoveStudentsButton();
}

function updateRemoveStudentsButton() {
    const button = $('#remove-students-button');
    if (button) button.disabled = !document.querySelector('[data-student-select]:checked');
}

function setStudentFormOpen(isOpen) {
    const form = $('#student-form');
    const toggle = $('#toggle-student-form');
    form.hidden = !isOpen;
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.textContent = isOpen ? 'Fechar cadastro' : '+ Novo cadastro';
    if (isOpen) form.querySelector('input[name="name"]').focus();
}

async function loadDashboard() {
    state.dashboard = await request('/api/dashboard');
    const { date, students, present, prepared, consumed, mealOptions, menu, notifications, studentsList, attendance } = state.dashboard;
    state.currentDate = date;
    const current = new Date(`${date}T12:00:00`);
    if ($('#week-start').value && localDate(new Date(`${$('#week-start').value}T12:00:00`)) !== getWeekStart(current)) {
        $('#week-start').value = getWeekStart(current);
    }
    $('#students-count').textContent = students;
    $('#present-count').textContent = present;
    $('#prepared-count').textContent = prepared;
    $('#consumed-count').textContent = consumed;
    mealOptions.forEach((option) => {
        const input = $(`#prepared-meals-form [name="${option.id}"]`);
        if (input) input.value = option.prepared || 0;
        const consumedInput = $(`#served-meals-form [name="${option.id}"]`);
        if (consumedInput) consumedInput.value = option.consumed || 0;
    });
    renderMenu(menu); renderNotifications(notifications); renderStudents(studentsList); renderAttendance(attendance);
}

async function loadReports() {
    state.report = await request('/api/reports');
    const { meals, countByClass } = state.report;
    const consumptionRate = meals.prepared ? Math.round(meals.consumed / meals.prepared * 100) : 0;
    $('#report-prepared').textContent = meals.prepared;
    $('#report-consumed').textContent = meals.consumed;
    $('#prepared-progress').style.width = `${Math.min(meals.prepared / 140 * 100, 100)}%`;
    $('#consumed-progress').style.width = `${Math.min(consumptionRate, 100)}%`;
    $('#consumption-rate').textContent = `${consumptionRate}%`;
    $('#class-report').innerHTML = Object.entries(countByClass).map(([className, count]) => `<div class="class-bar"><i style="height:${Math.max(25, count * 28)}px"></i>${escapeHtml(className)}<br><b>${count}</b></div>`).join('');
}

function navigate(section) {
    document.querySelectorAll('.page-section').forEach((item) => item.classList.toggle('active-section', item.id === section));
    document.querySelectorAll('.nav-link[data-section]').forEach((item) => item.classList.toggle('active', item.dataset.section === section));
    $('.sidebar').classList.remove('open');
    if (section === 'relatorios') loadReports().catch(() => showToast('Não foi possível carregar o relatório.'));
}

document.querySelectorAll('[data-section]').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); navigate(link.dataset.section); history.replaceState(null, '', `#${link.dataset.section}`); }));
$('.menu-toggle').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
$('.dashboard-grid').insertAdjacentHTML('beforeend', '<section class="panel attendance-panel"><div class="panel-heading"><div><p class="eyebrow">PRESENÇA DE HOJE</p><h2>Alunos confirmados</h2></div><span id="attendance-total" class="count-badge">Atualizado</span></div><div id="attendance-list" class="attendance-list"></div></section>');
const userMenuToggle = $('#user-menu-toggle');
const userMenu = $('#user-menu');
if (userMenuToggle && userMenu) {
    const closeUserMenu = () => {
        userMenu.hidden = true;
        userMenuToggle.setAttribute('aria-expanded', 'false');
    };
    userMenuToggle.addEventListener('click', () => {
        const isExpanded = userMenuToggle.getAttribute('aria-expanded') === 'true';
        userMenu.hidden = isExpanded;
        userMenuToggle.setAttribute('aria-expanded', String(!isExpanded));
    });
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.user-menu')) closeUserMenu();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !userMenu.hidden) {
            closeUserMenu();
            userMenuToggle.focus();
        }
    });
}
$('#served-meals-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const consumed = Object.fromEntries(mealTypes.map(({ id }) => [id, Number(form.elements[id].value)]));
    const feedback = $('#served-meals-feedback');
    try {
        await request('/api/meals/consumed', { method: 'PATCH', body: JSON.stringify({ consumed }) });
        feedback.textContent = 'Porções servidas atualizadas.';
        feedback.style.color = '#579775';
        await loadDashboard();
    } catch (error) {
        feedback.textContent = error.message;
        feedback.style.color = 'var(--theme-accent-text)';
    }
});
$('#prepared-meals-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const prepared = Object.fromEntries(mealTypes.map(({ id }) => [id, Number(form.elements[id].value)]));
    const feedback = $('#prepared-meals-feedback');
    try {
        await request('/api/meals/prepared', { method: 'PATCH', body: JSON.stringify({ prepared }) });
        feedback.textContent = 'Porções preparadas atualizadas.';
        feedback.style.color = '#579775';
        await loadDashboard();
    } catch (error) {
        feedback.textContent = error.message;
        feedback.style.color = 'var(--theme-accent-text)';
    }
});
$('#week-start').value = getWeekStart();
$('#week-start').addEventListener('change', () => {
    if (!$('#week-start').value) return;
    $('#week-start').value = getWeekStart(new Date(`${$('#week-start').value}T12:00:00`));
    if (state.dashboard) renderMenu(state.dashboard.menu);
});
$('#weekly-menu-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const dates = weekDates($('#week-start').value);
    const days = dates.map((date, dayIndex) => ({ date, meals: Object.fromEntries(mealTypes.map((type) => {
        const prefix = `days[${dayIndex}][${type.id}]`;
        return [type.id, { meal: $(`[name="${prefix}[meal]"]`).value, allergens: $(`[name="${prefix}[allergens]"]`).value.split(',').map((value) => value.trim()).filter(Boolean) }];
    })) }));
    const feedback = $('#weekly-menu-feedback');
    try {
        const result = await request('/api/menu/week', { method: 'PUT', body: JSON.stringify({ days }) });
        feedback.textContent = result.changedDates.length ? 'Cardápio publicado. Os dias alterados geraram notificações.' : 'Cardápio salvo; não houve alterações para notificar.';
        feedback.style.color = '#579775';
        await loadDashboard();
    } catch (error) { feedback.textContent = error.message; feedback.style.color = 'var(--theme-accent-text)'; }
});
$('#student-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.gender = payload.gender === 'other' ? String(payload.genderDetail || '').trim() : payload.gender;
    delete payload.genderDetail;
    payload.restrictions = String(payload.restrictions || '').split(',').map((item) => item.trim()).filter(Boolean);
    const feedback = $('#student-form-feedback');
    try { const student = await request('/api/students', { method: 'POST', body: JSON.stringify(payload) }); feedback.textContent = `${student.name} foi cadastrado. Código de acesso: ${student.accessCode}`; feedback.style.color = '#579775'; form.reset(); $('#student-gender-other-field').hidden = true; await loadDashboard(); setStudentFormOpen(false); showToast('Novo aluno cadastrado.'); } catch (error) { feedback.textContent = error.message; feedback.style.color = 'var(--theme-accent-text)'; }
});
$('#student-gender').addEventListener('change', (event) => {
    const otherField = $('#student-gender-other-field');
    const isOther = event.target.value === 'other';
    otherField.hidden = !isOther;
    $('#student-gender-detail').required = isOther;
    if (!isOther) $('#student-gender-detail').value = '';
});
$('#cancel-student-button').addEventListener('click', () => { $('#student-form').reset(); $('#student-gender-other-field').hidden = true; $('#student-gender-detail').required = false; $('#student-form-feedback').textContent = ''; });
$('#toggle-student-form').addEventListener('click', () => setStudentFormOpen($('#student-form').hidden));
$('#remove-students-button').addEventListener('click', async () => {
    const ids = [...document.querySelectorAll('[data-student-select]:checked')].map((checkbox) => Number(checkbox.dataset.studentSelect));
    if (!ids.length) return;
    if (!confirm(`Remover ${ids.length} matrícula(s) selecionada(s)?`)) return;
    const password = prompt('Digite a senha do acesso administrativo para confirmar:');
    if (password === null) return;
    try { const result = await request('/api/students', { method: 'DELETE', body: JSON.stringify({ ids, password }) }); await loadDashboard(); showToast(`${result.removedCount} matrícula(s) removida(s).`); } catch (error) { showToast(error.message); }
});
$('#student-search').addEventListener('input', (event) => { const term = event.target.value.toLowerCase(); renderStudents(state.dashboard.studentsList.filter((student) => `${student.name} ${student.enrollment}`.toLowerCase().includes(term))); });
$('#export-button').addEventListener('click', () => { const blob = new Blob([JSON.stringify(state.report, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'relatorio-prato-vivo.json'; link.click(); URL.revokeObjectURL(link.href); showToast('Relatório exportado.'); });
loadDashboard().catch(() => showToast('Não foi possível carregar os dados.'));
setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    try {
        const dashboard = await request('/api/dashboard');
        if (dashboard.date !== state.currentDate) {
            await loadDashboard();
            return;
        }
        $('#present-count').textContent = dashboard.present;
        $('#attendance-total').textContent = `${dashboard.present} hoje`;
        renderAttendance(dashboard.attendance);
    } catch {}
}, 15000);
