/* CIMAT v0.8.52 — constructor manual. No lee ni modifica tablas históricas. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const cfg = window.CIMAT_CONFIG || {};
  const root = String(cfg.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(cfg.SUPABASE_PUBLISHABLE_KEY || "");
  const sessionKey = "cimat_v012_sesion";
  const state = {ready:false,domain:"",domains:[],documents:[],catalog:[],roles:[],
    processes:[],activities:[],tasks:[],products:[],taskRoles:[],taskProducts:[],
    sequences:[],activitySequences:[],features:[],config:null,loading:false};
  const R = {rol:"cimat_0852_roles",vinculo:"cimat_0852_roles_dominios",
    proceso:"cimat_0852_procesos",actividad:"cimat_0852_actividades",
    tarea:"cimat_0852_tareas",producto:"cimat_0852_productos",
    tareaRol:"cimat_0852_tareas_roles",tareaProducto:"cimat_0852_tareas_productos",
    secuencia:"cimat_0852_precedencias",secuenciaAct:"cimat_0852_precedencias_actividades",
    caracteristica:"cimat_0852_caracteristicas"};
  const el=(tag,content,cls)=>{const n=document.createElement(tag);if(content!==undefined&&content!==null)n.textContent=String(content);if(cls)n.className=cls;return n;};
  function message(s,error=false){$("v85-status").textContent=s;$("v85-status").classList.toggle("error",Boolean(error));}
  function session(){let s=null;try{s=JSON.parse(sessionStorage.getItem(sessionKey)||"null");}catch(_){}
    if(!s?.access_token||!s.user?.id||Date.now()>=s.expires_at)throw Error("Sesión no vigente. Inicia sesión de nuevo.");
    return s;
  }
  async function api(path,method="GET",body){
    const s=session(),res=await fetch(root+path,{method,cache:"no-store",headers:{
      apikey:key,Authorization:"Bearer "+s.access_token,Accept:"application/json",
      ...(body===undefined?{}:{"Content-Type":"application/json",Prefer:"return=representation"})
    },body:body===undefined?undefined:JSON.stringify(body)});
    const raw=await res.text();let data=null;
    try{data=raw?JSON.parse(raw):null;}catch(_){}
    if(!res.ok)throw Error(data?.message||data?.error_description||"Error HTTP "+res.status+" ("+path.split("?")[0]+")");
    return data;
  }
  function endpoint(name,filters={},limit=2000){
    const q=new URLSearchParams({select:"*",limit:String(limit)});
    for(const [k,v] of Object.entries(filters))q.set(k,v);
    return "/rest/v1/"+name+"?"+q;
  }
  async function rows(name,filters={},limit=2000){
    const data=await api(endpoint(name,filters,limit));
    if(!Array.isArray(data))throw Error("Respuesta no tabular: "+name);
    if(data.length>=limit)throw Error("Consulta demasiado grande en "+name+"; cancelada para evitar datos incompletos.");
    return data;
  }
  const domFilter=()=>({dominio_id:"eq."+state.domain});
  function source(){const doc=$("v85-doc").value,raw=$("v85-page").value.trim(),page=raw?Number(raw):null;
    if(raw&&(!doc||!Number.isSafeInteger(page)||page<1))throw Error("Selecciona un documento y una página física válida.");
    return {documento_id:doc||null,pagina:page};
  }
  function setSource(row){$("v85-doc").value=row.documento_id||"";$("v85-page").value=row.pagina||"";}
  function short(item){return (item.codigo?item.codigo+" · ":"")+item.nombre;}
  // La posición en la interfaz sigue el registro original; no establece precedencia.
  function sortList(items){return [...items].sort((a,b)=>
    String(a.creado_en||"").localeCompare(String(b.creado_en||""))||
    String(a.id||"").localeCompare(String(b.id||"")));}
  function select(id,items,placeholder,formatter,keep=true){
    const node=$(id),old=keep?node.value:"";
    node.replaceChildren(new Option(placeholder,""));
    for(const x of items)node.add(new Option(formatter(x),x.id));
    if(old&&items.some(x=>x.id===old))node.value=old;
    return node;
  }
  function multi(id,items,formatter){
    const node=$(id),old=new Set(values(id));
    node.replaceChildren();
    if(!items.length){node.append(el("small","Aún no hay elementos registrados en este catálogo."));return;}
    for(const item of items){
      const label=el("label",null,"v85-check-option");
      const check=document.createElement("input");
      check.type="checkbox";check.value=item.id;check.checked=old.has(item.id);
      label.append(check,document.createTextNode(" "+formatter(item)));
      node.append(label);
    }
  }
  const values=id=>[...$(id).querySelectorAll('input[type="checkbox"]:checked')].map(x=>x.value);
  function selectValues(id,ids){
    const selected=new Set(ids);
    for(const check of $(id).querySelectorAll('input[type="checkbox"]'))check.checked=selected.has(check.value);
  }
  function paragraph(box,label,value){const p=el("p");p.append(el("strong",label+" "));p.append(document.createTextNode(value||"Sin especificar"));box.append(p);}
  function itemCard(root,title,body,klass="v85-record"){
    const c=el("div",null,klass);c.append(el("strong",title));
    if(body)c.append(el("p",body));root.append(c);return c;
  }
  function labelRole(x){
    const role=state.catalog.find(r=>r.id===x.rol_id);
    return role?(role.abreviatura+" — "+role.nombre):"Rol no encontrado";
  }
  function labelProduct(id){return state.products.find(p=>p.id===id)?.nombre||"Producto no encontrado";}
  function linkedRoleIds(taskId){return state.taskRoles.filter(r=>r.tarea_id===taskId).map(r=>r.rol_id);}
  function linkedProducts(taskId,flow){return state.taskProducts.filter(r=>r.tarea_id===taskId&&r.flujo===flow).map(r=>r.producto_id);}
  function nameOf(id,items){const e=items.find(x=>x.id===id);return e?short(e):"Registro no encontrado";}
  function nextActivityCode(){
    const used=new Set(state.activities.map(a=>String(a.codigo||"").trim().toUpperCase()));
    for(let i=1;i<=999999;i++){
      const code="ACT-"+String(i).padStart(4,"0");
      if(!used.has(code))return code;
    }
    throw Error("No hay identificadores internos disponibles para nuevas actividades.");
  }
  function updateActivityCodeUI(){
    const configured=state.config&&typeof state.config.actividades_tienen_codigo==="boolean";
    const hasCode=configured&&state.config.actividades_tienen_codigo;
    $("v85-activity-code-wrap").hidden=!hasCode;
    const selected=state.activities.find(a=>a.id===$("v85-activity-edit").value);
    $("v85-activity-code-hint").textContent=!configured
      ?"Primero indica en el apartado 1 si las actividades tienen código oficial."
      :hasCode?"Introduce el código de la fuente, si aparece. No se inventará uno oficial."
      :selected?.codigo?"Código ya registrado: "+selected.codigo+" (se conservará al editar)."
      :"CIMAT propondrá el identificador interno "+nextActivityCode()+" al guardar. No pertenece a la norma.";
    $("v85-activities-have-code").value=!configured?"":hasCode?"si":"no";
  }
  async function init(){
    if(!state.ready){
      try{
        const admin=await api("/rest/v1/rpc/mi_acceso_administrador","POST",{});
        if(admin!==true){message("Este constructor solo está disponible para el administrador global.");return;}
        state.ready=true;$("v85-controls").classList.remove("hidden");
        state.catalog=await rows(R.rol,{},3000);
        state.domains=await rows("dominios_conocimiento",{},300);
        select("v85-domain",state.domains,"Selecciona un dominio",d=>d.titulo+(d.edicion?" · "+d.edicion:""),false);
        message("Selecciona un dominio para comenzar la captura manual.");
      }catch(e){message("No se pudo abrir el constructor: "+e.message,true);}
      return;
    }
    if(state.domain&&$("v85-domain").value!==state.domain)await load();
  }
  async function load(){
    const domain=$("v85-domain").value;
    state.domain=domain;
    if(!domain){message("Selecciona un dominio.");return;}
    if(state.loading)return;
    state.loading=true;$("v85-refresh").disabled=true;
    message("Consultando catálogo manual del dominio...");
    try{
      const checks=[
        rows("cimat_0855_configuracion",{dominio_id:"eq."+domain},5),
        rows("documentos_dominio",{dominio_id:"eq."+domain},300),
        rows(R.vinculo,{dominio_id:"eq."+domain}),
        rows(R.proceso,{dominio_id:"eq."+domain}),
        rows(R.actividad,{dominio_id:"eq."+domain}),
        rows(R.tarea,{dominio_id:"eq."+domain}),
        rows(R.producto,{dominio_id:"eq."+domain}),
        rows(R.tareaRol,{dominio_id:"eq."+domain}),
        rows(R.tareaProducto,{dominio_id:"eq."+domain}),
        rows(R.secuencia,{dominio_id:"eq."+domain}),
        rows(R.secuenciaAct,{dominio_id:"eq."+domain}),
        rows(R.caracteristica,{dominio_id:"eq."+domain}),
        rows(R.rol,{},3000)
      ];
      const all=await Promise.all(checks);
      if(domain!==$("v85-domain").value)return;
      state.config=all[0][0]||null;
      [state.documents,state.roles,state.processes,state.activities,state.tasks,
        state.products,state.taskRoles,state.taskProducts,state.sequences,
        state.activitySequences,state.features,state.catalog]=all.slice(1);
      render();
      updateActivityCodeUI();
      message("Captura manual lista: "+state.roles.length+" roles, "+state.processes.length+
        " procesos, "+state.activities.length+" actividades, "+state.tasks.length+
        " tareas y "+state.products.length+" productos. El análisis histórico permanece intacto.");
    }catch(e){message("Error al cargar los datos: "+e.message,true);}
    finally{state.loading=false;$("v85-refresh").disabled=false;}
  }
  function render(){
    select("v85-doc",state.documents,"Sin documento asociado",d=>d.nombre_original);
    select("v85-role-existing",state.catalog,"Selecciona un rol existente",r=>r.abreviatura+" · "+r.nombre);
    const hints=$("v85-role-hints");hints.replaceChildren();
    for(const r of state.catalog){const option=el("option");option.value=r.nombre;hints.append(option);}
    const linked=state.roles.map(x=>({...x,id:x.rol_id,rol:state.catalog.find(r=>r.id===x.rol_id)}))
      .filter(x=>x.rol).sort((a,b)=>a.rol.nombre.localeCompare(b.rol.nombre,"es"));
    multi("v85-task-roles",linked,x=>x.rol.abreviatura+" · "+x.rol.nombre);
    const roleList=$("v85-role-list");roleList.replaceChildren();
    if(!linked.length)roleList.append(el("p","Aún no hay roles asociados a este dominio."));
    for(const x of linked)itemCard(roleList,x.rol.abreviatura+" · "+x.rol.nombre,x.funcion_local||x.rol.funcion);
    select("v85-process-edit",sortList(state.processes),"+ Nuevo proceso",short);
    for(const id of ["v85-activity-parent","v85-task-process","v85-diagram-process"])
      select(id,sortList(state.processes),"Selecciona un proceso",short);
    select("v85-activity-edit",sortList(state.activities),"+ Nueva actividad",short);
    select("v85-product-edit",state.products.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre,"es")),"+ Nuevo producto",p=>p.nombre);
    select("v85-task-edit",sortList(state.tasks),"+ Nueva tarea",short);
    select("v85-feature-product",state.products,"Selecciona un producto",p=>p.nombre);
    refreshActivityOptions();
    multi("v85-task-inputs",state.products,p=>p.nombre);
    multi("v85-task-outputs",state.products,p=>p.nombre);
    multi("v85-task-updates",state.products,p=>p.nombre);
    renderProcesses();renderTaskTable();renderSequences();renderProductSuggestions();refreshFeatures();renderDiagram();
  }
  function renderProcesses(){
    const root=$("v85-process-list");root.replaceChildren();
    if(!state.processes.length){root.append(el("p","Registra un proceso para comenzar."));return;}
    for(const p of sortList(state.processes)){
      const c=itemCard(root,short(p),p.descripcion||"");
      const acts=sortList(state.activities.filter(a=>a.proceso_id===p.id));
      for(const a of acts)c.append(el("div","↳ "+short(a)+" · "+state.tasks.filter(t=>t.actividad_id===a.id).length+" tarea(s)","v85-subrow"));
      const direct=state.tasks.filter(t=>t.proceso_id===p.id&&!t.actividad_id).length;
      if(direct)c.append(el("small",direct+" tarea(s) vinculadas directamente al proceso"));
    }
  }
  function refreshActivityOptions(){
    const pid=$("v85-task-process").value,old=$("v85-task-activity").value;
    const eligible=sortList(state.activities.filter(a=>a.proceso_id===pid));
    select("v85-task-activity",eligible,"Sin actividad",short,false);
    if(eligible.some(a=>a.id===old))$("v85-task-activity").value=old;
  }
  function renderTaskTable(){
    const root=$("v85-task-table");root.replaceChildren();
    if(!state.tasks.length){root.append(el("p","Todavía no se han capturado tareas."));return;}
    const table=el("table",null,"v85-table");
    const head=el("thead"),hr=el("tr");
    ["Proceso / actividad","Tarea (orden de registro)","Roles","Entradas","Salidas","Actualiza","Predecesoras"].forEach(s=>hr.append(el("th",s)));
    head.append(hr);table.append(head);
    const body=el("tbody");
    for(const t of sortList(state.tasks)){
      const tr=el("tr");
      const proc=nameOf(t.proceso_id,state.processes);
      const act=t.actividad_id?nameOf(t.actividad_id,state.activities):"Sin actividad";
      const roles=linkedRoleIds(t.id).map(id=>state.catalog.find(r=>r.id===id)?.abreviatura||"?");
      const products=flow=>linkedProducts(t.id,flow).map(labelProduct).join("; ")||"—";
      const prev=state.sequences.filter(s=>s.siguiente_id===t.id).map(s=>nameOf(s.anterior_id,state.tasks)).join("; ")||"—";
      [proc+" / "+act,short(t),roles.join(", ")||"—",products("entrada"),
        products("salida"),products("actualiza"),prev].forEach(v=>tr.append(el("td",v)));
      body.append(tr);
    }
    table.append(body);root.append(table);
  }
  function renderSequences(){
    const level=$("v85-seq-level").value;
    const data=level==="actividad"?state.activities:state.tasks;
    select("v85-seq-from",sortList(data),"Selecciona origen",short);
    select("v85-seq-to",sortList(data),"Selecciona destino",short);
    const list=$("v85-seq-list");list.replaceChildren();
    const edges=level==="actividad"?state.activitySequences:state.sequences;
    if(!edges.length){list.append(el("p","No hay precedencias explícitas registradas en este nivel."));return;}
    for(const s of edges){
      const row=itemCard(list,nameOf(s.anterior_id,data)+" → "+nameOf(s.siguiente_id,data),s.nota||"Dependencia declarada sin detalle adicional.");
      const btn=el("button","Quitar precedencia","outline");btn.type="button";
      btn.addEventListener("click",async()=>{if(!window.confirm("¿Eliminar esta relación de precedencia?"))return;
        try{await api("/rest/v1/"+(level==="actividad"?R.secuenciaAct:R.secuencia)+"?id=eq."+s.id+"&dominio_id=eq."+state.domain,"DELETE");await load();}
        catch(err){message(err.message,true);}
      });row.append(btn);
    }
  }
  function renderProductSuggestions(){
    const root=$("v85-product-suggestions");
    if(!root)return;
    root.replaceChildren();
    const outputs=state.taskProducts.filter(x=>x.flujo==="salida"||x.flujo==="actualiza");
    const inputs=state.taskProducts.filter(x=>x.flujo==="entrada");
    const confirmed=new Set(state.sequences.map(x=>x.anterior_id+"|"+x.siguiente_id));
    const examined=new Set();
    let total=0,shown=0;
    for(const out of outputs){
      for(const input of inputs){
        if(out.producto_id!==input.producto_id||out.tarea_id===input.tarea_id)continue;
        const pair=out.tarea_id+"|"+input.tarea_id;
        if(examined.has(pair)||confirmed.has(pair))continue;
        examined.add(pair);total++;
        if(shown>=25)continue;
        const product=labelProduct(out.producto_id);
        const a=nameOf(out.tarea_id,state.tasks),b=nameOf(input.tarea_id,state.tasks);
        const card=itemCard(root,a+" → "+b,"Coincidencia de producto: "+product+". Es una hipótesis; no demuestra que exista precedencia obligatoria.");
        const button=el("button","Revisar posible dependencia","outline");
        button.type="button";
        button.addEventListener("click",()=>{
          $("v85-seq-level").value="tarea";
          renderSequences();
          $("v85-seq-from").value=out.tarea_id;
          $("v85-seq-to").value=input.tarea_id;
          $("v85-seq-note").value="";
          $("v85-seq-form").scrollIntoView({behavior:"smooth",block:"center"});
          message("Sugerencia preparada. Comprueba en la norma si existe una precedencia real antes de presionar «Registrar precedencia».");
        });
        card.append(button);shown++;
      }
    }
    if(total===0)root.append(el("p","No se encontraron nuevas coincidencias entre productos de salida y entrada."));
    if(total>shown)root.append(el("small","Se muestran "+shown+" de "+total+" coincidencias; usa las precedencias manuales para las demás."));
  }
  function refreshFeatures(){
    const product=$("v85-feature-product").value;
    const list=sortList(state.features.filter(x=>x.producto_id===product));
    select("v85-feature-edit",list,"+ Nueva característica",x=>x.nombre);
    const root=$("v85-feature-list");root.replaceChildren();
    if(!product){root.append(el("p","Selecciona un producto para gestionar sus características."));return;}
    if(!list.length){root.append(el("p","Este producto no tiene características registradas (es opcional)."));return;}
    for(const x of list)itemCard(root,x.nombre,x.descripcion||"Sin detalle adicional.");
  }
  function renderDiagram(){
    const root=$("v85-diagram");root.replaceChildren();
    const pid=$("v85-diagram-process").value;
    const proc=state.processes.find(p=>p.id===pid);
    if(!proc){root.append(el("p","Selecciona un proceso con tareas para mostrar el diagrama."));return;}
    const diagram=el("div",null,"v85-diagram");
    diagram.append(el("h3",short(proc)));
    const sections=sortList(state.activities.filter(a=>a.proceso_id===pid));
    sections.push({id:"",nombre:"Tareas directamente asociadas al proceso",codigo:""});
    for(const activity of sections){
      const tasks=sortList(state.tasks.filter(t=>t.proceso_id===pid&&(t.actividad_id||"")===activity.id));
      if(!tasks.length&&activity.id==="")continue;
      const card=el("section",null,"v85-diagram-group");
      const heading=activity.id?short(activity):activity.nombre;
      card.append(el("h4",heading));
      const prevActs=state.activitySequences.filter(s=>s.siguiente_id===activity.id)
        .map(x=>nameOf(x.anterior_id,state.activities));
      if(prevActs.length)card.append(el("small","Actividad posterior a: "+prevActs.join(", ")));
      for(const t of tasks){
        const row=el("div",null,"v85-diagram-row");
        const roles=el("div",null,"v85-diagram-roles");
        roles.append(el("small","ROLES"));
        const names=linkedRoleIds(t.id).map(id=>state.catalog.find(x=>x.id===id))
          .filter(Boolean).map(x=>x.abreviatura+" · "+x.nombre);
        roles.append(el("p",names.join("; ")||"No especificados"));
        const task=el("div",null,"v85-diagram-task");
        task.append(el("strong",short(t)));
        const pred=state.sequences.filter(s=>s.siguiente_id===t.id)
          .map(s=>nameOf(s.anterior_id,state.tasks));
        task.append(el("small",pred.length?"Después de: "+pred.join("; "):"Sin precedencia declarada"));
        const prod=el("div",null,"v85-diagram-products");prod.append(el("small","PRODUCTOS"));
        for(const [f,label] of [["entrada","Entrada"],["salida","Salida"],["actualiza","Actualiza"]]){
          const names=linkedProducts(t.id,f).map(labelProduct);
          if(names.length)prod.append(el("p",label+": "+names.join("; ")));
        }
        if(prod.childElementCount===1)prod.append(el("p","No especificados"));
        const linked=new Set(["entrada","salida","actualiza"].flatMap(f=>linkedProducts(t.id,f)));
        for(const prodId of linked){
          const features=sortList(state.features.filter(f=>f.producto_id===prodId));
          if(features.length)prod.append(el("small","Componentes de "+labelProduct(prodId)+": "+features.map(f=>f.nombre).join("; ")));
        }
        row.append(roles,task,prod);card.append(row);
      }
      if(!tasks.length)card.append(el("p","Actividad sin tareas capturadas."));
      diagram.append(card);
    }
    const productMatches=[];
    for(const p of state.products){
      const creators=state.taskProducts.filter(r=>r.producto_id===p.id&&(r.flujo==="salida"||r.flujo==="actualiza"));
      const readers=state.taskProducts.filter(r=>r.producto_id===p.id&&r.flujo==="entrada");
      const connected=creators.some(a=>state.tasks.some(t=>t.id===a.tarea_id&&t.proceso_id===pid)) ||
        readers.some(a=>state.tasks.some(t=>t.id===a.tarea_id&&t.proceso_id===pid));
      if(creators.length&&readers.length&&connected)productMatches.push(p.nombre+": "+
        creators.map(x=>nameOf(x.tarea_id,state.tasks)).join("; ")+" → "+
        readers.map(x=>nameOf(x.tarea_id,state.tasks)).join("; "));
    }
    if(productMatches.length){
      const matching=el("div",null,"v85-diagram-product-flow");
      matching.append(el("h4","Reutilización de productos registrada"));
      for(const s of productMatches)matching.append(el("p",s));
      matching.append(el("small","Las flechas representan producción y consumo del mismo producto, no una precedencia obligatoria."));
      diagram.append(matching);
    }
    root.append(diagram);
  }
  function clearProcess(){$("v85-process-form").reset();$("v85-process-edit").value="";}
  function clearActivity(){$("v85-activity-form").reset();$("v85-activity-edit").value="";updateActivityCodeUI();}
  function clearProduct(){$("v85-product-form").reset();$("v85-product-edit").value="";}
  function clearTask(){$("v85-task-form").reset();$("v85-task-edit").value="";refreshActivityOptions();}
  function clearFeature(){$("v85-feature-edit").value="";$("v85-feature-name").value="";$("v85-feature-desc").value="";}
  async function write(method,table,payload,id){
    const path="/rest/v1/"+table+(id?"?id=eq."+id+"&dominio_id=eq."+state.domain:"");
    return api(path,method,payload);
  }
  function inlineResult(formId,text,error=false){
    const targetId={"v85-product-form":"v85-product-feedback","v85-task-form":"v85-task-feedback"}[formId];
    const node=targetId?$(targetId):null;
    if(node){node.textContent=text;node.classList.toggle("error",error);node.classList.toggle("v85-success",Boolean(text)&&!error);}
  }
  async function save(event,fn){
    event.preventDefault();
    const formId=event.currentTarget?.id||"";
    inlineResult(formId,"");
    if(!state.domain){message("Selecciona un dominio.",true);inlineResult(formId,"Selecciona un dominio.",true);return;}
    if(state.loading){message("Hay otra operación en curso.",true);return;}
    state.loading=true;
    try{
      const result=await fn();
      state.loading=false;
      await load();
      message(result||"Registro guardado correctamente.");
      inlineResult(formId,"✓ "+(result||"Registro guardado correctamente."));
    }catch(e){
      message("No se pudo guardar: "+e.message,true);
      inlineResult(formId,"No se pudo guardar: "+e.message,true);
    }finally{state.loading=false;}
  }
  $("v85-role-new").addEventListener("submit",e=>save(e,async()=>{
    const nombre=$("v85-role-name").value.trim(),abreviatura=$("v85-role-code").value.trim();
    const funcion=$("v85-role-function").value.trim();
    const captureSource=source();
    if(state.catalog.some(x=>x.nombre.trim().toLowerCase()===nombre.toLowerCase()))
      throw Error("Ese rol ya existe; selecciona Reutilizar un rol existente.");
    const r=await api("/rest/v1/"+R.rol,"POST",{nombre,abreviatura,funcion});
    if(!r?.[0]?.id)throw Error("No se obtuvo ID del nuevo rol.");
    await api("/rest/v1/"+R.vinculo,"POST",{dominio_id:state.domain,rol_id:r[0].id,...captureSource});
    $("v85-role-new").reset();
    return "Rol creado y vinculado al dominio.";
  }));
  $("v85-role-link").addEventListener("submit",e=>save(e,async()=>{
    const rol_id=$("v85-role-existing").value,funcion_local=$("v85-role-local").value.trim()||null;
    if(!rol_id)throw Error("Selecciona un rol para reutilizar.");
    const payload={funcion_local,...source()};
    if(state.roles.some(x=>x.rol_id===rol_id)){
      await api("/rest/v1/"+R.vinculo+"?dominio_id=eq."+state.domain+"&rol_id=eq."+rol_id,"PATCH",payload);
    }else{
      await api("/rest/v1/"+R.vinculo,"POST",{dominio_id:state.domain,rol_id,...payload});
    }
    return "Rol asociado a este dominio sin duplicarlo.";
  }));
  $("v85-process-form").addEventListener("submit",e=>save(e,async()=>{
    const id=$("v85-process-edit").value;
    const payload={codigo:$("v85-process-code").value.trim()||null,
      nombre:$("v85-process-name").value.trim(),descripcion:$("v85-process-desc").value.trim()||null,
      ...source()};
    if(id)await write("PATCH",R.proceso,payload,id);
    else await write("POST",R.proceso,{...payload,dominio_id:state.domain});
    clearProcess();return "Proceso guardado.";
  }));
  $("v85-activity-form").addEventListener("submit",e=>save(e,async()=>{
    const id=$("v85-activity-edit").value,proceso_id=$("v85-activity-parent").value;
    if(!proceso_id)throw Error("Selecciona un proceso padre.");
    if(!state.config)throw Error("Primero configura en el apartado 1 si las actividades tienen código oficial.");
    const previous=state.activities.find(a=>a.id===id);
    const code=state.config.actividades_tienen_codigo
      ? $("v85-activity-code").value.trim()||null
      : previous?.codigo||nextActivityCode();
    const payload={proceso_id,codigo:code,
      nombre:$("v85-activity-name").value.trim(),descripcion:$("v85-activity-desc").value.trim()||null,
      ...source()};
    if(id)await write("PATCH",R.actividad,payload,id);
    else await write("POST",R.actividad,{...payload,dominio_id:state.domain});
    clearActivity();return "Actividad guardada.";
  }));
  $("v85-product-form").addEventListener("submit",e=>save(e,async()=>{
    const id=$("v85-product-edit").value;
    const payload={nombre:$("v85-product-name").value.trim(),
      descripcion:$("v85-product-desc").value.trim()||null,...source()};
    if(id)await write("PATCH",R.producto,payload,id);
    else await write("POST",R.producto,{...payload,dominio_id:state.domain});
    clearProduct();return "Producto guardado y disponible para todas las tareas del dominio.";
  }));
  $("v85-task-form").addEventListener("submit",e=>save(e,async()=>{
    const proceso=$("v85-task-process").value,actividad=$("v85-task-activity").value||null;
    if(!proceso)throw Error("Selecciona el proceso.");
    if(actividad&&!state.activities.some(x=>x.id===actividad&&x.proceso_id===proceso))
      throw Error("La actividad elegida no pertenece a este proceso.");
    const payload={p_dominio:state.domain,p_proceso:proceso,p_actividad:actividad,
      p_codigo:$("v85-task-code").value.trim()||null,
      p_nombre:$("v85-task-name").value.trim(),p_descripcion:$("v85-task-desc").value.trim()||null,
      p_orden:0,p_documento:source().documento_id,
      p_pagina:source().pagina,p_roles:values("v85-task-roles"),
      p_entradas:values("v85-task-inputs"),p_salidas:values("v85-task-outputs"),
      p_actualiza:values("v85-task-updates"),p_id:$("v85-task-edit").value||null};
    await api("/rest/v1/rpc/cimat_0852_guardar_tarea","POST",payload);
    clearTask();return "Tarea y todas sus relaciones guardadas de manera conjunta.";
  }));
  $("v85-seq-form").addEventListener("submit",e=>save(e,async()=>{
    const first=$("v85-seq-from").value,next=$("v85-seq-to").value;
    if(!first||!next||first===next)throw Error("Selecciona dos elementos diferentes.");
    const level=$("v85-seq-level").value;
    await api("/rest/v1/"+(level==="actividad"?R.secuenciaAct:R.secuencia),"POST",{
      dominio_id:state.domain,anterior_id:first,siguiente_id:next,
      nota:$("v85-seq-note").value.trim()||null});
    $("v85-seq-note").value="";
    return "Precedencia registrada. La base de datos verifica que no existan ciclos.";
  }));
  $("v85-feature-form").addEventListener("submit",e=>save(e,async()=>{
    const id=$("v85-feature-edit").value,producto_id=$("v85-feature-product").value;
    if(!producto_id)throw Error("Selecciona un producto.");
    const payload={producto_id,nombre:$("v85-feature-name").value.trim(),
      descripcion:$("v85-feature-desc").value.trim()||null,
      ...source()};
    if(id)await write("PATCH",R.caracteristica,payload,id);
    else await write("POST",R.caracteristica,{...payload,dominio_id:state.domain});
    clearFeature();return "Característica añadida al producto sin duplicarlo.";
  }));
  $("v85-process-edit").addEventListener("change",()=>{
    const x=state.processes.find(p=>p.id===$("v85-process-edit").value);
    if(!x){clearProcess();return;}
    $("v85-process-code").value=x.codigo||"";$("v85-process-name").value=x.nombre;
    $("v85-process-desc").value=x.descripcion||"";setSource(x);
  });
  $("v85-activity-edit").addEventListener("change",()=>{
    const x=state.activities.find(a=>a.id===$("v85-activity-edit").value);
    if(!x){clearActivity();return;}
    $("v85-activity-parent").value=x.proceso_id;$("v85-activity-code").value=x.codigo||"";
    $("v85-activity-name").value=x.nombre;$("v85-activity-desc").value=x.descripcion||"";
    setSource(x);updateActivityCodeUI();
  });
  $("v85-product-edit").addEventListener("change",()=>{
    const x=state.products.find(p=>p.id===$("v85-product-edit").value);
    if(!x){clearProduct();return;}
    $("v85-product-name").value=x.nombre;$("v85-product-desc").value=x.descripcion||"";setSource(x);
  });
  $("v85-task-edit").addEventListener("change",()=>{
    const x=state.tasks.find(t=>t.id===$("v85-task-edit").value);
    if(!x){clearTask();return;}
    $("v85-task-process").value=x.proceso_id;refreshActivityOptions();
    $("v85-task-activity").value=x.actividad_id||"";$("v85-task-code").value=x.codigo||"";
    $("v85-task-name").value=x.nombre;$("v85-task-desc").value=x.descripcion||"";
    setSource(x);
    selectValues("v85-task-roles",linkedRoleIds(x.id));
    selectValues("v85-task-inputs",linkedProducts(x.id,"entrada"));
    selectValues("v85-task-outputs",linkedProducts(x.id,"salida"));
    selectValues("v85-task-updates",linkedProducts(x.id,"actualiza"));
  });
  $("v85-feature-edit").addEventListener("change",()=>{
    const x=state.features.find(f=>f.id===$("v85-feature-edit").value);
    if(!x){clearFeature();return;}
    $("v85-feature-name").value=x.nombre;$("v85-feature-desc").value=x.descripcion||"";
    setSource(x);
  });
  $("v85-domain").addEventListener("change",()=>{
    $("v85-doc").value="";$("v85-page").value="";
    $("v85-code-status").textContent="";
    inlineResult("v85-product-form","");
    inlineResult("v85-task-form","");
    state.config=null;
    for(const id of ["v85-task-roles","v85-task-inputs","v85-task-outputs","v85-task-updates"])
      for(const checkbox of $(id).querySelectorAll('input[type="checkbox"]'))checkbox.checked=false;
    load();
  });
  $("v85-code-save").addEventListener("click",async()=>{
    const choice=$("v85-activities-have-code").value,domain=$("v85-domain").value;
    const status=$("v85-code-status");status.textContent="";
    if(!domain||!["si","no"].includes(choice)){status.textContent="Selecciona un dominio y responde si sus actividades tienen código oficial.";return;}
    const next=choice==="si";
    if(state.config&&state.config.actividades_tienen_codigo!==next&&state.activities.length&&
       !window.confirm("Ya existen actividades registradas. El cambio afectará únicamente a nuevas capturas y no alterará los códigos existentes. ¿Continuar?"))return;
    if(state.loading)return;
    state.loading=true;$("v85-code-save").disabled=true;
    try{
      const payload={actividades_tienen_codigo:next,actualizado_por:session().user.id,actualizado_en:new Date().toISOString()};
      if(state.config)await api("/rest/v1/cimat_0855_configuracion?dominio_id=eq."+domain,"PATCH",payload);
      else await api("/rest/v1/cimat_0855_configuracion","POST",{dominio_id:domain,...payload});
      state.loading=false;await load();
      status.textContent=next?"Configuración guardada. Las actividades admitirán códigos oficiales.":"Configuración guardada. CIMAT asignará códigos internos a nuevas actividades.";
      message("Configuración de códigos guardada correctamente.");
    }catch(err){status.textContent="No se pudo guardar: "+err.message;message(status.textContent,true);}
    finally{state.loading=false;$("v85-code-save").disabled=false;}
  });
  $("v85-refresh").addEventListener("click",load);
  $("v85-task-process").addEventListener("change",refreshActivityOptions);
  $("v85-feature-product").addEventListener("change",()=>{clearFeature();refreshFeatures();});
  $("v85-activity-parent").addEventListener("change",updateActivityCodeUI);
  $("v85-seq-level").addEventListener("change",renderSequences);
  $("v85-diagram-process").addEventListener("change",renderDiagram);
  $("v85-process-clear").addEventListener("click",clearProcess);
  $("v85-activity-clear").addEventListener("click",clearActivity);
  $("v85-task-clear").addEventListener("click",clearTask);
  $("v85-product-clear").addEventListener("click",clearProduct);
  $("v85-feature-clear").addEventListener("click",clearFeature);
  document.querySelector('[data-view="modelo"]')?.addEventListener("click",init);
})();