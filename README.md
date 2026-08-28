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
- Operação de cobrança sincronizada em modo somente leitura com o ERP CAEZ.

## Desenvolvimento

```bash
npm ci
npm run dev
```

Variáveis obrigatórias:

```env
DATABASE_URL=postgresql://...
DATABASE_SCHEMA=star_profissoes
CAEZ_TOKEN_ENCRYPTION_KEY=gere-uma-chave-aleatoria-forte-e-preserve-a
CRON_SECRET=gere-um-segredo-aleatorio-forte
```

O schema `star_profissoes` é exclusivo deste projeto. As migrações ficam em `db/migrations`.

## Financeiro CAEZ

O token de integração é cadastrado por unidade na interface do Financeiro e armazenado com
AES-256-GCM. `CAEZ_TOKEN_ENCRYPTION_KEY` deve ser estável: sua troca impede a leitura dos tokens
já armazenados.

A sincronização manual apenas cria um job persistente. Configure o Easypanel para chamar, a cada
minuto, `GET /api/cron/financeiro-caez-sync` com o header
`Authorization: Bearer <CRON_SECRET>`. Cada execução processa uma turma e no máximo três consultas
financeiras simultâneas.

## Verificações

```bash
npm run lint
npm run build
npm audit
```
