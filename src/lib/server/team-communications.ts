import { randomBytes } from "node:crypto";
import { evolutionConnectionState, evolutionQrCodeFrom } from "@/lib/evolution-connection";
import { requestEvolution, evolutionWebhookUrl } from "@/lib/server/evolution-client";
import { configureEvolutionWebhook } from "@/lib/server/evolution-label-automation";
import { ensureTeamSchema } from "@/lib/server/team-schema";
import { remoteInstanceExists } from "@/lib/server/evolution-whatsapp";
import { queryDb, withTransaction } from "@/lib/server/db";
import { materializeScheduledTasks } from "@/lib/server/team-tasks";

const KINDS = ["stale", "overdue", "good", "low"] as const;
export type AlertKind = (typeof KINDS)[number];
type Sender = {
  unit_id: string;
  instance_id: string | null;
  enabled: boolean;
  daily_limit: number;
  recipient_daily_limit: number;
  min_interval_seconds: number;
  quiet_from_hour: number;
  quiet_to_hour: number;
  failed_count: number;
  last_sent_at: string | null;
  last_error: string | null;
};
type WhatsappInstance = {
  id: string;
  instance_name: string;
  status: string;
  phone_number: string | null;
  webhook_secret: string;
};
const digits = (phone: string) => phone.replace(/\D/g, "");
function brazilParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  }).formatToParts(date);
  const get = (kind: string) => parts.find((p) => p.type === kind)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}
async function senderRow(unitId: string) {
  await queryDb(
    `insert into app_team_sender_settings (unit_id) values($1)
     on conflict(unit_id) do nothing`,
    [unitId],
  );
  const result = await queryDb<Sender>("select * from app_team_sender_settings where unit_id=$1", [
    unitId,
  ]);
  return result.rows[0];
}
async function instanceForUnit(unitId: string) {
  const result = await queryDb<WhatsappInstance>(
    `select i.id,i.instance_name,i.status,i.phone_number,i.webhook_secret
     from app_team_sender_settings s
     join app_whatsapp_instances i on i.id=s.instance_id and i.unit_id=s.unit_id
     where s.unit_id=$1 and i.user_id is null`,
    [unitId],
  );
  return result.rows[0] ?? null;
}
export async function teamSenderState(unitId: string) {
  await ensureTeamSchema();
  const settings = await senderRow(unitId);
  const instance = await instanceForUnit(unitId);
  return {
    settings,
    instance: instance
      ? {
          status: instance.status,
          phoneNumber: instance.phone_number,
        }
      : null,
  };
}

export async function connectTeamSender(unitId: string, actorId: string, requestUrl: string) {
  await ensureTeamSchema();
  let instance = await instanceForUnit(unitId);
  if (!instance) {
    const name = `star_gestao_${unitId.replace(/-/g, "").slice(0, 18)}`;
    const secret = randomBytes(24).toString("base64url");
    const result = await queryDb<WhatsappInstance>(
      `insert into app_whatsapp_instances
       (unit_id, user_id, instance_name, status, webhook_secret, created_by)
       values ($1,null,$2,'connecting',$3,null)
       returning id,instance_name,status,phone_number,webhook_secret`,
      [unitId, name, secret],
    );
    instance = result.rows[0];
    await queryDb(
      "update app_team_sender_settings set instance_id=$2,updated_at=now() where unit_id=$1",
      [unitId, instance.id],
    );
  }
  const name = instance.instance_name;
  const remoteExists = await remoteInstanceExists(name);
  const state: unknown = remoteExists
    ? await requestEvolution(`/instance/connectionState/${encodeURIComponent(name)}`).catch(
        () => null,
      )
    : null;
  if (!remoteExists) {
    await requestEvolution("/instance/create", {
      method: "POST",
      body: JSON.stringify({
        instanceName: name,
        token: "",
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        rejectCall: false,
        groupsIgnore: true,
      }),
    });
  }
  await configureEvolutionWebhook(name, evolutionWebhookUrl(requestUrl, instance.webhook_secret));
  await requestEvolution(`/settings/set/${encodeURIComponent(name)}`, {
    method: "POST",
    body: JSON.stringify({
      groupsIgnore: true,
      rejectCall: false,
      alwaysOnline: false,
      readMessages: false,
      readStatus: false,
    }),
  }).catch(() => null);

  const live =
    state ??
    (await requestEvolution(`/instance/connectionState/${encodeURIComponent(name)}`).catch(
      () => null,
    ));
  const connection = evolutionConnectionState(live);
  await queryDb("update app_whatsapp_instances set status=$2,updated_at=now() where id=$1", [
    instance.id,
    connection,
  ]);
  if (connection === "connected") return { status: connection, qrCode: null };
  const qr = await requestEvolution(`/instance/connect/${encodeURIComponent(name)}`);
  return { status: "connecting", qrCode: evolutionQrCodeFrom(qr) };
}

