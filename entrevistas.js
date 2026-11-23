/* CIMAT 0.8.7 — Entrevistas genericas con consentimiento y respuestas privadas.
 * Captura de texto original, sin IA. Las normas no intervienen en la entrevista.
 * Las políticas PostgreSQL RLS son el límite de autorización real.
 */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const cfg = window.CIMAT_CONFIG || {};
  const root = String(cfg.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(cfg.SUPABASE_PUBLISHABLE_KEY || "");
  const storageKey = "cimat_v012_sesion";
  const CONSENT_VERSION = "cimat-0.8.7-1";
  let owner = "";
  let banks = [];
  let interviews = [];
  let active = null;
  let answers = new Map();
  let index = 0;
  let unsaved = false;
  let busy = false;

  function session() {
    let s = null;
    try { s = JSON.parse(sessionStorage.getItem(storageKey) || "null"); }
    catch (_) {}
    if (!s?.user?.id || !s.access_token || Date.now() >= s.expires_at)
      throw new Error("La sesión ha caducado. Ingresa nuevamente.");
    return s;
  }
  async function api(path, method = "GET", body, prefer = "") {
    const user = session();
    const response = await fetch(root + path, {
      method, cache: "no-store",
      headers: {
        apikey:key,
        Authorization:"Bearer " + user.access_token,
        Accept:"application/json",
        ...(body === undefined ? {} : {"Content-Type":"application/json"}),
        ...(prefer ? {Prefer:prefer} : {})
      },
      ...(body === undefined ? {} : {body:JSON.stringify(body)})
    });
    const raw = await response.text();
    let data = [];
    try { data = raw ? JSON.parse(raw) : []; }
    catch (_) { data = []; }
    if (!response.ok) {
      const msg = data?.message || data?.details || data?.hint || "Petición no autorizada";
      throw new Error("HTTP " + response.status + ": " + msg);
    }
    // Descartar resultados de otra cuenta si hubo cambio de sesión durante el fetch.
    if (session().user.id !== user.user.id)
      throw new Error("La sesión cambió. Recarga esta sección.");
    return data;
  }
  function option(value, label) {
    const el = document.createElement("option");
    el.value = value;
    el.textContent = label;
    return el;
  }
  function el(tag, value, className) {
    const element = document.createElement(tag);
    if (value != null) element.textContent = value;
    if (className) element.className = className;
    return element;
  }
  function notice(message, error = false) {
    const node = $("c087-status");
    node.textContent = message;
    node.classList.toggle("error",error);
  }
  function activeBank() { return banks.find(b=>b.id===active?.cuestionario_id); }
  function questions(bank) {
    return [...(bank?.preguntas || [])].filter(q=>q.habilitada === true)
      .sort((a,b)=>a.orden-b.orden);
  }
  function isEditable() { return active?.estado === "en_curso"; }
  function dirtyAllowed() {
    return !unsaved || window.confirm("La respuesta actual tiene cambios sin guardar. ¿Deseas descartarlos?");
  }
  function clearActive() {
    active = null;
    answers = new Map();
    index = 0;
    unsaved = false;
    $("c087-answer").value = "";
    $("c087-active").classList.add("hidden");
  }
  function clearPrivateView() {
    owner = "";
    banks = [];
    interviews = [];
    clearActive();
    $("c087-access").classList.add("hidden");
    $("c087-list").replaceChildren();
    $("c087-bank").replaceChildren();
    $("c087-consent").checked = false;
    notice("Abre esta sección para verificar tus permisos.");
  }
  function sessionName(record) {
    const bank = banks.find(b=>b.id===record.cuestionario_id);
    return bank ? bank.titulo + " · v" + bank.version : "Instrumento no disponible";
  }
  function isoDate(value) {
    if (!value) return "—";
    try { return new Date(value).toLocaleString("es-MX",{
      year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"
    }); }
    catch(_) { return "—"; }
  }
  function displayBanks() {
    const target = $("c087-bank"), selected = target.value;
    target.replaceChildren(option("","Selecciona un cuestionario publicado"));
    banks.forEach(b=>target.append(option(b.id,b.titulo+" · v"+b.version+
      " ("+questions(b).length+" preguntas)")));
    if (banks.some(b=>b.id===selected))target.value=selected;
    $("c087-create").disabled = !target.value || !$("c087-consent").checked || busy;
    $("c087-bank-none").classList.toggle("hidden",banks.length!==0);
  }
  function displayList() {
    const list = $("c087-list");
    list.replaceChildren();
    const count = el("p","Tus entrevistas: "+interviews.length,"subtle");
    list.append(count);
    if (!interviews.length) {
      list.append(el("p","Aún no tienes entrevistas. Puedes iniciar una con el cuestionario publicado.","subtle"));
      return;
    }
    for (const record of interviews) {
      const card = el("article",null,"c087-session");
      const heading = el("div",null,"c087-session-heading");
      heading.append(el("strong",sessionName(record)));
      heading.append(el("span",record.estado==="finalizada"?"Finalizada":"En curso","c087-tag"));
      const when = el("p","Creada: "+isoDate(record.creado_en)+
        " · Actualizada: "+isoDate(record.actualizado_en),"subtle");
      const btn = el("button",record.estado==="en_curso"?"Continuar entrevista":"Revisar respuestas");
      btn.type="button";
      btn.className="outline";
      btn.dataset.session=record.id;
      card.append(heading,when,btn);
      list.append(card);
    }
  }
  async function reload() {
    const [published,own] = await Promise.all([
      api("/rest/v1/cimat_086_cuestionarios?select=id,titulo,version,estado,preguntas&estado=eq.publicado&order=titulo.asc,version.desc&limit=200"),
      api("/rest/v1/cimat_087_entrevistas?select=id,cuestionario_id,estado,creado_en,actualizado_en,consentimiento_fecha,finalizado_en&order=actualizado_en.desc&limit=100")
    ]);
    if (!Array.isArray(published)||!Array.isArray(own))
      throw new Error("La base de datos respondió con un formato inesperado.");
    banks = published;
    interviews = own;
    displayBanks();
    displayList();
  }
  async function init() {
    try {
      const id=session().user.id;
      if (owner===id) return;
      clearPrivateView();
      notice("Comprobando permisos y cuestionarios publicados...");
      const allowed=await api("/rest/v1/rpc/cimat_087_puede_entrevistarse","POST",{});
      if (allowed!==true) {
        notice("Se necesita una asignación activa como «Entrevistado» o autorización como administrador global. Solicita al administrador que habilite tu acceso.");
        return;
      }
      await reload();
      owner=id;
      $("c087-access").classList.remove("hidden");
      notice("Puedes realizar entrevistas con preguntas genéricas. Las respuestas solo son visibles para tu cuenta.");
    } catch(err) {
      clearPrivateView();
      notice("No fue posible iniciar el módulo: "+err.message,true);
    }
  }
  function currentQuestions() { return questions(activeBank()); }
  function progressText() {
    const qs=currentQuestions();
    let count=0;
    for (const q of qs) if(answers.has(q.id))count++;
    return count+" de "+qs.length+" preguntas registradas (respondidas u omitidas)";
  }
  function showQuestion() {
    const bank=activeBank(),qs=currentQuestions(),q=qs[index];
    if (!active || !bank || !q) {
      notice("No se encontró la pregunta correspondiente a esta entrevista.",true);
      return;
    }
    const saved=answers.get(q.id);
    $("c087-active-title").textContent="Entrevista · "+bank.titulo+" (v"+bank.version+")";
    $("c087-active-state").textContent=active.estado==="finalizada" ?
      "Entrevista finalizada · solo lectura" : "Entrevista en curso · puedes guardar y continuar después";
    $("c087-index").textContent="Pregunta "+(index+1)+" de "+qs.length;
    $("c087-question").textContent=q.pregunta;
    $("c087-answer").value=saved?.estado==="respondida" ? saved.respuesta : "";
    $("c087-answer").readOnly=!isEditable();
    $("c087-answer").disabled=saved?.estado==="omitida" || !isEditable();
    $("c087-answer").maxLength=10000;
    $("c087-record-state").textContent=saved
      ? saved.estado==="respondida" ? "Respuesta guardada" : "Pregunta omitida"
      : "Sin respuesta registrada";
    $("c087-progress").textContent=progressText();
    $("c087-prev").disabled=index<=0;
    $("c087-next").disabled=index>=qs.length-1;
    $("c087-save").classList.toggle("hidden",!isEditable());
    $("c087-omit").classList.toggle("hidden",!isEditable());
    $("c087-finish").classList.toggle("hidden",!isEditable());
    $("c087-finish").disabled=answers.size!==qs.length || unsaved;
    $("c087-save").textContent=index===qs.length-1?"Guardar respuesta":"Guardar y continuar";
    $("c087-omit").textContent=saved?.estado==="omitida"?"Mantener omisión":"Omitir esta pregunta";
    $("c087-active").classList.remove("hidden");
    unsaved=false;
    $("c087-dirty").textContent="";
  }
  function markDirty() {
    if (!isEditable())return;
    // Al escribir sobre una pregunta omitida, la omisión debe sustituirse al guardar.
    unsaved=true;
    $("c087-dirty").textContent="Cambios sin guardar";
    $("c087-finish").disabled=true;
  }
  function setIndex(next) {
    const qs=currentQuestions();
    if (next<0 || next>=qs.length || !dirtyAllowed())return;
    index=next;showQuestion();
  }
  async function openInterview(id) {
    if (!dirtyAllowed())return;
    const row=interviews.find(s=>s.id===id);
    if (!row) throw new Error("La entrevista no está disponible.");
    const bank=banks.find(b=>b.id===row.cuestionario_id);
    if (!bank)throw new Error("No se encontró el instrumento publicado de esta sesión.");
    const records=await api("/rest/v1/cimat_087_respuestas?select=pregunta_id,estado,respuesta,actualizado_en&entrevista_id=eq."+
      encodeURIComponent(id)+"&order=pregunta_id.asc");
    if (!Array.isArray(records))throw new Error("No se pudieron consultar las respuestas.");
    active=row;
    answers=new Map(records.map(a=>[a.pregunta_id,a]));
    const qs=currentQuestions();
    const first=qs.findIndex(q=>!answers.has(q.id));
    index=first<0 ? 0:first;
    showQuestion();
    $("c087-active").scrollIntoView({behavior:"smooth",block:"start"});
  }
  async function saveCurrent(status) {
    if (!active || !isEditable())throw new Error("Esta entrevista no permite guardar nuevas respuestas.");
    const q=currentQuestions()[index];
    if (!q)throw new Error("No se encontró la pregunta actual.");
    const text=$("c087-answer").value.trim();
    if (status==="respondida" && (!text || text.length>10000))
      throw new Error("Escribe una respuesta de hasta 10 000 caracteres o utiliza «Omitir».");
    const payload={entrevista_id:active.id,pregunta_id:q.id,
      estado:status,respuesta:status==="respondida"?text:null};
    const rows=await api("/rest/v1/cimat_087_respuestas?on_conflict=entrevista_id,pregunta_id&select=entrevista_id,pregunta_id,estado,respuesta,actualizado_en",
      "POST",payload,"resolution=merge-duplicates,return=representation");
    if (!Array.isArray(rows)||rows.length!==1)
      throw new Error("No se confirmó el guardado. Recarga antes de continuar.");
    answers.set(q.id,rows[0]);
    unsaved=false;
    if (index<currentQuestions().length-1)index++;
    showQuestion();
    notice(status==="respondida"?"Respuesta guardada en Supabase.":"Omisión guardada. Puedes continuar.");
  }
  async function start() {
    const bankId=$("c087-bank").value,consent=$("c087-consent").checked;
    if (!consent)throw new Error("Debes confirmar voluntariamente el consentimiento antes de comenzar.");
    if (!banks.some(b=>b.id===bankId))throw new Error("Selecciona un cuestionario publicado.");
    const rows=await api("/rest/v1/cimat_087_entrevistas?select=id,cuestionario_id,estado,creado_en,actualizado_en,consentimiento_fecha,finalizado_en",
      "POST",{cuestionario_id:bankId,consentimiento_confirmado:true,consentimiento_version:CONSENT_VERSION},
      "return=representation");
    if (!Array.isArray(rows)||rows.length!==1)
      throw new Error("La creación no fue confirmada por el servidor.");
    $("c087-consent").checked=false;
    await reload();
    await openInterview(rows[0].id);
    notice("Consentimiento registrado. La entrevista ha comenzado; puedes pausarla cuando quieras.");
  }
  async function finish() {
    if (!active || !isEditable())return;
    if(unsaved)throw new Error("Guarda la respuesta actual antes de finalizar.");
    if(answers.size!==currentQuestions().length)
      throw new Error("Responde u omite todas las preguntas para finalizar.");
    if(!window.confirm("¿Finalizar esta entrevista? Después podrás revisar las respuestas pero ya no editarlas."))return;
    const rows=await api("/rest/v1/cimat_087_entrevistas?id=eq."+
      encodeURIComponent(active.id)+"&select=id,estado,finalizado_en","PATCH",
      {estado:"finalizada"},"return=representation");
    if (!Array.isArray(rows)||rows.length!==1||rows[0].estado!=="finalizada")
      throw new Error("La finalización no fue confirmada.");
    const id=active.id;
    await reload();
    active=interviews.find(e=>e.id===id)||{...active,estado:"finalizada"};
    showQuestion();
    notice("Entrevista finalizada y disponible para consulta privada.");
  }
  async function withdraw() {
    if(!active)return;
    if(!window.confirm("Retirar el consentimiento borrará definitivamente esta sesión y sus respuestas de las tablas activas. ¿Deseas continuar?"))return;
    const id=active.id;
    const rows=await api("/rest/v1/cimat_087_entrevistas?id=eq."+
      encodeURIComponent(id)+"&select=id","DELETE",undefined,"return=representation");
    if (!Array.isArray(rows)||rows.length!==1)
      throw new Error("El servidor no confirmó la eliminación.");
    clearActive();
    await reload();
    notice("Consentimiento retirado. La sesión y sus respuestas fueron eliminadas de las tablas activas.");
  }
  async function execute(action) {
    if (busy)return;
    busy=true;
    const buttons=["c087-create","c087-save","c087-omit","c087-finish","c087-withdraw"];
    buttons.forEach(id=>$(id).disabled=true);
    try{await action();}
    catch(err){notice("No se completó la operación: "+err.message,true);}
    finally{
      busy=false;
      displayBanks();
      if (active)showButtons();
    }
  }
  function showButtons() {
    $("c087-save").disabled=!isEditable();
    $("c087-omit").disabled=!isEditable();
    $("c087-finish").disabled=!isEditable()||answers.size!==currentQuestions().length||unsaved;
    $("c087-withdraw").disabled=false;
  }
  function bind() {
    document.querySelector('[data-view="entrevistas"]')?.addEventListener("click",init);
    $("c087-bank").addEventListener("change",displayBanks);
    $("c087-consent").addEventListener("change",displayBanks);
    $("c087-create").addEventListener("click",()=>execute(start));
    $("c087-list").addEventListener("click",event=>{
      const btn=event.target.closest("button[data-session]");
      if (btn)execute(()=>openInterview(btn.dataset.session));
    });
    $("c087-answer").addEventListener("input",markDirty);
    $("c087-prev").addEventListener("click",()=>setIndex(index-1));
    $("c087-next").addEventListener("click",()=>setIndex(index+1));
    $("c087-save").addEventListener("click",()=>execute(()=>saveCurrent("respondida")));
    $("c087-omit").addEventListener("click",()=>{
      if (unsaved && !window.confirm("¿Deseas omitir esta pregunta y descartar el texto sin guardar?"))return;
      execute(()=>saveCurrent("omitida"));
    });
    $("c087-pause").addEventListener("click",()=>{
      if(!dirtyAllowed())return;
      clearActive();
      notice("Entrevista pausada. Tus respuestas guardadas están disponibles para reanudarla.");
    });
    $("c087-finish").addEventListener("click",()=>execute(finish));
    $("c087-withdraw").addEventListener("click",()=>execute(withdraw));
    $("c087-refresh").addEventListener("click",()=>execute(async()=>{
      if(!dirtyAllowed())return;
      clearActive();
      await reload();
      notice("Entrevistas actualizadas.");
    }));
    $("logout")?.addEventListener("click",clearPrivateView);
    $("login-form")?.addEventListener("submit",clearPrivateView);
  }
  if ($("c087-access"))bind();
})();
