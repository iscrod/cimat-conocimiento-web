/* CIMAT v0.7: análisis documental. Funciona con el JWT del usuario y RLS. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const cfg=window.CIMAT_CONFIG||{};
  const root=String(cfg.SUPABASE_URL||"").replace(/\/+$/,"");
  const key=cfg.SUPABASE_PUBLISHABLE_KEY;
  const loginKey="cimat_v012_sesion";
  let sections=[],currentDoc="";
  function session(){
    let s;
    try{s=JSON.parse(sessionStorage.getItem(loginKey)||"null");}catch{}
    if(!s?.access_token || !s.user?.id || Date.now()>=s.expires_at)
      throw new Error("Inicia sesión nuevamente.");
    return s;
  }
  async function api(path,opts={}){
    const s=session();
    const r=await fetch(root+path,{
      method:opts.method||"GET",cache:"no-store",
      headers:{"apikey":key,"Authorization":"Bearer "+s.access_token,
        "Content-Type":"application/json"},
      body:opts.body===undefined?undefined:JSON.stringify(opts.body)});
    const payload=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(payload.mensaje||payload.message||"HTTP "+r.status);
    return payload;
  }
  function status(message,error=false){
    $("analisis-estado").textContent=message;
    $("analisis-estado").classList.toggle("error",error);
  }
  function node(tag,text,cls){
    const el=document.createElement(tag);
    if(text!==undefined)el.textContent=String(text);
    if(cls)el.className=cls;
    return el;
  }
  async function documents(){
    try{
      const docs=await api("/rest/v1/documentos_dominio?select=id,nombre_original,tipo_mime&order=cargado_en.desc&limit=200");
      const select=$("analisis-documento"),prev=select.value;
      select.replaceChildren(new Option("Selecciona un documento",""));
      docs.forEach(d=>select.add(new Option(d.nombre_original+(d.tipo_mime==="application/pdf"?"":" [aún no compatible]"),d.id)));
      if(docs.some(d=>d.id===prev))select.value=prev;
      if(!select.value&&docs.length===1)select.value=docs[0].id;
      if(select.value&&select.value!==currentDoc)await load();
    }catch(e){status("No se pudo consultar los documentos: "+e.message,true);}
  }
  async function page(){
    const id=$("analisis-documento").value,p=Number($("analisis-pagina").value);
    if(!id||!p)return;
    $("analisis-texto").textContent="Consultando página...";
    try{
      const rows=await api("/rest/v1/documento_paginas?select=texto&documento_id=eq."+encodeURIComponent(id)+"&pagina=eq."+p+"&limit=1");
      if(id===$("analisis-documento").value&&p===Number($("analisis-pagina").value))
        $("analisis-texto").textContent=rows[0]?.texto||"No hay texto extraíble en esta página.";
    }catch(e){$("analisis-texto").textContent="Error: "+e.message;}
  }
  function renderSections(){
    const target=$("analisis-secciones");
    target.replaceChildren();
    if(!sections.length){target.append(node("p","No se encontraron encabezados numerados. Revisa el texto por página."));return;}
    for(const sec of sections){
      const card=node("article",undefined,"analisis-seccion");
      card.dataset.id=sec.id;
      card.append(node("small","Página "+sec.pagina+" · "+(sec.codigo||"")+" · "+sec.estado));
      const label=node("label","Encabezado candidato");
      const input=node("input");input.value=sec.titulo;input.maxLength=300;input.className="analisis-titulo";
      label.append(input);card.append(label);
      const actions=node("div",undefined,"form-actions");
      for(const [caption,action] of [["Ver página","pagina"],["Aprobar","aprobado"],["Descartar","descartado"],["Pendiente","candidato"]]){
        const button=node("button",caption,action==="aprobado"?"":"outline");
        button.type="button";button.dataset.action=action;button.dataset.page=sec.pagina;
        actions.append(button);
      }
      card.append(actions);target.append(card);
    }
  }
  async function load(){
    const id=$("analisis-documento").value;
    currentDoc=id;sections=[];
    $("analisis-resumen").classList.add("hidden");
    $("analisis-inspeccion").classList.add("hidden");
    if(!id){status("Selecciona un documento.");return;}
    status("Consultando análisis...");
    try{
      const [summaries,items]=await Promise.all([
        api("/rest/v1/documento_analisis?select=estado,total_paginas,paginas_con_texto,caracteres,candidatos&documento_id=eq."+id+"&limit=1"),
        api("/rest/v1/documento_secciones?select=id,pagina,codigo,titulo,estado&documento_id=eq."+id+"&order=pagina.asc&limit=300")
      ]);
      if(id!==$("analisis-documento").value)return;
      const a=summaries[0];
      if(!a){status("Pendiente de procesamiento. Presiona «Procesar PDF».");return;}
      sections=items;
      $("analisis-resumen").textContent=a.total_paginas+" páginas; "+a.paginas_con_texto+" con texto; "+
        a.caracteres+" caracteres; "+items.length+" encabezados candidatos; "+
        items.filter(x=>x.estado==="aprobado").length+" aprobados.";
      $("analisis-resumen").classList.remove("hidden");
      const choose=$("analisis-pagina");choose.replaceChildren();
      for(let p=1;p<=a.total_paginas;p++)choose.add(new Option("Página "+p,String(p)));
      $("analisis-inspeccion").classList.remove("hidden");
      renderSections();await page();
      status(a.estado==="sin_texto"?"El PDF no contiene texto extraíble; requiere OCR.":"Extracción disponible; revisa los encabezados antes de utilizarlos.");
    }catch(e){status("No fue posible consultar: "+e.message,true);}
  }
  $("analisis-procesar").addEventListener("click",async()=>{
    const id=$("analisis-documento").value;
    if(!id){status("Selecciona un documento.",true);return;}
    const button=$("analisis-procesar");button.disabled=true;
    status("Procesando PDF privado. No cierres esta pestaña durante la solicitud.");
    try{
      const data=await api("/functions/v1/cimat-procesar-documento",{method:"POST",body:{documento_id:id}});
      await load();status(data.mensaje||"Análisis preparado.");
    }catch(e){status("Procesamiento no completado: "+e.message,true);}
    finally{button.disabled=false;}
  });
  $("analisis-secciones").addEventListener("click",async event=>{
    const button=event.target.closest("button"),card=button?.closest(".analisis-seccion");
    if(!card)return;
    const sec=sections.find(s=>s.id===card.dataset.id);
    if(!sec)return;
    if(button.dataset.action==="pagina"){
      $("analisis-pagina").value=String(sec.pagina);await page();
      $("analisis-texto").scrollIntoView({behavior:"smooth",block:"center"});return;
    }
    const title=card.querySelector("input").value.trim();
    if(title.length<3){status("Revisa el título de la sección.",true);return;}
    card.querySelectorAll("button").forEach(b=>b.disabled=true);
    try{
      await api("/rest/v1/rpc/revisar_seccion",{method:"POST",
        body:{p_id:sec.id,p_estado:button.dataset.action,p_titulo:title}});
      await load();status("Revisión guardada y auditada.");
    }catch(e){
      card.querySelectorAll("button").forEach(b=>b.disabled=false);
      status("Revisión no guardada: "+e.message,true);
    }
  });
  $("analisis-documento").addEventListener("change",load);
  $("analisis-pagina").addEventListener("change",page);
  $("analisis-recargar").addEventListener("click",async()=>{await documents();await load();});
  $("analisis-documento").addEventListener("focus",documents);
  document.querySelector('[data-view="biblioteca"]')?.addEventListener("click",documents);
})();