export async function teamSenderQr(unitId: string) {
  await ensureTeamSchema();
  const instance = await instanceForUnit(unitId);
  if (!instance) return null;
  const raw = await requestEvolution(
    `/instance/connect/${encodeURIComponent(instance.instance_name)}`,
  );
  return evolutionQrCodeFrom(raw);
}

export async function refreshTeamSender(unitId: string) {
  await ensureTeamSchema();
  const instance = await instanceForUnit(unitId);
  if (!instance) return { status: "not_connected", phoneNumber: null };
  try {
    const raw = await requestEvolution(
      `/instance/connectionState/${encodeURIComponent(instance.instance_name)}`,
    );
    const status = evolutionConnectionState(raw);
    await queryDb("update app_whatsapp_instances set status=$2,updated_at=now() where id=$1", [
      instance.id,
      status,
    ]);
    return { status, phoneNumber: instance.phone_number };
  } catch {
    return { status: instance.status, phoneNumber: instance.phone_number };
  }
}

export async function disconnectTeamSender(unitId: string) {
  await ensureTeamSchema();
  const instance = await instanceForUnit(unitId);
  await queryDb(
    "update app_team_sender_settings set enabled=false,updated_at=now() where unit_id=$1",
    [unitId],
  );
  if (!instance) return;
  await requestEvolution(`/instance/logout/${encodeURIComponent(instance.instance_name)}`, {
    method: "DELETE",
  }).catch(() => null);
  await requestEvolution(`/instance/delete/${encodeURIComponent(instance.instance_name)}`, {
    method: "DELETE",
  }).catch(() => null);
  await queryDb(
    "update app_whatsapp_instances set status='disconnected',updated_at=now() where id=$1",
    [instance.id],
  );
}

export async function updateSenderSettings(unitId: string, patch: Record<string, unknown>) {
  await ensureTeamSchema();
  const settings = await senderRow(unitId);
  const instance = await instanceForUnit(unitId);
  const enabled = patch.enabled === true;
  if (enabled && (!instance || instance.status !== "connected")) {
    throw new Error("Conecte um número da gestão antes de ativar os envios.");
  }
  const daily = Math.min(50, Math.max(1, Number(patch.dailyLimit ?? settings.daily_limit)));
  const perUser = Math.min(
    2,
    Math.max(1, Number(patch.recipientDailyLimit ?? settings.recipient_daily_limit)),
  );
  const interval = Math.min(
    3600,
    Math.max(180, Number(patch.minIntervalSeconds ?? settings.min_interval_seconds)),
  );
  if (![daily, perUser, interval].every(Number.isFinite)) throw new Error("Limites inválidos.");
  await queryDb(
    `update app_team_sender_settings set enabled=$2,daily_limit=$3,
      recipient_daily_limit=$4,min_interval_seconds=$5,
      failed_count=case when $2 then 0 else failed_count end,
      last_error=case when $2 then null else last_error end,
      updated_at=now() where unit_id=$1`,
    [unitId, enabled, daily, perUser, interval],
  );
  return senderRow(unitId);
}

