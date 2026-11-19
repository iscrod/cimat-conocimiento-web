/* CIMAT 0.8.6 — Banco de preguntas genéricas.
 * El cuestionario NO depende de normas, ocupaciones ni sectores.
 * No almacena entrevistas ni respuestas personales.
 * La autorización se comprueba también mediante RLS en PostgreSQL.
 */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const cfg = window.CIMAT_CONFIG || {};
  const root = String(cfg.SUPABASE_URL || "").replace(/\/+$/, "");
  const publicKey = String(cfg.SUPABASE_PUBLISHABLE_KEY || "");
  const dimensions = [
    ["contexto", "Contexto laboral"],
    ["actividades", "Actividades habituales"],
    ["seleccion", "Selección de actividad"],
    ["caso", "Episodio concreto"],
    ["inicio", "Inicio y desencadenantes"],
    ["secuencia", "Secuencia y ejecución"],
    ["recursos", "Recursos e información"],
    ["participantes", "Personas y coordinación"],
    ["decisiones", "Decisiones y criterios"],
    ["excepciones", "Variaciones y excepciones"],
    ["experiencia", "Conocimiento experiencial"],
    ["validacion", "Verificación con entrevistado"],
    ["otro", "Otra dimensión"]
  ];
  let loaded = false;
  let loading = false;
  let banks = [];
  let selected = null;
  let working = [];
  let dirty = false;
  let editedQuestion = null;

  function session() {
    let s = null;
    try { s = JSON.parse(sessionStorage.getItem("cimat_v012_sesion") || "null"); } catch (_) {}
    if (!s || !s.access_token || !s.user?.id || Date.now() >= s.expires_at)
      throw new Error("Inicia sesión nuevamente para gestionar cuestionarios.");
    return s;
  }
  async function request(path, method = "GET", body) {
    const token = session().access_token;
    const response = await fetch(root + path, {
      method, cache: "no-store",
      headers: {
        apikey: publicKey,
        Authorization: "Bearer " + token,
        Accept: "application/json",
        ...(body === undefined ? {} : {"Content-Type": "application/json", Prefer: "return=representation"})
      },
      ...(body === undefined ? {} : {body: JSON.stringify(body)})
    });
    const raw = await response.text();
    let data = raw;
    try { data = raw ? JSON.parse(raw) : []; } catch (_) {}
    if (!response.ok) {
      const reason = data?.message || data?.details || data?.hint || "Operación rechazada";
      throw new Error("HTTP " + response.status + ": " + reason);
    }
    return data;
  }
  const copy = obj => JSON.parse(JSON.stringify(obj));
  const option = (value, label) => {
    const el = document.createElement("option");
    el.value = value; el.textContent = label;
    return el;
  };
  function message(text, error = false) {
    const el = $("c086-status");
    el.textContent = text;
    el.classList.toggle("error", error);
  }
  function uuid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    throw new Error("El navegador no dispone de un generador seguro de identificadores.");
  }
  function canEdit() { return !selected || selected.estado === "borrador"; }
  function setDirty() {
    dirty = true;
    $("c086-unsaved").textContent = "Cambios sin guardar";
  }
  function markSaved() {
    dirty = false;
    $("c086-unsaved").textContent = "Sin cambios pendientes";
  }
  function isLeavingAllowed() {
    return !dirty || window.confirm("Hay cambios sin guardar. ¿Deseas descartarlos?");
  }
  function countEnabled() { return working.filter(q => q.habilitada).length; }
  function refreshActions() {
    const editable = canEdit();
    $("c086-bank-name").disabled = !editable;
    $("c086-save").disabled = !editable;
    $("c086-publish").disabled = !selected?.id || !editable || !working.length;
    $("c086-new-version").disabled = !selected?.id;
    for (const el of $("c086-form").elements) el.disabled = !editable;
    $("c086-new-question").disabled = !editable;
    $("c086-count").textContent = working.length + " preguntas, " + countEnabled() + " habilitadas";
    $("c086-current-version").textContent = selected
      ? "Versión " + selected.version + " · " + (selected.estado === "publicado" ? "Publicada, inmutable" : "Borrador")
      : "Nuevo cuestionario · Versión 1";
  }
  function renderBankSelect() {
    const select = $("c086-bank-select");
    const id = selected?.id || "";
    select.replaceChildren(option("", "+ Crear cuestionario nuevo"));
    banks.sort((a,b) => a.titulo.localeCompare(b.titulo, "es") ||
      b.version - a.version).forEach(b => select.append(
      option(b.id, b.titulo + " · v" + b.version +
        (b.estado === "publicado" ? " [publicado]" : " [borrador]"))));
    select.value = id;
  }
  function choose(record) {
    selected = record || null;
    working = copy(record?.preguntas || []);
    working.sort((a,b) => a.orden - b.orden);
    editedQuestion = null;
    $("c086-bank-name").value = record?.titulo || "";
    $("c086-question-id").value = "";
    clearQuestion();
    markSaved();
    renderBankSelect();
    renderQuestions();
    refreshActions();
    message(record?.estado === "publicado"
      ? "Esta versión no puede modificarse. Crea una versión nueva para continuar."
      : "Puedes editar las preguntas y guardar el cuestionario.");
  }
  function clearQuestion() {
    editedQuestion = null;
    $("c086-form").reset();
    $("c086-question-id").value = "";
    $("c086-dimension").value = "contexto";
    $("c086-priority").value = "principal";
    $("c086-enabled").checked = true;
    $("c086-question-submit").textContent = "Agregar pregunta";
  }
  function renderQuestions() {
    const target = $("c086-questions");
    target.replaceChildren();
    for (let i=0;i<working.length;i++) {
      const q = working[i];
      const section = document.createElement("article");
      section.className = "c086-question" + (q.habilitada ? "" : " c086-disabled");
      const top = document.createElement("div");
      top.className = "c086-question-title";
      const strong = document.createElement("strong");
      strong.textContent = (i+1) + ". " + q.pregunta;
      const pill = document.createElement("span");
      pill.textContent = q.habilitada ? "Habilitada" : "Deshabilitada";
      pill.className = "c086-state";
      top.append(strong, pill);
      const meta = document.createElement("p");
      const dimension = dimensions.find(d=>d[0] === q.dimension)?.[1] || q.dimension;
      meta.className = "subtle";
      meta.textContent = dimension + " · " +
        (q.prioridad === "principal" ? "Principal" : "Complementaria") +
        (q.sondeos?.length ? " · " + q.sondeos.length + " posible(s) sondeo(s)" : "");
      const controls = document.createElement("div");
      controls.className = "c086-question-actions";
      if (canEdit()) {
        [["edit", "Editar"], ["toggle", q.habilitada ? "Deshabilitar" : "Habilitar"],
         ["up", "↑ Subir"], ["down", "↓ Bajar"], ["remove", "Quitar"]]
          .forEach(([action, label]) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "outline";
            button.dataset.action = action;
            button.dataset.id = q.id;
            button.textContent = label;
            if (action === "up" && i===0 || action === "down" && i===working.length-1)
              button.disabled = true;
            controls.append(button);
          });
      }
      section.append(top, meta, controls);
      target.append(section);
    }
    if (!working.length) {
      const p = document.createElement("p");
      p.className = "subtle";
      p.textContent = "No hay preguntas. Utiliza el formulario para agregar la primera.";
      target.append(p);
    }
    refreshActions();
  }
  function normalizeOrder() {
    working.forEach((q,i) => { q.orden = i + 1; });
  }
  function editQuestion(q) {
    editedQuestion = q.id;
    $("c086-question-id").value = q.id;
    $("c086-dimension").value = q.dimension;
    $("c086-priority").value = q.prioridad;
    $("c086-question-text").value = q.pregunta;
    $("c086-objective").value = q.objetivo || "";
    $("c086-probes").value = (q.sondeos || []).join("\n");
    $("c086-enabled").checked = !!q.habilitada;
    $("c086-question-submit").textContent = "Actualizar pregunta";
    $("c086-form").scrollIntoView({behavior:"smooth",block:"start"});
  }
  function handleQuestionAction(event) {
    const btn = event.target.closest("button[data-action][data-id]");
    if (!btn || !canEdit()) return;
    const index = working.findIndex(q => q.id === btn.dataset.id);
    if (index < 0) return;
    const q = working[index];
    switch (btn.dataset.action) {
      case "edit": editQuestion(q); return;
      case "toggle": q.habilitada = !q.habilitada; break;
      case "up":
        if (index > 0) [working[index-1],working[index]]=[working[index],working[index-1]];
        break;
      case "down":
        if (index < working.length-1)
          [working[index+1],working[index]]=[working[index],working[index+1]];
        break;
      case "remove":
        if (!window.confirm("¿Quitar esta pregunta del borrador?")) return;
        working.splice(index,1);
        if (editedQuestion===q.id) clearQuestion();
        break;
    }
    normalizeOrder();
    setDirty();
    renderQuestions();
  }
  function questionPayload() {
    const probes = $("c086-probes").value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
    const payload = {
      id: editedQuestion || uuid(),
      orden: editedQuestion ? 0 : working.length+1,
      dimension: $("c086-dimension").value,
      prioridad: $("c086-priority").value,
      pregunta: $("c086-question-text").value.trim(),
      objetivo: $("c086-objective").value.trim(),
      sondeos: probes,
      habilitada: $("c086-enabled").checked
    };
    if (payload.pregunta.length < 10 || payload.pregunta.length > 700)
      throw new Error("La pregunta debe contener entre 10 y 700 caracteres.");
    if (payload.objetivo.length > 350 || probes.length > 8 ||
        probes.some(v=>v.length > 450))
      throw new Error("Máximo 350 caracteres de objetivo y 8 sondeos de 450 caracteres.");
    if (!dimensions.some(d=>d[0]===payload.dimension))
      throw new Error("Dimensión no válida.");
    return payload;
  }
  async function loadBanks(preserveId = "") {
    banks = await request("/rest/v1/cimat_086_cuestionarios?select=id,titulo,version,estado,preguntas,creado_por,creado_en,actualizado_en,origen_id&order=titulo.asc,version.desc&limit=200");
    if (!Array.isArray(banks)) throw new Error("Respuesta inesperada del banco de preguntas.");
    choose(banks.find(b=>b.id===preserveId) || banks[0] || null);
  }
  async function save() {
    const titulo = $("c086-bank-name").value.trim();
    if (!canEdit()) throw new Error("Una versión publicada no puede editarse.");
    if (titulo.length < 3 || titulo.length > 180)
      throw new Error("El título debe tener entre 3 y 180 caracteres.");
    if (!working.length) throw new Error("Agrega al menos una pregunta.");
    if (!countEnabled()) throw new Error("Habilita al menos una pregunta.");
    normalizeOrder();
    const body = {titulo, preguntas:working};
    let rows;
    if (selected) {
      const filter = "?id=eq." + encodeURIComponent(selected.id) +
        "&actualizado_en=eq." + encodeURIComponent(selected.actualizado_en) +
        "&select=id,titulo,version,estado,preguntas,creado_por,creado_en,actualizado_en,origen_id";
      rows = await request("/rest/v1/cimat_086_cuestionarios" + filter, "PATCH", body);
      if (!Array.isArray(rows) || rows.length !== 1)
        throw new Error("El registro fue modificado desde otra sesión. Recarga antes de editar.");
    } else {
      rows = await request("/rest/v1/cimat_086_cuestionarios?select=id,titulo,version,estado,preguntas,creado_por,creado_en,actualizado_en,origen_id",
        "POST", {...body,version:1,estado:"borrador"});
      if (!Array.isArray(rows) || rows.length !== 1)
        throw new Error("El servidor no confirmó la creación.");
    }
    await loadBanks(rows[0].id);
    message("Cuestionario guardado correctamente.");
  }
  async function cloneVersion() {
    if (!selected) throw new Error("Selecciona una versión para duplicar.");
    if (dirty) throw new Error("Guarda o descarta los cambios antes de crear otra versión.");
    const version = Math.max(0,...banks.filter(b=>b.titulo===selected.titulo).map(b=>b.version)) + 1;
    const rows = await request("/rest/v1/cimat_086_cuestionarios?select=id,titulo,version,estado,preguntas,creado_por,creado_en,actualizado_en,origen_id",
      "POST", {titulo:selected.titulo,version,estado:"borrador",
        preguntas:copy(selected.preguntas),origen_id:selected.id});
    if (!Array.isArray(rows)||rows.length!==1) throw new Error("No se pudo registrar la nueva versión.");
    await loadBanks(rows[0].id);
    message("Versión " + version + " creada como borrador. El original permanece intacto.");
  }
  async function publish() {
    if (!selected || selected.estado !== "borrador")
      throw new Error("Solo se pueden publicar borradores previamente guardados.");
    if (dirty) throw new Error("Guarda primero los cambios pendientes.");
    if (!countEnabled()) throw new Error("Habilita al menos una pregunta antes de publicar.");
    if (!window.confirm("¿Publicar la versión " + selected.version + "? Después no podrás editarla.")) return;
    const rows = await request("/rest/v1/cimat_086_cuestionarios?id=eq." +
      encodeURIComponent(selected.id) + "&actualizado_en=eq." +
      encodeURIComponent(selected.actualizado_en) + "&select=id",
      "PATCH", {estado:"publicado"});
    if (!Array.isArray(rows)||rows.length!==1)
      throw new Error("La versión cambió desde otra sesión. Recarga antes de publicar.");
    await loadBanks(selected.id);
    message("Versión publicada e inmutable. Utiliza «Crear nueva versión» para cambios posteriores.");
  }
  async function guarded(action, button) {
    if (loading) return;
    loading = true;
    const old = button?.disabled;
    if (button) button.disabled = true;
    try { await action(); }
    catch (err) { message(err.message || String(err), true); }
    finally { loading = false; if (button) button.disabled = old; refreshActions(); }
  }
  async function init() {
    if (loaded) return;
    message("Comprobando permisos...");
    try {
      const isAdmin = await request("/rest/v1/rpc/mi_acceso_administrador","POST",{});
      if (isAdmin !== true) {
        message("La configuración del instrumento está reservada al administrador global.");
        $("c086-controls").classList.add("hidden");
        return;
      }
      await loadBanks();
      $("c086-controls").classList.remove("hidden");
      loaded = true;
      message("Banco de preguntas disponible. No depende de una norma o estándar.");
    } catch(err) { message("No se pudo cargar el banco: " + err.message, true); }
  }

  function bind() {
    const dimensionSelect = $("c086-dimension");
    dimensions.forEach(d=>dimensionSelect.append(option(d[0],d[1])));
    $("c086-bank-select").addEventListener("change",function(){
      if (!isLeavingAllowed()) { this.value=selected?.id||""; return; }
      choose(banks.find(b=>b.id===this.value)||null);
    });
    $("c086-bank-name").addEventListener("input", setDirty);
    $("c086-new").addEventListener("click",()=>{
      if (isLeavingAllowed()) choose(null);
    });
    $("c086-new-question").addEventListener("click",clearQuestion);
    $("c086-questions").addEventListener("click",handleQuestionAction);
    $("c086-form").addEventListener("submit",function(e){
      e.preventDefault();
      if (!canEdit()) return;
      try {
        const q=questionPayload();
        const index=working.findIndex(item=>item.id===q.id);
        if(index>=0) {q.orden=working[index].orden;working[index]=q;}
        else working.push(q);
        normalizeOrder();clearQuestion();setDirty();renderQuestions();
        message("Pregunta incorporada al borrador. Guarda el cuestionario para conservarla.");
      } catch(err){message(err.message,true);}
    });
    $("c086-save").addEventListener("click",e=>guarded(save,e.currentTarget));
    $("c086-publish").addEventListener("click",e=>guarded(publish,e.currentTarget));
    $("c086-new-version").addEventListener("click",e=>guarded(cloneVersion,e.currentTarget));
    $("c086-reload").addEventListener("click",e=>guarded(async()=>{
      if (!isLeavingAllowed()) return;
      await loadBanks(selected?.id||"");
      message("Datos actualizados desde Supabase.");
    },e.currentTarget));
    document.querySelector('[data-view="cuestionario"]')?.addEventListener("click",init);
  }
  if ($("c086-controls")) bind();
})();