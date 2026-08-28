import type { PoolClient } from "pg";
import {
  createCaezClient,
  formatCaezDate,
  parseCaezDate,
  type CaezClass,
  type CaezFinancialTitle,
  type CaezStudent,
} from "@/lib/server/caez-client";
import { queryDb, withTransaction } from "@/lib/server/db";
import { decryptCaezToken, encryptCaezToken } from "@/lib/server/caez-token-crypto";
import { ensureFinancialSchema } from "@/lib/server/financial-schema";

const PROVIDER = "caez";
const DEFAULT_BASE_URL = "https://app.caezescola.com.br/api/";

type IntegrationRow = {
  id: string;
  unit_id: string;
  base_url: string;
  token_encrypted: string;
  active: boolean;
  sync_past_days: number;
  sync_future_days: number;
  last_sync_at: string | null;
  last_successful_sync_at: string | null;
  last_error: string | null;
};

type SyncCheckpoint = {
  phase?: "classes";
  classes?: Array<CaezClass>;
  classIndex?: number;
  leaseUntil?: string;
};

function safeInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 3650 ? parsed : fallback;
}

function phone(values: unknown) {
  if (!Array.isArray(values)) return "";
  const first = values[0] as { ddd?: unknown; numero?: unknown } | undefined;
  return first ? `${String(first.ddd ?? "")}${String(first.numero ?? "")}`.replace(/\D/g, "") : "";
}

function email(values: unknown) {
  if (!Array.isArray(values)) return "";
  const first = values[0] as { email?: unknown } | undefined;
  return typeof first?.email === "string" ? first.email.trim() : "";
}

function documentDigits(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function titleStatus(dueDate: string) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  );
  return dueDate > today ? "upcoming" : dueDate === today ? "due_today" : "overdue";
}

async function integrationForUnit(unitId: string) {
  await ensureFinancialSchema();
  const result = await queryDb<IntegrationRow>(
    `select id, unit_id, base_url, token_encrypted, active, sync_past_days, sync_future_days,
      last_sync_at::text, last_successful_sync_at::text, last_error
     from app_financial_integrations where unit_id=$1 and provider=$2 limit 1`,
    [unitId, PROVIDER],
  );
  return result.rows[0] ?? null;
}

export async function getFinancialIntegrationState(unitId: string) {
  await ensureFinancialSchema();
  const result = await queryDb<
    IntegrationRow & { students_count: number; installments_count: number }
  >(
    `select i.id,i.unit_id,i.base_url,i.token_encrypted,i.active,i.sync_past_days,i.sync_future_days,
      i.last_sync_at::text,i.last_successful_sync_at::text,i.last_error,
      (select count(*)::int from app_financial_students s where s.unit_id=i.unit_id) students_count,
      (select count(*)::int from app_financial_installments x where x.unit_id=i.unit_id) installments_count
     from app_financial_integrations i where i.unit_id=$1 and i.provider=$2 limit 1`,
    [unitId, PROVIDER],
  );
  const row = result.rows[0];
  if (!row)
    return {
      configured: false,
      active: false,
      syncPastDays: 730,
      syncFutureDays: 365,
      studentsCount: 0,
      installmentsCount: 0,
    };
  return {
    configured: Boolean(row.token_encrypted),
    active: row.active,
    syncPastDays: row.sync_past_days,
    syncFutureDays: row.sync_future_days,
    lastSyncAt: row.last_sync_at,
    lastSuccessfulSyncAt: row.last_successful_sync_at,
    lastError: row.last_error,
    studentsCount: row.students_count,
    installmentsCount: row.installments_count,
  };
}

