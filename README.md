# Saúde no Prato

Painel de alimentação escolar para acompanhar presença, cardápio, restrições alimentares, consumo e relatórios.

## Executar

Requer Node.js 18 ou superior.

```bash
npm install
npm start
```

Ajuste `STAFF_PASSWORD` e `JWT_SECRET` no arquivo `.env` usando `.env.example` como referência. Acesse `http://localhost:3000` para entrar na área da equipe ou `http://localhost:3000/aluno` para o portal do aluno. O modo de desenvolvimento usa `npm run dev`.

## Funcionalidades

- Dashboard com alunos ativos, presenças e refeições; equipe registra as porções preparadas por refeição.
- Portais separados: funcionários entram com senha; alunos entram com sua matrícula ou código individual.
- O aluno consulta cardápio e confirma a própria presença no portal, uma vez por dia, com ou sem cardápio publicado.
- Três refeições obrigatórias por dia útil: café da manhã, almoço e jantar.
- Cadastro de alunos e restrições alimentares.
- Cadastro de cardápio semanal e alérgenos por refeição.
- Avisos de publicação de cardápio.
- Relatórios de refeições e presença por turma, com exportação JSON.
- APIs de funcionário protegidas por sessão, além das APIs do portal do aluno.
- Layout responsivo para celular, tablet, desktop e totens.

## Dados

Durante o MVP, os dados persistem em `data/store.json`, criado automaticamente com registros de demonstração. Essa camada mantém a aplicação executável sem dependência de infraestrutura externa e pode ser substituída por MySQL ou outro adaptador mantendo as rotas REST.

## Estrutura

- `server.js`: inicialização do Express.
- `routes.js`: páginas e API REST.
- `database.js`: armazenamento persistente local.
- `views/index.ejs`: painel administrativo.
- `public/css/main.css`: identidade visual responsiva.
- `public/js/app.js`: navegação e integração com a API.