export async function upsertTeamContact(
  unitId: string,
  userId: string,
  phoneText: string,
  optIn: boolean,
) {
  await ensureTeamSchema();
  const phone = digits(phoneText);
  if (phone && !/^\d{11,15}$/.test(phone))
    throw new Error("Informe o número com DDI e DDD (ex.: 5511999999999).");
  const result = await queryDb(
    `select u.id from app_users u join app_user_units uu on uu.user_id=u.id
      where u.id=$1 and uu.unit_id=$2 and u.status='active'`,
    [userId, unitId],
  );
  if (!result.rowCount) throw new Error("Usuário não pertence à unidade.");
  await queryDb(
    `insert into app_team_contacts(unit_id,user_id,phone,opt_in,consent_at)
     values($1,$2,$3,$4,case when $4 then now() else null end)
     on conflict(unit_id,user_id) do update set phone=excluded.phone,
       opt_in=excluded.opt_in,
       consent_at=case when excluded.opt_in then
         case when app_team_contacts.phone is distinct from excluded.phone
           then now() else coalesce(app_team_contacts.consent_at,now()) end
         else null end,
       updated_at=now()`,
    [unitId, userId, phone || null, Boolean(phone && optIn)],
  );
}

export async function listTeamCommunications(unitId: string) {
  await ensureTeamSchema();
  const [rules, contacts, queue, sender] = await Promise.all([
    getOrSeedRules(unitId),
    queryDb(
      `select u.id,u.name,c.phone,coalesce(c.opt_in,false) as opt_in,c.consent_at::text
       from app_users u join app_user_units uu on uu.user_id=u.id
       left join app_team_contacts c on c.unit_id=uu.unit_id and c.user_id=u.id
       where uu.unit_id=$1 and u.role='CONSULTOR' and u.status='active'
       order by u.name`,
      [unitId],
    ),
    queryDb(
      `select o.id,u.name as recipient,o.status,o.message,o.last_error,
        o.created_at::text,o.sent_at::text
       from app_team_outbox o join app_users u on u.id=o.user_id
       where o.unit_id=$1 order by o.created_at desc limit 60`,
      [unitId],
    ),
    teamSenderState(unitId),
  ]);
  return { rules, contacts: contacts.rows, queue: queue.rows, sender };
}

export async function getOrSeedRules(unitId: string) {
  await ensureTeamSchema();
  await queryDb(
    `insert into app_team_alert_rules(unit_id,kind,enabled,threshold)
     values ($1,'stale',true,24),($1,'overdue',true,1),
       ($1,'good',false,3),($1,'low',false,1)
     on conflict(unit_id,kind) do nothing`,
    [unitId],
  );
  const result = await queryDb(
    "select id,kind,enabled,threshold,updated_at::text from app_team_alert_rules where unit_id=$1 order by kind",
    [unitId],
  );
  return result.rows;
}

export async function updateTeamRule(
  unitId: string,
  actorId: string,
  kind: AlertKind,
  enabled: boolean,
  threshold: number,
) {
  if (
    !KINDS.includes(kind) ||
    !Number.isSafeInteger(threshold) ||
    threshold < 0 ||
    threshold > 720 ||
    (kind === "stale" && threshold < 1)
  )
    throw new Error("Regra inválida.");
  await getOrSeedRules(unitId);
  await queryDb(
    `update app_team_alert_rules set enabled=$3,threshold=$4,updated_by=$5,updated_at=now()
     where unit_id=$1 and kind=$2`,
    [unitId, kind, enabled, threshold, actorId],
  );
}

