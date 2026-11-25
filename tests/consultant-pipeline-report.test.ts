import assert from "node:assert/strict";
import test from "node:test";
import { summarizeConsultantPipeline } from "../src/lib/consultant-pipeline-report.ts";
import type { PipelineColumn } from "../src/lib/commercial-types.ts";
const columns = [
  {id:"new",name:"Novo lead",semanticStage:"Novo lead"},
  {id:"contact",name:"Em contato",semanticStage:"Em contato"},
  {id:"call",name:"Ligação feita",semanticStage:"Em contato"},
  {id:"pay",name:"Pagamento pendente",semanticStage:"Pagamento pendente"},
].map((c,i)=>({...c,unitId:"unit",pipelineType:"leads",color:"blue",position:i,systemKey:null})) as PipelineColumn[];
test("compara as colunas reais, resolve registros legados e separa fila compartilhada sem duplicar",()=>{
  const result=summarizeConsultantPipeline("unit",columns,[
    {owner_id:"a",shared_queue:false,pipeline_column_id:"call",stage:"Em contato",total:"5",period_total:"2"},
    {owner_id:"a",shared_queue:false,pipeline_column_id:null,stage:"Confirmado",total:"3",period_total:"1"},
    {owner_id:"a",shared_queue:true,pipeline_column_id:"new",stage:"Novo lead",total:"300",period_total:"25"},
    {owner_id:null,shared_queue:false,pipeline_column_id:null,stage:"Novo lead",total:"8",period_total:"1"},
  ],["a","b"]);
  assert.deepEqual(result.consultants.get("a")?.current,{new:0,contact:0,call:5,pay:3});
  assert.deepEqual(result.consultants.get("a")?.period,{new:0,contact:0,call:2,pay:1});
  assert.deepEqual(result.consultants.get("b")?.current,{new:0,contact:0,call:0,pay:0});
  assert.equal(result.shared.current.new,300);
  assert.equal(result.other.current.new,8);
});
