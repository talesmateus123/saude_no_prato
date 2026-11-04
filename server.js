import dotenv from 'dotenv';
import express from 'express';
import app from './routes.js';
import { initializeDatabase } from './database.js';

dotenv.config();

const port = process.env.PORT || 3000;

// Middleware para servir arquivos estáticos (CSS, JS, imagens)
app.use(express.static('public'));

// Middleware para parsear dados do formulário
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Configurar o EJS como motor de templates
app.set('view engine', 'ejs');

// Inicializar banco antes de aceitar requisições.
initializeDatabase().then(() => {
    app.listen(port, () => {
        console.log(`Servidor rodando em http://localhost:${port}`);
    });
}).catch((error) => {
    console.error('Não foi possível inicializar o banco de dados:', error);
    process.exitCode = 1;
});