export async function saveFinancialIntegration(unitId: string, body: Record<string, unknown>) {
  await ensureFinancialSchema();
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const existing = await integrationForUnit(unitId);
  if (!token && !existing) throw new Error("Informe o token de integração CAEZ.");
  const encrypted = token ? encryptCaezToken(token) : existing!.token_encrypted;
  await queryDb(
    `insert into app_financial_integrations(unit_id,provider,base_url,token_encrypted,active,sync_past_days,sync_future_days)
     values($1,$2,$3,$4,$5,$6,$7)
     on conflict(unit_id,provider) do update set token_encrypted=excluded.token_encrypted,active=excluded.active,
       sync_past_days=excluded.sync_past_days,sync_future_days=excluded.sync_future_days,updated_at=now()`,
    [
      unitId,
      PROVIDER,
      DEFAULT_BASE_URL,
      encrypted,
      body.active !== false,
      safeInteger(body.syncPastDays, 730),
      safeInteger(body.syncFutureDays, 365),
    ],
  );
  return getFinancialIntegrationState(unitId);
}

export async function testFinancialIntegration(unitId: string, suppliedToken?: string) {
  const integration = await integrationForUnit(unitId);
  const token =
    suppliedToken?.trim() || (integration ? decryptCaezToken(integration.token_encrypted) : "");
  if (!token) throw new Error("Integração CAEZ não configurada.");
  const result = await createCaezClient(
    integration?.base_url ?? DEFAULT_BASE_URL,
    token,
  ).getClasses();
  return { ok: true, classesCount: result.data.length, totalReported: result.total };
}

export async function enqueueFinancialSync(unitId: string) {
  const integration = await integrationForUnit(unitId);
  if (!integration?.active)
    throw new Error("Ative e configure a integração CAEZ antes de sincronizar.");
  const result = await queryDb<{ id: string; status: string; created_at: string }>(
    `insert into app_financial_sync_runs(unit_id,provider,status) values($1,$2,'queued')
     on conflict(unit_id,provider) where status in ('queued','running') do nothing
     returning id,status,created_at::text`,
    [unitId, PROVIDER],
  );
  if (result.rows[0]) return result.rows[0];
  const current = await queryDb<{ id: string; status: string; created_at: string }>(
    `select id,status,created_at::text from app_financial_sync_runs where unit_id=$1 and provider=$2 and status in ('queued','running') limit 1`,
    [unitId, PROVIDER],
  );
  return current.rows[0];
}

export async function listFinancialSyncRuns(unitId: string) {
  await ensureFinancialSchema();
  const result = await queryDb(
    `select id,status,started_at::text,finished_at::text,classes_processed,students_processed,
      installments_found,lookup_not_found,errors_count,error_summary,created_at::text
     from app_financial_sync_runs where unit_id=$1 order by created_at desc limit 10`,
    [unitId],
  );
  return result.rows;
}

