/* Pruebas del visor Cytoscape — sin conexión a Supabase y sin navegador. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const code = fs.readFileSync(path.join(__dirname, "..", "grafo-relaciones.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(code, context, { timeout: 1000 });
const { buildGraph } = context.window.CIMATGraph;

function fixture() {
  return {
    processes: [{ id: "gp", codigo: "GP", nombre: "Gestión del Proyecto" }],
    activities: [
      { id: "a1", proceso_id: "gp", codigo: "GP.1", nombre: "Planificación" },
      { id: "a2", proceso_id: "gp", codigo: "GP.2", nombre: "Ejecución" }
    ],
    // El orden de captura contradice la precedencia intencionalmente.
    tasks: [
      { id: "t2", proceso_id: "gp", actividad_id: "a1", creado_en: "2026-01-01", nombre: "Segunda" },
      { id: "t3", proceso_id: "gp", actividad_id: "a1", creado_en: "2026-01-02", nombre: "Tercera" },
      { id: "t1", proceso_id: "gp", actividad_id: "a1", creado_en: "2026-01-03", nombre: "Primera" },
      { id: "t4", proceso_id: "gp", actividad_id: "a2", creado_en: "2026-01-04", nombre: "Cuarta" }
    ],
    sequences: [
      { anterior_id: "t1", siguiente_id: "t2" },
      { anterior_id: "t2", siguiente_id: "t3" }
    ],
    products: [
      { id: "p1", nombre: "Producto de entrada" },
      { id: "p2", nombre: "Producto de salida" }
    ],
    taskProducts: [
      { tarea_id: "t2", producto_id: "p1", flujo: "entrada" },
      { tarea_id: "t3", producto_id: "p2", flujo: "salida" },
      { tarea_id: "t4", producto_id: "p2", flujo: "actualiza" }
    ],
    taskRoles: [],
    activitySequences: [],
    catalog: [],
    roles: []
  };
}

function node(graph, id) {
  return graph.elements.find(e => e.group === "nodes" && e.data.id === id);
}
function edge(graph, kind) {
  return graph.elements.find(e => e.group === "edges" && e.data.kind === kind);
}

test("las precedencias tienen prioridad sobre el orden de captura", () => {
  const state = fixture();
  const graph = buildGraph(state, "gp", { products: true });
  const ordered = graph.elements
    .filter(e => e.group === "nodes" && e.data.kind === "tarea")
    .sort((a, b) => a.position.y - b.position.y)
    .map(e => e.data.recordId);
  assert.equal(ordered.join(","), "t1,t2,t3,t4");
  assert.equal(graph.counts.precedences, 2);
  // La construcción visual no modifica los registros originales.
  assert.equal(state.tasks[0].id, "t2");
});

test("la entrada llega al puerto superior derecho y la salida parte del inferior", () => {
  const graph = buildGraph(fixture(), "gp", { products: true });
  const entrada = edge(graph, "entrada");
  const salida = edge(graph, "salida");
  const actualiza = edge(graph, "actualiza");
  assert.equal(entrada.data.source, "product:p1");
  assert.equal(entrada.data.target, "port:input:t2");
  assert.equal(salida.data.source, "port:output:t3");
  assert.equal(salida.data.target, "product:p2");
  assert.equal(actualiza.data.source, "port:output:t4");
  assert.equal(actualiza.data.target, "product:p2");
  assert.ok(node(graph, "port:input:t2").position.y < node(graph, "task:t2").position.y);
  assert.ok(node(graph, "port:output:t3").position.y > node(graph, "task:t3").position.y);
  assert.equal(node(graph, "port:input:t2").position.x, 95);
  assert.equal(node(graph, "port:output:t3").position.x, 95);
});

test("el filtro de actividad excluye otras tareas, relaciones y sus puertos", () => {
  const graph = buildGraph(fixture(), "gp", { products: true, activityId: "a1" });
  assert.equal(graph.counts.tasks, 3);
  assert.equal(graph.counts.precedences, 2);
  assert.ok(!node(graph, "task:t4"));
  assert.ok(!node(graph, "port:output:t4"));
  assert.ok(graph.elements.every(e => !e.data.id.includes("t4")));
});

test("todas las aristas visuales tienen extremos existentes", () => {
  const graph = buildGraph(fixture(), "gp", { products: true, roles: true, activities: true });
  const ids = new Set(graph.elements.filter(e => e.group === "nodes").map(e => e.data.id));
  for (const relation of graph.elements.filter(e => e.group === "edges")) {
    assert.ok(ids.has(relation.data.source), "origen inexistente: " + relation.data.id);
    assert.ok(ids.has(relation.data.target), "destino inexistente: " + relation.data.id);
  }
});

test("si se ocultan los productos, no se muestran puertos ni relaciones de producto", () => {
  const graph = buildGraph(fixture(), "gp", { products: false });
  assert.ok(graph.elements.every(e => !e.data.id.startsWith("port:")));
  assert.ok(graph.elements.every(e => !["entrada", "salida", "actualiza"].includes(e.data.kind)));
});
