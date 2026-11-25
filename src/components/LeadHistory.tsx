import * as React from "react";
import { History, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
type Event = {id:string;actorName:string|null;source:string;eventType:string;details: {from?:string;to?:string;title?:string;fields?:string[];stage?:string;owner?:string;origin?:string;reason?:string};occurredAt:string};
const labels: Record<string,string> = {
  created:"Lead criado",legacy_created:"Lead cadastrado (registro anterior)",deleted:"Lead excluído",
  stage_changed:"Etapa alterada",enrolled:"Convertido em aluno",returned:"Retornou ao funil",
  claimed:"Atendimento assumido",assigned:"Responsável atribuído",transferred:"Lead transferido",
  released:"Devolvido à fila compartilhada",unassigned:"Responsável removido",data_changed:"Dados do lead alterados",
  payment_changed:"Pagamento atualizado",follow_up:"Follow-up registrado",task_created:"Tarefa agendada",
  task_completed:"Tarefa concluída",task_reopened:"Tarefa reaberta",task_removed:"Tarefa removida",task_updated:"Tarefa alterada"
};
const fields: Record<string,string> = {full_name:"Nome",phone:"Telefone",phone2:"Telefone adicional",email:"E-mail",city:"Cidade",course_id:"Curso",course_name_snapshot:"Curso",course_value_snapshot:"Valor do curso",attendance_id:"Turma",acquisition_channel_id:"Canal de aquisição",acquisition_channel_name_snapshot:"Canal de aquisição",observations:"Observações",unit_id:"Unidade"};
const sources: Record<string,string> = {manual_create:"Cadastro manual",lead_edit:"CRM",lead_delete:"CRM",assume:"Assumir atendimento",transfer:"Central de transferências",import:"Importação",task:"Tarefas",system:"Sistema / automação",legacy:"Registro anterior"};
const dateFormatter = new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"medium",timeZone:"America/Sao_Paulo"});
export function LeadHistory({leadId,unitId,refreshKey}:{leadId:string;unitId:string;refreshKey:string}) {
  const [events,setEvents]=React.useState<Event[]>([]);
  const [loading,setLoading]=React.useState(true);
  const [error,setError]=React.useState("");
  const [hasMore,setHasMore]=React.useState(false);
  const [limit,setLimit]=React.useState(50);
  const [refresh,setRefresh]=React.useState(0);
  React.useEffect(()=>{setLimit(50);setEvents([])},[leadId,unitId]);
  React.useEffect(()=>{
    const c=new AbortController();
    let running=false;
    async function load() {
      if(running||c.signal.aborted)return;
      running=true;
      try {
        const all:Event[]=[];let more=false;
        for(let offset=0;offset<limit;offset+=50){
          const r=await fetch("/api/crm/lead-history?"+new URLSearchParams({leadId,unitId,offset:String(offset)}),{credentials:"same-origin",cache:"no-store",signal:c.signal});
          if(!r.ok)throw Error(r.status===404?"Histórico indisponível para este lead.":"Não foi possível carregar o histórico.");
          const data=await r.json();
          all.push(...data.events);more=data.hasMore;if(!more)break;
        }
        if(!c.signal.aborted){setEvents([...new Map(all.map(e=>[e.id,e])).values()]);setHasMore(more);setError("");}
      }catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:"Falha no histórico.");}
      finally{running=false;if(!c.signal.aborted)setLoading(false);}
    }
    void load();
    const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void load()},20000);
    return ()=>{c.abort();window.clearInterval(timer)};
  },[leadId,unitId,refreshKey,refresh,limit]);
  return <section className="space-y-3 rounded-xl border bg-card p-4 md:col-span-2">
    <div className="flex items-start justify-between gap-3">
      <div><h3 className="flex items-center gap-2 text-sm font-bold text-primary"><History className="h-4 w-4"/>Histórico do lead</h3>
      <p className="mt-1 text-xs text-muted-foreground">Movimentações, responsáveis e alterações registradas pelo sistema.</p></div>
      <Button type="button" size="icon" variant="ghost" onClick={()=>setRefresh(n=>n+1)} aria-label="Atualizar histórico"><RefreshCw className="h-4 w-4"/></Button>
    </div>
    {loading?<div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Carregando histórico...</div>:null}
    {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
    {!loading&&!error&&!events.length?<p className="text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>:null}
    <ol className="max-h-[340px] space-y-3 overflow-y-auto pr-2">
      {events.map(e=><li key={e.id} className="relative ml-2 border-l border-primary/20 pb-2 pl-4">
        <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-primary"/>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><span className="text-sm font-semibold">{labels[e.eventType]??e.eventType}</span><time className="text-xs text-muted-foreground">{dateFormatter.format(new Date(e.occurredAt))}</time></div>
        <p className="mt-1 text-xs text-muted-foreground">{e.actorName??(e.source==="legacy"?"Responsável não registrado":"Sistema / automação")} · {sources[e.source]??e.source}</p>
        {e.details.from||e.details.to?<p className="mt-1 break-words text-xs">{e.details.from??"—"} → {e.details.to??"—"}</p>:null}
        {e.details.title?<p className="mt-1 break-words text-xs">{e.details.title}</p>:null}
        {e.details.fields?.length?<p className="mt-1 text-xs">{[...new Set(e.details.fields.map(f=>fields[f]??f))].join(", ")}</p>:null}
        {e.details.stage?<p className="mt-1 text-xs">{e.details.stage}{e.details.owner?" · "+e.details.owner:""}{e.details.origin?" · "+e.details.origin:""}</p>:null}
        {e.details.reason?<p className="mt-1 break-words text-xs text-muted-foreground">{e.details.reason}</p>:null}
      </li>)}
    </ol>
    {hasMore?<Button type="button" size="sm" variant="outline" onClick={()=>setLimit(n=>n+50)}>Carregar mais eventos</Button>:null}
    <p className="text-[11px] text-muted-foreground">Registros anteriores à implantação incluem somente os fatos disponíveis. Horário de Brasília.</p>
  </section>
}