async function acquireSyncRun() {
  return withTransaction(async (client) => {
    const result = await client.query<{
      id: string;
      unit_id: string;
      status: string;
      checkpoint: SyncCheckpoint;
    }>(
      `select id,unit_id,status,checkpoint from app_financial_sync_runs
       where provider=$1 and (status='queued' or (status='running' and coalesce((checkpoint->>'leaseUntil')::timestamptz,now()-interval '1 second') < now()))
       order by created_at asc for update skip locked limit 1`,
      [PROVIDER],
    );
    const run = result.rows[0];
    if (!run) return null;
    const checkpoint = {
      ...(run.checkpoint ?? {}),
      leaseUntil: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
    await client.query(
      `update app_financial_sync_runs set status='running',started_at=coalesce(started_at,now()),checkpoint=$2::jsonb where id=$1`,
      [run.id, JSON.stringify(checkpoint)],
    );
    return { ...run, checkpoint };
  });
}

async function upsertStudentAndEnrollment(
  client: PoolClient,
  unitId: string,
  student: CaezStudent,
) {
  const externalStudentId = String(student.codigo_aluno ?? "").trim();
  const externalEnrollmentId = String(student.codigo_matricula ?? "").trim();
  if (!externalStudentId || !externalEnrollmentId)
    throw new Error("Registro acadêmico do CAEZ sem identificadores.");
  const phones = Array.isArray(student.telefone_aluno) ? student.telefone_aluno : [];
  const studentResult = await client.query<{ id: string }>(
    `insert into app_financial_students(unit_id,external_student_id,full_name,cpf,phone,phone2,email,raw_payload)
     values($1,$2,$3,nullif($4,''),nullif($5,''),nullif($6,''),nullif($7,''),$8::jsonb)
     on conflict(unit_id,external_student_id) do update set full_name=excluded.full_name,cpf=excluded.cpf,
       phone=excluded.phone,phone2=excluded.phone2,email=excluded.email,raw_payload=excluded.raw_payload,last_synced_at=now(),updated_at=now()
     returning id`,
    [
      unitId,
      externalStudentId,
      String(student.nome_aluno ?? "Aluno CAEZ").trim(),
      documentDigits(student.cpf_aluno),
      phone(phones),
      phone(phones.slice(1)),
      email(student.email_aluno),
      JSON.stringify(student),
    ],
  );
  const enrollmentResult = await client.query<{ id: string }>(
    `insert into app_financial_enrollments(unit_id,student_id,external_enrollment_id,external_class_id,class_name,external_course_id,course_name,
       enrollment_date,start_date,end_date,raw_payload)
     values($1,$2,$3,nullif($4,''),nullif($5,''),nullif($6,''),nullif($7,''),$8,$9,$10,$11::jsonb)
     on conflict(unit_id,external_enrollment_id) do update set student_id=excluded.student_id,external_class_id=excluded.external_class_id,
       class_name=excluded.class_name,external_course_id=excluded.external_course_id,course_name=excluded.course_name,
       enrollment_date=excluded.enrollment_date,start_date=excluded.start_date,end_date=excluded.end_date,raw_payload=excluded.raw_payload,
       last_synced_at=now(),updated_at=now() returning id`,
    [
      unitId,
      studentResult.rows[0].id,
      externalEnrollmentId,
      String(student.codigo_turma ?? ""),
      String(student.nome_turma ?? ""),
      String(student.codigo_curso ?? ""),
      String(student.nome_curso ?? ""),
      parseCaezDate(student.data_matricula),
      parseCaezDate(student.data_inicio),
      parseCaezDate(student.data_termino),
      JSON.stringify(student),
    ],
  );
  return {
    studentId: studentResult.rows[0].id,
    enrollmentId: enrollmentResult.rows[0].id,
    externalEnrollmentId,
    cpf: documentDigits(student.cpf_aluno),
  };
}

async function upsertTitle(
  unitId: string,
  runId: string,
  studentId: string,
  fallbackEnrollmentId: string,
  title: CaezFinancialTitle,
) {
  const externalTitleId = String(title.codigo ?? "").trim();
  const dueDate = parseCaezDate(title.data_vencimento);
  if (!externalTitleId || !dueDate) throw new Error("Título CAEZ sem código ou vencimento válido.");
  const enrollmentExternal = String(title.codigo_matricula ?? "").trim();
  const enrollment = enrollmentExternal
    ? await queryDb<{ id: string }>(
        `select id from app_financial_enrollments where unit_id=$1 and external_enrollment_id=$2 limit 1`,
        [unitId, enrollmentExternal],
      )
    : null;
  await queryDb(
    `insert into app_financial_installments(unit_id,student_id,enrollment_id,external_title_id,due_date,original_amount,penalty_amount,
       interest_amount,total_amount,days_overdue,status,boleto_url,course_suspended,restriction_type,responsible_external_id,
       responsible_name,responsible_document,responsible_phone,responsible_email,last_seen_sync_run_id,raw_payload)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,nullif($12,''),$13,nullif($14,''),nullif($15,''),nullif($16,''),nullif($17,''),nullif($18,''),nullif($19,''),$20,$21::jsonb)
     on conflict(unit_id,external_title_id) do update set student_id=excluded.student_id,enrollment_id=excluded.enrollment_id,
       due_date=excluded.due_date,original_amount=excluded.original_amount,penalty_amount=excluded.penalty_amount,
       interest_amount=excluded.interest_amount,total_amount=excluded.total_amount,days_overdue=excluded.days_overdue,
       status=excluded.status,boleto_url=excluded.boleto_url,course_suspended=excluded.course_suspended,
       restriction_type=excluded.restriction_type,responsible_external_id=excluded.responsible_external_id,
       responsible_name=excluded.responsible_name,responsible_document=excluded.responsible_document,
       responsible_phone=excluded.responsible_phone,responsible_email=excluded.responsible_email,
       last_seen_at=now(),not_returned_at=null,last_seen_sync_run_id=excluded.last_seen_sync_run_id,raw_payload=excluded.raw_payload,updated_at=now()`,
    [
      unitId,
      studentId,
      enrollment?.rows[0]?.id ?? fallbackEnrollmentId,
      externalTitleId,
      dueDate,
      amount(title.valor_titulo),
      amount(title.valor_multa),
      amount(title.valor_juros),
      amount(title.valor_total),
      Number(title.dias_atraso ?? 0) || 0,
      titleStatus(dueDate),
      String(title.url_boleto ?? ""),
      title.indicador_curso_suspenso === true,
      String(title.tipo_restricao ?? ""),
      String(title.codigo_responsavel ?? ""),
      String(title.nome_responsavel ?? ""),
      documentDigits(title.cpf_cnpj_responsavel),
      phone(title.telefone_responsavel),
      email(title.email_responsavel),
      runId,
      JSON.stringify(title),
    ],
  );
}

async function processStudent(
  unitId: string,
  runId: string,
  integration: IntegrationRow,
  student: CaezStudent,
  start: string,
  end: string,
) {
  const record = await withTransaction((client) =>
    upsertStudentAndEnrollment(client, unitId, student),
  );
  if (!record.cpf) {
    await queryDb(
      `update app_financial_enrollments set financial_lookup_status='NO_DOCUMENT',last_financial_lookup_at=now(),updated_at=now() where id=$1`,
      [record.enrollmentId],
    );
    return { installments: 0, notFound: 0, error: false };
  }
  try {
    const titles = await createCaezClient(
      integration.base_url,
      decryptCaezToken(integration.token_encrypted),
    ).getFinancialTitles(record.cpf, start, end);
    for (const title of titles.data)
      await upsertTitle(unitId, runId, record.studentId, record.enrollmentId, title);
    const status = titles.data.length ? "FOUND" : "NOT_FOUND";
    await queryDb(
      `update app_financial_enrollments set financial_lookup_status=$2,last_financial_lookup_at=now(),updated_at=now() where id=$1`,
      [record.enrollmentId, status],
    );
    return { installments: titles.data.length, notFound: titles.data.length ? 0 : 1, error: false };
  } catch {
    await queryDb(
      `update app_financial_enrollments set financial_lookup_status='ERROR',last_financial_lookup_at=now(),updated_at=now() where id=$1`,
      [record.enrollmentId],
    );
    return { installments: 0, notFound: 0, error: true };
  }
}

async function mapLimited<T, R>(items: Array<T>, limit: number, mapper: (item: T) => Promise<R>) {
  const output: Array<R> = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        output[index] = await mapper(items[index]);
      }
    }),
  );
  return output;
}

