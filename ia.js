/* CIMAT v0.8 · Solicitudes de extracción inteligente con revisión experta.
   Las credenciales del proveedor permanecen exclusivamente en Supabase. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const cfg=window.CIMAT_CONFIG||{};
  const root=String(cfg.SUPABASE_URL||"").replace(/\/+$/,"");
  const key=String(cfg.SUPABASE_PUBLISHABLE_KEY||"");
  const sessionKey="cimat_v012_sesion";
  let documents=[],busy=false;
  function session(){
    let s;
    try{s=JSON.parse(sessionStorage.getItem(sessionKey)||"null");}catch{}
    if(!s?.access_token||!s.user?.id||Date.now()>=s.expires_at)
      throw new Error("La sesión expiró; ingresa nuevamente.");
    return s;
  }
  async function api(path,opt={}){
    const s=session();
    const response=await fetch(root+path,{
      method:opt.method||"GET",cache:"no-store",
      headers:{"apikey":key,"Authorization":"Bearer "+s.access_token,
        "Content-Type":"application/json","Accept":"application/json"},
      body:opt.body===undefined?undefined:JSON.stringify(opt.body)
    });
    const raw=await response.text();let body={};
    try{body=raw?JSON.parse(raw):{};}catch{}
    if(!response.ok)throw new Error(body.mensaje||body.message||"HTTP "+response.status);
    return body;
  }
  function status(id,text,error=false){
    const target=$(id);target.textContent=text;
    target.classList.toggle("error",error);
  }
  function elem(tag,text,cls){
    const e=document.createElement(tag);
    e.textContent=text;if(cls)e.className=cls;
    return e;
  }
  async function config(){
    try{
      const a=await api("/functions/v1/cimat-analizar-dominio",{
        method:"POST",body:{accion:"estado"}
      });
      status("ia-configuracion",a.configurado
        ?"Proveedor de IA configurado · "+a.modelo+". Analiza solo fragmentos autorizados."
        :"IA aún no habilitada: configura CIMAT_GEMINI_API_KEY como secreto del proyecto Supabase.");
      $("ia-enviar").disabled=!a.configurado;
    }catch(err){
      status("ia-configuracion","No fue posible comprobar la IA: "+err.message,true);
      $("ia-enviar").disabled=true;
    }
  }
  async function loadDocuments(){
    try{
      const rows=await api("/rest/v1/documentos_dominio?select=id,dominio_id,nombre_original&order=cargado_en.desc&limit=200");
      documents=rows;
      const target=$("ia-documento"),old=target.value;
      target.replaceChildren(new Option("Selecciona un PDF procesado",""));
      rows.forEach(d=>target.add(new Option(d.nombre_original,d.id)));
      if(rows.some(d=>d.id===old))target.value=old;
      else if(rows.length===1)target.value=rows[0].id;
      await pageLimits();
    }catch(err){status("ia-resultado","No se pudieron consultar los documentos: "+err.message,true);}
  }
  async function pageLimits(){
    const id=$("ia-documento").value;
    if(!id)return;
    try{
      const data=await api("/rest/v1/documento_analisis?select=total_paginas,paginas_con_texto,estado&documento_id=eq."+encodeURIComponent(id)+"&limit=1");
      const a=data[0];
      if(!a){status("ia-resultado","Este documento aún no se ha procesado como PDF. Ve a Biblioteca y selecciona Procesar PDF.",true);return;}
      for(const input of [$("ia-pagina-inicio"),$("ia-pagina-fin")]){
        input.max=String(a.total_paginas);
        if(Number(input.value)>a.total_paginas)input.value="1";
      }
      status("ia-resultado","Documento listo: "+a.total_paginas+" páginas; "+a.paginas_con_texto+" con texto extraído. Selecciona una o dos páginas.");
    }catch(err){status("ia-resultado","No se pudo consultar el análisis: "+err.message,true);}
  }
  async function history(){
    try{
      const rows=await api("/rest/v1/ia_extracciones?select=pagina_inicio,pagina_fin,estado,elementos_nuevos,relaciones_nuevas,descartes_sin_evidencia,modelo,creado_en&order=creado_en.desc&limit=12");
      const target=$("ia-historial");target.replaceChildren();
      if(!rows.length){target.append(elem("p","No hay ejecuciones registradas."));return;}
      rows.forEach(r=>{
        const div=elem("div","","item");
        const date=new Date(r.creado_en).toLocaleString("es-MX",{dateStyle:"short",timeStyle:"short"});
        div.append(elem("strong",r.estado+" · páginas "+r.pagina_inicio+"–"+r.pagina_fin));
        div.append(elem("p",date+" · elementos nuevos "+r.elementos_nuevos+
          " · relaciones nuevas "+r.relaciones_nuevas+
          " · descartes "+r.descartes_sin_evidencia+" · "+r.modelo));
        target.append(div);
      });
    }catch(err){status("ia-resultado","No se pudo consultar el historial: "+err.message,true);}
  }
  async function init(){
    if(busy)return;
    busy=true;
    try{await Promise.all([config(),loadDocuments(),history()]);}
    finally{busy=false;}
  }
  $("ia-estado-boton").addEventListener("click",config);
  $("ia-actualizar").addEventListener("click",history);
  $("ia-documento").addEventListener("change",pageLimits);
  $("ia-pagina-inicio").addEventListener("change",function(){
    const p=Number(this.value),to=$("ia-pagina-fin");
    if(Number(to.value)<p||Number(to.value)>p+1)to.value=this.value;
  });
  $("ia-form").addEventListener("submit",async evt=>{
    evt.preventDefault();
    const doc=$("ia-documento").value,ini=Number($("ia-pagina-inicio").value),
      fin=Number($("ia-pagina-fin").value);
    if(!doc||!Number.isInteger(ini)||!Number.isInteger(fin)||fin<ini||fin>ini+1){
      status("ia-resultado","Elige un documento y máximo dos páginas consecutivas.",true);return;
    }
    if(!$("ia-consentimiento").checked){
      status("ia-resultado","Confirma la autorización de enviar estos fragmentos a un proveedor externo.",true);return;
    }
    const button=$("ia-enviar");button.disabled=true;
    status("ia-resultado","Analizando páginas con IA. Las propuestas nunca se aprueban automáticamente.");
    try{
      const result=await api("/functions/v1/cimat-analizar-dominio",{method:"POST",
        body:{accion:"analizar",documento_id:doc,pagina_inicio:ini,
          pagina_fin:fin,consentimiento_externo:true}
      });
      status("ia-resultado",result.mensaje+" Nuevos elementos: "+result.elementos_nuevos+
        "; nuevas relaciones: "+result.relaciones_nuevas+
        "; candidatos descartados por falta de evidencia: "+result.descartes_sin_evidencia+
        ". Abre «Modelo y diagramas» y verifica cada propuesta antes de aprobar.");
      $("ia-consentimiento").checked=false;
      await history();
      // El catálogo gráfico utiliza los registros aprobados y propuestos desde PostgreSQL.
      $("modelo-recargar")?.click();
    }catch(err){
      status("ia-resultado","No se completó el análisis: "+err.message,true);
      await history();
    }finally{button.disabled=false;}
  });
  document.querySelector('[data-view="modelo"]')?.addEventListener("click",init);
})();
