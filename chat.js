/* CIMAT beta — Entrevista conversacional, evidencia y comparación de modelos.
 * Las respuestas son privadas. Los nombres de modelos aparecen solo como
 * hipótesis posteriores: el chat no parte de una norma para interrogar.
 */
(() => {
 "use strict";
 const $=id=>document.getElementById(id);
 const cfg=window.CIMAT_CONFIG||{};
 const root=String(cfg.SUPABASE_URL||"").replace(/\/+$/,"");
 const publish=String(cfg.SUPABASE_PUBLISHABLE_KEY||"");
 const kinds={proceso:"Proceso",actividad:"Actividad",tarea:"Tarea",decision:"Decisión",
  rol:"Rol",entrada:"Entrada",salida:"Salida",excepcion:"Excepción",criterio:"Criterio"};
 const grades={posible:"Posible correspondencia",parcial:"Coincidencia parcial",
  insuficiente:"Información insuficiente",contradiccion:"Posible contradicción"};
 let userId="",sessions=[],banks=[],selected=null,turns=[],findings=[],reviews=[],busy=false;

 function session(){
  let v=null;
  try{v=JSON.parse(sessionStorage.getItem("cimat_v012_sesion")||"null");}catch(_){}
  if(!v?.user?.id||!v.access_token||Date.now()>=v.expires_at)
   throw Error("La sesión de CIMAT ha caducado. Inicia sesión nuevamente.");
  return v;
 }
 async function api(path,method="GET",body,prefer){
  const s=session();
  const resp=await fetch(root+path,{method,cache:"no-store",headers:{
   apikey:publish,Authorization:"Bearer "+s.access_token,
   Accept:"application/json",...(body===undefined?{}:{"Content-Type":"application/json"}),
   ...(prefer?{Prefer:prefer}:{})
  },...(body===undefined?{}:{body:JSON.stringify(body)})});
  const raw=await resp.text();let data=[];
  try{data=raw?JSON.parse(raw):[];}catch(_){data=[];}
  if(!resp.ok)throw Error("HTTP "+resp.status+": "+
   (data?.message||data?.mensaje||data?.details||"Solicitud no autorizada"));
  if(session().user.id!==s.user.id)throw Error("Cambió la cuenta activa.");
  return data;
 }
 const el=(tag,text,className)=>{
  const n=document.createElement(tag);
  if(text!=null)n.textContent=String(text);
  if(className)n.className=className;
  return n;
 };
 function status(t,isError=false){
  const n=$("cchat-status");n.textContent=t;n.classList.toggle("error",isError);
 }
 function option(v,t){const n=el("option",t);n.value=v;return n;}
 function reset(){
  userId="";sessions=[];banks=[];selected=null;turns=[];findings=[];reviews=[];busy=false;
  $("cchat-session").replaceChildren();
  $("cchat-newbank").replaceChildren();
  $("cchat-start-consent").checked=false;
  $("cchat-thread").replaceChildren();
  $("cchat-consent").checked=false;
  $("cchat-compose").value="";
  $("cchat-layout").classList.add("hidden");
  $("cchat-controls").classList.add("hidden");
  status("Abre esta pestaña para cargar tus entrevistas privadas.");
 }
 function title(s){
  const bank=banks.find(x=>x.id===s.cuestionario_id);
  return (bank?.titulo||"Cuestionario")+" · v"+(bank?.version||"?")+
    " · "+(s.estado==="en_curso"?"En curso":"Finalizada");
 }
 async function loadLists(){
  const [s,b]=await Promise.all([
   api("/rest/v1/cimat_087_entrevistas?select=id,cuestionario_id,estado,actualizado_en&order=actualizado_en.desc&limit=100"),
   api("/rest/v1/cimat_086_cuestionarios?select=id,titulo,version,estado&estado=eq.publicado&limit=150")
  ]);
  if(!Array.isArray(s)||!Array.isArray(b))throw Error("Datos de entrevista no disponibles.");
  sessions=s;banks=b;
  const current=selected?.id||$("cchat-session").value;
  const pick=$("cchat-session");pick.replaceChildren(option("","Elige una entrevista propia"));
  sessions.forEach(item=>pick.append(option(item.id,title(item))));
  if(sessions.some(item=>item.id===current))pick.value=current;
  const bank=$("cchat-newbank"),currentBank=bank.value;
  bank.replaceChildren(option("","Selecciona un cuestionario publicado"));
  banks.forEach(item=>bank.append(option(item.id,item.titulo+" · v"+item.version)));
  if(banks.some(item=>item.id===currentBank))bank.value=currentBank;
  $("cchat-empty").classList.toggle("hidden",sessions.length!==0);
 }
 async function init(){
  try{
   const id=session().user.id;
   if(userId===id)return;
   reset();status("Cargando entrevistas y verificación de permisos...");
   await loadLists();
   userId=id;
   $("cchat-controls").classList.remove("hidden");
   status("Chat preparado. La IA investiga procesos reales; las comparaciones son exploratorias.");
  }catch(e){reset();status(e.message,true);}
 }
 async function loadTurnData(id){
  const eid=encodeURIComponent(id);
  const [t,h,r]=await Promise.all([
   api("/rest/v1/cimat_11_dialogos?select=id,entrevista_id,mensaje_usuario,respuesta_ia,estado,hallazgos,coincidencias,creado_en,modelo&entrevista_id=eq."+
    eid+"&order=creado_en.asc,id.asc&limit=150"),
   api("/rest/v1/cimat_10_hallazgos?select=id,entrevista_id,dialogo_id,titulo,tipo,evidencia_literal,estado&entrevista_id=eq."+eid+"&limit=400"),
   api("/rest/v1/cimat_11_revisiones?select=dialogo_id,elemento_id,estado,observacion,revisado_en&limit=300")
  ]);
  if(!Array.isArray(t)||!Array.isArray(h)||!Array.isArray(r))
    throw Error("No se pudo cargar el historial.");
  turns=t;findings=h;
  const turnIds=new Set(t.map(x=>x.id));
  reviews=r.filter(x=>turnIds.has(x.dialogo_id));
  render();
 }
 async function createInterview(){
  const bankId=$("cchat-newbank").value,approved=$("cchat-start-consent").checked;
  if(!approved)throw Error("Lee y acepta voluntariamente las condiciones de la entrevista antes de continuar.");
  if(!banks.some(b=>b.id===bankId))throw Error("Selecciona un cuestionario genérico publicado.");
  const rows=await api("/rest/v1/cimat_087_entrevistas?select=id,cuestionario_id,estado,actualizado_en",
   "POST",{cuestionario_id:bankId,consentimiento_confirmado:true,consentimiento_version:"cimat-0.8.7-1"},
   "return=representation");
  if(!Array.isArray(rows)||rows.length!==1)throw Error("El servidor no confirmó la creación de la sesión.");
  $("cchat-start-consent").checked=false;
  await loadLists();
  $("cchat-session").value=rows[0].id;
  await selectInterview(rows[0].id);
  status("Sesión de entrevista creada. Puedes comenzar directamente en el chat, sin responder primero las doce preguntas del cuestionario.");
 }
 async function selectInterview(id){
  const s=sessions.find(x=>x.id===id)||null;
  selected=s;
  $("cchat-consent").checked=false;
  turns=[];reviews=[];findings=[];
  $("cchat-thread").replaceChildren();
  $("cchat-compose").value="";
  if(!s){$("cchat-layout").classList.add("hidden");return;}
  $("cchat-layout").classList.remove("hidden");
  $("cchat-head").textContent=title(s);
  await loadTurnData(id);
 }
 function atBottom(){const p=$("cchat-thread");p.scrollTop=p.scrollHeight;}
 function addBubble(role,text){
  const bubble=el("article",null,"cchat-bubble "+(role==="usuario"?"cchat-user":"cchat-assistant"));
  bubble.append(el("small",role==="usuario"?"Trabajador":"CIMAT · Entrevistador IA"));
  const content=el("p",text);bubble.append(content);
  $("cchat-thread").append(bubble);
  return bubble;
 }
 function renderFindings(turn,where){
  const items=Array.isArray(turn.hallazgos)?turn.hallazgos:[];
  if(!items.length)return;
  const detail=document.createElement("details");detail.className="cchat-insights";
  detail.append(el("summary","Hallazgos posibles ("+items.length+")"));
  for(let i=0;i<items.length;i++){
   const h=items[i];
   if(!h||typeof h.cita!=="string")continue;
   const card=el("div",null,"cchat-finding");
   card.append(el("strong",(kinds[h.tipo]||h.tipo)+" · "+h.titulo));
   card.append(el("blockquote","“"+h.cita+"”"));
   if(h.descripcion)card.append(el("p",h.descripcion,"cchat-muted"));
   const saved=findings.some(f=>f.dialogo_id===turn.id&&f.tipo===h.tipo&&
    f.evidencia_literal===h.cita&&f.titulo===h.titulo);
   const btn=el("button",saved?"Hipótesis registrada":"Registrar hipótesis","outline");
   btn.type="button";btn.dataset.turn=turn.id;btn.dataset.hyp=String(i);btn.disabled=saved;
   card.append(btn);detail.append(card);
  }
  where.append(detail);
 }
 function renderMatches(turn,where){
  const found=Array.isArray(turn.coincidencias)?turn.coincidencias:[];
  if(!found.length)return;
  const detail=document.createElement("details");detail.className="cchat-insights";
  detail.append(el("summary","Posibles correspondencias con modelos ("+found.length+")"));
  for(let i=0;i<found.length;i++){
   const m=found[i];
   if(!m||!m.elemento_id)continue;
   const card=el("div",null,"cchat-match");
   card.append(el("strong",(m.tipo==="producto"?"Producto de trabajo: ":"Tarea: ")+m.nombre));
   card.append(el("p",m.modelo+
     (m.edicion?" · edición "+m.edicion:"")+
     (m.codigo?" · "+m.codigo:"")+
     (m.pagina?" · página "+m.pagina:""),"cchat-muted"));
   card.append(el("span",grades[m.grado]||"Por verificar","cchat-label"));
   if(m.justificacion)card.append(el("p","Correspondencia sugerida: "+m.justificacion));
   card.append(el("blockquote","Evidencia del relato: “"+m.cita+"”"));
   if(m.criterios_registrados?.length){
    card.append(el("p","Características registradas: "+m.criterios_registrados.join("; "),"cchat-muted"));
   }
   card.append(el("p","Falta comprobar: "+(m.faltantes||"No existe evidencia suficiente para una conclusión."),"cchat-muted"));
   const btn=el("button","Pedir aclaraciones sobre esta correspondencia","outline");
   btn.type="button";btn.dataset.clarify=turn.id+":"+i;
   card.append(btn);
   const own=reviews.find(x=>x.dialogo_id===turn.id&&x.elemento_id===m.elemento_id);
   const select=el("select");
   select.setAttribute("aria-label","Evaluación humana de esta correspondencia");
   [
    ["","Revisión humana pendiente"],
    ["insuficiente","Evidencia insuficiente"],
    ["compatible","Evidencia aparentemente compatible"],
    ["parcial","Correspondencia parcial"],
    ["no_corresponde","No corresponde"]
   ].forEach(([v,t])=>select.append(option(v,t)));
   select.value=own?.estado||"";
   select.dataset.grade=turn.id+":"+i;
   card.append(select);
   const obs=el("textarea");obs.rows=2;obs.maxLength=1600;
   obs.placeholder="Observación y evidencia pendiente para revisión";obs.value=own?.observacion||"";
   obs.dataset.reviewnote=turn.id+":"+i;
   card.append(obs);
   const save=el("button","Guardar revisión humana","outline");
   save.type="button";save.dataset.review=turn.id+":"+i;card.append(save);
   detail.append(card);
  }
  where.append(detail);
 }
 function render(){
  $("cchat-head").textContent=selected?title(selected):"Entrevista";
  const thread=$("cchat-thread");thread.replaceChildren();
  if(!turns.length){
   const greeting=el("article",null,"cchat-bubble cchat-assistant");
   greeting.append(el("small","CIMAT · Entrevistador IA"));
   greeting.append(el("p","Cuéntame una actividad que hayas realizado recientemente en tu trabajo. ¿Qué ocurrió desde que comenzó?"));
   thread.append(greeting);
  }
  for(const turn of turns){
   addBubble("usuario",turn.mensaje_usuario);
   const wrap=addBubble("asistente",turn.estado==="completado"?
     turn.respuesta_ia:turn.estado==="procesando"?
     "Procesando respuesta...":"No se pudo procesar este mensaje. Puedes intentarlo nuevamente.");
   if(turn.estado==="completado"){
    renderFindings(turn,wrap);
    renderMatches(turn,wrap);
   }
  }
  const writable=selected?.estado==="en_curso";
  $("cchat-compose").disabled=!writable||busy;
  $("cchat-send").disabled=!writable||busy||!$("cchat-consent").checked;
  $("cchat-count").textContent=turns.length+" intervenciones registradas";
  $("cchat-readonly").classList.toggle("hidden",writable);
  $("cchat-consent").disabled=!writable||busy;
  atBottom();
 }
 async function send(){
  if(busy)return;
  const s=session(),value=$("cchat-compose").value.trim(),current=selected?.id;
  if(!current||selected?.estado!=="en_curso")throw Error("Selecciona una entrevista abierta.");
  if(!$("cchat-consent").checked)throw Error("Autoriza expresamente el tratamiento externo antes de conversar.");
  if(value.length<2||value.length>4000)throw Error("Escribe entre 2 y 4 000 caracteres.");
  busy=true;
  $("cchat-send").disabled=true;
  $("cchat-compose").disabled=true;
  status("Consultando al entrevistador IA...");
  const pending=el("p","La IA está elaborando su siguiente pregunta...","cchat-pending");
  $("cchat-thread").append(pending);atBottom();
  try{
   const id=crypto.randomUUID();
   const res=await fetch(root+"/functions/v1/cimat-entrevista-chat",{
    method:"POST",headers:{apikey:publish,Authorization:"Bearer "+s.access_token,"Content-Type":"application/json"},
    body:JSON.stringify({entrevista_id:current,turno_id:id,mensaje:value,consentimiento_externo:true})
   });
   let data={};try{data=await res.json();}catch(_){}
   if(!res.ok)throw Error(data.mensaje||"HTTP "+res.status+" en servicio de conversación.");
   if(session().user.id!==s.user.id||selected?.id!==current)
     throw Error("La sesión cambió; vuelve a cargar el chat.");
   $("cchat-compose").value="";
   $("cchat-consent").checked=false;
   await loadTurnData(current);
   status("Turno guardado. Los hallazgos son propuestas revisables, no cumplimiento certificado.");
  }catch(e){status(e.message,true);}
  finally{busy=false;pending.remove();if(selected)render();}
 }
 async function saveFinding(turnId,index){
  const turn=turns.find(t=>t.id===turnId),h=turn?.hallazgos?.[index];
  if(!turn||!h)throw Error("No se encontró el hallazgo.");
  if(findings.some(f=>f.dialogo_id===turnId&&f.titulo===h.titulo&&
     f.evidencia_literal===h.cita))throw Error("Esta propuesta ya fue registrada.");
  const rows=await api("/rest/v1/cimat_10_hallazgos?select=id","POST",{
   entrevista_id:turn.entrevista_id,dialogo_id:turn.id,
   tipo:h.tipo,titulo:h.titulo,descripcion:h.descripcion||"",
   evidencia_literal:h.cita,origen:"ia",modelo:turn.modelo||"gemini"
  },"return=representation");
  if(!Array.isArray(rows)||rows.length!==1)throw Error("No se confirmó el registro del hallazgo.");
  await loadTurnData(turn.entrevista_id);
  status("Hipótesis registrada con su cita original. Puedes confirmarla en Laboratorio beta.");
 }
 function parseKey(value){
  const pos=value.lastIndexOf(":");
  const idx=Number(value.slice(pos+1)),id=value.slice(0,pos);
  const turn=turns.find(t=>t.id===id);
  if(!turn||!Number.isInteger(idx)||idx<0)throw Error("Referencia no reconocida.");
  return {turn,idx,match:turn.coincidencias?.[idx]};
 }
 function clarify(value){
  const {match}=parseKey(value);
  if(!match)return;
  $("cchat-compose").value="Quiero profundizar en el trabajo que describí y aclarar qué evidencia falta sobre «"+
   match.nombre+"». Hazme una pregunta concreta y neutral, sin asumir que cumplo el modelo.";
  $("cchat-compose").focus();
  status("El mensaje se preparó para que decidas si deseas enviarlo. No se envía automáticamente.");
 }
 async function review(value){
  const {turn,idx,match}=parseKey(value);
  if(!match)throw Error("No se encontró la correspondencia.");
  const select=document.querySelector('select[data-grade="'+value+'"]');
  const notes=document.querySelector('textarea[data-reviewnote="'+value+'"]');
  const state=select?.value||"",observation=notes?.value.trim()||"";
  if(!state)throw Error("Selecciona un estado de revisión.");
  if(observation.length>1600)throw Error("La nota excede el límite permitido.");
  const rows=await api("/rest/v1/cimat_11_revisiones?on_conflict=dialogo_id,elemento_id&select=dialogo_id,elemento_id,estado",
    "POST",{dialogo_id:turn.id,elemento_id:match.elemento_id,
    usuario_id:session().user.id,estado:state,observacion:observation},
    "resolution=merge-duplicates,return=representation");
  if(!Array.isArray(rows)||rows.length!==1)throw Error("No se confirmó la revisión.");
  await loadTurnData(turn.entrevista_id);
  status("Revisión guardada. Esta valoración no constituye certificación de conformidad.");
 }
 async function action(fn){
  if(busy)return;
  busy=true;
  try{await fn();}
  catch(e){status(e.message,true);}
  finally{busy=false;if(selected)render();}
 }
 function bind(){
  document.querySelector('[data-view="chat"]')?.addEventListener("click",init);
  $("cchat-session").addEventListener("change",e=>action(()=>selectInterview(e.target.value)));
  $("cchat-start-form").addEventListener("submit",e=>{e.preventDefault();action(createInterview);});
  $("cchat-refresh").addEventListener("click",()=>action(async()=>{
   const old=selected?.id;await loadLists();
   if(old&&sessions.some(x=>x.id===old))await selectInterview(old);
   status("Conversaciones actualizadas.");
  }));
  $("cchat-consent").addEventListener("change",render);
  $("cchat-form").addEventListener("submit",e=>{
   e.preventDefault();send().catch(err=>status(err.message||String(err),true));
  });
  $("cchat-compose").addEventListener("keydown",e=>{
   if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();send().catch(err=>status(err.message||String(err),true));}
  });
  $("cchat-thread").addEventListener("click",e=>{
   const save=e.target.closest("button[data-hyp]");
   if(save){action(()=>saveFinding(save.dataset.turn,Number(save.dataset.hyp)));return;}
   const question=e.target.closest("button[data-clarify]");
   if(question){try{clarify(question.dataset.clarify);}catch(err){status(err.message,true);}return;}
   const check=e.target.closest("button[data-review]");
   if(check)action(()=>review(check.dataset.review));
  });
  $("logout")?.addEventListener("click",reset);
  $("login-form")?.addEventListener("submit",reset);
 }
 if($("cchat-controls"))bind();
})();