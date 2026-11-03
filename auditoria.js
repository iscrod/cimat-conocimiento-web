/* CIMAT v0.8.2a · Presentación y exportación del diagnóstico del dominio.
   Esta pantalla SOLO lee; nunca crea, aprueba, fusiona o descarta registros. */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const apiRoot=String(window.CIMAT_CONFIG?.SUPABASE_URL||"").replace(/\/+$/,"");
  const publicKey=String(window.CIMAT_CONFIG?.SUPABASE_PUBLISHABLE_KEY||"");
  const sessionKey="cimat_v012_sesion";
  let result=null,source=[],currentDomain="",visibleLimit=35,running=false;
  function el(tag,content,css) {
    const node=document.createElement(tag);
    if(content!==undefined&&content!==null)node.textContent=String(content);
    if(css)node.className=css;
    return node;
  }
  function report(text,error=false) {
    const e=$("auditoria-estado");e.textContent=text;e.classList.toggle("error",error);
  }
  function session(){
    let s;
    try{s=JSON.parse(sessionStorage.getItem(sessionKey)||"null");}catch{}
    if(!s?.access_token||!s.user?.id||Date.now()>=s.expires_at)
      throw new Error("La sesión expiró. Inicia sesión nuevamente.");
    return s;
  }
  async function fetchRows(name,columns,domain,limit) {
    const s=session(),params=new URLSearchParams({
      select:columns,dominio_id:"eq."+domain,limit:String(limit)
    });
    const response=await fetch(apiRoot+"/rest/v1/"+name+"?"+params,{
      method:"GET",cache:"no-store",
      headers:{apikey:publicKey,Authorization:"Bearer "+s.access_token,
        Accept:"application/json"}
    });
    const text=await response.text();let data;
    try{data=JSON.parse(text);}catch{data=null;}
    if(!response.ok)throw new Error(data?.message||"Error HTTP "+response.status+" consultando "+name);
    if(!Array.isArray(data))throw new Error("Respuesta inesperada de "+name);
    if(data.length>=limit)throw new Error("El catálogo supera el límite de "+limit+" registros de "+name+
      ". Se cancela la auditoría para evitar resultados incompletos.");
    return data;
  }
  function sourceText(issue) {
    const refs=source.filter(p=>p.elemento_id===issue.elementId);
    const first=refs.find(p=>p.cita);
    if(first)return "PDF pág. "+first.pagina+" · Cita registrada: “"+
      first.cita.slice(0,220)+(first.cita.length>220?"…":"")+"”";
    if(issue.page)return "PDF pág. "+issue.page+
      " · Referencia de página; consulta la fuente antes de validar.";
    return "Sin referencia a una página identificada.";
  }
  function jumpTo(issue) {
    const id=issue.relationId?"modelo-relacion-id":"modelo-elemento-id";
    const value=issue.relationId||issue.elementId;
    if(!value){report("Este aviso describe una ausencia; no existe una ficha que abrir.");return;}
    const select=$(id);
    if(!select || ![...select.options].some(x=>x.value===value)){
      report("La ficha no está cargada en el editor. Presiona «Actualizar el modelo» y vuelve a auditar.",true);
      return;
    }
    select.value=value;
    select.dispatchEvent(new Event("change",{bubbles:true}));
  }
  function render() {
    const list=$("auditoria-lista"),summary=$("auditoria-resumen");
    list.replaceChildren();summary.replaceChildren();
    if(!result)return;
    const s=result.summary;
    const stats=[
      [s.elements,"Elementos"],[s.relations,"Relaciones"],[s.evidence,"Evidencias"],
      [s.high,"Prioridad alta"],[s.medium,"Prioridad media"],[s.low,"Prioridad baja"]
    ];
    stats.forEach(([count,label])=>{
      const item=el("div",null,"auditoria-estadistica");
      item.append(el("strong",count),el("small",label));summary.append(item);
    });
    const severity=$("auditoria-prioridad").value,category=$("auditoria-categoria").value;
    const matches=result.issues.filter(i=>(severity==="todos"||i.severity===severity)&&
      (category==="todos"||i.category===category));
    if(!matches.length){
      list.append(el("p",s.total===0?"Sin incidencias detectadas por las reglas disponibles. No equivale a una aprobación normativa.":
        "No hay avisos con estos filtros."));$("auditoria-mas").hidden=true;return;
    }
    for(const issue of matches.slice(0,visibleLimit)){
      const card=el("div",null,"auditoria-incidencia");
      const header=el("div",null,"auditoria-encabezado");
      const title=el("strong",issue.title);
      const marker=el("span",issue.severity.toUpperCase()+" · "+
        (result.categories[issue.category]||issue.category),"auditoria-marcador "+issue.severity);
      header.append(title,marker);
      card.append(header,el("p",issue.detail,"auditoria-detalle"));
      card.append(el("p","Revisión propuesta: "+issue.proposal,"auditoria-recomendacion"));
      if(issue.elementId)card.append(el("small",sourceText(issue),"auditoria-fuente"));
      const actions=el("div",null,"form-actions");
      if(issue.elementId||issue.relationId){
        const open=el("button",issue.relationId?"Revisar relación":"Revisar ficha","outline");
        open.type="button";open.addEventListener("click",()=>jumpTo(issue));
        actions.append(open);
      }
      card.append(actions);list.append(card);
    }
    const remaining=matches.length-visibleLimit;
    $("auditoria-mas").hidden=remaining<=0;
    $("auditoria-mas").textContent="Ver más ("+Math.max(0,remaining)+" restantes)";
    $("auditoria-contador").textContent="Mostrando "+Math.min(visibleLimit,matches.length)+
      " de "+matches.length+" avisos. "+s.total+" incidencias en total para este dominio.";
  }
  async function run(){
    if(running)return;
    const domain=$("modelo-dominio")?.value;
    if(!domain){report("Selecciona un dominio documental en la sección anterior.",true);return;}
    if(!window.CIMAT_AUDITORIA_CORE?.audit){
      report("Falta cargar el motor de auditoría. Actualiza la página con Ctrl + F5.",true);return;
    }
    running=true;$("auditoria-ejecutar").disabled=true;
    report("Consultando elementos, relaciones y evidencias del dominio seleccionado...");
    try{
      const [elements,relations,evidence]=await Promise.all([
        fetchRows("conocimiento_elementos","id,tipo,codigo,titulo,descripcion,estado,origen,documento_id,pagina",domain,1000),
        fetchRows("conocimiento_relaciones","id,origen_id,destino_id,tipo,detalle,documento_id,pagina,estado",domain,2000),
        fetchRows("conocimiento_evidencias","elemento_id,documento_id,pagina,cita",domain,4000)
      ]);
      // Una selección modificada durante la carga invalida el cálculo.
      if(domain!==$("modelo-dominio").value)throw new Error("Cambió el dominio durante la consulta. Vuelve a ejecutar.");
      const domainName=$("modelo-dominio").selectedOptions?.[0]?.textContent||"";
      result=window.CIMAT_AUDITORIA_CORE.audit({elements,relations,evidence,domainLabel:domainName});
      source=evidence;currentDomain=domain;visibleLimit=35;
      $("auditoria-exportar").disabled=false;
      report("Auditoría de solo lectura completada: "+result.summary.total+
        " avisos por revisar. Reglas aplicadas: "+result.summary.scope+
        ". Ninguna ficha fue modificada.");
      render();
    }catch(err){
      result=null;source=[];$("auditoria-exportar").disabled=true;
      $("auditoria-lista").replaceChildren();$("auditoria-resumen").replaceChildren();
      report("No se pudo ejecutar la auditoría: "+err.message,true);
    }finally{running=false;$("auditoria-ejecutar").disabled=false;}
  }
  function reset(){
    result=null;source=[];currentDomain="";visibleLimit=35;
    $("auditoria-resumen").replaceChildren();$("auditoria-lista").replaceChildren();
    $("auditoria-contador").textContent="";
    $("auditoria-exportar").disabled=true;
    $("auditoria-mas").hidden=true;
    report("Dominio seleccionado. Presiona «Auditar dominio» para generar el diagnóstico.");
  }
  function csv(){
    if(!result)return;
    const lines=[["Prioridad","Categoría","Incidencia","Observación","Propuesta","Página PDF","ID elemento","ID relación"]];
    for(const issue of result.issues){
      lines.push([issue.severity,result.categories[issue.category]||issue.category,
        issue.title,issue.detail,issue.proposal,issue.page||"",issue.elementId||"",issue.relationId||""]);
    }
    const safeCell=value=>{
      let raw=String(value??"").replace(/[\r\n]+/g," ");
      // Evita interpretar el texto procedente del PDF como fórmula de hoja de cálculo.
      if(/^[\s]*[=+\-@]/.test(raw))raw="'"+raw;
      return '"'+raw.replace(/"/g,'""')+'"';
    };
    const text="\uFEFF"+lines.map(line=>line.map(safeCell).join(";")).join("\r\n");
    const url=URL.createObjectURL(new Blob([text],{type:"text/csv;charset=utf-8"}));
    const a=document.createElement("a");a.href=url;
    a.download="cimat_auditoria_v082_"+new Date().toISOString().slice(0,10)+".csv";
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1200);
  }
  $("auditoria-ejecutar").addEventListener("click",run);
  $("auditoria-exportar").addEventListener("click",csv);
  $("auditoria-prioridad").addEventListener("change",()=>{visibleLimit=35;render();});
  $("auditoria-categoria").addEventListener("change",()=>{visibleLimit=35;render();});
  $("auditoria-mas").addEventListener("click",()=>{visibleLimit+=35;render();});
  $("modelo-dominio")?.addEventListener("change",reset);
  $("modelo-recargar")?.addEventListener("click",()=>{
    if(result)report("El catálogo se está actualizando. Vuelve a auditar para obtener un diagnóstico vigente.");
  });
  reset();
})();
