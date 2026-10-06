import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dataDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const dataFile = path.join(dataDirectory, 'store.json');

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
        prepared: 132,
        consumed: 118,
        options: [
            { id: 'cafe-da-manha', label: 'Café da manhã', active: true, prepared: 42, consumed: 38 },
            { id: 'almoco', label: 'Almoço', active: true, prepared: 52, consumed: 47 },
            { id: 'jantar', label: 'Jantar', active: true, prepared: 38, consumed: 33 }
        ]
    },
    mealSelections: []
};

function ensureStore() {
    fs.mkdirSync(dataDirectory, { recursive: true });
    if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, JSON.stringify(initialData, null, 2));
}

export function generateStudentAccessCode(students) {
    let code;
    do {
        code = randomBytes(5).toString('hex').toUpperCase();
    } while (students.some((student) => student.accessCode === code));
    return code;
}

export function readStore() {
    ensureStore();
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    let mealsChanged = false;
    if (!data.meals.options) {
        data.meals.options = initialData.meals.options;
        mealsChanged = true;
    }
    data.meals.options.forEach((option) => {
        if (option.id === 'janta') {
            option.id = 'jantar';
            option.label = 'Jantar';
            mealsChanged = true;
        }
    });
    if (!data.mealSelections) data.mealSelections = [];
    const accessCodes = new Set();
    let codesChanged = false;
    data.students.forEach((student) => {
        const existingCode = String(student.accessCode || '').toUpperCase();
        if (!/^[A-F0-9]{10}$/.test(existingCode) || accessCodes.has(existingCode)) {
            student.accessCode = generateStudentAccessCode([...data.students.filter((item) => item !== student), ...[...accessCodes].map((accessCode) => ({ accessCode }))]);
            codesChanged = true;
        } else {
            student.accessCode = existingCode;
        }
        accessCodes.add(student.accessCode);
    });
    if (codesChanged || mealsChanged) fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    return data;
}

export function writeStore(data) {
    ensureStore();
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    return data;
}