/* CIMAT 1.0.0-beta: laboratorio de elicitacion y formalizacion.
 * Preguntas de seguimiento por REGLAS (no IA), extraccion IA opcional con consentimiento
 * independiente, trazabilidad literal, validacion humana y diagrama del proceso real.
 * No modifica modelos normativos ni publica respuestas de otros participantes.
 */
(() => {
"use strict";
const $=id=>document.getElementById(id);
const config=window.CIMAT_CONFIG||{};
const root=String(config.SUPABASE_URL||"").replace(/\/+$/,"");
const key=String(config.SUPABASE_PUBLISHABLE_KEY||"");
const label={proceso:"Proceso",actividad:"Actividad",tarea:"Tarea",decision:"Decisión",rol:"Rol",
  entrada:"Entrada",salida:"Salida",excepcion:"Excepción",criterio:"Criterio"};
const edgeTypes={precede:"Precede",contiene:"Contiene",participa:"Participa",
  utiliza:"Utiliza",genera:"Genera",depende:"Depende de"};
let owner="",banks=[],sessions=[],selected=null,base=[],followups=[],findings=[],relations=[],contrasts=[];
let pendingAI=[],pendingProbes=[],busy=false,graph=null;
function session(){
 let s;
 try{s=JSON.parse(sessionStorage.getItem("cimat_v012_sesion")||"null");}catch(_){}
 if(!s?.user?.id||!s.access_token||Date.now()>=s.expires_at)
   throw Error("La sesión no está vigente. Inicia sesión de nuevo.");
 return s;
}
async function api(path,method="GET",body,prefer){
 const s=session();
 const r=await fetch(root+path,{method,cache:"no-store",headers:{
   apikey:key,Authorization:"Bearer "+s.access_token,Accept:"application/json",
   ...(body===undefined?{}:{"Content-Type":"application/json"}),
   ...(prefer?{Prefer:prefer}:{})
 },...(body===undefined?{}:{body:JSON.stringify(body)})});
 const raw=await r.text();let data;
 try{data=raw?JSON.parse(raw):[];}catch(_){data=[];}
 if(!r.ok)throw Error("HTTP "+r.status+": "+(data?.message||data?.mensaje||data?.details||"Solicitud rechazada"));
 if(session().user.id!==s.user.id)throw Error("La sesión cambió; recarga este módulo.");
 return data;
}
function node(tag,text,className){
 const x=document.createElement(tag);
 if(text!==undefined&&text!==null)x.textContent=String(text);
 if(className)x.className=className;
 return x;
}
function opt(value,text){const e=node("option",text);e.value=value;return e;}
function msg(text,error=false){
 const m=$("c100-status");m.textContent=text;m.classList.toggle("error",error);
}
function show(id,yes){$(id).classList.toggle("hidden",!yes);}
function clean(){
 if(graph){graph.destroy();graph=null;}
 owner="";banks=[];sessions=[];selected=null;base=[];followups=[];findings=[];relations=[];contrasts=[];pendingAI=[];pendingProbes=[];
 $("c100-select").replaceChildren();$("c100-details").classList.add("hidden");
 $("c100-ai-preview").replaceChildren();$("c100-probe-preview").replaceChildren();$("c100-select").replaceChildren();
 msg("Selecciona el módulo para cargar tus entrevistas privadas.");
}
function qList(){
 const b=banks.find(x=>x.id===selected?.cuestionario_id);
 return [...(b?.preguntas||[])].filter(x=>x.habilitada).sort((a,b)=>a.orden-b.orden);
}
function sources(){
 return [
 ...qList().filter(q=>base.some(a=>a.pregunta_id===q.id&&a.estado==="respondida"))
  .map(q=>({key:"b:"+q.id,id:q.id,type:"base",text:base.find(a=>a.pregunta_id===q.id)?.respuesta||"",title:q.pregunta})),
 ...followups.filter(a=>a.estado==="respondido").map(a=>({
  key:"s:"+a.id,id:a.id,type:"seguimiento",text:a.respuesta||"",title:a.pregunta
 }))
 ];
}
function nameOf(s){const b=banks.find(x=>x.id===s.cuestionario_id);
 return (b?.titulo||"Cuestionario")+" · v"+(b?.version||"?")+" · "+
   (s.estado==="finalizada"?"finalizada":"en curso");
}
async function loadLists(){
 const [q,s]=await Promise.all([
  api("/rest/v1/cimat_086_cuestionarios?select=id,titulo,version,preguntas,estado&estado=eq.publicado&limit=200"),
  api("/rest/v1/cimat_087_entrevistas?select=id,cuestionario_id,estado,creado_en,actualizado_en&order=actualizado_en.desc&limit=100")
 ]);
 banks=q;sessions=s;
 const target=$("c100-select"),old=selected?.id||target.value;
 target.replaceChildren(opt("","Selecciona una entrevista propia"));
 sessions.forEach(x=>target.append(opt(x.id,nameOf(x))));
 if(sessions.some(x=>x.id===old))target.value=old;
 show("c100-no-sessions",!sessions.length);
}
async function initialize(){
 try{
  const who=session().user.id;
  if(owner===who)return;
  clean();
  msg("Consultando entrevistas y permisos...");
  await loadLists();owner=who;show("c100-controls",true);
  msg("Laboratorio beta preparado. Las hipótesis necesitan evidencia y validación.");
 }catch(e){clean();show("c100-controls",false);msg(e.message,true);}
}
async function selectInterview(id){
 const changed=selected?.id!==id;
 selected=sessions.find(x=>x.id===id)||null;
 if(changed){
  $("c100-ai-consent").checked=false;
  $("c100-ai-probes-consent").checked=false;
  $("c100-ai-probes").replaceChildren();
 }
 pendingAI=[];pendingProbes=[];
 $("c100-ai-preview").replaceChildren();$("c100-probe-preview").replaceChildren();
 if(!selected){show("c100-details",false);if(graph){graph.destroy();graph=null;}return;}
 const eid=encodeURIComponent(id);
 const [r,f,h,l,c]=await Promise.all([
 api("/rest/v1/cimat_087_respuestas?select=pregunta_id,estado,respuesta&entrevista_id=eq."+eid),
 api("/rest/v1/cimat_10_seguimientos?select=*&entrevista_id=eq."+eid+"&order=creado_en.asc"),
 api("/rest/v1/cimat_10_hallazgos?select=*&entrevista_id=eq."+eid+"&order=creado_en.asc"),
 api("/rest/v1/cimat_10_relaciones?select=*&entrevista_id=eq."+eid+"&order=creado_en.asc"),
 api("/rest/v1/cimat_10_contrastes?select=*&entrevista_id=eq."+eid+"&order=creado_en.asc")
 ]);
 base=r;followups=f;findings=h;relations=l;contrasts=c;
 show("c100-details",true);
 render();
}
function render(){if(!selected)return;
 const qs=qList(),a=base.filter(x=>x.estado==="respondida").length,omitted=base.filter(x=>x.estado==="omitida").length;
 const confirmed=findings.filter(x=>x.estado==="confirmado");
 $("c100-summary").textContent=
  "Preguntas iniciales: "+a+" respondidas, "+omitted+" omitidas, "+qs.length+
  " habilitadas · Seguimientos: "+followups.length+" · Hallazgos propuestos: "+
  findings.filter(x=>x.estado==="propuesto").length+" · Confirmados: "+confirmed.length;
 $("c100-session-state").textContent=nameOf(selected);
 renderFollowups();renderSourceSelect();renderFindings();renderRelations();renderContrasts();renderGraph();
}
function signalSuggestions(q,a){
 const text=(a.respuesta||"").toLocaleLowerCase("es");
 const cues=[
  {test:/\bdepende\b|\bsegún\b|\ba veces\b/u,signal:"decision",
   prompt:"¿De qué depende que elija una forma de actuar u otra? Describa un caso concreto."},
  {test:/\bnormalmente\b|\bgeneralmente\b|\bsiempre\b/u,signal:"excepcion",
   prompt:"¿Recuerda alguna ocasión en que esa manera habitual no funcionó? ¿Qué hizo?"},
  {test:/\brevis[oaé]?\b|\bverific[oaé]?\b|\bcompruebo\b/u,signal:"decision",
   prompt:"¿En qué se fija para decidir que la revisión es suficiente o que algo está correcto?"},
  {test:/\baviso\b|\bconsulto\b|\bcompart[io]\b|\bentrego\b/u,signal:"coordinacion",
   prompt:"¿Qué información intercambia con otras personas y cómo sabe cuándo hacerlo?"},
  {test:/\bexperiencia\b|\bintuici[oó]n\b|\bme doy cuenta\b/u,signal:"experiencia",
   prompt:"¿Qué señales concretas reconoce gracias a su experiencia? ¿Puede recordar un ejemplo?"},
  {test:/\bproblema\b|\bfall[oa]\b|\berror\b|\bno hab[ií]a\b/u,signal:"excepcion",
   prompt:"Piense en el último problema semejante: ¿cómo lo identificó y qué pasos siguió?"},
  {test:/\bdespués\b|\bluego\b|\bprimero\b/u,signal:"ejemplo",
   prompt:"¿Qué hace entre esos pasos y qué resultado le permite continuar?"}
 ];
 const candidates=[];
 for(const cue of cues)if(cue.test.test(text))candidates.push(cue);
 const bankProbes=(q.sondeos||[]).slice(0,2).map(p=>({prompt:p,signal:"otro"}));
 if(!candidates.length)candidates.push({signal:"ejemplo",
   prompt:"¿Puede relatar un ejemplo reciente y explicar qué hizo usted en cada momento?"});
 return [...candidates,...bankProbes].filter((x,i,arr)=>
   arr.findIndex(y=>y.prompt===x.prompt)===i &&
   !followups.some(s=>s.pregunta_id===q.id&&s.pregunta===x.prompt)).slice(0,3);
}
function renderFollowups(){
 const source=$("c100-base"),existing=source.value;
 source.replaceChildren(opt("","Selecciona una respuesta para profundizar"));
 qList().forEach(q=>{
  if(base.some(a=>a.pregunta_id===q.id&&a.estado==="respondida"))
    source.append(opt(q.id,q.pregunta));
 });
 if([...source.options].some(x=>x.value===existing))source.value=existing;
 $("c100-add-followup").disabled=selected.estado!=="en_curso";
 const choice=qList().find(q=>q.id===source.value);
 const output=$("c100-suggestions");output.replaceChildren();
 if(choice){
  const answer=base.find(x=>x.pregunta_id===choice.id);
  output.append(node("p","Respuesta original: "+(answer?.respuesta||"").slice(0,900),"c100-source-text"));
  for(const x of signalSuggestions(choice,answer)){
   const card=node("div",null,"c100-row");
   card.append(node("span",x.prompt));
   const button=node("button","Añadir seguimiento","outline");
   button.type="button";button.dataset.probe=x.prompt;button.dataset.signal=x.signal;
   button.disabled=selected.estado!=="en_curso";
   card.append(button);output.append(card);
  }
 }
 const listing=$("c100-followups");listing.replaceChildren();
 followups.forEach(f=>{
  const card=node("article",null,"c100-item");
  card.append(node("strong",f.pregunta),node("small","Señal: "+f.senal+" · "+f.estado));
  const answer=node("textarea");answer.rows=3;answer.maxLength=10000;
  answer.value=f.respuesta||"";answer.placeholder="Explique con sus propias palabras…";
  answer.disabled=selected.estado!=="en_curso";
  answer.dataset.followup=f.id;card.append(answer);
  if(selected.estado==="en_curso"){
   const actions=node("div",null,"c100-actions");
   for(const [action,text] of [["respondido","Guardar respuesta"],["omitido","Omitir"]]){
    const button=node("button",text,action==="omitido"?"outline":"");
    button.type="button";button.dataset.status=action;button.dataset.id=f.id;
    actions.append(button);
   }
   card.append(actions);
  }
  listing.append(card);
 });
 if(!followups.length)listing.append(node("p","Todavía no existen preguntas de seguimiento.","subtle"));
}
function renderSourceSelect(){
 const select=$("c100-source"),value=select.value;
 select.replaceChildren(opt("","Selecciona la respuesta que sustenta el hallazgo"));
 sources().forEach(s=>select.append(opt(s.key,s.title)));
 if([...select.options].some(o=>o.value===value))select.value=value;
 const src=sources().find(s=>s.key===select.value);
 $("c100-evidence-preview").textContent=src?
   "Texto original (selecciona y copia un fragmento literal): "+src.text:
   "Selecciona una respuesta para consultar su texto original.";
}
function renderFindings(){
 const target=$("c100-findings");target.replaceChildren();
 findings.forEach(h=>{
  const card=node("article",null,"c100-item");
  const head=node("div",null,"c100-row");
  head.append(node("strong",(label[h.tipo]||h.tipo)+" · "+h.titulo));
  head.append(node("span",h.estado,"c100-state"));
  card.append(head,node("p",h.descripcion||"Sin descripción","subtle"));
  card.append(node("blockquote","«"+h.evidencia_literal+"»"));
  card.append(node("small",h.origen==="ia"?"Hipótesis propuesta con IA":"Propuesta manual"));
  const actions=node("div",null,"c100-actions");
  if(h.estado!=="confirmado"){
   const b=node("button","Confirmar","outline");b.type="button";b.dataset.validate=h.id;b.dataset.action="confirmado";actions.append(b);
  }
  if(h.estado!=="rechazado"){
   const b=node("button","Rechazar","outline");b.type="button";b.dataset.validate=h.id;b.dataset.action="rechazado";actions.append(b);
  }
  if(h.estado!=="propuesto"){
   const b=node("button","Reabrir revisión","outline");b.type="button";b.dataset.validate=h.id;b.dataset.action="propuesto";actions.append(b);
  }
  card.append(actions);target.append(card);
 });
 if(!findings.length)target.append(node("p","No hay hallazgos. Puedes registrarlos manualmente o solicitar hipótesis asistidas.","subtle"));
}
function setApprovedOptions(element,old=""){
 element.replaceChildren(opt("","Selecciona un hallazgo confirmado"));
 findings.filter(x=>x.estado==="confirmado").forEach(x=>element.append(opt(x.id,(label[x.tipo]||x.tipo)+" · "+x.titulo)));
 if([...element.options].some(o=>o.value===old))element.value=old;
}
function renderRelations(){
 const a=$("c100-edge-from"),b=$("c100-edge-to"),oa=a.value,ob=b.value;
 setApprovedOptions(a,oa);setApprovedOptions(b,ob);
 const target=$("c100-relations");target.replaceChildren();
 relations.forEach(r=>{
  const from=findings.find(x=>x.id===r.origen_id),to=findings.find(x=>x.id===r.destino_id);
  target.append(node("p",(from?.titulo||"?")+" — "+(edgeTypes[r.tipo]||r.tipo)+" → "+(to?.titulo||"?"),"c100-relation"));
 });
 if(!relations.length)target.append(node("p","No hay relaciones verificadas aún.","subtle"));
}
function renderContrasts(){
 const select=$("c100-contrast-hallazgo"),old=select.value;
 setApprovedOptions(select,old);
 const target=$("c100-contrasts");target.replaceChildren();
 contrasts.forEach(c=>{
  const h=findings.find(x=>x.id===c.hallazgo_id);
  target.append(node("p",(h?.titulo||"?")+" · "+c.referencia+": "+c.observacion,"c100-relation"));
 });
 if(!contrasts.length)target.append(node("p","No hay comparaciones opcionales registradas.","subtle"));
}
function renderGraph(){
 const canvas=$("c100-canvas");
 if(graph){graph.destroy();graph=null;}
 canvas.replaceChildren();
 const nodes=findings.filter(x=>x.estado==="confirmado");
 const valid=new Set(nodes.map(n=>n.id));
 if(!nodes.length){
  canvas.append(node("p","Confirma al menos un hallazgo para visualizar el modelo provisional del proceso real.","subtle"));
  return;
 }
 if(typeof window.cytoscape!=="function"){
  nodes.forEach(n=>canvas.append(node("p",(label[n.tipo]||n.tipo)+" · "+n.titulo)));
  return;
 }
 const elements=[
  ...nodes.map(n=>({data:{id:n.id,label:n.titulo,kind:n.tipo}})),
  ...relations.filter(r=>valid.has(r.origen_id)&&valid.has(r.destino_id)).map(r=>({
   data:{id:r.id,source:r.origen_id,target:r.destino_id,label:edgeTypes[r.tipo]||r.tipo}
  }))
 ];
 graph=window.cytoscape({container:canvas,elements,
   layout:{name:"breadthfirst",directed:true,padding:35,spacingFactor:1.25},
   minZoom:0.15,maxZoom:3,wheelSensitivity:0.2,
   style:[
    {selector:"node",style:{"background-color":"#d8e7f2","border-color":"#608baa",
     "border-width":2,"width":155,"height":68,"shape":"round-rectangle","label":"data(label)",
     "text-wrap":"wrap","text-max-width":"130px","font-size":11,"color":"#14344d"}},
    {selector:'node[kind="tarea"]',style:{"background-color":"#dbf0df"}},
    {selector:'node[kind="decision"]',style:{"shape":"diamond","background-color":"#ffeed0"}},
    {selector:'node[kind="proceso"]',style:{"background-color":"#cfe0fa"}},
    {selector:'edge',style:{"curve-style":"taxi","taxi-direction":"downward",
      "target-arrow-shape":"triangle","line-color":"#6b849a","target-arrow-color":"#6b849a",
      "width":2,"label":"data(label)","font-size":9,"text-background-opacity":1,
      "text-background-color":"#fff","text-background-padding":"2px"}}
   ]});
}
function renderProbePreview(){
 const target=$("c100-probe-preview");target.replaceChildren();
 pendingProbes.forEach((x,i)=>{
  const item=node("div",null,"c100-row");
  item.append(node("span",x.pregunta));
  const b=node("button","Añadir sugerencia","outline");b.type="button";
  b.dataset.probeAi=String(i);b.disabled=selected?.estado!=="en_curso";
  item.append(b);target.append(item);
 });
 if(!pendingProbes.length)target.append(node("p","No hay propuestas de seguimiento de IA para revisar.","subtle"));
}
async function loadAIProbes(){
 if(!$("c100-ai-consent").checked)throw Error("Autoriza de manera explícita el análisis externo de respuestas ficticias.");
 if(!selected||selected.estado!=="en_curso")throw Error("Solo se pueden añadir seguimientos a entrevistas abiertas.");
 const qid=$("c100-base").value;
 if(!qid||!base.some(a=>a.pregunta_id===qid&&a.estado==="respondida"))
   throw Error("Selecciona una pregunta principal con respuesta guardada.");
 const previous=selected.id,user=session().user.id;
 const r=await fetch(root+"/functions/v1/cimat-entrevista-beta",{
  method:"POST",headers:{"Content-Type":"application/json",apikey:key,Authorization:"Bearer "+session().access_token},
  body:JSON.stringify({accion:"sondear",entrevista_id:previous,pregunta_id:qid,consentimiento_externo:true})
 });
 let data={};try{data=await r.json();}catch(_){}
 if(!r.ok)throw Error(data.mensaje||"HTTP "+r.status+" al consultar IA.");
 if(session().user.id!==user||selected?.id!==previous)throw Error("Cambió la entrevista activa.");
 pendingProbes=(Array.isArray(data.preguntas)?data.preguntas:[])
   .filter(x=>x&&typeof x.pregunta==="string"&&x.pregunta.length>=10);
 renderProbePreview();
 msg("Se generaron "+pendingProbes.length+" sugerencias opcionales. Elige cuáles deseas incorporar.");
}
function renderAIPreview(){
 const target=$("c100-ai-preview");target.replaceChildren();
 pendingAI.forEach((x,i)=>{
  const card=node("article",null,"c100-item");
  card.append(node("strong",(label[x.tipo]||x.tipo)+" · "+x.titulo));
  card.append(node("p",x.descripcion||"","subtle"));
  card.append(node("blockquote","«"+x.evidencia_literal+"»"));
  const button=node("button","Guardar como hipótesis","outline");
  button.type="button";button.dataset.ai=i;card.append(button);
  target.append(card);
 });
 if(!pendingAI.length)target.append(node("p","No hay hipótesis nuevas para revisar.","subtle"));
}
async function loadAIProbes(){
 if(!selected||selected.estado!=="en_curso")
   throw Error("Solo puedes añadir seguimientos a una entrevista en curso.");
 if(!$("c100-ai-probes-consent").checked)
   throw Error("Primero autoriza expresamente el análisis externo de la respuesta ficticia.");
 const id=selected.id,qid=$("c100-base").value;
 if(!qid)throw Error("Selecciona una respuesta original guardada.");
 const token=session().access_token;
 const res=await fetch(root+"/functions/v1/cimat-entrevista-beta",{
  method:"POST",headers:{apikey:key,Authorization:"Bearer "+token,"Content-Type":"application/json"},
  body:JSON.stringify({accion:"sondear",entrevista_id:id,pregunta_id:qid,consentimiento_externo:true})
 });
 let data={};try{data=await res.json();}catch(_){}
 if(!res.ok)throw Error(data.mensaje||"HTTP "+res.status+" del servicio de IA.");
 if(selected?.id!==id||$("c100-base").value!==qid||session().user.id!==owner)
   throw Error("La selección cambió; descarta las preguntas anteriores.");
 const target=$("c100-ai-probes");target.replaceChildren();
 const suggestions=(Array.isArray(data.preguntas)?data.preguntas:[]).filter(
   x=>typeof x.pregunta==="string"&&x.pregunta.length>=10&&
   !followups.some(s=>s.pregunta_id===qid&&s.pregunta===x.pregunta));
 for(const x of suggestions){
  const row=node("div",null,"c100-row");
  row.append(node("span",x.pregunta));
  const b=node("button","Añadir seguimiento con IA","outline");
  b.type="button";b.dataset.probe=x.pregunta;b.dataset.signal=x.senal;
  row.append(b);target.append(row);
 }
 if(!suggestions.length)target.append(node("p","El análisis no propuso preguntas adicionales válidas.","subtle"));
 msg("IA: "+suggestions.length+" sugerencia(s) de seguimiento. Debes elegir cuáles utilizar.");
}
async function loadAI(){
 if(!$("c100-ai-consent").checked)throw Error("Autoriza explícitamente el análisis externo de las respuestas ficticias.");
 const id=selected?.id;if(!id)throw Error("Selecciona una entrevista.");
 const token=session().access_token;
 const r=await fetch(root+"/functions/v1/cimat-entrevista-beta",{
  method:"POST",headers:{"Content-Type":"application/json",
  apikey:key,Authorization:"Bearer "+token},
  body:JSON.stringify({accion:"extraer",entrevista_id:id,consentimiento_externo:true})});
 let data={};try{data=await r.json();}catch(_){}
 if(!r.ok)throw Error(data.mensaje||"HTTP "+r.status+" al invocar el servicio de IA.");
 if(session().user.id!==owner||selected?.id!==id)throw Error("La sesión cambió; no se presentarán resultados.");
 pendingAI=Array.isArray(data.candidatos)?data.candidatos:[];
 renderAIPreview();
 msg("IA: "+pendingAI.length+" hipótesis con evidencia literal. Ninguna se confirma automáticamente.");
}
async function doAction(fn){
 if(busy)return;
 busy=true;
 try{await fn();}catch(e){msg(e.message||String(e),true);}
 finally{busy=false;}
}
async function addFollowup(pregunta,senal){
 if(!selected||selected.estado!=="en_curso")throw Error("Esta entrevista ya no admite seguimientos.");
 const qid=$("c100-base").value;
 if(!qid||!base.some(x=>x.pregunta_id===qid&&x.estado==="respondida"))
  throw Error("Elige una respuesta original guardada.");
 const rows=await api("/rest/v1/cimat_10_seguimientos?select=*&on_conflict=entrevista_id,pregunta_id,pregunta",
 "POST",{entrevista_id:selected.id,pregunta_id:qid,pregunta,senal},
 "resolution=ignore-duplicates,return=representation");
 await selectInterview(selected.id);
 msg(rows.length?"Pregunta de seguimiento registrada.":"Esta pregunta ya estaba registrada.");
}
async function saveFollowup(id,estado){
 const f=followups.find(x=>x.id===id);
 if(!f)throw Error("Seguimiento inexistente.");
 const text=document.querySelector("textarea[data-followup='"+id+"']")?.value.trim()||"";
 if(estado==="respondido"&&(!text||text.length>10000))throw Error("Escribe una respuesta válida.");
 const rows=await api("/rest/v1/cimat_10_seguimientos?id=eq."+encodeURIComponent(id)+"&select=id,estado",
 "PATCH",{estado,respuesta:estado==="respondido"?text:null},"return=representation");
 if(!Array.isArray(rows)||rows.length!==1)throw Error("No se confirmó el guardado.");
 await selectInterview(selected.id);msg("Seguimiento guardado.");
}
function payloadFinding(source,tipo,titulo,descripcion,quote,origen="manual",modelo=null){
 const src=sources().find(s=>s.key===source);
 if(!src)throw Error("Selecciona una respuesta fuente.");
 if(!quote||quote.length<8||!src.text.includes(quote))
   throw Error("La evidencia debe copiarse literalmente de la respuesta seleccionada (8 caracteres como mínimo).");
 return {entrevista_id:selected.id,tipo,titulo,descripcion,evidencia_literal:quote,
  origen,modelo, ...(src.type==="base"?{pregunta_id:src.id}:{seguimiento_id:src.id})};
}
async function saveFinding(x){
 const r=await api("/rest/v1/cimat_10_hallazgos?select=id","POST",x,"return=representation");
 if(!Array.isArray(r)||r.length!==1)throw Error("No se confirmó el hallazgo.");
 await selectInterview(selected.id);
 msg("Hipótesis guardada con evidencia literal. Requiere confirmación humana.");
}
async function updateFinding(id,state){
 const r=await api("/rest/v1/cimat_10_hallazgos?id=eq."+encodeURIComponent(id)+"&select=id,estado",
 "PATCH",{estado:state},"return=representation");
 if(!Array.isArray(r)||r.length!==1)throw Error("No se confirmó la validación.");
 await selectInterview(selected.id);msg("Estado de revisión actualizado: "+state+".");
}
async function addRelation(){
 const a=$("c100-edge-from").value,b=$("c100-edge-to").value,type=$("c100-edge-type").value;
 if(!a||!b||a===b)throw Error("Selecciona dos hallazgos confirmados diferentes.");
 const r=await api("/rest/v1/cimat_10_relaciones?select=id",
 "POST",{entrevista_id:selected.id,origen_id:a,destino_id:b,tipo:type,
 nota:$("c100-edge-note").value.trim()},"return=representation");
 if(!Array.isArray(r)||r.length!==1)throw Error("La relación no se registró.");
 await selectInterview(selected.id);msg("Relación del proceso registrada y representada en el diagrama.");
}
async function addContrast(){
 const hallazgo_id=$("c100-contrast-hallazgo").value,referencia=$("c100-reference").value.trim(),
 observacion=$("c100-observation").value.trim();
 if(!hallazgo_id||referencia.length<5||observacion.length<10)
  throw Error("Selecciona un hallazgo confirmado y describe la referencia y la observación.");
 const r=await api("/rest/v1/cimat_10_contrastes?select=id","POST",
  {entrevista_id:selected.id,hallazgo_id,referencia,observacion},"return=representation");
 if(!Array.isArray(r)||r.length!==1)throw Error("El contraste no se confirmó.");
 $("c100-observation").value="";await selectInterview(selected.id);
 msg("Comparación opcional registrada. No supone cumplimiento ni incumplimiento.");
}
function exportValidated(){
 if(!selected)throw Error("Selecciona una entrevista.");
 const valid=findings.filter(x=>x.estado==="confirmado");
 if(!valid.length)throw Error("Confirma al menos un hallazgo antes de exportar.");
 const ids=new Set(valid.map(x=>x.id));
 const data={sistema:"CIMAT",version:"1.0.0-beta",tipo:"modelo_organizacional_provisional",
  entrevista_id:selected.id,exportado_en:new Date().toISOString(),
  limite:"Hallazgos validados por la cuenta del participante. No equivale a auditoría normativa.",
  elementos:valid.map(x=>({id:x.id,tipo:x.tipo,titulo:x.titulo,descripcion:x.descripcion,
   origen:x.origen,evidencia_literal:x.evidencia_literal,pregunta_id:x.pregunta_id,
   seguimiento_id:x.seguimiento_id,validado_en:x.validado_en})),
  relaciones:relations.filter(x=>ids.has(x.origen_id)&&ids.has(x.destino_id)).map(
   x=>({origen_id:x.origen_id,destino_id:x.destino_id,tipo:x.tipo,nota:x.nota})),
  contrastes:contrasts.filter(x=>ids.has(x.hallazgo_id)).map(
   x=>({hallazgo_id:x.hallazgo_id,referencia:x.referencia,observacion:x.observacion}))
 };
 if(!window.confirm("El archivo contendrá evidencias textuales del proceso. ¿Quieres exportarlo a tu equipo?"))return;
 const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
 const href=URL.createObjectURL(blob);const a=document.createElement("a");
 a.href=href;a.download="cimat-modelo-beta-"+selected.id.slice(0,8)+".json";
 document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(href),1500);
}
function bind(){
 document.querySelector('[data-view="beta"]')?.addEventListener("click",initialize);
 $("c100-select").addEventListener("change",e=>doAction(()=>selectInterview(e.target.value)));
 $("c100-reload").addEventListener("click",()=>doAction(async()=>{const id=selected?.id;await loadLists();if(id)await selectInterview(id);msg("Datos actualizados.");}));
 $("c100-base").addEventListener("change",()=>{
  $("c100-ai-probes").replaceChildren();
  renderFollowups();
 });
 for(const id of ["c100-suggestions","c100-ai-probes"]){
  $(id).addEventListener("click",e=>{
   const b=e.target.closest("button[data-probe]");
   if(b)doAction(()=>addFollowup(b.dataset.probe,b.dataset.signal));
  });
 }
 $("c100-ai-probes-run").addEventListener("click",()=>doAction(loadAIProbes));
 $("c100-add-followup").addEventListener("click",()=>doAction(async()=>{
  const text=$("c100-custom-followup").value.trim();
  if(text.length<10||text.length>500)throw Error("Escribe una pregunta de 10 a 500 caracteres.");
  await addFollowup(text,"otro");$("c100-custom-followup").value="";
 }));
 $("c100-followups").addEventListener("click",e=>{
  const b=e.target.closest("button[data-status]");if(b)doAction(()=>saveFollowup(b.dataset.id,b.dataset.status));
 });
 $("c100-source").addEventListener("change",renderSourceSelect);
 $("c100-finding-form").addEventListener("submit",e=>{
  e.preventDefault();doAction(async()=>{
   const p=payloadFinding($("c100-source").value,$("c100-type").value,
    $("c100-title").value.trim(),$("c100-description").value.trim(),
    $("c100-quote").value.trim());
   await saveFinding(p);
   $("c100-title").value="";$("c100-description").value="";$("c100-quote").value="";
  });
 });
 $("c100-ai-run").addEventListener("click",()=>doAction(loadAI));
 $("c100-ai-probes").addEventListener("click",()=>doAction(loadAIProbes));
 $("c100-probe-preview").addEventListener("click",e=>{
  const b=e.target.closest("button[data-probe-ai]");if(!b)return;
  doAction(async()=>{
   const x=pendingProbes[Number(b.dataset.probeAi)];
   if(!x)return;
   await addFollowup(x.pregunta,x.senal||"otro");
   pendingProbes=pendingProbes.filter(y=>y!==x);
   renderProbePreview();
  });
 });
 $("c100-ai-preview").addEventListener("click",e=>{
  const b=e.target.closest("button[data-ai]");if(!b)return;
  doAction(async()=>{
   const x=pendingAI[Number(b.dataset.ai)];if(!x)return;
   const remaining=pendingAI.filter(y=>y!==x);
   const p=payloadFinding(x.fuente,x.tipo,x.titulo,x.descripcion,x.evidencia_literal,"ia",x.modelo||null);
   await saveFinding(p);
   pendingAI=remaining;
   renderAIPreview();
  });
 });
 $("c100-findings").addEventListener("click",e=>{
  const b=e.target.closest("button[data-validate]");if(b)doAction(()=>updateFinding(b.dataset.validate,b.dataset.action));
 });
 $("c100-relation-form").addEventListener("submit",e=>{
  e.preventDefault();doAction(addRelation);
 });
 $("c100-contrast-form").addEventListener("submit",e=>{
  e.preventDefault();doAction(addContrast);
 });
 $("c100-export").addEventListener("click",()=>doAction(exportValidated));
 $("logout")?.addEventListener("click",clean);
 $("login-form")?.addEventListener("submit",clean);
}
if($("c100-controls"))bind();
})();
