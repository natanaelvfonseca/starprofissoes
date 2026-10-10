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

## Configurações comerciais

As etapas exibidas usam os IDs, nomes, cores e posições de `app_pipeline_columns` da unidade. O significado comercial (`semantic_stage`) permanece separado do nome exibido para preservar fila compartilhada, matrícula e automações. O seletor do card move pela mesma API do Kanban e salva a etapa ao selecionar.

Os nomes de canais vêm de `app_acquisition_channels`; snapshots são apenas fallback para vínculos antigos/removidos. A migration `034_commercial_configuration_defaults.sql` registra a inicialização dos canais por unidade, impedindo recriação de nomes padrão após renomear ou excluir. O runtime aplica somente essa tabela adicional, sem reexecutar o schema comercial.

Alterações de cadastro notificam as telas e outras abas via evento/BroadcastChannel (com fallback de storage); foco, visibilidade e polling atualizam outras sessões. O Kanban usa toda a altura das colunas como destino e rolagem horizontal nas bordas durante o arraste.

`npm test` cobre resolução/contagem por ID, sincronização entre abas e rolagem. O teste de persistência PostgreSQL pode ser executado com `STAR_TEST_DATABASE_URL` definido; ele cria apenas tabelas temporárias com `search_path=pg_temp` e termina com rollback, sem modificar tabelas reais.