export async function processNextFinancialSyncBatch() {
  await ensureFinancialSchema();
  const run = await acquireSyncRun();
  if (!run) return { processed: false };
  const integration = await integrationForUnit(run.unit_id);
  if (!integration?.active) {
    await queryDb(
      `update app_financial_sync_runs set status='failed',finished_at=now(),error_summary='Integração CAEZ inativa.' where id=$1`,
      [run.id],
    );
    return { processed: true, completed: true, status: "failed" };
  }
  try {
    const client = createCaezClient(
      integration.base_url,
      decryptCaezToken(integration.token_encrypted),
    );
    let checkpoint: SyncCheckpoint = run.checkpoint ?? {};
    if (!checkpoint.classes) {
      const classes = await client.getClasses();
      checkpoint = { phase: "classes", classes: classes.data, classIndex: 0 };
    }
    const classes = checkpoint.classes ?? [];
    const classIndex = checkpoint.classIndex ?? 0;
    if (classIndex >= classes.length) return finishSyncRun(run.id, run.unit_id);
    const currentClass = classes[classIndex];
    const classId = String(currentClass?.codigo_turma ?? "");
    if (!classId) throw new Error("Turma CAEZ sem código.");
    const students = await client.getStudentsByClass(classId);
    const past = new Date();
    past.setDate(past.getDate() - integration.sync_past_days);
    const future = new Date();
    future.setDate(future.getDate() + integration.sync_future_days);
    const results = await mapLimited(students.data, 3, (student) =>
      processStudent(
        run.unit_id,
        run.id,
        integration,
        { ...currentClass, ...student },
        formatCaezDate(past),
        formatCaezDate(future),
      ),
    );
    const counters = results.reduce(
      (sum, item) => ({
        installments: sum.installments + item.installments,
        notFound: sum.notFound + item.notFound,
        errors: sum.errors + Number(item.error),
      }),
      { installments: 0, notFound: 0, errors: 0 },
    );
    const nextCheckpoint = { ...checkpoint, classIndex: classIndex + 1, leaseUntil: null };
    await queryDb(
      `update app_financial_sync_runs set checkpoint=$2::jsonb,classes_processed=classes_processed+1,
       students_processed=students_processed+$3,installments_found=installments_found+$4,
       lookup_not_found=lookup_not_found+$5,errors_count=errors_count+$6 where id=$1`,
      [
        run.id,
        JSON.stringify(nextCheckpoint),
        students.data.length,
        counters.installments,
        counters.notFound,
        counters.errors,
      ],
    );
    await queryDb(
      `update app_financial_integrations set last_sync_at=now(),updated_at=now() where unit_id=$1 and provider=$2`,
      [run.unit_id, PROVIDER],
    );
    if (classIndex + 1 >= classes.length) return finishSyncRun(run.id, run.unit_id);
    return {
      processed: true,
      completed: false,
      runId: run.id,
      classIndex: classIndex + 1,
      classesCount: classes.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no lote financeiro.";
    await queryDb(
      `update app_financial_sync_runs set status='failed',finished_at=now(),error_summary=$2 where id=$1`,
      [run.id, message],
    );
    await queryDb(
      `update app_financial_integrations set last_sync_at=now(),last_error=$2,updated_at=now() where unit_id=$1 and provider=$3`,
      [run.unit_id, message, PROVIDER],
    );
    return { processed: true, completed: true, status: "failed" };
  }
}

async function finishSyncRun(runId: string, unitId: string) {
  await queryDb(
    `update app_financial_installments i set status='not_returned',not_returned_at=coalesce(not_returned_at,now()),updated_at=now()
     where i.unit_id=$1 and i.status<>'not_returned' and i.last_seen_sync_run_id is distinct from $2
       and exists(select 1 from app_financial_enrollments e where e.student_id=i.student_id
         and e.last_financial_lookup_at >= (select started_at from app_financial_sync_runs where id=$2)
         and e.financial_lookup_status in ('FOUND','NOT_FOUND'))`,
    [unitId, runId],
  );
  const result = await queryDb<{ errors_count: number }>(
    `select errors_count from app_financial_sync_runs where id=$1`,
    [runId],
  );
  const partial = Number(result.rows[0]?.errors_count ?? 0) > 0;
  await queryDb(
    `update app_financial_sync_runs set status=$2,finished_at=now(),checkpoint=checkpoint-'leaseUntil' where id=$1`,
    [runId, partial ? "partial" : "completed"],
  );
  await queryDb(
    `update app_financial_integrations set last_sync_at=now(),
       last_successful_sync_at=case when $2::boolean then last_successful_sync_at else now() end,
       last_error=case when $2::boolean then 'Sincronização parcial: alguns alunos não puderam ser consultados.' else null end,
       updated_at=now() where unit_id=$1 and provider=$3`,
    [unitId, partial, PROVIDER],
  );
  return { processed: true, completed: true, status: partial ? "partial" : "completed", runId };
}

export async function getFinancialDashboard(unitId: string) {
  await ensureFinancialSchema();
  const result = await queryDb(
    `select
      (select count(*)::int from app_financial_students where unit_id=$1) total_students,
      (select count(*)::int from app_financial_enrollments where unit_id=$1) total_enrollments,
      coalesce(sum(total_amount) filter(where status<>'not_returned'),0)::float total_open_amount,
      coalesce(sum(total_amount) filter(where status='overdue'),0)::float overdue_amount,
      count(*) filter(where status='overdue')::int overdue_count,
      coalesce(sum(total_amount) filter(where status='due_today'),0)::float due_today_amount,
      count(*) filter(where status='due_today')::int due_today_count,
      coalesce(sum(total_amount) filter(where status='upcoming'),0)::float upcoming_amount,
      count(*) filter(where status='upcoming')::int upcoming_count,
      count(distinct student_id) filter(where status='overdue')::int students_overdue,
      count(*) filter(where status='not_returned')::int not_returned_count
     from app_financial_installments where unit_id=$1`,
    [unitId],
  );
  const extra = await queryDb<{
    promises_today: number;
    broken_promises: number;
    not_found_financial_count: number;
  }>(
    `select
      (select count(*)::int from app_financial_promises where unit_id=$1 and status='open' and promised_date=current_date) promises_today,
      (select count(*)::int from app_financial_promises where unit_id=$1 and status='open' and promised_date<current_date) broken_promises,
      (select count(*)::int from app_financial_enrollments where unit_id=$1 and financial_lookup_status='NOT_FOUND') not_found_financial_count`,
    [unitId],
  );
  const aging = await queryDb<{ bucket: string; count: number; amount: number }>(
    `select bucket,count(*)::int,coalesce(sum(total_amount),0)::float amount from (
      select total_amount,case when days_overdue between 1 and 7 then '1-7' when days_overdue between 8 and 15 then '8-15'
      when days_overdue between 16 and 30 then '16-30' when days_overdue between 31 and 60 then '31-60'
      when days_overdue between 61 and 90 then '61-90' else '90+' end bucket
      from app_financial_installments where unit_id=$1 and status='overdue') x group by bucket`,
    [unitId],
  );
  return { ...(result.rows[0] ?? {}), ...(extra.rows[0] ?? {}), aging: aging.rows };
}

export async function listTodayCollections(unitId: string) {
  await ensureFinancialSchema();
  const result = await queryDb(
    `select i.id installment_id,s.id student_id,s.full_name,s.phone,e.course_name,e.class_name,e.external_enrollment_id,
      i.responsible_name,i.responsible_phone,i.due_date::text,i.days_overdue,i.original_amount::float,i.total_amount::float,
      i.status,i.course_suspended,a.performed_at::text last_contact_at,
      p.promised_date::text,p.promised_amount::float,
      ((case when p.status='open' and p.promised_date<current_date then 100 when i.days_overdue>90 then 90
        when i.days_overdue between 61 and 90 then 80 when i.days_overdue between 31 and 60 then 70
        when i.days_overdue between 16 and 30 then 50 when i.days_overdue between 8 and 15 then 35
        when i.days_overdue between 1 and 7 then 20 when i.status='due_today' then 10 else 0 end)
       + case when i.total_amount>=1000 then 15 when i.total_amount>=500 then 10 else 0 end
       + case when i.course_suspended then 20 else 0 end)::int score
     from app_financial_installments i join app_financial_students s on s.id=i.student_id
     left join app_financial_enrollments e on e.id=i.enrollment_id
     left join lateral(select performed_at from app_financial_collection_actions where unit_id=$1 and student_id=s.id order by performed_at desc limit 1)a on true
     left join lateral(select promised_date,promised_amount,status from app_financial_promises where unit_id=$1 and student_id=s.id and status='open' order by promised_date asc limit 1)p on true
     where i.unit_id=$1 and i.status in ('overdue','due_today') order by score desc,i.days_overdue desc,i.total_amount desc limit 300`,
    [unitId],
  );
  return result.rows;
}

export async function listFinancialStudents(unitId: string, params: URLSearchParams) {
  await ensureFinancialSchema();
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(params.get("pageSize") ?? 25) || 25));
  const search = params.get("search")?.trim() ?? "";
  const status = params.get("status")?.trim() ?? "";
  const course = params.get("course")?.trim() ?? "";
  const className = params.get("class")?.trim() ?? "";
  const result = await queryDb(
    `with rows as(select s.id,s.full_name,s.phone,e.external_enrollment_id,e.course_name,e.class_name,e.financial_lookup_status,
       coalesce(sum(i.total_amount) filter(where i.status='overdue'),0)::float overdue_amount,
       count(i.id) filter(where i.status='overdue')::int overdue_count,
       coalesce(max(i.days_overdue) filter(where i.status='overdue'),0)::int max_overdue_days
     from app_financial_students s left join app_financial_enrollments e on e.student_id=s.id and e.unit_id=$1
     left join app_financial_installments i on i.enrollment_id=e.id and i.status<>'not_returned'
     where s.unit_id=$1 and ($2='' or concat_ws(' ',s.full_name,s.phone,e.course_name,e.class_name,e.external_enrollment_id) ilike '%'||$2||'%')
       and ($3='' or e.financial_lookup_status=$3) and ($4='' or e.course_name=$4) and ($5='' or e.class_name=$5)
     group by s.id,s.full_name,s.phone,e.external_enrollment_id,e.course_name,e.class_name,e.financial_lookup_status)
     select *,count(*) over()::int total_count from rows order by max_overdue_days desc,full_name asc limit $6 offset $7`,
    [unitId, search, status, course, className, pageSize, (page - 1) * pageSize],
  );
  const filters = await queryDb<{ courses: Array<string>; classes: Array<string> }>(
    `select array_remove(array_agg(distinct course_name order by course_name),null) courses,
      array_remove(array_agg(distinct class_name order by class_name),null) classes from app_financial_enrollments where unit_id=$1`,
    [unitId],
  );
  return {
    students: result.rows,
    total: Number(result.rows[0]?.total_count ?? 0),
    page,
    pageSize,
    filters: filters.rows[0] ?? { courses: [], classes: [] },
  };
}

