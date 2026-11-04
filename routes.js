import express from "express";
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createStudent, deleteStudents, generateStudentAccessCode, getCurrentDate, readStore, recordStudentAttendance, replaceMenuWeek, saveMenuItem, saveNotification, updateMealOptions, updateStudentRestrictions, updateStudentStatus } from "./database.js";

const app = express();
const mealTypes = ['cafe-da-manha', 'almoco', 'jantar'];
const staffAuthCookieName = 'prato_vivo_auth';
const studentAuthCookieName = 'prato_vivo_student_auth';
const fallbackAuthSecret = randomBytes(32).toString('hex');

function normalizeMenuItem(item) {
    return { ...item, mealType: item.mealType || 'almoco', allergens: Array.isArray(item.allergens) ? item.allergens : [] };
}

function menuForDate(menu, date) {
    return menu.filter((item) => item.date === date).map(normalizeMenuItem);
}

function addMenuNotification(store, title, text) {
    store.notifications.unshift({ id: Date.now() + Math.random(), title, text, date: 'agora', read: false });
}

function studentFromIdentifier(store, identifier) {
    const normalizedIdentifier = String(identifier || '').trim().toUpperCase();
    return store.students.find((student) => student.accessCode === normalizedIdentifier || String(student.enrollment).trim().toUpperCase() === normalizedIdentifier);
}

function authSecret() {
    return process.env.JWT_SECRET || fallbackAuthSecret;
}

