const mealTypes = [
    { id: 'cafe-da-manha', label: 'Café da manhã' },
    { id: 'almoco', label: 'Almoço' },
    { id: 'jantar', label: 'Jantar' }
];
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
let portalData;
const $ = (selector) => document.querySelector(selector);

function formatDate(date) {
    return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

async function request(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
    return data;
}

function renderPortal(data) {
    portalData = data;
    $('#student-login').hidden = true;
    $('#student-content').hidden = false;
    $('#student-name').textContent = data.student.name.split(' ')[0];
    $('#student-class').textContent = data.student.className;
    $('#student-today').textContent = formatDate(data.today);

    const todayMeals = data.menu.filter((item) => item.date === data.today);
    const availableMealTypes = mealTypes.filter((type) => todayMeals.some((item) => item.mealType === type.id));
    $('#student-today-menu').innerHTML = availableMealTypes.length ? availableMealTypes.map((type) => {
        const item = todayMeals.find((meal) => meal.mealType === type.id);
        return `<article class="student-meal"><h3>${type.label}</h3><p>${escapeHtml(item.meal)}</p><small class="student-allergens">${item.allergens.length ? `Alérgenos: ${escapeHtml(item.allergens.join(', '))}` : 'Sem alérgenos informados'}</small></article>`;
    }).join('') : '<p class="student-empty">O cardápio de hoje ainda não foi publicado.</p>';

    $('#student-notification-list').innerHTML = data.notifications?.length ? data.notifications.map((item) => `<article class="student-notification"><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.date)}</small></div><p>${escapeHtml(item.text)}</p></article>`).join('') : '<p class="student-empty">Não há avisos no momento.</p>';

    $('#student-meal-choices').innerHTML = availableMealTypes.map((type) => `<label class="student-meal-choice"><input type="checkbox" name="meals" value="${type.id}" ${data.selectedMeals.includes(type.id) ? 'checked' : ''}><span>${type.label}</span></label>`).join('') || '<p class="student-empty">Não há refeições disponíveis para selecionar.</p>';
    const isConfirmed = data.confirmed;
    $('#student-attendance-form').hidden = isConfirmed;
    $('#student-confirm-button').disabled = false;
    $('#student-attendance-feedback').textContent = availableMealTypes.length ? '' : 'Você pode confirmar sua presença mesmo sem cardápio publicado.';
    $('#student-confirmed').hidden = !isConfirmed;
    $('#student-confirmed').textContent = isConfirmed ? data.selectedMeals.length ? 'Presença confirmada. Suas refeições de hoje foram registradas.' : 'Presença confirmada. Não havia refeições publicadas para selecionar.' : '';

    const days = data.menu.reduce((grouped, item) => {
        (grouped[item.date] ||= []).push(item);
        return grouped;
    }, {});
    $('#student-week-menu').innerHTML = Object.entries(days).length ? Object.entries(days).map(([date, items]) => `<article class="student-week-day"><h3>${escapeHtml(formatDate(date))}</h3>${items.map((item) => `<div class="student-week-meal"><strong>${mealTypes.find((type) => type.id === item.mealType)?.label || 'Refeição'}</strong><span>${escapeHtml(item.meal)}</span><small>${item.allergens.length ? `Alérgenos: ${escapeHtml(item.allergens.join(', '))}` : 'Sem alérgenos informados'}</small></div>`).join('')}</article>`).join('') : '<p class="student-empty">Ainda não há outros dias publicados.</p>';
}

$('#student-login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const identifier = $('#student-identifier').value.trim().toUpperCase();
    const feedback = $('#student-login-feedback');
    try {
        await request('/api/student/login', { method: 'POST', body: JSON.stringify({ identifier }) });
        const data = await request('/api/student/portal');
        feedback.textContent = '';
        renderPortal(data);
    } catch (error) {
        feedback.textContent = error.message;
    }
});

$('#student-attendance-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const meals = [...document.querySelectorAll('#student-meal-choices input:checked')].map((input) => input.value);
    const feedback = $('#student-attendance-feedback');
    try {
        await request('/api/student/attendance', { method: 'POST', body: JSON.stringify({ meals }) });
        renderPortal(await request('/api/student/portal'));
    } catch (error) {
        feedback.textContent = error.message;
    }
});

$('#student-logout').addEventListener('click', async () => {
    const button = $('#student-logout');
    button.disabled = true;
    try {
        await request('/api/student/logout', { method: 'POST' });
        portalData = null;
        $('#student-content').hidden = true;
        $('#student-login').hidden = false;
        $('#student-identifier').value = '';
        $('#student-login-feedback').textContent = 'Você saiu do portal.';
        $('#student-identifier').focus();
    } catch (error) {
        $('#student-attendance-feedback').textContent = `Não foi possível sair: ${error.message}`;
    } finally {
        button.disabled = false;
    }
});

request('/api/student/portal').then(renderPortal).catch(() => {});
setInterval(() => {
    if (document.visibilityState === 'visible' && portalData) request('/api/student/portal').then(renderPortal).catch(() => {});
}, 30000);
