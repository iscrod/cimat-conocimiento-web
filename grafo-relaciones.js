/* CIMAT: visor de relaciones de solo lectura con Cytoscape.js.
 * Las posiciones de los elementos no implican precedencias normativas.
 * El modelo se deriva de las tablas existentes; no realiza escrituras.
 */
(() => {
  "use strict";

  let graphInstance = null;
  const chronological = items => [...items].sort((a, b) =>
    String(a.creado_en || "").localeCompare(String(b.creado_en || "")) ||
    String(a.id || "").localeCompare(String(b.id || "")));
  const name = item => (item.codigo ? item.codigo + " · " :
    item.abreviatura ? item.abreviatura + " · " : "") + item.nombre;
  const display = item => {
    const value = name(item);
    return value.length > 70 ? value.slice(0, 67) + "…" : value;
  };
  const mean = values => values.reduce((a, b) => a + b, 0) / values.length;

  // Ordenación topológica estable: una precedencia siempre se respeta.
  // Cuando dos tareas no tienen dependencia entre sí se conserva su orden de captura.
  function orderByPrecedence(items, relations) {
    const initial = chronological(items);
    const rank = new Map(initial.map((item, index) => [item.id, index]));
    const degree = new Map(initial.map(item => [item.id, 0]));
    const outgoing = new Map(initial.map(item => [item.id, new Set()]));
    for (const rel of relations) {
      if (!degree.has(rel.anterior_id) || !degree.has(rel.siguiente_id) ||
        rel.anterior_id === rel.siguiente_id) continue;
      const followers = outgoing.get(rel.anterior_id);
      if (followers.has(rel.siguiente_id)) continue;
      followers.add(rel.siguiente_id);
      degree.set(rel.siguiente_id, degree.get(rel.siguiente_id) + 1);
    }
    const available = initial.filter(item => degree.get(item.id) === 0);
    const ordered = [];
    while (available.length) {
      available.sort((a, b) => rank.get(a.id) - rank.get(b.id));
      const item = available.shift();
      ordered.push(item);
      for (const id of outgoing.get(item.id)) {
        degree.set(id, degree.get(id) - 1);
        if (degree.get(id) === 0) available.push(initial[rank.get(id)]);
      }
    }
    // Protección ante datos inconsistentes: nunca perder tareas por un ciclo.
    return ordered.length === initial.length ? ordered : initial;
  }

  // Función pura: facilita las pruebas y separa el modelo de su representación.
  function buildGraph(state, processId, options = {}) {
    const process = state.processes.find(p => p.id === processId);
    const activityId = options.activityId || "";
    const tasks = orderByPrecedence(state.tasks.filter(t => t.proceso_id === processId &&
      (!activityId || (activityId === "__sin_actividad__" ? !t.actividad_id : t.actividad_id === activityId))),
    state.sequences);
    const taskIds = new Set(tasks.map(t => t.id));
    const taskY = new Map(tasks.map((t, i) => [t.id, 95 + i * 170]));
    const elements = [];
    const nodes = new Set();
    const edges = new Set();
    const counts = {tasks: tasks.length, roles: 0, activities: 0, products: 0,
      precedences: 0, suggestions: 0, suggestionOverflow: 0};

    const addNode = (id, kind, item, x, y, extra = {}) => {
      if (nodes.has(id)) return;
      nodes.add(id);
      elements.push({group: "nodes", data: {
        id, kind, label: display(item), fullName: name(item),
        description: item.descripcion || item.funcion || "", recordId: item.id, ...extra
      }, position: {x, y}});
    };
    const addEdge = (id, source, target, kind, description, note = "") => {
      if (edges.has(id) || !nodes.has(source) || !nodes.has(target)) return;
      edges.add(id);
      elements.push({group: "edges", data: {id, source, target, kind, description, note}});
    };
    const placeSide = (items, x, minGap) => {
      let lastY = -Infinity;
      for (const item of items.sort((a, b) => a.average - b.average || a.label.localeCompare(b.label, "es"))) {
        item.y = Math.max(item.average, lastY + minGap);
        item.x = x;
        lastY = item.y;
      }
    };

    for (const task of tasks) addNode("task:" + task.id, "tarea", task, 0, taskY.get(task.id));

    if (options.activities) {
      const relevant = chronological(state.activities.filter(a => a.proceso_id === processId &&
        (!activityId || (activityId !== "__sin_actividad__" && a.id === activityId))));
      const positioned = relevant.map(a => {
        const positions = tasks.filter(t => t.actividad_id === a.id).map(t => taskY.get(t.id));
        return {item: a, average: positions.length ? mean(positions) : 95, label: name(a)};
      });
      placeSide(positioned, -900, 100);
      for (const {item: a, x, y} of positioned) {
        addNode("activity:" + a.id, "actividad", a, x, y);
        counts.activities++;
      }
      for (const task of tasks) {
        if (task.actividad_id) addEdge("activity-task:" + task.id,
          "activity:" + task.actividad_id, "task:" + task.id,
          "pertenencia", "La tarea pertenece a esta actividad.");
      }
      for (const rel of state.activitySequences) {
        addEdge("activity-precedence:" + rel.anterior_id + ":" + rel.siguiente_id,
          "activity:" + rel.anterior_id, "activity:" + rel.siguiente_id,
          "precedencia", "Precedencia declarada entre actividades.", rel.nota || "");
      }
    }

    if (options.roles) {
      const links = state.taskRoles.filter(r => taskIds.has(r.tarea_id));
      const roleIds = [...new Set(links.map(r => r.rol_id))];
      const positioned = roleIds.map(id => {
        const role = state.catalog.find(r => r.id === id);
        if (!role) return null;
        const positions = links.filter(r => r.rol_id === id).map(r => taskY.get(r.tarea_id));
        return {item: role, average: mean(positions), label: name(role)};
      }).filter(Boolean);
      placeSide(positioned, -505, 100);
      for (const {item: role, x, y} of positioned) {
        const local = (state.roles || []).find(r => r.rol_id === role.id);
        addNode("role:" + role.id, "rol", role, x, y,
          {description: local?.funcion_local || role.funcion || ""});
        counts.roles++;
      }
      for (const rel of links) addEdge("role-task:" + rel.rol_id + ":" + rel.tarea_id,
        "role:" + rel.rol_id, "task:" + rel.tarea_id,
        "participacion", "El rol participa en esta tarea.");
    }

    const relations = state.taskProducts.filter(r => taskIds.has(r.tarea_id));
    if (options.products) {
      const productIds = [...new Set(relations.map(r => r.producto_id))];
      const positioned = productIds.map(id => {
        const product = state.products.find(p => p.id === id);
        if (!product) return null;
        const positions = relations.filter(r => r.producto_id === id).map(r => taskY.get(r.tarea_id));
        return {item: product, average: mean(positions), label: name(product)};
      }).filter(Boolean);
      placeSide(positioned, 555, 95);
      for (const {item: product, x, y} of positioned) {
        addNode("product:" + product.id, "producto", product, x, y);
        counts.products++;
      }
      // Puertos puramente visuales: separan entrada y salida sobre el borde derecho.
      // No son tareas ni relaciones adicionales en la base de datos.
      for (const task of tasks) {
        if (relations.some(r => r.tarea_id === task.id && r.flujo === "entrada"))
          addNode("port:input:" + task.id, "puerto-entrada", task,
            95, taskY.get(task.id) - 24, {label: "", ownerTask: task.id});
        if (relations.some(r => r.tarea_id === task.id && r.flujo !== "entrada"))
          addNode("port:output:" + task.id, "puerto-salida", task,
            95, taskY.get(task.id) + 24, {label: "", ownerTask: task.id});
      }
      for (const [i, rel] of relations.entries()) {
        const isInput = rel.flujo === "entrada";
        const kind = isInput ? "entrada" : rel.flujo === "salida" ? "salida" : "actualiza";
        const label = kind === "entrada" ? "Producto de entrada" :
          kind === "salida" ? "Producto de salida" : "Producto actualizado";
        addEdge("task-product:" + i,
          isInput ? "product:" + rel.producto_id : "port:output:" + rel.tarea_id,
          isInput ? "port:input:" + rel.tarea_id : "product:" + rel.producto_id,
          kind, label + " en la tarea.");
      }
    }

    const confirmed = new Set();
    for (const rel of state.sequences) {
      if (!taskIds.has(rel.anterior_id) || !taskIds.has(rel.siguiente_id)) continue;
      const pair = rel.anterior_id + ":" + rel.siguiente_id;
      confirmed.add(pair);
      addEdge("precedence:" + pair, "task:" + rel.anterior_id,
        "task:" + rel.siguiente_id, "precedencia",
        "Precedencia registrada explícitamente.", rel.nota || "");
      counts.precedences++;
    }

    if (options.suggestions) {
      const outputs = relations.filter(r => r.flujo === "salida" || r.flujo === "actualiza");
      const inputs = relations.filter(r => r.flujo === "entrada");
      const seenPairs = new Set();
      for (const output of outputs) {
        for (const input of inputs) {
          if (output.producto_id !== input.producto_id || output.tarea_id === input.tarea_id) continue;
          const pair = output.tarea_id + ":" + input.tarea_id;
          if (confirmed.has(pair) || seenPairs.has(pair)) continue;
          seenPairs.add(pair);
          if (counts.suggestions === 30) { counts.suggestionOverflow++; continue; }
          const product = state.products.find(p => p.id === output.producto_id);
          addEdge("suggestion:" + pair, "task:" + output.tarea_id,
            "task:" + input.tarea_id, "sugerencia",
            "Hipótesis por producto compartido: " + (product?.nombre || "sin identificar") + ".",
            "No demuestra ni registra una precedencia normativa.");
          counts.suggestions++;
        }
      }
    }
    return {process, elements, counts};
  }

  function setDetail(node, title, lines) {
    node.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = title;
    node.append(heading);
    for (const line of lines.filter(Boolean)) {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      node.append(paragraph);
    }
  }

  function destroy() {
    if (graphInstance) graphInstance.destroy();
    graphInstance = null;
  }

  function render(state, processId, options) {
    const canvas = document.getElementById("v85-graph-canvas");
    const status = document.getElementById("v85-graph-status");
    const detail = document.getElementById("v85-graph-detail");
    if (!canvas || !status || !detail) return;
    destroy();
    canvas.replaceChildren();
    const model = buildGraph(state, processId, options);
    if (!model.process || model.counts.tasks === 0) {
      status.textContent = !model.process ? "Selecciona un proceso." : options.activityId
        ? "No hay tareas registradas para la actividad seleccionada."
        : "No hay tareas registradas para este proceso.";
      setDetail(detail, "Información del elemento", ["Selecciona un proceso que contenga tareas."]);
      return;
    }
    if (typeof window.cytoscape !== "function") {
      status.textContent = "No se pudo cargar Cytoscape.js. Comprueba el acceso al recurso y utiliza el diagrama original mientras tanto.";
      setDetail(detail, "Visualización no disponible", ["Los datos originales y la tabla relacional no se han modificado."]);
      return;
    }

    try {
      graphInstance = window.cytoscape({
        container: canvas,
        elements: model.elements,
        layout: {name: "preset", fit: true, padding: 48},
        minZoom: 0.14,
        maxZoom: 3.5,
        userZoomingEnabled: true,
        userPanningEnabled: true,
        autoungrabify: true,
        boxSelectionEnabled: false,
        style: [
          {selector: "node", style: {"background-color": "#6b8195", "label": "data(label)",
            "font-size": 12, "font-weight": 600, "color": "#18334a", "text-wrap": "wrap",
            "text-max-width": "170px", "text-halign": "center", "text-valign": "center",
            "width": 190, "height": 74, "shape": "round-rectangle",
            "border-width": 2, "border-color": "#93a7ba", "text-outline-width": 0,
            "overlay-opacity": 0}},
          {selector: 'node[kind = "tarea"]', style: {"background-color": "#dcf1e2", "border-color": "#39805d"}},
          {selector: 'node[kind = "producto"]', style: {"background-color": "#deebfb", "border-color": "#4c79ac"}},
          {selector: 'node[kind = "rol"]', style: {"background-color": "#f0e5ff", "border-color": "#8964ba"}},
          {selector: 'node[kind = "actividad"]', style: {"background-color": "#fff0d7", "border-color": "#b3833b"}},
          {selector: 'node[kind = "puerto-entrada"]', style: {"label": "", "shape": "ellipse",
            "width": 10, "height": 10, "border-width": 1, "border-color": "#fff",
            "background-color": "#5182b4", "z-index": 8}},
          {selector: 'node[kind = "puerto-salida"]', style: {"label": "", "shape": "ellipse",
            "width": 10, "height": 10, "border-width": 1, "border-color": "#fff",
            "background-color": "#48956d", "z-index": 8}},
          {selector: "edge", style: {"width": 1.8, "line-color": "#a1b0bf", "curve-style": "taxi",
            "taxi-direction": "horizontal", "taxi-turn": "50%", "taxi-turn-min-distance": "16px",
            "target-arrow-shape": "triangle", "target-arrow-color": "#a1b0bf", "arrow-scale": 0.9}},
          {selector: 'edge[kind = "precedencia"]', style: {"width": 3.7, "line-color": "#233f56",
            "target-arrow-color": "#233f56", "taxi-direction": "leftward", "taxi-turn": "90px", "z-index": 5}},
          {selector: 'edge[kind = "sugerencia"]', style: {"width": 2.4, "line-style": "dashed",
            "line-color": "#e19029", "target-arrow-color": "#e19029",
            "taxi-direction": "rightward", "taxi-turn": "90px", "z-index": 4}},
          {selector: 'edge[kind = "entrada"]', style: {"line-color": "#5182b4", "target-arrow-color": "#5182b4"}},
          {selector: 'edge[kind = "salida"]', style: {"line-color": "#48956d", "target-arrow-color": "#48956d"}},
          {selector: 'edge[kind = "actualiza"]', style: {"line-color": "#af7b36", "target-arrow-color": "#af7b36"}},
          {selector: 'edge[kind = "participacion"]', style: {"line-style": "dotted", "line-color": "#987bb7",
            "target-arrow-color": "#987bb7"}},
          {selector: "node:selected", style: {"border-width": 4, "border-color": "#172f52"}},
          {selector: "edge:selected", style: {"width": 5}},
          {selector: ".v85-graph-dimmed", style: {"opacity": 0.13, "text-opacity": 0.13}}
        ]
      });
      const focus = element => {
        let related = element.closedNeighborhood();
        if (element.isNode() && element.data("kind") === "tarea") {
          const ports = graphInstance.nodes().filter(node =>
            node.data("ownerTask") === element.data("recordId"));
          related = related.union(ports.closedNeighborhood());
        }
        // Si la relación termina en un puerto, incluir su tarea real al resaltar.
        const owners = new Set(related.nodes().map(node => node.data("ownerTask")).filter(Boolean));
        related = related.union(graphInstance.nodes().filter(node =>
          node.data("kind") === "tarea" && owners.has(node.data("recordId"))));
        graphInstance.elements().removeClass("v85-graph-dimmed");
        graphInstance.elements().not(related).addClass("v85-graph-dimmed");
      };
      graphInstance.on("tap", event => {
        if (event.target === graphInstance) {
          graphInstance.elements().removeClass("v85-graph-dimmed");
        }
      });
      graphInstance.on("tap", "node", event => {
        const selected = event.target.data("ownerTask")
          ? graphInstance.getElementById("task:" + event.target.data("ownerTask"))
          : event.target;
        focus(selected);
        const d = selected.data();
        const original = [...state.tasks, ...state.activities, ...state.products, ...state.catalog]
          .find(item => item.id === d.recordId);
        const document = state.documents.find(item => item.id === original?.documento_id);
        const source = document ? "Fuente: " + (document.nombre_original || document.nombre || "documento") +
          (original.pagina ? ", página física " + original.pagina : "") : "";
        setDetail(detail, d.fullName, ["Tipo: " + d.kind + ".", d.description, source]);
      });
      graphInstance.on("tap", "edge", event => {
        focus(event.target);
        const d = event.target.data();
        const start = graphInstance.getElementById(d.source).data("fullName");
        const end = graphInstance.getElementById(d.target).data("fullName");
        setDetail(detail, "Relación: " + d.kind, [start + " → " + end, d.description, d.note]);
      });
      const c = model.counts;
      status.textContent = c.tasks + " tareas, " + c.precedences + " precedencias explícitas, " +
        c.products + " productos, " + c.roles + " roles y " + c.activities + " actividades visibles." +
        (options.suggestions ? " " + c.suggestions + " posibles conexiones no confirmadas" +
        (c.suggestionOverflow ? " (" + c.suggestionOverflow + " omitidas por claridad)" : "") + "." : "");
      setDetail(detail, "Información del elemento", [
        "Selecciona una caja o flecha para consultar los detalles.",
        "Las tareas se ordenan respetando las precedencias registradas. Sin una dependencia entre dos tareas, se conserva su orden de captura."
      ]);
      window.requestAnimationFrame(() => {
        if (graphInstance && canvas.offsetWidth > 0) {
          graphInstance.resize();
          graphInstance.fit(undefined, 48);
        }
      });
    } catch (error) {
      destroy();
      status.textContent = "No fue posible generar el diagrama: " + error.message;
    }
  }

  function fit() {
    if (graphInstance) {
      graphInstance.resize();
      graphInstance.fit(undefined, 48);
    }
  }

  window.CIMATGraph = {buildGraph, render, fit, destroy};
})();