function createAuthToken(payload) {
    const encodedPayload = Buffer.from(JSON.stringify({ ...payload, expiresAt: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
    const signature = createHmac('sha256', authSecret()).update(encodedPayload).digest('base64url');
    return `${encodedPayload}.${signature}`;
}

function readAuthToken(token) {
    if (!token) return null;
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) return null;
    const expectedSignature = createHmac('sha256', authSecret()).update(encodedPayload).digest();
    let providedSignature;
    try {
        providedSignature = Buffer.from(signature, 'base64url');
    } catch {
        return null;
    }
    if (providedSignature.length !== expectedSignature.length || !timingSafeEqual(providedSignature, expectedSignature)) return null;
    try {
        const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
        return payload.expiresAt > Date.now() ? payload : null;
    } catch {
        return null;
    }
}

function setAuthCookie(res, payload) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const cookieName = payload.role === 'aluno' ? studentAuthCookieName : staffAuthCookieName;
    res.set('Set-Cookie', `${cookieName}=${createAuthToken(payload)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`);
}

function clearAuthCookie(res, role) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const cookieName = role === 'aluno' ? studentAuthCookieName : staffAuthCookieName;
    res.set('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
}

function passwordMatches(password, configuredPassword = process.env.STAFF_PASSWORD) {
    if (!configuredPassword) return false;
    const supplied = Buffer.from(String(password || ''));
    const expected = Buffer.from(configuredPassword);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function requireEmployee(req, res) {
    if (req.auth?.role === 'funcionario') return true;
    res.status(403).json({ error: 'Somente funcionários autorizados podem acessar esta área.' });
    return false;
}

function requireStudent(req, res) {
    if (req.auth?.role === 'aluno') return true;
    res.status(401).json({ error: 'Entre no portal com seu código ou matrícula.' });
    return false;
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use((req, res, next) => {
    const cookies = Object.fromEntries(String(req.headers.cookie || '').split(';').map((part) => part.trim().split(/=(.*)/s).slice(0, 2)).filter(([name, value]) => name && value));
    const isStudentPath = req.path === '/aluno' || req.path.startsWith('/api/student/');
    const cookieName = isStudentPath ? studentAuthCookieName : staffAuthCookieName;
    req.auth = readAuthToken(cookies[cookieName]);
    next();
});

app.get('/', async (req, res) => {
    if (req.auth?.role === 'aluno') return res.redirect('/aluno');
    if (req.auth?.role !== 'funcionario') return res.status(401).render('employee-login', { titulo: 'Acesso da equipe', error: '' });
    res.render('index', { titulo: 'Saúde no Prato' });
});

app.post('/login', (req, res) => {
    if (req.auth?.role === 'aluno') return res.redirect('/aluno');
    const configuredPassword = process.env.STAFF_PASSWORD;
    if (!configuredPassword) return res.status(503).render('employee-login', { titulo: 'Acesso da equipe', error: 'O acesso da equipe ainda não foi configurado.' });
    if (!passwordMatches(req.body.password, configuredPassword)) return res.status(401).render('employee-login', { titulo: 'Acesso da equipe', error: 'Senha incorreta.' });
    setAuthCookie(res, { role: 'funcionario' });
    res.redirect('/');
});

app.post('/logout', (req, res) => {
    clearAuthCookie(res, 'funcionario');
    res.redirect('/');
});

app.get('/aluno', (req, res) => {
    res.render('student', { titulo: 'Área do aluno' });
});

app.post('/api/student/login', async (req, res) => {
    if (req.auth?.role === 'aluno') return res.status(403).json({ error: 'Saia do portal antes de entrar com outro aluno.' });
    const store = await readStore();
    const student = studentFromIdentifier(store, req.body.identifier);
    if (!student) return res.status(401).json({ error: 'Matrícula ou código do aluno inválido.' });
    setAuthCookie(res, { role: 'aluno', studentId: student.id });
    res.json({ student: { name: student.name, className: student.className } });
});

app.post('/api/student/logout', (req, res) => {
    if (!requireStudent(req, res)) return;
    clearAuthCookie(res, 'aluno');
    res.json({ ok: true });
});

app.get('/api/student/portal', async (req, res) => {
    if (!requireStudent(req, res)) return;
    const today = getCurrentDate();
    const store = await readStore(today);
    const student = store.students.find((item) => item.id === req.auth.studentId);
    if (!student) return res.status(401).json({ error: 'Acesso do aluno expirado. Entre novamente.' });
    const todayDate = new Date(`${today}T00:00:00Z`);
    const dayOfWeek = todayDate.getUTCDay();
    todayDate.setUTCDate(todayDate.getUTCDate() + (dayOfWeek >= 6 ? 8 - dayOfWeek : 1 - dayOfWeek));
    const weekStart = todayDate.toISOString().slice(0, 10);
    const weekEndDate = new Date(todayDate);
    weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 4);
    const weekEnd = weekEndDate.toISOString().slice(0, 10);
    const publishedMenu = store.menu.filter((item) => item.status === 'Publicado' && item.date >= weekStart && item.date <= weekEnd).map(normalizeMenuItem).sort((a, b) => a.date.localeCompare(b.date));
    const attendance = store.attendance.find((item) => item.studentId === student.id && item.date === today);
    const selection = store.mealSelections.find((item) => item.studentId === student.id && item.date === today);
    const notifications = store.notifications
        .filter((item) => /card[aá]pio|al[eé]rgen/i.test(`${item.title} ${item.text}`))
        .slice(0, 5)
        .map(({ id, title, text, date }) => ({ id, title, text, date }));
    res.set('Cache-Control', 'no-store');
    res.json({ student: { name: student.name, className: student.className }, today, menu: publishedMenu, notifications, confirmed: Boolean(attendance), selectedMeals: selection?.meals || attendance?.meals || [] });
});

app.post('/api/student/attendance', async (req, res) => {
    if (!requireStudent(req, res)) return;
    const date = getCurrentDate();
    const store = await readStore(date);
    const student = store.students.find((item) => item.id === req.auth.studentId);
    if (!student) return res.status(401).json({ error: 'Acesso do aluno expirado. Entre novamente.' });
    const selectedMeals = Array.isArray(req.body.meals) ? [...new Set(req.body.meals)] : [];
    const availableMeals = store.menu.filter((item) => item.date === date && item.status === 'Publicado').map(normalizeMenuItem).map((item) => item.mealType);
    if (selectedMeals.some((mealType) => !mealTypes.includes(mealType) || !availableMeals.includes(mealType))) return res.status(400).json({ error: 'Escolha somente refeições publicadas para hoje.' });
    if (store.attendance.some((item) => item.studentId === student.id && item.date === date)) return res.status(409).json({ error: 'Sua presença já foi confirmada hoje.' });
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    try {
        await recordStudentAttendance(
            { id: Date.now(), studentId: student.id, date, meals: selectedMeals },
            { id: Date.now() + 1, studentId: student.id, date, time, method: 'Código do aluno', meals: selectedMeals }
        );
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Sua presença já foi confirmada hoje.' });
        throw error;
    }
    res.status(201).json({ name: student.name, date, time, meals: selectedMeals });
});

app.get('/api/dashboard', async (req, res) => {
    if (!requireEmployee(req, res)) return;
    const today = getCurrentDate();
    const store = await readStore(today);
    const todayAttendance = store.attendance.filter((item) => item.date === today);
    const activeStudents = store.students.filter((student) => !student.status || student.status === 'ativo');
    const prepared = store.meals.options.reduce((total, option) => total + Number(option.prepared || 0), 0);
    res.json({ date: today, students: activeStudents.length, present: todayAttendance.length, prepared, consumed: store.meals.consumed, mealOptions: store.meals.options, menu: store.menu.map(normalizeMenuItem), attendance: todayAttendance.map((item) => ({ ...item, student: store.students.find((student) => student.id === item.studentId) })), notifications: store.notifications, studentsList: store.students, guardians: store.guardians });
});

app.patch('/api/meals/prepared', async (req, res) => {
    if (!requireEmployee(req, res)) return;
    const prepared = req.body?.prepared;
    if (!prepared || typeof prepared !== 'object' || Array.isArray(prepared) || mealTypes.some((id) => !Number.isSafeInteger(prepared[id]) || prepared[id] < 0)) {
        return res.status(400).json({ error: 'Informe uma quantidade válida para cada refeição.' });
    }
    const result = await updateMealOptions('prepared', prepared, getCurrentDate());
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ prepared: result.total, mealOptions: result.options });
});

