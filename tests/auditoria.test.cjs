// Pruebas deterministas del motor de auditoría CIMAT v0.8.2a.
// Ejecutar en Node.js: node --test tests/auditoria.test.cjs
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");

const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,"..","auditoria-core.js"),"utf8"),context);
const {audit}=context.window.CIMAT_AUDITORIA_CORE;
const doc="doc";
const node=(id,tipo,codigo,titulo,pagina=1)=>({
  id,tipo,codigo,titulo,pagina,documento_id:doc,estado:"propuesto",descripcion:"Cita literal: evidencia de ejemplo"
});

test("Detecta que IS.6.3 no es una actividad en la estructura ISO 29110",()=>{
  const e=node("1","actividad","IS.6.3","Documentar el Manual");
  const result=audit({domainLabel:"NTP-ISO/IEC 29110:2012",elements:[e]});
  assert.ok(result.issues.some(x=>x.elementId==="1"&&x.title.includes("clasificación incompatible")));
});

test("No confunde el rol GP con el proceso GP solo por compartir abreviatura",()=>{
  const result=audit({domainLabel:"ISO/IEC 29110",elements:[
    node("1","proceso","GP","Gestión del Proyecto"),node("2","rol","GP","Gestor de Proyecto")
  ]});
  assert.ok(!result.issues.some(x=>x.title.includes("GP · clasificación incompatible")));
});

test("No confunde tareas homónimas de actividades distintas con duplicados",()=>{
  const result=audit({domainLabel:"ISO/IEC 29110",elements:[
    node("1","tarea","IS.2.1","Asignar tareas"),node("2","tarea","IS.5.1","Asignar tareas")
  ]});
  assert.ok(!result.issues.some(x=>x.category==="duplicados"));
});

test("Advierte productos con denominaciones canónicas equivalentes",()=>{
  const result=audit({domainLabel:"ISO/IEC 29110",elements:[
    node("1","producto","ET","Enunciado de Trabajo"),
    node("2","producto","T2","Enunciado del Trabajo")
  ]});
  assert.ok(result.issues.some(x=>x.category==="duplicados"));
});

test("Advierte participaciones invertidas sin alterar relaciones",()=>{
  const elements=[node("a","tarea","GP.1.1","Revisar trabajo"),node("b","rol","CL","Cliente")];
  const relations=[{id:"r1",origen_id:"a",destino_id:"b",tipo:"participa",estado:"propuesto",documento_id:doc,pagina:1,detalle:"Cita literal: relacion de ejemplo"}];
  const before=JSON.stringify({elements,relations});
  const result=audit({elements,relations,domainLabel:"ISO/IEC 29110"});
  assert.ok(result.issues.some(x=>x.category==="relaciones"&&x.relationId==="r1"));
  assert.equal(JSON.stringify({elements,relations}),before);
});

test("No aplica nomenclatura GP/IS a una metodología genérica",()=>{
  const result=audit({domainLabel:"Manual de procesos",elements:[
    node("1","actividad","IS.6.3","Fase opcional")
  ]});
  assert.equal(result.summary.scope,"General");
  assert.ok(!result.issues.some(x=>x.title.includes("clasificación incompatible")));
});
