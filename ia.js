/* CIMAT v0.8 · Solicitudes de extracción inteligente con revisión experta.
   Las credenciales del proveedor permanecen exclusivamente en Supabase. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const cfg=window.CIMAT_CONFIG||{};
  const root=String(cfg.SUPABASE_URL||"").replace(/\/+$/,"");
  const key=String(cfg.SUPABASE_PUBLISHABLE_KEY||"");
  const sessionKey="cimat_v012_sesion";
  let documents=[],busy=false,fullRunning=false,stopRequested=false;
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
    if(!response.ok){
      const error=new Error(body.mensaje||body.message||"HTTP "+response.status);
      error.status=response.status;
      error.reintentar=body.reintentar===true;
      error.codigo=body.codigo||"";
      throw error;
    }
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
      $("ia-enviar").disabled=!a.configurado || fullRunning;
      $("ia-total-iniciar").disabled=!a.configurado || fullRunning;
    }catch(err){
      status("ia-configuracion","No fue posible comprobar la IA: "+err.message,true);
      $("ia-enviar").disabled=true;
      $("ia-total-iniciar").disabled=true;
    }
  }
  async function loadDocuments(){
    try{
      const rows=await api("/rest/v1/documentos_dominio?select=id,dominio_id,nombre_original&order=cargado_en.desc&limit=200");
      const domain=$("modelo-dominio")?.value||"";
      documents=domain?rows.filter(d=>d.dominio_id===domain):[];
      const target=$("ia-documento"),old=target.value;
      target.replaceChildren(new Option(domain?"Selecciona el PDF del dominio":"Primero selecciona el dominio",""));
      documents.forEach(d=>target.add(new Option(d.nombre_original,d.id)));
      if(documents.some(d=>d.id===old))target.value=old;
      else if(documents.length===1)target.value=documents[0].id;
      if(!documents.length)status("ia-resultado",domain
        ?"El dominio elegido no tiene documentos registrados. Cárgalo desde Biblioteca."
        :"Selecciona primero un dominio documental arriba.",false);
      else await pageLimits();
      await history();
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
    const target=$("ia-historial");
    const id=$("ia-documento").value;
    if(!id){target.replaceChildren(elem("p","Selecciona un documento de este dominio para ver su historial."));return;}
    try{
      const rows=await api("/rest/v1/ia_extracciones?select=pagina_inicio,pagina_fin,estado,elementos_nuevos,relaciones_nuevas,descartes_sin_evidencia,modelo,creado_en&order=creado_en.desc&limit=12&documento_id=eq."+encodeURIComponent(id));
      target.replaceChildren();
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
    try{await Promise.all([config(),loadDocuments()]);}
    finally{busy=false;}
  }
  $("ia-estado-boton").addEventListener("click",config);
  $("ia-actualizar").addEventListener("click",history);
  $("ia-documento").addEventListener("change",async()=>{await pageLimits();await history();});
  $("modelo-dominio").addEventListener("change",loadDocuments);
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
      const disconnected=err instanceof TypeError || /NetworkError|Failed to fetch|fetch resource|Load failed/i.test(err.message||"");
      status("ia-resultado",disconnected
        ? "Se interrumpió la comunicación con el servidor y no se pudo confirmar el resultado. Presiona «Consultar ejecuciones» antes de reintentar, para evitar análisis duplicados. Si no aparece una nueva ejecución, comprueba la conexión de red o intenta desde otra red."
        : "No se completó el análisis: "+err.message,true);
      await history();
    }finally{button.disabled=false;}
  });

  // Operación integral: una sola decisión explícita del administrador, múltiples
  // solicitudes pequeñas. El progreso persistente se consulta desde ia_extracciones.
  function pendingPairs(pages){
    const pending=[...new Set(pages)].filter(Number.isInteger).sort((a,b)=>a-b);
    const pairs=[];
    for(let i=0;i<pending.length;i++){
      const start=pending[i];
      if(pending[i+1]===start+1){pairs.push([start,start+1]);i++;}
      else pairs.push([start,start]);
    }
    return pairs;
  }
  $("ia-total-detener").addEventListener("click",()=>{
    stopRequested=true;
    status("ia-total-estado","Se detendrá al concluir la solicitud actual. Las páginas ya analizadas quedarán guardadas.");
  });
  $("ia-total-iniciar").addEventListener("click",async()=>{
    if(fullRunning)return;
    const id=$("ia-documento").value;
    if(!id){status("ia-total-estado","Selecciona primero el documento.",true);return;}
    if(!$("ia-total-consentimiento").checked){
      status("ia-total-estado","Debes autorizar de forma específica el envío de todas las páginas con texto a Gemini.",true);return;
    }
    fullRunning=true;
    stopRequested=false;
    const startButton=$("ia-total-iniciar"),stopButton=$("ia-total-detener");
    startButton.disabled=true;
    $("ia-enviar").disabled=true;
    $("ia-documento").disabled=true;
    stopButton.classList.remove("hidden");
    stopButton.disabled=false;
    let completed=0,created=0,edges=0,discarded=0,total=0,wasStopped=false,failed=false;
    try{
      status("ia-total-estado","Preparando el análisis integral y consultando páginas que ya se procesaron...");
      const plan=await api("/functions/v1/cimat-analizar-dominio",{
        method:"POST",body:{accion:"plan",documento_id:id}
      });
      const pairs=pendingPairs(plan.paginas_pendientes||[]);
      total=pairs.length;
      if(total===0){
        status("ia-total-estado","No quedan páginas pendientes con texto para el modelo "+plan.modelo+
          ". Revisa y consolida los elementos propuestos.");
        return;
      }
      const eligible=plan.paginas_con_texto||0;
      const done=(plan.paginas_analizadas||[]).length;
      const proceed=window.confirm(
        "CIMAT analizará "+(eligible-done)+" páginas pendientes de "+eligible+
        " mediante aproximadamente "+total+" solicitudes a Gemini. "+
        "Ya se han analizado "+done+" páginas. "+
        "La operación puede consumir cuota o generar cargos según tu cuenta. "+
        "Se enviará texto del documento a Google. ¿Confirmas continuar?"
      );
      if(!proceed){status("ia-total-estado","Análisis cancelado. No se enviaron nuevas páginas.");return;}
      for(let i=0;i<pairs.length;i++){
        if(stopRequested){wasStopped=true;break;}
        const [from,to]=pairs[i];
        status("ia-total-estado","Analizando tramo "+(i+1)+" de "+total+
          " · páginas "+from+(to===from?"":"–"+to)+". "+
          "Completados: "+completed+"; nuevos elementos: "+created+
          "; relaciones: "+edges+". Mantén abierta esta pestaña.");
        let result;
        for(let attempt=0;attempt<3;attempt++){
          if(stopRequested){wasStopped=true;break;}
          try{
            result=await api("/functions/v1/cimat-analizar-dominio",{
              method:"POST",
              body:{accion:"analizar",documento_id:id,pagina_inicio:from,pagina_fin:to,
                consentimiento_externo:true}
            });
            break;
          }catch(err){
            const temporary=(err.status===503&&err.reintentar===true)||
              (err.status===502&&/proveedor de IA respondió HTTP 503/i.test(err.message||""));
            if(!temporary||attempt===2){
              failed=true;
              status("ia-total-estado","Interrupción en las páginas "+from+"–"+to+": "+err.message+
                ". Consulta el historial antes de reanudar; CIMAT omitirá los tramos ya completados.",true);
              break;
            }
            // Una respuesta perdida podría corresponder a un análisis ya guardado.
            // Nunca repetir si la ejecución previa aparece completa en Supabase.
            try{
              const check=await api("/functions/v1/cimat-analizar-dominio",{
                method:"POST",body:{accion:"plan",documento_id:id}
              });
              const pending=new Set(check.paginas_pendientes||[]);
              if(!pending.has(from)&&!pending.has(to)){
                result={elementos_nuevos:0,relaciones_nuevas:0,descartes_sin_evidencia:0};
                break;
              }
            }catch(checkError){
              failed=true;
              status("ia-total-estado","No se pudo confirmar si las páginas "+from+"–"+to+
                " quedaron guardadas. Revisa el historial antes de repetir la solicitud.",true);
              break;
            }
            const pause=(attempt+1)*15000;
            status("ia-total-estado","Gemini está temporalmente saturado en las páginas "+
              from+"–"+to+". Reintento "+(attempt+1)+" de 2 después de "+
              (pause/1000)+" segundos. Los resultados anteriores están guardados.");
            await new Promise(resolve=>setTimeout(resolve,pause));
          }
        }
        if(failed||wasStopped)break;
        if(!result){
          failed=true;
          status("ia-total-estado","No se obtuvo una respuesta verificable para las páginas "+
            from+"–"+to+". Consulta el historial antes de reanudar.",true);
          break;
        }
        completed++;
        created+=Number(result.elementos_nuevos||0);
        edges+=Number(result.relaciones_nuevas||0);
        discarded+=Number(result.descartes_sin_evidencia||0);
        // Pausa moderada para no concentrar todas las peticiones en pocos segundos.
        if(i<pairs.length-1&&!stopRequested)await new Promise(r=>setTimeout(r,8000));
      }
      if(!failed){
        status("ia-total-estado",(wasStopped||stopRequested?"Análisis detenido de forma segura. ":"Análisis integral finalizado. ")+
          "Tramos completados ahora: "+completed+"/"+total+
          ". Elementos nuevos: "+created+"; relaciones nuevas: "+edges+
          "; propuestas descartadas: "+discarded+
          ". Revisa la estructura y sus evidencias antes de aprobar.");
      }
      await history();
      $("modelo-recargar")?.click();
    }catch(err){
      status("ia-total-estado","No se pudo completar la planificación: "+err.message+
        ". No reinicies a ciegas; consulta las ejecuciones registradas.",true);
    }finally{
      fullRunning=false;
      $("ia-documento").disabled=false;
      stopButton.classList.add("hidden");
      $("ia-total-consentimiento").checked=false;
      await config();
    }
  });
  document.querySelector('[data-view="modelo"]')?.addEventListener("click",init);
})();