app.patch('/api/meals/consumed', async (req, res) => {
    if (!requireEmployee(req, res)) return;
    const consumed = req.body?.consumed;
    if (!consumed || typeof consumed !== 'object' || Array.isArray(consumed) || mealTypes.some((id) => !Number.isSafeInteger(consumed[id]) || consumed[id] < 0)) {
        return res.status(400).json({ error: 'Informe uma quantidade válida para cada refeição.' });
    }
    const result = await updateMealOptions('consumed', consumed, getCurrentDate());
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ consumed: result.total, mealOptions: result.options });
});

app.post('/api/students', async (req, res) => {
    if (!requireEmployee(req, res)) return;
    const store = await readStore();
    const { name, enrollment, className, birthDate = '', gender = '', guardianName = '', guardianPhone = '', address = '', status = 'ativo', restrictions = [] } = req.body;
    if (!name || !enrollment || !className) return res.status(400).json({ error: 'Preencha nome, matrícula e turma.' });
    if (!['ativo', 'inativo', 'transferido'].includes(status)) return res.status(400).json({ error: 'Status de aluno inválido.' });
    if (store.students.some((student) => student.enrollment === enrollment)) return res.status(409).json({ error: 'Esta matrícula já está cadastrada.' });
    const student = await createStudent({ name: String(name).trim(), enrollment: String(enrollment).trim(), accessCode: generateStudentAccessCode(store.students), className: String(className).trim(), birthDate, gender: String(gender).trim(), guardianName: String(guardianName).trim(), guardianPhone: String(guardianPhone).trim(), address: String(address).trim(), status, restrictions: Array.isArray(restrictions) ? restrictions.map(String).map((item) => item.trim()).filter(Boolean) : [] });
    res.status(201).json(student);
});

app.patch('/api/students/:id/status', async (req, res) => {
    if (!requireEmployee(req, res)) return;
    if (!['ativo', 'inativo', 'transferido'].includes(req.body.status)) return res.status(400).json({ error: 'Status de aluno inválido.' });
    const updated = await updateStudentStatus(req.params.id, req.body.status);
    if (!updated) return res.status(404).json({ error: 'Aluno não encontrado.' });
    res.json({ id: Number(req.params.id), status: req.body.status });
});

app.delete('/api/students', async (req, res) => {
    if (!requireEmployee(req, res)) return;
    if (!passwordMatches(req.body.password)) return res.status(401).json({ error: 'Senha administrativa incorreta.' });
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
    if (!ids.length) return res.status(400).json({ error: 'Selecione pelo menos uma matrícula.' });
    const removedCount = await deleteStudents(ids);
    if (!removedCount) return res.status(404).json({ error: 'Nenhuma matrícula selecionada foi encontrada.' });
    res.json({ removedCount });
});

app.patch('/api/students/:id/restrictions', async (req, res) => {
    if (!requireEmployee(req, res)) return;
    const restrictions = Array.isArray(req.body.restrictions) ? req.body.restrictions : [];
    const updated = await updateStudentRestrictions(req.params.id, restrictions);
    if (!updated) return res.status(404).json({ error: 'Aluno não encontrado.' });
    res.json({ id: Number(req.params.id), restrictions });
});