export async function listTeamNotifications(unitId: string, userId: string) {
  await ensureTeamSchema();
  const result = await queryDb(
    `select id,kind,title,body,href,read_at::text,created_at::text
     from app_team_notifications
     where unit_id=$1 and user_id=$2 order by created_at desc limit 70`,
    [unitId, userId],
  );
  return result.rows;
}
export async function markTeamNotificationRead(unitId: string, userId: string, id: string) {
  await ensureTeamSchema();
  await queryDb(
    `update app_team_notifications set read_at=coalesce(read_at,now())
     where id=$1 and unit_id=$2 and user_id=$3`,
    [id, unitId, userId],
  );
}
async function pushNotice(
  unitId: string,
  userId: string,
  kind: string,
  title: string,
  body: string,
  eventKey: string,
) {
  await queryDb(
    `insert into app_team_notifications(unit_id,user_id,kind,title,body,event_key)
     values($1,$2,$3,$4,$5,$6)
     on conflict(unit_id,user_id,event_key) do nothing`,
    [unitId, userId, kind, title, body, eventKey],
  );
}

export async function processTeamRules() {
  await ensureTeamSchema();
  const units = await queryDb<{ id: string }>("select distinct unit_id as id from app_user_units");
  const day = brazilParts().date;
  const currentHour = brazilParts().hour;
  let notifications = 0;
  const report: Record<string, number> = { units: units.rowCount ?? 0, notifications: 0 };
  for (const unit of units.rows) {
    const rules = (await getOrSeedRules(unit.id)) as Array<Record<string, unknown>>;
    const consultants = await queryDb<{ id: string }>(
      `select distinct u.id from app_users u join app_user_units uu on uu.user_id=u.id
       where u.role='CONSULTOR' and u.status='active' and uu.unit_id=$1`,
      [unit.id],
    );
    for (const user of consultants.rows) {
      for (const rule of rules) {
        if (rule.enabled !== true) continue;
        const kind = String(rule.kind);
        const threshold = Number(rule.threshold);
        let count = 0;
        let title = "";
        let body = "";
        if (kind === "stale") {
          const rows = await queryDb<{ total: string }>(
            `select count(*)::text as total from app_leads
             where unit_id=$1 and created_by=$2 and stage <> 'Matriculado'
               and coalesce(last_follow_up_at,first_contact_at,created_at) <=
                 now() - make_interval(hours => $3::int)`,
            [unit.id, user.id, threshold],
          );
          count = Number(rows.rows[0]?.total ?? 0);
          title = "Leads sem movimentação";
          body = `Você tem ${count} leads sem atividade há pelo menos ${threshold} horas. Revise sua carteira.`;
        } else if (kind === "overdue") {
          const rows = await queryDb<{ total: string }>(
            `select count(*)::text as total from app_team_assignments a
             join app_team_occurrences o on o.id=a.occurrence_id
             join app_team_tasks t on t.id=o.task_id
             where a.unit_id=$1 and a.user_id=$2 and a.status='pending'
               and t.status='active' and o.due_at <= now() - make_interval(hours=>$3::int)`,
            [unit.id, user.id, threshold],
          );
          count = Number(rows.rows[0]?.total ?? 0);
          title = "Tarefas atrasadas";
          body = `Você tem ${count} tarefas vencidas. Acesse a Central de Tarefas.`;
        } else if (currentHour >= 17) {
          const rows = await queryDb<{ total: string }>(
            `select count(*)::text as total from app_leads
             where unit_id=$1 and converted_by=$2 and stage='Matriculado'
               and converted_at >= ((now() at time zone 'America/Sao_Paulo')::date::timestamp at time zone 'America/Sao_Paulo')`,
            [unit.id, user.id],
          );
          count = Number(rows.rows[0]?.total ?? 0);
          if (kind === "good") {
            title = "Parabéns pelas matrículas!";
            body = `Você já realizou ${count} matrículas hoje. Continue assim!`;
          } else {
            const portfolio = await queryDb<{ total: string }>(
              `select count(*)::text as total from app_leads
               where unit_id=$1 and created_by=$2 and stage <> 'Matriculado'`,
              [unit.id, user.id],
            );
            if (Number(portfolio.rows[0]?.total ?? 0) < 5) continue;
            title = "Acompanhamento dos resultados";
            body = `Você realizou ${count} matrículas hoje. Revise oportunidades e peça apoio à gestão quando necessário.`;
          }
        }
        const shouldNotify =
          kind === "stale" || kind === "overdue"
            ? count > 0
            : kind === "good"
              ? count >= threshold
              : count < threshold;
        if (shouldNotify) {
          await pushNotice(unit.id, user.id, `alert_${kind}`, title, body, `alert:${kind}:${day}`);
          notifications++;
        }
      }
    }
  }
  report.notifications = notifications;
  return report;
}

