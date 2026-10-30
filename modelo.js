/* CIMAT 0.7.1 — Modelo de conocimiento documental y diagrama relacional */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const cfg = window.CIMAT_CONFIG || {};
  const root = String(cfg.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(cfg.SUPABASE_PUBLISHABLE_KEY || "");
  const sessionKey = "cimat_v012_sesion";
  const model = { domains: [], documents: [], elements: [], relations: [], ready: false };
  const kinds = { proceso: "Proceso", actividad: "Actividad", tarea: "Tarea", rol: "Rol", producto: "Producto de trabajo", componente: "Componente", concepto: "Concepto" };
  const relations = { contiene: "contiene", participa: "participa en", ejecuta: "ejecuta", utiliza: "utiliza (entrada)", genera: "genera (salida)", actualiza: "actualiza", verifica: "verifica", precede: "precede a", referencia: "referencia" };

  function session() {
    let s;
    try { s = JSON.parse(sessionStorage.getItem(sessionKey) || "null"); } catch (_) {}
    if (!s || !s.access_token || !s.user?.id || Date.now() >= s.expires_at) {
      throw new Error("Inicia sesión nuevamente para administrar el modelo.");
    }
    return s;
  }

  async function api(path, options) {
    const s = session();
    const opts = options || {};
    const response = await fetch(root + path, {
      method: opts.method || "GET", cache: "no-store",
      headers: {
        apikey: key, Authorization: "Bearer " + s.access_token,
        Accept: "application/json", "Content-Type": "application/json",
        ...(opts.body !== undefined ? {Prefer: "return=representation"} : {})
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    });
    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = null; }
    if (!response.ok) {
      throw new Error(data?.message || data?.error_description || data?.mensaje || "HTTP " + response.status);
    }
    return data;
  }

  function el(tag, text, css) {
    const n = document.createElement(tag);
    if (text !== undefined && text !== null) n.textContent = String(text);
    if (css) n.className = css;
    return n;
  }
  function msg(id, value, error) {
    const n = $(id);
    n.textContent = value;
    n.classList.toggle("error", Boolean(error));
  }
  function options(id, items, placeholder, display) {
    const select = $(id), prev = select.value;
    select.replaceChildren(new Option(placeholder, ""));
    items.forEach((item) => select.add(new Option(display(item), item.id)));
    if (items.some((item) => item.id === prev)) select.value = prev;
  }
  function sourceLabel(item) {
    const doc = model.documents.find(d => d.id === item.documento_id);
    return doc && item.pagina ? "PDF pág. " + item.pagina + " · " + doc.nombre_original : "Sin referencia de página";
  }
  function displayNode(node) {
    return (node.codigo ? node.codigo + " · " : "") + node.titulo + " [" + (kinds[node.tipo] || node.tipo) + "]";
  }
  function selectedDomain() { return $("modelo-dominio").value; }
  function sortNodes(a, b) {
    return (a.orden || 0) - (b.orden || 0) || String(a.codigo || a.titulo).localeCompare(String(b.codigo || b.titulo), "es");
  }

  async function init() {
    if (model.ready) return;
    try {
      msg("modelo-estado", "Comprobando acceso...");
      const isAdmin = await api("/rest/v1/rpc/mi_acceso_administrador", { method: "POST", body: {} });
      if (isAdmin !== true) {
        msg("modelo-estado", "La administración del modelo documental requiere permiso global. Las empresas no tienen acceso a este catálogo.");
        return;
      }
      $("modelo-controles").classList.remove("hidden");
      model.ready = true;
      await refreshDomains();
    } catch (error) {
      msg("modelo-estado", "No fue posible abrir el modelo: " + error.message, true);
    }
  }

  async function refreshDomains() {
    model.domains = await api("/rest/v1/dominios_conocimiento?select=id,titulo,codigo,edicion,estado&order=creado_en.desc&limit=100");
    options("modelo-dominio", model.domains, "Selecciona un dominio", d => d.titulo + (d.edicion ? " · " + d.edicion : ""));
    if (!$("modelo-dominio").value && model.domains.length === 1) $("modelo-dominio").value = model.domains[0].id;
    if (selectedDomain()) await refreshModel();
    else msg("modelo-estado", "Selecciona un dominio de la biblioteca.");
  }

  async function refreshModel() {
    const domain = selectedDomain();
    if (!domain) return;
    msg("modelo-estado", "Cargando conocimiento...");
    const [documents, elements, edges] = await Promise.all([
      api("/rest/v1/documentos_dominio?select=id,dominio_id,nombre_original&dominio_id=eq." + encodeURIComponent(domain) + "&order=cargado_en.desc&limit=100"),
      api("/rest/v1/conocimiento_elementos?select=id,dominio_id,documento_id,pagina,tipo,codigo,titulo,descripcion,estado,origen,orden,revisado_en&dominio_id=eq." + encodeURIComponent(domain) + "&order=orden.asc&limit=500"),
      api("/rest/v1/conocimiento_relaciones?select=id,dominio_id,origen_id,destino_id,tipo,detalle,documento_id,pagina,estado&dominio_id=eq." + encodeURIComponent(domain) + "&limit=1000")
    ]);
    if (domain !== selectedDomain()) return;
    model.documents = documents;
    model.elements = elements;
    model.relations = edges;
    const docDisplay = d => d.nombre_original;
    options("modelo-elemento-documento", documents, "Sin PDF asociado (solo propuesta)", docDisplay);
    options("modelo-relacion-documento", documents, "Sin PDF asociado (solo propuesta)", docDisplay);
    const nodeDisplay = n => displayNode(n);
    options("modelo-relacion-origen", elements, "Selecciona el elemento de origen", nodeDisplay);
    options("modelo-relacion-destino", elements, "Selecciona el elemento de destino", nodeDisplay);
    options("modelo-elemento-id", elements, "+ Nuevo elemento", nodeDisplay);
    options("modelo-relacion-id", edges, "+ Nueva relación", edge => {
      const first = elements.find(n => n.id === edge.origen_id);
      const last = elements.find(n => n.id === edge.destino_id);
      return (first?.codigo || first?.titulo || "?") + " → " + edge.tipo + " → " + (last?.codigo || last?.titulo || "?");
    });
    const parentNodes = elements.filter(n => ["proceso", "actividad"].includes(n.tipo) && n.estado !== "descartado");
    options("modelo-diagrama-raiz", parentNodes, "Selecciona un proceso o actividad", nodeDisplay);
    const rootSelect = $("modelo-diagrama-raiz");
    if (!rootSelect.value && parentNodes.length) rootSelect.value = parentNodes.find(n => n.tipo === "proceso")?.id || parentNodes[0].id;
    renderDirectory();
    renderDiagram();
    msg("modelo-estado", elements.length + " elementos y " + edges.length +
      " relaciones registrados. La aprobación de la estructura no equivale a certificación ni cumplimiento.");
  }

  function resetElement() {
    $("modelo-elemento-form").reset();
    $("modelo-elemento-id").value = "";
    $("modelo-elemento-documento").value = "";
    $("modelo-elemento-estado").value = "propuesto";
    msg("modelo-elemento-estado-mensaje", "Nuevo elemento: se guardará como propuesta.");
  }

  function resetRelation() {
    $("modelo-relacion-form").reset();
    $("modelo-relacion-id").value = "";
    $("modelo-relacion-documento").value = "";
    $("modelo-relacion-estado").value = "propuesto";
    msg("modelo-relacion-estado-mensaje", "Nueva relación: se guardará como propuesta.");
  }

  function editElement(id) {
    const n = model.elements.find(x => x.id === id);
    if (!n) return;
    $("modelo-elemento-id").value = n.id;
    $("modelo-elemento-tipo").value = n.tipo;
    $("modelo-elemento-codigo").value = n.codigo || "";
    $("modelo-elemento-titulo").value = n.titulo;
    $("modelo-elemento-descripcion").value = n.descripcion || "";
    $("modelo-elemento-documento").value = n.documento_id || "";
    $("modelo-elemento-pagina").value = n.pagina || "";
    $("modelo-elemento-orden").value = n.orden || 0;
    $("modelo-elemento-estado").value = n.estado;
    msg("modelo-elemento-estado-mensaje", "Editando " + displayNode(n) + ". Para cambiar un elemento aprobado, primero regresa su estado a Propuesto.");
    $("modelo-elemento-form").scrollIntoView({behavior:"smooth",block:"start"});
  }

  function editRelation(id) {
    const r = model.relations.find(x => x.id === id);
    if (!r) return;
    $("modelo-relacion-id").value = r.id;
    $("modelo-relacion-origen").value = r.origen_id;
    $("modelo-relacion-destino").value = r.destino_id;
    $("modelo-relacion-tipo").value = r.tipo;
    $("modelo-relacion-detalle").value = r.detalle || "";
    $("modelo-relacion-documento").value = r.documento_id || "";
    $("modelo-relacion-pagina").value = r.pagina || "";
    $("modelo-relacion-estado").value = r.estado;
    msg("modelo-relacion-estado-mensaje", "Editando relación. Si está aprobada, vuelve a Propuesto antes de modificar sus datos.");
    $("modelo-relacion-form").scrollIntoView({behavior:"smooth",block:"start"});
  }

  function renderDirectory() {
    const elemTarget = $("modelo-elementos-lista");
    elemTarget.replaceChildren();
    if (!model.elements.length) elemTarget.append(el("p", "Todavía no existen elementos para este dominio."));
    model.elements.slice().sort((a,b)=>a.tipo.localeCompare(b.tipo)||sortNodes(a,b)).forEach(n => {
      const row = el("div", null, "modelo-directorio-fila");
      const desc = el("div", null, "modelo-directorio-descripcion");
      desc.append(el("strong", displayNode(n)), el("small", n.estado + " · " + sourceLabel(n)));
      const action=el("button","Editar","outline");
      action.type="button";
      action.addEventListener("click",()=>editElement(n.id));
      row.append(desc,action);
      elemTarget.append(row);
    });
    const relTarget=$("modelo-relaciones-lista");
    relTarget.replaceChildren();
    if (!model.relations.length) relTarget.append(el("p","Sin relaciones registradas."));
    model.relations.forEach(r=>{
      const origin=model.elements.find(n=>n.id===r.origen_id);
      const dest=model.elements.find(n=>n.id===r.destino_id);
      const row=el("div",null,"modelo-directorio-fila");
      const desc=el("div",null,"modelo-directorio-descripcion");
      desc.append(el("strong",(origin?.codigo||origin?.titulo||"?")+" → "+r.tipo+" → "+(dest?.codigo||dest?.titulo||"?")),
        el("small",r.estado+" · "+sourceLabel(r)));
      const action=el("button","Editar","outline");
      action.type="button";
      action.addEventListener("click",()=>editRelation(r.id));
      row.append(desc,action);
      relTarget.append(row);
    });
  }

  async function saveElement(evt) {
    evt.preventDefault();
    const domain=selectedDomain();
    const id=$("modelo-elemento-id").value;
    const doc=$("modelo-elemento-documento").value || null;
    const pageRaw=$("modelo-elemento-pagina").value;
    const page=pageRaw === "" ? null : Number(pageRaw);
    const estado=$("modelo-elemento-estado").value;
    const payload={
      tipo:$("modelo-elemento-tipo").value,
      codigo:$("modelo-elemento-codigo").value.trim() || null,
      titulo:$("modelo-elemento-titulo").value.trim(),
      descripcion:$("modelo-elemento-descripcion").value.trim() || null,
      documento_id:doc,pagina:page,
      orden:Number($("modelo-elemento-orden").value || 0)
    };
    if (!domain || (doc && !page) || (!doc && page) || (estado === "aprobado" && !doc) ||
        (!id && estado !== "propuesto")) {
      msg("modelo-elemento-estado-mensaje","Comprueba el dominio, la página y la revisión. Un registro nuevo comienza como propuesta; para aprobarlo debe estar asociado a un PDF y página.",true);
      return;
    }
    const button=$("modelo-elemento-guardar");
    button.disabled=true;
    try {
      const body=id?{...payload,estado}:{...payload,dominio_id:domain};
      const path="/rest/v1/conocimiento_elementos"+(id?"?id=eq."+encodeURIComponent(id):"");
      const result=await api(path,{method:id?"PATCH":"POST",body});
      if (!Array.isArray(result) || result.length !== 1) throw new Error("El servidor no confirmó el cambio.");
      const after=id?"actualizado":"creado";
      await refreshModel();
      resetElement();
      msg("modelo-elemento-estado-mensaje","Elemento "+after+" correctamente. Su estado queda sujeto a revisión.");
    } catch(error) {
      msg("modelo-elemento-estado-mensaje","No fue posible guardar: "+error.message,true);
    } finally {button.disabled=false;}
  }

  async function saveRelation(evt) {
    evt.preventDefault();
    const domain=selectedDomain(),id=$("modelo-relacion-id").value;
    const origin=$("modelo-relacion-origen").value,dest=$("modelo-relacion-destino").value;
    const tipo=$("modelo-relacion-tipo").value;
    const doc=$("modelo-relacion-documento").value||null;
    const rawPage=$("modelo-relacion-pagina").value;
    const page=rawPage===""?null:Number(rawPage);
    const estado=$("modelo-relacion-estado").value;
    if (!domain||!origin||!dest||origin===dest||
        (doc&&!page)||(!doc&&page)||(estado==="aprobado"&&!doc)||
        (!id&&estado!=="propuesto")) {
      msg("modelo-relacion-estado-mensaje","Selecciona dos elementos distintos del mismo dominio y registra una referencia documental al aprobar. La relación nueva comienza como propuesta.",true);
      return;
    }
    const button=$("modelo-relacion-guardar");button.disabled=true;
    try {
      const payload={
        origen_id:origin,destino_id:dest,tipo,
        detalle:$("modelo-relacion-detalle").value.trim()||null,
        documento_id:doc,pagina:page
      };
      const body=id?{...payload,estado}:{...payload,dominio_id:domain};
      const result=await api("/rest/v1/conocimiento_relaciones"+(id?"?id=eq."+encodeURIComponent(id):""),{
        method:id?"PATCH":"POST",body
      });
      if (!Array.isArray(result)||result.length!==1) throw new Error("El servidor no confirmó la relación.");
      await refreshModel();
      resetRelation();
      msg("modelo-relacion-estado-mensaje","Relación guardada correctamente. Verifica su fuente antes de aprobarla.");
    }catch(error){
      msg("modelo-relacion-estado-mensaje","No fue posible guardar: "+error.message,true);
    }finally{button.disabled=false;}
  }

  function diagramCard(item,additional) {
    const card=el("div",null,"modelo-diagrama-nodo modelo-"+item.tipo);
    card.append(el("strong",(item.codigo?item.codigo+" · ":"")+item.titulo));
    if (additional) card.append(el("span",additional,"modelo-nodo-etiqueta"));
    card.append(el("small",item.estado+" · "+(item.pagina?"PDF pág. "+item.pagina:"sin fuente verificada")));
    return card;
  }
  function renderDiagram() {
    const target=$("modelo-diagrama"),rootId=$("modelo-diagrama-raiz").value;
    target.replaceChildren();
    if(!rootId) {target.append(el("p","Selecciona un proceso o actividad."));return;}
    const included=model.elements.filter(n=>n.estado!=="descartado");
    const valid=new Set(included.map(n=>n.id));
    const links=model.relations.filter(r=>r.estado!=="descartado"&&valid.has(r.origen_id)&&valid.has(r.destino_id));
    const byId=new Map(included.map(n=>[n.id,n]));
    const children=(id,tipo)=>links.filter(r=>r.origen_id===id&&r.tipo==="contiene")
      .map(r=>byId.get(r.destino_id)).filter(x=>x&&(!tipo||x.tipo===tipo)).sort(sortNodes);
    const rootNode=byId.get(rootId);
    if(!rootNode){target.append(el("p","El elemento no está disponible."));return;}
    const activities=rootNode.tipo==="proceso"?children(rootId,"actividad"):[rootNode];
    const diagram=el("div",null,"modelo-diagrama-plano");
    const header=el("div",null,"modelo-diagrama-cabecera");
    header.append(el("h3",(rootNode.codigo?rootNode.codigo+" · ":"")+rootNode.titulo),
      el("p","Representación de los elementos y relaciones registrados. No es un dictamen de cumplimiento."));
    diagram.append(header);
    const legend=el("div",null,"modelo-diagrama-leyenda");
    ["ROLES","TAREAS Y FLUJO","PRODUCTOS Y COMPONENTES"].forEach(l=>legend.append(el("strong",l)));
    diagram.append(legend);
    let totalTasks=0;
    for(const activity of activities) {
      const group=el("section",null,"modelo-actividad-grupo");
      const atitle=el("h4",(activity.codigo?activity.codigo+" · ":"")+activity.titulo);
      group.append(atitle);
      const tasks=children(activity.id,"tarea");
      for(const task of tasks) {
        totalTasks++;
        const row=el("div",null,"modelo-diagrama-fila");
        const left=el("div",null,"modelo-diagrama-roles");
        const mid=el("div",null,"modelo-diagrama-tarea");
        const right=el("div",null,"modelo-diagrama-productos");
        const roleEdges=links.filter(r=>(r.tipo==="participa"||r.tipo==="ejecuta") &&
           ((r.destino_id===task.id&&byId.get(r.origen_id)?.tipo==="rol") ||
            (r.origen_id===task.id&&byId.get(r.destino_id)?.tipo==="rol")));
        const roles=roleEdges.map(r=>{
          const n=byId.get(r.origen_id===task.id?r.destino_id:r.origen_id);
          return {n,r};
        });
        roles.forEach(({n,r})=>left.append(diagramCard(n,relations[r.tipo])));
        if(!roles.length)left.append(el("span","Sin rol vinculado","modelo-vacio"));
        mid.append(diagramCard(task,"Tarea"));
        const outputs=links.filter(r=>r.origen_id===task.id &&
          ["utiliza","genera","actualiza","verifica"].includes(r.tipo) &&
          byId.get(r.destino_id)?.tipo==="producto");
        outputs.forEach(r=>{
          const prod=byId.get(r.destino_id);
          const productCard=diagramCard(prod,relations[r.tipo]);
          const components=children(prod.id,"componente");
          if(components.length){
            const wrap=el("div",null,"modelo-componentes");
            components.forEach(c=>wrap.append(el("span",c.titulo,"modelo-componente")));
            productCard.append(wrap);
          }
          right.append(productCard);
        });
        if(!outputs.length)right.append(el("span","Sin producto vinculado","modelo-vacio"));
        row.append(left,mid,right);group.append(row);
      }
      if(!tasks.length)group.append(el("p","Actividad sin tareas asociadas."));
      diagram.append(group);
    }
    if(!activities.length)diagram.append(el("p","Este proceso todavía no tiene actividades vinculadas."));
    const review=el("p","Vista de trabajo: "+totalTasks+" tarea(s), "+links.length+" relación(es) vigentes. Fuente del ejemplo: ISO/IEC TR 29110-5-1-2:2011; comprobar las referencias antes de aprobar.","modelo-diagrama-pie");
    diagram.append(review);
    target.append(diagram);
  }

  $("modelo-dominio").addEventListener("change",async()=>{
    resetElement();resetRelation();
    try{await refreshModel();}catch(e){msg("modelo-estado","Error consultando el dominio: "+e.message,true);}
  });
  $("modelo-diagrama-raiz").addEventListener("change",renderDiagram);
  $("modelo-elemento-id").addEventListener("change",function(){if(this.value)editElement(this.value);else resetElement();});
  $("modelo-relacion-id").addEventListener("change",function(){if(this.value)editRelation(this.value);else resetRelation();});
  $("modelo-elemento-form").addEventListener("submit",saveElement);
  $("modelo-relacion-form").addEventListener("submit",saveRelation);
  $("modelo-elemento-limpiar").addEventListener("click",resetElement);
  $("modelo-relacion-limpiar").addEventListener("click",resetRelation);
  $("modelo-recargar").addEventListener("click",async()=>{try{await refreshModel();}catch(e){msg("modelo-estado",e.message,true);}});
  document.querySelector('[data-view="modelo"]')?.addEventListener("click",init);
})();