app.post('/api/menu', async (req, res) => {
    if (!requireEmployee(req, res)) return;
    const store = await readStore();
    const { date, meal, dessert, allergens = [], status = 'Publicado', mealType = 'almoco' } = req.body;
    if (!date || !meal) return res.status(400).json({ error: 'Informe data e prato principal.' });
    if (!mealTypes.includes(mealType)) return res.status(400).json({ error: 'Tipo de refeição inválido.' });
    const menuItem = { id: Date.now(), date, mealType, meal, dessert: dessert || '', allergens: Array.isArray(allergens) ? allergens : [], status };
    const previous = store.menu.find((item) => item.date === date && normalizeMenuItem(item).mealType === mealType);
    const previousSnapshot = previous && JSON.stringify({ meal: previous.meal, dessert: previous.dessert || '', allergens: previous.allergens || [], status: previous.status });
    const nextSnapshot = JSON.stringify({ meal: menuItem.meal, dessert: menuItem.dessert, allergens: menuItem.allergens, status: menuItem.status });
    if (previous) menuItem.id = previous.id;
    await saveMenuItem(menuItem);
    if (status === 'Publicado' && (!previous || previousSnapshot !== nextSnapshot)) {
        await saveNotification({ id: Date.now() + Math.random(), title: previous ? 'Cardápio alterado' : 'Novo cardápio publicado', text: `Confira a refeição de ${date}.`, date: 'agora', read: false });
    }
    res.status(201).json(menuItem);
});

app.put('/api/menu/week', async (req, res) => {
    if (!requireEmployee(req, res)) return;
    const days = Array.isArray(req.body.days) ? req.body.days : [];
    const invalidWeek = days.length !== 5 || days.some((day, index) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) return true;
        const date = new Date(`${day.date}T00:00:00Z`);
        return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day.date || date.getUTCDay() !== index + 1 || !day.meals || mealTypes.some((type) => !day.meals[type] || !String(day.meals[type].meal || '').trim());
    });
    if (invalidWeek) {
        return res.status(400).json({ error: 'Informe uma semana de segunda a sexta com as três refeições de cada dia.' });
    }

    const store = await readStore();
    const updatedMenu = [];
    const changedDates = [];
    const daysToSave = [];
    days.forEach((day) => {
        const oldItems = menuForDate(store.menu, day.date).filter((item) => mealTypes.includes(item.mealType));
        const newItems = mealTypes.map((mealType) => {
            const entry = day.meals[mealType];
            return { date: day.date, mealType, meal: String(entry.meal).trim(), dessert: String(entry.dessert || '').trim(), allergens: Array.isArray(entry.allergens) ? entry.allergens.map(String).map((value) => value.trim()).filter(Boolean) : [], status: 'Publicado' };
        });
        const oldSnapshot = oldItems.map(({ mealType, meal, dessert, allergens }) => ({ mealType, meal, dessert: dessert || '', allergens })).sort((a, b) => mealTypes.indexOf(a.mealType) - mealTypes.indexOf(b.mealType));
        const newSnapshot = newItems.map(({ mealType, meal, dessert, allergens }) => ({ mealType, meal, dessert, allergens }));
        if (JSON.stringify(oldSnapshot) !== JSON.stringify(newSnapshot)) changedDates.push(day.date);
        newItems.forEach((item) => {
            const oldItem = store.menu.find((existing) => existing.date === day.date && normalizeMenuItem(existing).mealType === item.mealType);
            item.id = oldItem ? oldItem.id : Date.now() + Math.random();
            updatedMenu.push(item);
        });
        daysToSave.push({ date: day.date, meals: newItems });
    });
    const notifications = changedDates.map((date) => ({ id: Date.now() + Math.random(), title: 'Cardápio alterado', text: `O cardápio de ${date} foi atualizado. Confira as refeições e os alérgenos.`, date: 'agora', read: false }));
    await replaceMenuWeek(daysToSave, notifications);
    res.json({ days: updatedMenu, changedDates });
});

app.get('/api/reports', async (req, res) => {
    if (!requireEmployee(req, res)) return;
    const store = await readStore(getCurrentDate());
    const countByClass = store.students.reduce((result, student) => { result[student.className] = (result[student.className] || 0) + store.attendance.filter((item) => item.studentId === student.id).length; return result; }, {});
    res.json({ meals: store.meals, attendanceTotal: store.attendance.length, countByClass });
});

export default app;