export async function queueTeamDigests() {
  await ensureTeamSchema();
  const { date, hour } = brazilParts();
  if (hour < 8 || hour >= 18) return { queued: 0 };
  const result = await queryDb<{ id: string; daily_limit: number }>(
    `select unit_id as id,daily_limit from app_team_sender_settings
     where enabled=true and failed_count < 3`,
  );
  let queued = 0;
  for (const unit of result.rows) {
    const instance = await instanceForUnit(unit.id);
    if (!instance || instance.status !== "connected") continue;
    const contacts = await queryDb<{ user_id: string; phone: string; name: string }>(
      `select c.user_id,c.phone,u.name from app_team_contacts c
       join app_users u on u.id=c.user_id
       join app_user_units uu on uu.user_id=u.id and uu.unit_id=c.unit_id
       where c.unit_id=$1 and c.opt_in=true and c.phone is not null
         and u.status='active' and u.role='CONSULTOR'`,
      [unit.id],
    );
    for (const user of contacts.rows) {
      const messages = await queryDb<{ title: string }>(
        `select title from app_team_notifications where unit_id=$1 and user_id=$2
         and read_at is null and created_at > now() - interval '48 hours'
         order by created_at desc limit 4`,
        [unit.id, user.user_id],
      );
      if (!messages.rows.length) continue;
      const greeting = user.name.trim().split(" ")[0];
      const summary = messages.rows
        .slice(0, 3)
        .map((item, i) => `${i + 1}. ${item.title}`)
        .join("\n");
      const extra = messages.rows.length > 3 ? "\nE outras notificações." : "";
      const body = `Olá, ${greeting}. Seu resumo da Star Profissões:\n${summary}${extra}\nAcesse o CRM para consultar os detalhes.\nSe não quiser receber avisos por WhatsApp, desative em Minhas tarefas.`;
      const row = await queryDb(
        `insert into app_team_outbox(unit_id,user_id,instance_id,phone,message,dedupe_key)
         values($1,$2,$3,$4,$5,$6)
         on conflict(unit_id,user_id,dedupe_key) do nothing returning id`,
        [unit.id, user.user_id, instance.id, user.phone, body, `digest:${date}`],
      );
      queued += row.rowCount ?? 0;
    }
  }
  return { queued };
}

function providerMessageId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const r = payload as Record<string, unknown>;
  const key = r.key && typeof r.key === "object" ? (r.key as Record<string, unknown>) : {};
  return String(key.id ?? r.messageId ?? "") || null;
}

