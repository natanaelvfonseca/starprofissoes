const DEFAULT_BASE_URL = "https://app.caezescola.com.br/api/";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;

export type CaezClass = {
  codigo_turma?: number | string;
  nome_turma?: string;
  data_inicio?: string;
  data_termino?: string;
  codigo_curso?: number | string;
  nome_curso?: string;
};

export type CaezStudent = {
  codigo_matricula?: number | string;
  data_matricula?: string;
  data_inicio?: string;
  data_termino?: string;
  codigo_turma?: number | string;
  nome_turma?: string;
  codigo_curso?: number | string;
  nome_curso?: string;
  codigo_aluno?: number | string;
  nome_aluno?: string;
  cpf_aluno?: string;
  telefone_aluno?: Array<{ ddd?: string; numero?: string }>;
  email_aluno?: Array<{ email?: string }>;
  [key: string]: unknown;
};

export type CaezFinancialTitle = {
  codigo?: number | string;
  codigo_matricula?: number | string;
  data_vencimento?: string;
  dias_atraso?: number | string;
  valor_titulo?: number | string;
  valor_multa?: number | string;
  valor_juros?: number | string;
  valor_total?: number | string;
  indicador_curso_suspenso?: boolean;
  url_boleto?: string;
  codigo_responsavel?: number | string;
  nome_responsavel?: string;
  cpf_cnpj_responsavel?: string;
  telefone_responsavel?: Array<{ ddd?: string; numero?: string }>;
  email_responsavel?: Array<{ email?: string }>;
  tipo_restricao?: string;
  [key: string]: unknown;
};

type CaezResponse<T> = { total_registros?: number; dados?: Array<T> };

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function endpointUrl(baseUrl: string, path: string, query?: URLSearchParams) {
  const normalizedBase = new URL(baseUrl || DEFAULT_BASE_URL);
  if (normalizedBase.protocol !== "https:") throw new Error("A URL do CAEZ deve usar HTTPS.");
  const url = new URL(
    path,
    normalizedBase.href.endsWith("/") ? normalizedBase : `${normalizedBase.href}/`,
  );
  if (query) url.search = query.toString();
  return url;
}

async function request<T>(baseUrl: string, token: string, path: string, query?: URLSearchParams) {
  if (!token.trim()) throw new Error("Token de integração CAEZ não configurado.");
  const url = endpointUrl(baseUrl, path, query);
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", token_integracao: token },
        signal: controller.signal,
      });
      const retryable = response.status === 429 || response.status >= 500;
      if (!response.ok) {
        if (retryable && attempt < MAX_ATTEMPTS) {
          await wait(400 * 2 ** (attempt - 1));
          continue;
        }
        throw new Error(`CAEZ respondeu HTTP ${response.status}.`);
      }
      const payload = (await response.json()) as CaezResponse<T>;
      return {
        total: Number(payload.total_registros ?? payload.dados?.length ?? 0),
        data: payload.dados ?? [],
      };
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof TypeError || (error instanceof Error && error.name === "AbortError");
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      await wait(400 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(
    lastError instanceof Error && lastError.name === "AbortError"
      ? "Tempo limite ao consultar o CAEZ."
      : "Falha ao consultar o CAEZ.",
  );
}

export function createCaezClient(baseUrl: string, token: string) {
  return {
    getClasses: () => request<CaezClass>(baseUrl, token, "api00702.aspx"),
    getStudentsByClass: (classId: string) =>
      request<CaezStudent>(
        baseUrl,
        token,
        "api00701.aspx",
        new URLSearchParams({ turma: classId }),
      ),
    getFinancialTitles: (document: string, start: string, end: string) =>
      request<CaezFinancialTitle>(
        baseUrl,
        token,
        "api00301.aspx",
        new URLSearchParams({
          data_vencimento_inicio: start,
          data_vencimento_termino: end,
          documento_responsavel: document,
        }),
      ),
  };
}

export function parseCaezDate(value: unknown) {
  if (typeof value !== "string") return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

export function formatCaezDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(date);
}
