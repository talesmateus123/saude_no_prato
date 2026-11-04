import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));
const mealTypes = ['cafe-da-manha', 'almoco', 'jantar'];
export function getCurrentDate() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
const pool = mysql.createPool({
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT || 3306),
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'prato_vivo',
    waitForConnections: true,
    connectionLimit: 10,
    supportBigNumbers: true,
    bigNumberStrings: false,
    dateStrings: true,
    timezone: 'Z'
});

const initialData = {
    students: [],
    guardians: [],
    menu: [
        { id: 1, date: '2026-09-16', meal: 'Arroz, feijão, frango assado e salada', dessert: 'Banana', allergens: [], status: 'Publicado' },
        { id: 2, date: '2026-09-17', meal: 'Macarrão ao molho de tomate e legumes', dessert: 'Maçã', allergens: ['Glúten'], status: 'Publicado' },
        { id: 3, date: '2026-09-18', meal: 'Arroz colorido, carne moída e abóbora', dessert: 'Melancia', allergens: [], status: 'Publicado' },
        { id: 4, date: '2026-09-19', meal: 'Sopa de legumes com pão integral', dessert: 'Laranja', allergens: ['Glúten'], status: 'Rascunho' }
    ],
    attendance: [],
    notifications: [
        { id: 1, title: 'Cardápio de amanhã publicado', text: 'Macarrão ao molho de tomate estará no almoço.', date: '16 set, 09:42', read: false },
        { id: 2, title: 'Atenção aos alergênicos', text: 'O cardápio de amanhã contém glúten.', date: '15 set, 16:10', read: true }
    ],
    meals: {
        options: [
            { id: 'cafe-da-manha', label: 'Café da manhã', active: true, prepared: 42, consumed: 38 },
            { id: 'almoco', label: 'Almoço', active: true, prepared: 52, consumed: 47 },
            { id: 'jantar', label: 'Jantar', active: true, prepared: 38, consumed: 33 }
        ]
    },
    mealSelections: []
};

const numericId = (value) => {
    const converted = Number(value);
    return Number.isFinite(converted) ? converted : value;
};
const dateOnly = (value) => value ? String(value).slice(0, 10) : '';
const toDateOrNull = (value) => value ? dateOnly(value) : null;

async function execute(connection, sql, parameters = []) {
    const [result] = await connection.execute(sql, parameters);
    return result;
}

export async function query(sql, parameters = []) {
    const [result] = await pool.execute(sql, parameters);
    return result;
}