export async function getFinancialStudentProfile(unitId: string, studentId: string) {
  await ensureFinancialSchema();
  const student = await queryDb(
    `select s.id,s.full_name,s.phone,s.phone2,s.email,e.enrollment_id,e.external_enrollment_id,
      e.course_name,e.class_name,e.enrollment_date,e.start_date,e.end_date,e.financial_lookup_status,
      coalesce(fin.overdue_amount,0)::float overdue_amount,
      coalesce(fin.upcoming_amount,0)::float upcoming_amount,
      coalesce(fin.overdue_count,0)::int overdue_count,
      coalesce(fin.max_overdue_days,0)::int max_overdue_days,
      fin.responsible_name,fin.responsible_phone,fin.responsible_email
     from app_financial_students s
     left join lateral (
       select max(id::text)::uuid enrollment_id,
         string_agg(distinct external_enrollment_id, ', ' order by external_enrollment_id) external_enrollment_id,
         string_agg(distinct course_name, ', ' order by course_name) course_name,
         string_agg(distinct class_name, ', ' order by class_name) class_name,
         min(enrollment_date)::text enrollment_date,min(start_date)::text start_date,max(end_date)::text end_date,
         string_agg(distinct financial_lookup_status, ', ' order by financial_lookup_status) financial_lookup_status
       from app_financial_enrollments where unit_id=$1 and student_id=s.id
     ) e on true
     left join lateral (
       select sum(total_amount) filter(where status='overdue') overdue_amount,
         sum(total_amount) filter(where status='upcoming') upcoming_amount,
         count(*) filter(where status='overdue') overdue_count,
         max(days_overdue) filter(where status='overdue') max_overdue_days,
         max(responsible_name) responsible_name,max(responsible_phone) responsible_phone,max(responsible_email) responsible_email
       from app_financial_installments where unit_id=$1 and student_id=s.id and status<>'not_returned'
     ) fin on true
     where s.unit_id=$1 and s.id=$2 limit 1`,
    [unitId, studentId],
  );
  if (!student.rows[0]) return null;
  const installments = await queryDb(
    `select id,due_date::text,original_amount::float,penalty_amount::float,interest_amount::float,total_amount::float,
      days_overdue,status,boleto_url,course_suspended,restriction_type from app_financial_installments
     where unit_id=$1 and student_id=$2 order by due_date asc`,
    [unitId, studentId],
  );
  const actions = await queryDb(
    `select a.id,a.type,a.status,a.notes,a.performed_at::text,u.name performed_by_name from app_financial_collection_actions a
     left join app_users u on u.id=a.performed_by where a.unit_id=$1 and a.student_id=$2 order by a.performed_at desc limit 100`,
    [unitId, studentId],
  );
  const promises = await queryDb(
    `select id,installment_id,promised_date::text,promised_amount::float,
      case when status='open' and promised_date<current_date then 'broken' else status end status,notes,created_at::text
     from app_financial_promises where unit_id=$1 and student_id=$2 order by created_at desc`,
    [unitId, studentId],
  );
  return {
    student: student.rows[0],
    installments: installments.rows,
    actions: actions.rows,
    promises: promises.rows,
  };
}

