# Star Profissões CRM

CRM independente da Star Profissões, com frontend e backend TanStack Start, autenticação por sessão e persistência em PostgreSQL.

## Módulos

- Dashboard com indicadores reais da unidade ativa.
- CRM em kanban, filtros, busca, criação e edição de leads.
- Tarefas, notificações e transferência de responsável.
- Alunos originados pela conversão de leads matriculados.
- Cadastro de cursos, canais de aquisição e turmas/atendimentos.
- Administração de usuários, perfis de acesso e unidades.
- Perfil do usuário com alteração de dados, avatar e senha.

## Desenvolvimento

```bash
npm ci
npm run dev
```

Variáveis obrigatórias:

```env
DATABASE_URL=postgresql://...
DATABASE_SCHEMA=star_profissoes
```

O schema `star_profissoes` é exclusivo deste projeto. As migrações ficam em `db/migrations`.

## Verificações

```bash
npm run lint
npm run build
npm audit
```