export async function dispatchTeamOutbox() {
  await ensureTeamSchema();
  const { hour } = brazilParts();
  if (hour < 8 || hour >= 18) return { status: "quiet_hours" };
  const claimed = await withTransaction(async (client) => {
    // Global serialisation: one reserved send per worker, with durable interval per number.
    const senders = await client.query<Sender>(
      `select * from app_team_sender_settings
       where enabled=true and failed_count<3
       order by coalesce(last_sent_at,'1970-01-01'::timestamptz)
       for update skip locked limit 20`,
    );
    for (const s of senders.rows) {
      if (
        s.last_sent_at &&
        Date.now() - new Date(s.last_sent_at).getTime() <
          Math.max(180, s.min_interval_seconds) * 1000
      )
        continue;
      const inst = await client.query<{ id: string; status: string; instance_name: string }>(
        `select id,status,instance_name from app_whatsapp_instances
         where id=$1 and unit_id=$2 and user_id is null`,
        [s.instance_id, s.unit_id],
      );
      const instance = inst.rows[0];
      if (!instance || instance.status !== "connected") continue;
      const dayLimits = await client.query<{ total: string }>(
        `select count(*)::text as total from app_team_outbox
         where unit_id=$1 and status in ('sending','sent')
           and coalesce(claimed_at,sent_at,created_at) >= ((now() at time zone 'America/Sao_Paulo')::date::timestamp at time zone 'America/Sao_Paulo')`,
        [s.unit_id],
      );
      if (Number(dayLimits.rows[0]?.total ?? 0) >= s.daily_limit) continue;
      const outbox = await client.query<{
        id: string;
        user_id: string;
        phone: string;
        message: string;
        attempts: number;
      }>(
        `select o.id,o.user_id,o.phone,o.message,o.attempts
         from app_team_outbox o join app_team_contacts c
           on c.unit_id=o.unit_id and c.user_id=o.user_id
         where o.unit_id=$1 and o.status='pending' and o.available_at<=now()
           and c.opt_in=true and c.phone=o.phone and c.phone is not null
           and (select count(*) from app_team_outbox sent
             where sent.unit_id=o.unit_id and sent.user_id=o.user_id
               and sent.status in ('sending','sent')
               and coalesce(sent.claimed_at,sent.sent_at,sent.created_at) >= ((now() at time zone 'America/Sao_Paulo')::date::timestamp at time zone 'America/Sao_Paulo')
             ) < $2
         order by o.created_at asc limit 1 for update of o skip locked`,
        [s.unit_id, s.recipient_daily_limit],
      );
      if (!outbox.rows[0]) continue;
      const msg = outbox.rows[0];
      await client.query(
        `update app_team_outbox set status='sending',attempts=attempts+1,
           claimed_at=now() where id=$1`,
        [msg.id],
      );
      await client.query(
        `update app_team_sender_settings set last_sent_at=now() where unit_id=$1`,
        [s.unit_id],
      );
      return { ...msg, unitId: s.unit_id, instanceName: instance.instance_name };
    }
    return null;
  });
  if (!claimed) return { status: "empty_or_limited" };
  try {
    const payload = await requestEvolution(
      `/message/sendText/${encodeURIComponent(claimed.instanceName)}`,
      {
        method: "POST",
        body: JSON.stringify(
          process.env.EVOLUTION_TEXT_PAYLOAD_MODE === "legacy"
            ? { number: claimed.phone, textMessage: { text: claimed.message } }
            : { number: claimed.phone, text: claimed.message },
        ),
      },
    );
    await queryDb(
      `update app_team_outbox set status='sent',provider_message_id=$2,
       sent_at=now(),last_error=null where id=$1`,
      [claimed.id, providerMessageId(payload)],
    );
    await queryDb(
      `update app_team_sender_settings set failed_count=0,last_error=null
       where unit_id=$1`,
      [claimed.unitId],
    );
    return { status: "sent" };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Erro de envio.";
    await queryDb(`update app_team_outbox set status='failed',last_error=$2 where id=$1`, [
      claimed.id,
      message,
    ]);
    await queryDb(
      `update app_team_sender_settings set failed_count=failed_count+1,last_error=$2,
        enabled=case when failed_count+1>=3 then false else enabled end
       where unit_id=$1`,
      [claimed.unitId, message],
    );
    return { status: "failed" };
  }
}

export async function processTeamOperations() {
  await ensureTeamSchema();
  // Um resumo antigo nunca deve ser enviado como se fosse uma cobrança atual.
  await queryDb(
    `update app_team_outbox set status='cancelled',
       last_error='Resumo expirado; não será enviado com atraso.'
     where status='pending' and created_at < now()-interval '30 hours'`,
  );
  await queryDb(
    `update app_team_outbox set status='failed',
       last_error='Envio com resultado desconhecido. Não repetir automaticamente.'
     where status='sending' and claimed_at < now()-interval '5 minutes'`,
  );
  const tasks = await materializeScheduledTasks();
  const alerts = await processTeamRules();
  const queued = await queueTeamDigests();
  const delivered = await dispatchTeamOutbox();
  return { tasks, alerts, queued, delivered };
}