export async function createCollectionAction(
  unitId: string,
  userId: string,
  body: Record<string, unknown>,
) {
  await ensureFinancialSchema();
  const type = String(body.type ?? "");
  const status = String(body.status ?? "");
  const studentId = String(body.studentId ?? "");
  if (
    !["whatsapp", "call", "manual_contact", "note"].includes(type) ||
    !["attempted", "answered", "no_answer", "negotiating", "resolved"].includes(status) ||
    !studentId
  )
    throw new Error("Dados do contato inválidos.");
  const result = await queryDb(
    `insert into app_financial_collection_actions(unit_id,student_id,enrollment_id,installment_id,type,status,notes,performed_by)
     select $1,s.id,$3::uuid,$4::uuid,$5,$6,nullif($7,''),$8 from app_financial_students s where s.id=$2 and s.unit_id=$1 returning id,performed_at::text`,
    [
      unitId,
      studentId,
      body.enrollmentId || null,
      body.installmentId || null,
      type,
      status,
      String(body.notes ?? "").trim(),
      userId,
    ],
  );
  if (!result.rows[0]) throw new Error("Aluno financeiro não encontrado.");
  return result.rows[0];
}

export async function createFinancialPromise(
  unitId: string,
  userId: string,
  body: Record<string, unknown>,
) {
  await ensureFinancialSchema();
  const studentId = String(body.studentId ?? "");
  const date = String(body.promisedDate ?? "");
  const promisedAmount = amount(body.promisedAmount);
  if (!studentId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || promisedAmount <= 0)
    throw new Error("Dados da promessa inválidos.");
  const result = await queryDb(
    `insert into app_financial_promises(unit_id,student_id,installment_id,promised_date,promised_amount,notes,created_by)
     select $1,s.id,$3::uuid,$4,$5,nullif($6,''),$7 from app_financial_students s where s.id=$2 and s.unit_id=$1 returning id,created_at::text`,
    [
      unitId,
      studentId,
      body.installmentId || null,
      date,
      promisedAmount,
      String(body.notes ?? "").trim(),
      userId,
    ],
  );
  if (!result.rows[0]) throw new Error("Aluno financeiro não encontrado.");
  return result.rows[0];
}