export async function withTransaction(work) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await work(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

function uniqueAccessCode(usedCodes) {
    let code;
    do {
        code = randomBytes(5).toString('hex').toUpperCase();
    } while (usedCodes.has(code));
    usedCodes.add(code);
    return code;
}

export function generateStudentAccessCode(students) {
    const usedCodes = new Set(students.map((student) => String(student.accessCode || '').toUpperCase()));
    return uniqueAccessCode(usedCodes);
}

export async function readStore(activityDate = getCurrentDate()) {
    const [studentRows, restrictionRows, guardianRows, guardianStudentRows, menuRows, allergenRows, attendanceRows, attendanceMealRows, selectionRows, selectionMealRows, notificationRows, optionRows] = await Promise.all([
        query('SELECT * FROM students ORDER BY id'),
        query('SELECT student_id, restriction_text FROM student_restrictions ORDER BY student_id, position'),
        query('SELECT guardian_key, payload FROM guardians ORDER BY guardian_key'),
        query('SELECT guardian_key, student_id FROM guardian_students ORDER BY guardian_key, student_id'),
        query('SELECT id, menu_date, meal_type, meal, dessert, status FROM menu_items ORDER BY menu_date, meal_type'),
        query('SELECT menu_item_id, allergen FROM menu_item_allergens ORDER BY menu_item_id, position'),
        query('SELECT id, student_id, attendance_date, attendance_time, method FROM attendance ORDER BY attendance_date DESC, id DESC'),
        query('SELECT attendance_id, meal_type FROM attendance_meals ORDER BY attendance_id, meal_type'),
        query('SELECT id, student_id, selection_date FROM meal_selections ORDER BY selection_date DESC, id DESC'),
        query('SELECT selection_id, meal_type FROM meal_selection_items ORDER BY selection_id, meal_type'),
        query('SELECT id, title, body, date_label, is_read FROM notifications ORDER BY id DESC'),
        query('SELECT options.id, options.label, options.active, COALESCE(daily.prepared, 0) AS prepared, COALESCE(daily.consumed, 0) AS consumed FROM meal_options AS options LEFT JOIN meal_option_daily AS daily ON daily.meal_option_id = options.id AND daily.activity_date = ?', [activityDate])
    ]);

    const students = studentRows.map((row) => ({
        id: Number(row.id), name: row.name, enrollment: row.enrollment, accessCode: row.access_code,
        className: row.class_name, birthDate: dateOnly(row.birth_date), gender: row.gender,
        guardianName: row.guardian_name, guardianPhone: row.guardian_phone, address: row.address,
        status: row.status, restrictions: []
    }));
    const studentsById = new Map(students.map((student) => [String(student.id), student]));
    for (const row of restrictionRows) studentsById.get(String(row.student_id))?.restrictions.push(row.restriction_text);

    const guardians = guardianRows.map((row) => ({ ...(typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload), studentIds: [] }));
    const guardiansById = new Map(guardianRows.map((row, index) => [String(row.guardian_key), guardians[index]]));
    for (const row of guardianStudentRows) guardiansById.get(String(row.guardian_key))?.studentIds.push(Number(row.student_id));

    const menu = menuRows.map((row) => ({ id: numericId(row.id), date: dateOnly(row.menu_date), mealType: row.meal_type, meal: row.meal, dessert: row.dessert, status: row.status, allergens: [] }));
    const menuById = new Map(menuRows.map((row, index) => [String(row.id), menu[index]]));
    for (const row of allergenRows) menuById.get(String(row.menu_item_id))?.allergens.push(row.allergen);

    const attendance = attendanceRows.map((row) => ({ id: Number(row.id), studentId: Number(row.student_id), date: dateOnly(row.attendance_date), time: row.attendance_time, method: row.method, meals: [] }));
    const attendanceById = new Map(attendance.map((item) => [String(item.id), item]));
    for (const row of attendanceMealRows) attendanceById.get(String(row.attendance_id))?.meals.push(row.meal_type);

    const mealSelections = selectionRows.map((row) => ({ id: Number(row.id), studentId: Number(row.student_id), date: dateOnly(row.selection_date), meals: [] }));
    const selectionsById = new Map(mealSelections.map((item) => [String(item.id), item]));
    for (const row of selectionMealRows) selectionsById.get(String(row.selection_id))?.meals.push(row.meal_type);

    const options = optionRows.map((row) => ({ id: row.id, label: row.label, active: Boolean(row.active), prepared: Number(row.prepared), consumed: Number(row.consumed) }));
    return {
        students, guardians, menu, attendance,
        notifications: notificationRows.map((row) => ({ id: numericId(row.id), title: row.title, text: row.body, date: row.date_label, read: Boolean(row.is_read) })),
        meals: {
            prepared: options.reduce((total, option) => total + option.prepared, 0),
            consumed: options.reduce((total, option) => total + option.consumed, 0),
            options
        },
        mealSelections
    };
}

export async function createStudent(student) {
    return withTransaction(async (connection) => {
        const result = await execute(connection,
            'INSERT INTO students (name, enrollment, access_code, class_name, birth_date, gender, guardian_name, guardian_phone, address, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [student.name, student.enrollment, student.accessCode, student.className, toDateOrNull(student.birthDate), student.gender, student.guardianName, student.guardianPhone, student.address, student.status]);
        const id = Number(result.insertId);
        for (const [position, restriction] of student.restrictions.entries()) {
            await execute(connection, 'INSERT INTO student_restrictions (student_id, position, restriction_text) VALUES (?, ?, ?)', [id, position, restriction]);
        }
        return { ...student, id };
    });
}

export async function updateStudentStatus(id, status) {
    const result = await query('UPDATE students SET status = ? WHERE id = ?', [status, id]);
    return result.affectedRows > 0;
}

export async function updateStudentRestrictions(id, restrictions) {
    return withTransaction(async (connection) => {
        const [students] = await connection.execute('SELECT id FROM students WHERE id = ? FOR UPDATE', [id]);
        if (!students.length) return false;
        await execute(connection, 'DELETE FROM student_restrictions WHERE student_id = ?', [id]);
        for (const [position, restriction] of restrictions.entries()) {
            await execute(connection, 'INSERT INTO student_restrictions (student_id, position, restriction_text) VALUES (?, ?, ?)', [id, position, restriction]);
        }
        return true;
    });
}

export async function deleteStudents(ids) {
    return withTransaction(async (connection) => {
        const placeholders = ids.map(() => '?').join(', ');
        const result = await execute(connection, `DELETE FROM students WHERE id IN (${placeholders})`, ids);
        await execute(connection, 'DELETE FROM guardians WHERE NOT EXISTS (SELECT 1 FROM guardian_students WHERE guardian_students.guardian_key = guardians.guardian_key)');
        return result.affectedRows;
    });
}

export async function updateMealOptions(field, values, activityDate = getCurrentDate()) {
    const column = field === 'prepared' || field === 'consumed' ? field : null;
    if (!column) throw new Error('Campo de porções inválido.');
    return withTransaction(async (connection) => {
        await execute(connection, 'INSERT IGNORE INTO meal_option_daily (activity_date, meal_option_id) SELECT ?, id FROM meal_options', [activityDate]);
        const [options] = await connection.execute('SELECT options.id, daily.prepared, daily.consumed FROM meal_options AS options JOIN meal_option_daily AS daily ON daily.meal_option_id = options.id AND daily.activity_date = ? FOR UPDATE', [activityDate]);
        const byId = new Map(options.map((option) => [option.id, option]));
        if (mealTypes.some((id) => !byId.has(id))) throw new Error('As opções de refeição não estão configuradas.');
        if (column === 'prepared' && mealTypes.some((id) => values[id] < Number(byId.get(id).consumed))) {
            return { error: 'As porções preparadas não podem ser menores do que as já servidas.' };
        }
        if (column === 'consumed' && mealTypes.some((id) => values[id] > Number(byId.get(id).prepared))) {
            return { error: 'As porções servidas não podem superar as porções preparadas.' };
        }
        for (const id of mealTypes) await execute(connection, `UPDATE meal_option_daily SET ${column} = ? WHERE activity_date = ? AND meal_option_id = ?`, [values[id], activityDate, id]);
        const [updated] = await connection.execute('SELECT options.id, options.label, options.active, daily.prepared, daily.consumed FROM meal_options AS options JOIN meal_option_daily AS daily ON daily.meal_option_id = options.id AND daily.activity_date = ? ORDER BY options.sort_position', [activityDate]);
        const normalized = updated.map((option) => ({ id: option.id, label: option.label, active: Boolean(option.active), prepared: Number(option.prepared), consumed: Number(option.consumed) }));
        const total = normalized.reduce((sum, option) => sum + option[column], 0);
        return { total, options: normalized };
    });
}

export async function recordStudentAttendance(selection, attendance) {
    return withTransaction(async (connection) => {
        await execute(connection, 'INSERT INTO meal_selections (id, student_id, selection_date) VALUES (?, ?, ?)', [selection.id, selection.studentId, selection.date]);
        for (const mealType of selection.meals) await execute(connection, 'INSERT INTO meal_selection_items (selection_id, meal_type) VALUES (?, ?)', [selection.id, mealType]);
        await execute(connection, 'INSERT INTO attendance (id, student_id, attendance_date, attendance_time, method) VALUES (?, ?, ?, ?, ?)', [attendance.id, attendance.studentId, attendance.date, attendance.time, attendance.method]);
        for (const mealType of attendance.meals) await execute(connection, 'INSERT INTO attendance_meals (attendance_id, meal_type) VALUES (?, ?)', [attendance.id, mealType]);
    });
}

async function insertMenuItem(connection, item) {
    const id = String(item.id);
    await execute(connection, 'INSERT INTO menu_items (id, menu_date, meal_type, meal, dessert, status) VALUES (?, ?, ?, ?, ?, ?)', [id, item.date, item.mealType || 'almoco', item.meal, item.dessert || '', item.status]);
    for (const [position, allergen] of (item.allergens || []).entries()) {
        await execute(connection, 'INSERT INTO menu_item_allergens (menu_item_id, position, allergen) VALUES (?, ?, ?)', [id, position, allergen]);
    }
}

export async function saveMenuItem(item) {
    return withTransaction(async (connection) => {
        const [existing] = await connection.execute('SELECT id FROM menu_items WHERE menu_date = ? AND meal_type = ? FOR UPDATE', [item.date, item.mealType || 'almoco']);
        if (existing.length) await execute(connection, 'DELETE FROM menu_items WHERE id = ?', [existing[0].id]);
        await insertMenuItem(connection, item);
    });
}

export async function replaceMenuWeek(days, notifications) {
    return withTransaction(async (connection) => {
        const dates = days.map((day) => day.date);
        const placeholders = dates.map(() => '?').join(', ');
        await execute(connection, `DELETE FROM menu_items WHERE menu_date IN (${placeholders})`, dates);
        for (const day of days) for (const item of day.meals) await insertMenuItem(connection, item);
        for (const item of notifications) {
            await execute(connection, 'INSERT INTO notifications (id, title, body, date_label, is_read) VALUES (?, ?, ?, ?, ?)', [String(item.id), item.title, item.text, item.date, item.read]);
        }
    });
}

export async function saveNotification(notification) {
    await query('INSERT INTO notifications (id, title, body, date_label, is_read) VALUES (?, ?, ?, ?, ?)', [String(notification.id), notification.title, notification.text, notification.date, notification.read]);
}

async function importLegacyStore(connection, data) {
    const students = Array.isArray(data.students) ? data.students : [];
    const knownStudentIds = new Set();
    const accessCodes = new Set();
    for (const student of students) {
        let accessCode = String(student.accessCode || '').toUpperCase();
        if (!/^[A-F0-9]{10}$/.test(accessCode) || accessCodes.has(accessCode)) accessCode = uniqueAccessCode(accessCodes);
        else accessCodes.add(accessCode);
        await execute(connection,
            'INSERT INTO students (id, name, enrollment, access_code, class_name, birth_date, gender, guardian_name, guardian_phone, address, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [student.id, student.name || '', String(student.enrollment || ''), accessCode, student.className || '', toDateOrNull(student.birthDate), student.gender || '', student.guardianName || '', student.guardianPhone || '', student.address || '', student.status || 'ativo']);
        knownStudentIds.add(String(student.id));
        for (const [position, restriction] of (Array.isArray(student.restrictions) ? student.restrictions : []).entries()) {
            await execute(connection, 'INSERT INTO student_restrictions (student_id, position, restriction_text) VALUES (?, ?, ?)', [student.id, position, String(restriction)]);
        }
    }

    for (const [index, guardian] of (Array.isArray(data.guardians) ? data.guardians : []).entries()) {
        const key = String(guardian.id ?? index + 1);
        await execute(connection, 'INSERT INTO guardians (guardian_key, payload) VALUES (?, ?)', [key, JSON.stringify(guardian)]);
        for (const studentId of guardian.studentIds || []) {
            if (knownStudentIds.has(String(studentId))) await execute(connection, 'INSERT IGNORE INTO guardian_students (guardian_key, student_id) VALUES (?, ?)', [key, studentId]);
        }
    }

    for (const [index, item] of (Array.isArray(data.menu) ? data.menu : []).entries()) {
        await insertMenuItem(connection, { ...item, id: item.id ?? `legacy-menu-${index + 1}`, mealType: item.mealType || 'almoco', dessert: item.dessert || '', allergens: item.allergens || [] });
    }
    for (const item of Array.isArray(data.attendance) ? data.attendance : []) {
        if (!knownStudentIds.has(String(item.studentId))) continue;
        await execute(connection, 'INSERT INTO attendance (id, student_id, attendance_date, attendance_time, method) VALUES (?, ?, ?, ?, ?)', [item.id, item.studentId, item.date, item.time || '', item.method || '']);
        for (const mealType of item.meals || []) await execute(connection, 'INSERT INTO attendance_meals (attendance_id, meal_type) VALUES (?, ?)', [item.id, mealType]);
    }
    let skippedSelections = 0;
    for (const item of Array.isArray(data.mealSelections) ? data.mealSelections : []) {
        if (!knownStudentIds.has(String(item.studentId))) {
            skippedSelections += 1;
            continue;
        }
        await execute(connection, 'INSERT INTO meal_selections (id, student_id, selection_date) VALUES (?, ?, ?)', [item.id, item.studentId, item.date]);
        for (const mealType of item.meals || []) await execute(connection, 'INSERT INTO meal_selection_items (selection_id, meal_type) VALUES (?, ?)', [item.id, mealType]);
    }
    if (skippedSelections) console.warn(`Migração: ${skippedSelections} seleção(ões) sem aluno correspondente foram ignoradas.`);

    for (const [index, notification] of (Array.isArray(data.notifications) ? data.notifications : []).entries()) {
        await execute(connection, 'INSERT INTO notifications (id, title, body, date_label, is_read) VALUES (?, ?, ?, ?, ?)', [String(notification.id ?? `legacy-notification-${index + 1}`), notification.title || '', notification.text || '', notification.date || '', Boolean(notification.read)]);
    }
    const options = data.meals?.options?.length ? data.meals.options : initialData.meals.options;
    for (const [position, option] of options.entries()) {
        const id = option.id === 'janta' ? 'jantar' : option.id;
        const fallback = initialData.meals.options.find((item) => item.id === id);
        await execute(connection, 'INSERT INTO meal_options (id, label, active, prepared, consumed, sort_position) VALUES (?, ?, ?, ?, ?, ?)', [id, id === 'jantar' ? 'Jantar' : option.label || fallback?.label || id, option.active !== false, Number(option.prepared || 0), Number(option.consumed || 0), position]);
    }
}

export async function initializeDatabase() {
    const schema = await fs.readFile(path.join(projectDirectory, 'database', 'schema.sql'), 'utf8');
    for (const statement of schema.split(';').map((part) => part.trim()).filter(Boolean)) await pool.query(statement);

    const lockName = 'prato_vivo_initial_data_migration';
    const [lockRows] = await pool.query('SELECT GET_LOCK(?, 30) AS acquired', [lockName]);
    if (Number(lockRows[0].acquired) !== 1) throw new Error('Não foi possível obter o bloqueio para inicializar o banco de dados.');
    try {
        const [migrations] = await pool.execute('SELECT migration_name FROM schema_migrations WHERE migration_name = ?', ['store-json-v1']);
        if (!migrations.length) {
            let data;
            try {
                data = JSON.parse(await fs.readFile(path.join(projectDirectory, 'data', 'store.json'), 'utf8'));
            } catch (error) {
                if (error.code !== 'ENOENT') throw error;
                data = initialData;
            }
            await withTransaction(async (connection) => {
                await importLegacyStore(connection, data);
                await execute(connection, 'INSERT INTO schema_migrations (migration_name) VALUES (?)', ['store-json-v1']);
            });
            console.log('Banco MySQL inicializado; migração dos dados locais concluída.');
        }
        const [dailyMigrations] = await pool.execute('SELECT migration_name FROM schema_migrations WHERE migration_name = ?', ['daily-meal-options-v1']);
        if (!dailyMigrations.length) await withTransaction(async (connection) => {
            await execute(connection, 'INSERT IGNORE INTO meal_option_daily (activity_date, meal_option_id, prepared, consumed) SELECT ?, id, prepared, consumed FROM meal_options', [getCurrentDate()]);
            await execute(connection, 'INSERT INTO schema_migrations (migration_name) VALUES (?)', ['daily-meal-options-v1']);
        });
    } finally {
        await pool.query('SELECT RELEASE_LOCK(?)', [lockName]);
    }
}