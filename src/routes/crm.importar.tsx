import * as React from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { CheckCircle2, FileSpreadsheet, Loader2, Shuffle, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { isDevRole } from "@/lib/auth-types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type TargetField = "ignore" | "fullName" | "phone" | "phone2" | "campaignName" | "formId" | "observations";
type Consultant = { id: string; name: string; email: string };
type Course = { id: string; name: string; value: string; cities: Array<string> };
type ParsedCsv = { headers: Array<string>; rows: Array<Array<string>> };

const fieldLabels: Record<TargetField, string> = {
  ignore: "Ignorar coluna",
  fullName: "Nome do lead",
  phone: "Telefone principal",
  phone2: "WhatsApp / telefone 2",
  campaignName: "Nome da campanha",
  formId: "ID do formulário",
  observations: "Observações",
};

function detectDelimiter(line: string) {
  const candidates = ["\t", ";", ","];
  return candidates.sort((a, b) => line.split(b).length - line.split(a).length)[0];
}

function parseDelimited(text: string): ParsedCsv {
  const clean = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(clean.split(/\r?\n/, 1)[0] ?? "");
  const records: Array<Array<string>> = [];
  let record: Array<string> = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    if (char === '"') {
      if (quoted && clean[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      record.push(field.trim()); field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && clean[index + 1] === "\n") index += 1;
      record.push(field.trim()); field = "";
      if (record.some(Boolean)) records.push(record);
      record = [];
    } else field += char;
  }
  record.push(field.trim());
  if (record.some(Boolean)) records.push(record);
  const headers = records.shift() ?? [];
  return { headers, rows: records.map((row) => headers.map((_, index) => row[index] ?? "")) };
}

function suggestedField(header: string): TargetField {
  const key = header.toLowerCase().replace(/[\s-]+/g, "_");
  if (["full_name", "name", "nome", "nome_completo"].includes(key)) return "fullName";
  if (["phone", "telefone", "celular"].includes(key)) return "phone";
  if (["whatsapp_number", "whatsapp", "phone2", "telefone_2"].includes(key)) return "phone2";
  if (["campaign_name", "campanha"].includes(key)) return "campaignName";
  if (["form_id", "formulario", "id_formulario"].includes(key)) return "formId";
  if (["observations", "observacoes", "observação"].includes(key)) return "observations";
  return "ignore";
}

async function readJson<T>(response: Response) {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Falha na operação.");
  return data;
}

export const Route = createFileRoute("/crm/importar")({
  head: () => ({ meta: [{ title: "Importar leads · Star Profissões" }] }),
  component: LeadImporter,
});

function LeadImporter() {
  const { session } = useAuth();
  const unitId = session?.activeUnit?.id ?? "";
  const [parsed, setParsed] = React.useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = React.useState("");
  const [mapping, setMapping] = React.useState<Array<TargetField>>([]);
  const [consultants, setConsultants] = React.useState<Array<Consultant>>([]);
  const [courses, setCourses] = React.useState<Array<Course>>([]);
  const [courseId, setCourseId] = React.useState("");
  const [city, setCity] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [skipDuplicates, setSkipDuplicates] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [importing, setImporting] = React.useState(false);
  const [result, setResult] = React.useState<{ imported: number; updated: number; duplicates: number } | null>(null);

  React.useEffect(() => {
    if (!unitId || session?.user.role !== "DEV") { setLoading(false); return; }
    setLoading(true);
    fetch(`/api/crm/import?unitId=${encodeURIComponent(unitId)}`)
      .then((response) => readJson<{ consultants: Array<Consultant>; courses: Array<Course> }>(response))
      .then((data) => { setConsultants(data.consultants); setCourses(data.courses); })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Falha ao carregar consultores."))
      .finally(() => setLoading(false));
  }, [session?.user.role, unitId]);

  if (session && !isDevRole(session.user.role)) return <Navigate to="/crm" />;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const next = parseDelimited(await file.text());
    if (!next.headers.length || !next.rows.length) { toast.error("O arquivo não possui cabeçalho e linhas válidas."); return; }
    setFileName(file.name);
    setParsed(next);
    setMapping(next.headers.map(suggestedField));
    setResult(null);
  }

  function mappedRows() {
    return (parsed?.rows ?? []).map((values) => {
      const row: Record<string, string> = {};
      mapping.forEach((target, index) => {
        if (target !== "ignore" && values[index]) row[target] = row[target] ? `${row[target]} ${values[index]}` : values[index];
      });
      return row;
    });
  }

  async function importLeads() {
    if (!parsed) return;
    if (!mapping.includes("fullName") || !mapping.includes("phone")) { toast.error("Mapeie ao menos Nome e Telefone principal."); return; }
    if (!selected.size) { toast.error("Selecione ao menos um consultor."); return; }
    if (!courseId) { toast.error("Selecione o curso dos leads."); return; }
    if (!city.trim()) { toast.error("Informe a cidade dos leads."); return; }
    setImporting(true);
    try {
      const data = await readJson<{ imported: number; updated: number; duplicates: number }>(await fetch("/api/crm/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId, rows: mappedRows(), consultantIds: Array.from(selected), courseId, city: city.trim(), skipDuplicates }),
      }));
      setResult(data);
      toast.success(`${data.imported} importado(s) e ${data.updated} atualizado(s).`);
      if ("BroadcastChannel" in window) {
        const channel = new BroadcastChannel(`crm-pipeline-${unitId}`);
        channel.postMessage({ type: "leads-imported" }); channel.close();
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao importar leads."); }
    finally { setImporting(false); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Importar leads" description="Importação manual de leads para a unidade ativa. Acesso exclusivo para DEV." />
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-primary" />Arquivo CSV</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Label htmlFor="lead-csv" className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/25 bg-primary/5 p-6 text-center hover:bg-primary/10">
            <Upload className="mb-2 h-7 w-7 text-primary" /><span className="font-medium">Escolher CSV ou arquivo separado por tabulação</span><span className="mt-1 text-xs text-muted-foreground">Até 2.000 linhas por importação</span>
          </Label>
          <Input id="lead-csv" type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={(event) => void handleFile(event.target.files?.[0])} />
          {parsed ? <div className="flex flex-wrap gap-2"><Badge variant="secondary">{fileName}</Badge><Badge variant="secondary">{parsed.rows.length} linhas</Badge></div> : null}
        </CardContent>
      </Card>

      {parsed ? <>
        <Card><CardHeader><CardTitle>Mapeamento das colunas</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {parsed.headers.map((header, index) => <div key={`${header}-${index}`} className="space-y-2"><Label>{header || `Coluna ${index + 1}`}</Label><Select value={mapping[index]} onValueChange={(value) => setMapping((current) => current.map((item, itemIndex) => itemIndex === index ? value as TargetField : item))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(fieldLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><p className="truncate text-xs text-muted-foreground">Exemplo: {parsed.rows[0]?.[index] || "—"}</p></div>)}
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Curso e cidade</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label>Curso dos leads</Label><Select value={courseId} onValueChange={(value) => { setCourseId(value); const selectedCourse = courses.find((course) => course.id === value); setCity(selectedCourse?.cities.length === 1 ? selectedCourse.cities[0] : ""); }}><SelectTrigger><SelectValue placeholder="Selecione o curso" /></SelectTrigger><SelectContent>{courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="import-city">Cidade dos leads</Label><Input id="import-city" list="import-course-cities" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Ex.: Juiz de Fora" /><datalist id="import-course-cities">{(courses.find((course) => course.id === courseId)?.cities ?? []).map((item) => <option key={item} value={item} />)}</datalist></div>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Direcionamento</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Shuffle className="h-4 w-4" />Com vários consultores, cada lead recebe um deles aleatoriamente.</div>
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{consultants.map((consultant) => <Label key={consultant.id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3"><Checkbox checked={selected.has(consultant.id)} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(consultant.id); else next.delete(consultant.id); return next; })} /><span><span className="block font-medium">{consultant.name}</span><span className="text-xs text-muted-foreground">{consultant.email}</span></span></Label>)}</div>}
          <Label className="flex items-center gap-3"><Checkbox checked={skipDuplicates} onCheckedChange={(checked) => setSkipDuplicates(checked === true)} />Ignorar telefones que já existem nesta unidade</Label>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Pré-visualização</CardTitle></CardHeader><CardContent className="space-y-4"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Telefone</TableHead><TableHead>WhatsApp</TableHead><TableHead>Campanha</TableHead><TableHead>Formulário</TableHead></TableRow></TableHeader><TableBody>{mappedRows().slice(0, 8).map((row, index) => <TableRow key={index}><TableCell>{row.fullName || "—"}</TableCell><TableCell>{row.phone || "—"}</TableCell><TableCell>{row.phone2 || "—"}</TableCell><TableCell className="max-w-64 truncate">{row.campaignName || "—"}</TableCell><TableCell>{row.formId || "—"}</TableCell></TableRow>)}</TableBody></Table></div>
          {result ? <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-5 w-5" />{result.imported} importados; {result.updated} já importados atualizados; {result.duplicates} duplicados ignorados.</div> : null}
          <Button onClick={() => void importLeads()} disabled={importing || !selected.size || !courseId || !city.trim()}>{importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}{importing ? "Importando..." : `Importar ${parsed.rows.length} leads`}</Button>
        </CardContent></Card>
      </> : null}
    </div>
  );
}
