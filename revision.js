/* CIMAT v0.8.2b: revisión explícita, historial y consolidación no destructiva. */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const apiRoot=String(window.CIMAT_CONFIG?.SUPABASE_URL||"").replace(/\/+$/,"");
  const key=String(window.CIMAT_CONFIG?.SUPABASE_PUBLISHABLE_KEY||"");
  const sessionKey="cimat_v012_sesion";
  const state={domain:"",elements:[],relations:[],evidence:[],merges:[],history:[],loading:false};
  const labels={proceso:"Proceso",actividad:"Actividad",tarea:"Tarea",rol:"Rol",producto:"Producto",componente:"Componente",concepto:"Concepto"};
  const e=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined&&text!==null)node.textContent=String(text);if(cls)node.className=cls;return node;};
  const say=(message,err=false)=>{const el=$("revision-estado");el.textContent=message;el.classList.toggle("error",Boolean(err));};
  function session(){
    let s=null;try{s=JSON.parse(sessionStorage.getItem(sessionKey)||"null");}catch{}
    if(!s?.access_token||!s.user?.id||Date.now()>=s.expires_at)throw new Error("La sesión venció; inicia sesión nuevamente.");
    return s;
  }
  async function api(path,opts={}){
    const s=session();
    const res=await fetch(apiRoot+path,{method:opts.method||"GET",cache:"no-store",
      headers:{apikey:key,Authorization:"Bearer "+s.access_token,Accept:"application/json",
        ...(opts.body===undefined?{}:{"Content-Type":"application/json"})},
      body:opts.body===undefined?undefined:JSON.stringify(opts.body)
    });
    const raw=await res.text();let val;
    try{val=raw?JSON.parse(raw):null;}catch{val=null;}
    if(!res.ok)throw new Error(val?.message||val?.mensaje||"Error HTTP "+res.status);
    return val;
  }
  async function readTable(name,columns,domain,max=1000,order=""){
    const params=new URLSearchParams({select:columns,dominio_id:"eq."+domain,limit:String(max)});
    if(order)params.set("order",order);
    const rows=await api("/rest/v1/"+name+"?"+params);
    if(!Array.isArray(rows))throw new Error("Respuesta inesperada de "+name);
    if(rows.length===max)throw new Error("El número de filas alcanzó el límite de "+name+". Revisión cancelada para no mostrar información incompleta.");
    return rows;
  }
  function textName(node){
    return (node.codigo?node.codigo+" · ":"")+node.titulo+" ["+(labels[node.tipo]||node.tipo)+"] · "+node.estado;
  }
  function linksName(r){
    const a=state.elements.find(x=>x.id===r.origen_id),b=state.elements.find(x=>x.id===r.destino_id);
    return (a?.codigo||a?.titulo||"?")+" → "+r.tipo+" → "+(b?.codigo||b?.titulo||"?")+" · "+r.estado;
  }
  function selectOptions(id,items,description,fn,desired){
    const select=$(id);
    select.replaceChildren(new Option(description,""));
    for(const item of items)select.add(new Option(fn(item),item.id));
    if(desired&&items.some(x=>x.id===desired))select.value=desired;
  }
  async function load(){
    const domain=$("modelo-dominio")?.value||"";
    state.domain=domain;
    if(!domain){say("Selecciona un dominio documental.");return;}
    if(state.loading)return;
    state.loading=true;
    $("revision-recargar").disabled=true;
    say("Cargando fichas, evidencias, fusiones y decisiones de este dominio...");
    try{
      const prev=$("revision-registro").value,entity=$("revision-entidad").value;
      const [elements,relations,evidence,merges,history]=await Promise.all([
        readTable("conocimiento_elementos","id,tipo,codigo,titulo,descripcion,estado,documento_id,pagina",domain,1000,"codigo.asc"),
        readTable("conocimiento_relaciones","id,origen_id,destino_id,tipo,detalle,documento_id,pagina,estado",domain,2000),
        readTable("conocimiento_evidencias","elemento_id,documento_id,pagina,cita",domain,4000),
        readTable("conocimiento_fusiones","fuente_id,canonico_id,motivo,creado_en",domain,1000),
        readTable("conocimiento_revisiones","id,elemento_id,relacion_id,accion,motivo,actor_id,creado_en,anterior,posterior",domain,2000,"creado_en.desc")
      ]);
      if(domain!==$("modelo-dominio").value)return;
      Object.assign(state,{elements,relations,evidence,merges,history});
      renderOptions(prev,entity);
      renderHistory();
      say("Revisión disponible: "+elements.length+" fichas, "+relations.length+
        " relaciones, "+evidence.length+" citas y "+merges.length+" consolidaciones activas. Nada se modifica sin confirmar.");
    }catch(err){say("No fue posible consultar las revisiones: "+err.message,true);}
    finally{state.loading=false;$("revision-recargar").disabled=false;}
  }
  function renderOptions(previous="",entity=$("revision-entidad").value){
    const merged=new Map(state.merges.map(x=>[x.fuente_id,x.canonico_id]));
    if(entity==="elemento"){
      selectOptions("revision-registro",state.elements,"Selecciona un elemento",
        x=>textName(x)+(merged.has(x.id)?" · fusionado":""),previous);
    }else{
      selectOptions("revision-registro",state.relations,"Selecciona una relación",linksName,previous);
    }
    $("revision-elemento-opciones").hidden=entity!=="elemento";
    showDetail();
  }
  function showDetail(){
    const id=$("revision-registro").value,ent=$("revision-entidad").value;
    const root=$("revision-detalle");root.replaceChildren();
    const item=ent==="elemento"?state.elements.find(x=>x.id===id):state.relations.find(x=>x.id===id);
    const merged=state.merges.find(f=>f.fuente_id===id);
    $("revision-reclasificar").disabled=ent!=="elemento"||!item||!!merged||item.estado==="aprobado";
    $("revision-fusionar").disabled=ent!=="elemento"||!item||!!merged||item.estado!=="propuesto";
    $("revision-deshacer").disabled=ent!=="elemento"||!merged;
    $("revision-aprobar").disabled=!item||!!merged||item.estado==="aprobado";
    $("revision-descartar").disabled=!item||!!merged||item.estado==="descartado";
    $("revision-restablecer").disabled=!item||!!merged||item.estado==="propuesto";
    if(!item)return;
    const box=e("div",null,"auditoria-incidencia");
    if(ent==="elemento"){
      box.append(e("strong",textName(item)));
      box.append(e("p",item.descripcion||"Sin descripción documental."));
      const citations=state.evidence.filter(x=>x.elemento_id===id);
      box.append(e("p","Referencia principal: "+(item.pagina?"PDF página "+item.pagina:"sin página")+
        " · "+citations.length+" cita(s) asociada(s)."));
      for(const c of citations.slice(0,10)){
        box.append(e("p","Página "+c.pagina+" · “"+c.cita+"”","auditoria-fuente"));
      }
      if(citations.length>10)box.append(e("small","Se muestran las primeras diez citas; el resto continúa preservado en Supabase."));
      if(merged){
        const target=state.elements.find(x=>x.id===merged.canonico_id);
        box.append(e("p","Consolidada en: "+(target?textName(target):merged.canonico_id)+
          ". La ficha, sus citas y sus relaciones originales siguen almacenadas."));
      }
      $("revision-tipo").value=item.tipo;
      const targets=state.elements.filter(t=>t.id!==id&&t.tipo===item.tipo&&t.estado==="propuesto"&&
        !state.merges.some(f=>f.fuente_id===t.id)&&!state.merges.some(f=>f.canonico_id===id));
      selectOptions("revision-canonico",targets,"Selecciona la ficha correcta que representa lo mismo",textName);
    }else{
      box.append(e("strong",linksName(item)));
      box.append(e("p","Página del PDF: "+(item.pagina||"no identificada")));
      box.append(e("p",item.detalle||"La relación no tiene cita textual registrada."));
    }
    root.append(box);
  }
  function renderHistory(){
    const root=$("revision-historial");root.replaceChildren();
    const rows=state.history.slice(0,25);
    if(!rows.length){root.append(e("p","Todavía no se han registrado decisiones de revisión en este dominio."));return;}
    for(const r of rows){
      const card=e("div",null,"auditoria-incidencia");
      const item=state.elements.find(x=>x.id===r.elemento_id)||
        state.relations.find(x=>x.id===r.relacion_id);
      card.append(e("strong",new Date(r.creado_en).toLocaleString("es-MX")+
        " · "+r.accion+" · "+(item?(item.codigo||item.titulo||r.relacion_id):"Ficha histórica")));
      card.append(e("p",r.motivo||"Sin motivo."));
      if(r.accion==="reclasificar"){
        card.append(e("small","Tipo anterior: "+(r.anterior?.tipo||"—")+
          " · tipo posterior: "+(r.posterior?.tipo||"—")));
      }
      root.append(card);
    }
  }
  async function decide(action){
    if(state.loading)return;
    const id=$("revision-registro").value,entity=$("revision-entidad").value;
    const motive=$("revision-motivo").value.trim();
    const canonical=$("revision-canonico").value;
    if(!id){say("Selecciona la ficha que deseas revisar.",true);return;}
    if(motive.length<12||motive.length>1000){say("Documenta una justificación de 12 a 1000 caracteres.",true);return;}
    if(!$("revision-confirmacion").checked){say("Debes confirmar que contrastaste la decisión con la fuente.",true);return;}
    if(action==="fusionar"&&!canonical){say("Selecciona primero la ficha canónica.",true);return;}
    const descriptions={reclasificar:"cambiar la categoría",aprobar:"aprobar la ficha",
      descartar:"descartar la ficha",restablecer:"devolverla a propuesta",
      fusionar:"consolidar sin eliminar los datos",deshacer_fusion:"deshacer la consolidación"};
    if(!window.confirm("¿Confirmas "+(descriptions[action]||action)+
      " para la ficha seleccionada? La decisión y su justificación quedarán registradas."))return;
    state.loading=true;
    for(const b of $("revision-panel").querySelectorAll("button"))b.disabled=true;
    say("Guardando la decisión con su justificación...");
    try{
      await api("/rest/v1/rpc/cimat_082b_revisar",{method:"POST",
        body:{p_entidad:entity,p_id:id,p_accion:action,p_motivo:motive,
          p_nuevo_tipo:action==="reclasificar"?$("revision-tipo").value:null,
          p_destino:action==="fusionar"?canonical:null}
      });
      $("revision-confirmacion").checked=false;
      $("revision-motivo").value="";
      state.loading=false;
      await load();
      $("modelo-recargar")?.click();
      // La auditoría anterior era un diagnóstico de un estado que ya cambió.
      $("auditoria-estado").textContent="Se registraron decisiones nuevas. Ejecuta otra vez la auditoría para actualizar los avisos.";
      say("Decisión registrada: "+action+". Se conservó el historial y la trazabilidad.");
    }catch(err){say("La decisión no se pudo aplicar: "+err.message,true);}
    finally{
      state.loading=false;$("revision-recargar").disabled=false;
      showDetail();
    }
  }
  $("revision-recargar").addEventListener("click",load);
  $("revision-entidad").addEventListener("change",()=>renderOptions());
  $("revision-registro").addEventListener("change",showDetail);
  for(const [id,action] of Object.entries({
    "revision-reclasificar":"reclasificar","revision-aprobar":"aprobar",
    "revision-descartar":"descartar","revision-restablecer":"restablecer",
    "revision-fusionar":"fusionar","revision-deshacer":"deshacer_fusion"
  }))$(id).addEventListener("click",()=>decide(action));
  $("modelo-dominio")?.addEventListener("change",()=>{
    Object.assign(state,{domain:"",elements:[],relations:[],evidence:[],merges:[],history:[]});
    $("revision-registro").replaceChildren(new Option("Selecciona una ficha",""));
    $("revision-historial").replaceChildren();
    $("revision-detalle").replaceChildren();
    load();
  });
  window.addEventListener("cimat:revisar",event=>{
    const info=event.detail||{};
    if(info.relationId)$("revision-entidad").value="relacion";
    else if(info.elementId)$("revision-entidad").value="elemento";
    renderOptions(info.relationId||info.elementId||"");
    $("revision-panel")?.scrollIntoView({behavior:"smooth",block:"start"});
  });
  document.querySelector('[data-view="modelo"]')?.addEventListener("click",()=>{
    if($("modelo-dominio")?.value && state.domain!==$("modelo-dominio").value)load();
  });
})();
