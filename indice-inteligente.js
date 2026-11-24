/* CIMAT 1.0.0-beta.2 — Administrador del índice inteligente de modelos.
 * La Biblioteca, cuestionario y constructor originales no cambian.
 * Solo usa Edge autenticada; sin claves privilegiadas en el cliente.
 */
(()=>{
"use strict";
const $=id=>document.getElementById(id),config=window.CIMAT_CONFIG||{};
const URL=String(config.SUPABASE_URL||"").replace(/\/+$/,"");
const KEY=String(config.SUPABASE_PUBLISHABLE_KEY||"");
let loaded=false,user="",models=[],elements=[],documents=[],cases=[],busy=false;
function session(){
 let s;try{s=JSON.parse(sessionStorage.getItem("cimat_v012_sesion")||"null");}catch(_){}
 if(!s?.user?.id||!s.access_token||Date.now()>=s.expires_at)throw Error("Vuelve a iniciar sesión.");
 return s;
}
function elem(tag,value,className){
 const e=document.createElement(tag);if(value!=null)e.textContent=String(value);
 if(className)e.className=className;return e;
}
function option(id,label){const o=elem("option",label);o.value=id;return o;}
function message(str,isError=false){const e=$("c12-status");e.textContent=str;e.classList.toggle("error",isError);}
async function api(body){
 const s=session();
 const response=await fetch(URL+"/functions/v1/cimat-indice-inteligente",{
  method:"POST",headers:{"Content-Type":"application/json",apikey:KEY,Authorization:"Bearer "+s.access_token},
  body:JSON.stringify(body),cache:"no-store"
 });
 let data={};try{data=await response.json();}catch(_){}
 if(session().user.id!==s.user.id)throw Error("La sesión cambió.");
 if(!response.ok)throw Error(data.mensaje||"Error HTTP "+response.status);
 return data;
}
async function act(fn){
 if(busy)return;busy=true;
 try{await fn();}catch(e){message(e.message||String(e),true);}
 finally{busy=false;}
}
function reset(){
 user="";loaded=false;models=[];elements=[];documents=[];cases=[];
 $("c12-controls").classList.add("hidden");
 $("c12-results").replaceChildren();$("c12-pilot").replaceChildren();
 message("Ingresa como administrador para configurar el índice inteligente.");
}
function selectOptions(element,items,head,mapping){
 const old=element.value;
 element.replaceChildren(option("",head));
 items.forEach(item=>element.append(option(String(item.id),mapping(item))));
 if(items.some(item=>String(item.id)===old))element.value=old;
}
function renderCatalog(){
 selectOptions($("c12-domain"),models,"Selecciona un modelo",d=>d.titulo+" ("+(d.edicion||"sin edición")+")");
 selectOptions($("c12-target-domain"),models,"Selecciona un modelo",d=>d.titulo+" ("+(d.edicion||"sin edición")+")");
 syncTargets();syncDocs();
 $("c12-catalog-summary").textContent=
   "Modelos: "+models.length+" · Elementos consultables: "+elements.length+
   " · Documentos registrados: "+documents.length;
}
function syncTargets(){
 const domain=$("c12-target-domain").value;
 const items=elements.filter(x=>x.dominio_id===domain&&
  ["tarea","producto","practica","actividad","proceso"].includes(x.origen_tipo));
 const old=$("c12-target").value;
 $("c12-target").replaceChildren(option("","Selecciona elemento para el criterio"));
 for(const x of items){const o=option(x.id,x.origen_tipo+" · "+x.nombre);o.dataset.origenId=x.origen_id;
  o.dataset.tipo=x.origen_tipo;$("c12-target").append(o);}
 if(items.some(x=>x.id===old))$("c12-target").value=old;
}
function syncDocs(){
 for(const prefix of ["c12-","c12-criterion-"]){
  const domain=$(prefix==="c12-"?"c12-domain":"c12-target-domain").value;
  const node=$(prefix==="c12-"?"c12-document":"c12-criterion-document");
  selectOptions(node,documents.filter(d=>d.dominio_id===domain),"Sin documento (opcional)",d=>d.nombre_original);
 }
}
async function refresh(){
 const [stats,listing]=await Promise.all([api({accion:"estado"}),api({accion:"dominios"})]);
 models=listing.modelos||[];elements=listing.elementos||[];documents=listing.documentos||[];
 const s=stats.datos||{};
 $("c12-stats").textContent=
  "Elementos indexados: "+(s.elementos||0)+" · Relaciones: "+(s.relaciones||0)+
  " · Vectores pendientes: "+(s.sin_vectores||0)+" · Prácticas: "+(s.practicas||0)+
  " · Criterios adicionales: "+(s.criterios_adicionales||0);
 $("c12-embeddings-status").textContent=s.embeddings_configurados?
  "La función dispone de proveedor configurado; falta confirmar su disponibilidad con una prueba.":
  "No se ha detectado la clave necesaria para generar vectores. La búsqueda textual seguirá funcionando.";
 renderCatalog();
 return s;
}
async function init(){
 try{
  const uid=session().user.id;
  if(loaded&&uid===user)return;
  reset();message("Verificando permisos y consultando el catálogo...");
  await refresh();
  user=uid;loaded=true;$("c12-controls").classList.remove("hidden");
  message("Índice de conocimiento disponible. La Biblioteca original permanece intacta.");
 }catch(e){reset();message(e.message||String(e),true);}
}
function showMatches(arr){
 const target=$("c12-results");target.replaceChildren();
 if(!arr?.length){target.append(elem("p","No se encontraron coincidencias con suficiente puntuación.","subtle"));return;}
 for(const x of arr){
  const card=elem("article",null,"c12-item");
  card.append(elem("strong",x.origen_tipo+" · "+x.nombre));
  card.append(elem("p",x.modelo+" · "+(x.edicion||"sin edición"),"subtle"));
  card.append(elem("p",x.descripcion||"Sin descripción registrada","subtle"));
  const score=typeof x.puntaje==="number"?x.puntaje.toFixed(3):"—";
  const sim=typeof x.similitud==="number"?x.similitud.toFixed(3):"no disponible";
  card.append(elem("small","Puntuación: "+score+" · similitud vectorial: "+sim+" · página: "+(x.pagina||"no registrada")));
  if(Array.isArray(x.relaciones)&&x.relaciones.length){
   const details=elem("details");details.append(elem("summary","Ver relaciones ("+x.relaciones.length+")"));
   for(const v of x.relaciones.slice(0,12))details.append(elem("p",v.tipo+" → "+v.nombre,"subtle"));
   card.append(details);
  }
  target.append(card);
 }
}
async function createPractice(e){
 e.preventDefault();
 const payload={accion:"practica",dominio_id:$("c12-domain").value,
   nombre:$("c12-practice-name").value,descripcion:$("c12-practice-desc").value,
   naturaleza:$("c12-practice-kind").value,documento_id:$("c12-document").value,
   pagina:$("c12-page").value,apartado:$("c12-section").value};
 if(!payload.dominio_id||payload.nombre.trim().length<3)throw Error("Indica modelo y nombre de práctica.");
 const data=await api(payload);message(data.mensaje);$("c12-practice-name").value="";$("c12-practice-desc").value="";
}
async function createCriterion(e){
 e.preventDefault();
 const selected=$("c12-target").selectedOptions[0];
 if(!selected?.dataset.origenId)throw Error("Selecciona un elemento de referencia.");
 const data=await api({accion:"criterio",dominio_id:$("c12-target-domain").value,
  objetivo_id:selected.dataset.origenId,objetivo_tipo:selected.dataset.tipo,
  texto:$("c12-criterion-text").value,naturaleza:$("c12-criterion-kind").value,
  documento_id:$("c12-criterion-document").value,pagina:$("c12-criterion-page").value,
  apartado:$("c12-criterion-section").value});
 message(data.mensaje);$("c12-criterion-text").value="";
}
function displayPilot(data){
 const target=$("c12-pilot");target.replaceChildren();
 const positive=data.detalles?.filter(x=>!x.negativo).length||0;
 target.append(elem("p","Casos: "+data.casos+" · Positivos conocidos: "+positive+
  " · Aciertos Top 1: "+data.aciertos_top1+" · Aciertos Top 5: "+data.aciertos_top5+
  " · MRR de positivos: "+Number(data.mrr).toFixed(3)+
  " · Latencia media: "+Number(data.latencia_media_ms).toFixed(1)+" ms"));
 target.append(elem("p","Los casos contienen solo referencias positivas conocidas y controles negativos ficticios. La precisión y los falsos positivos generales requieren etiquetado humano exhaustivo.","subtle"));
 for(const c of data.detalles||[]){
  const card=elem("article",null,"c12-item");
  card.append(elem("strong",c.caso+" · "+c.puesto));
  card.append(elem("p",c.negativo?
    "Control negativo: no se espera ninguna referencia aplicable.":
    "Referencia esperada: "+c.esperado+" · posición: "+(c.rango||"no encontrada"),"subtle"));
  for(const x of c.top3||[]){
   const row=elem("div",null,"c12-judgment");
   row.append(elem("span",x.tipo+" · "+x.nombre));
   const chooser=elem("select");
   for(const [v,n] of [["","Seleccione juicio"],["relevante","Relevante"],["no_relevante","No relevante"],["dudoso","Dudoso"]])
    chooser.append(option(v,n));
   const button=elem("button","Guardar juicio","outline");button.type="button";
   button.addEventListener("click",()=>act(async()=>{
    if(!chooser.value)throw Error("Selecciona un juicio antes de guardar.");
    const res=await api({accion:"juicio",caso_id:c.caso_id,catalogo_id:x.id,juicio:chooser.value});
    message(res.mensaje);
   }));
   row.append(chooser,button);card.append(row);
  }
  target.append(card);
 }
}
function bind(){
 document.querySelector('[data-view="indice"]')?.addEventListener("click",init);
 $("c12-domain").addEventListener("change",syncDocs);
 $("c12-target-domain").addEventListener("change",()=>{syncTargets();syncDocs();});
 $("c12-rebuild").addEventListener("click",()=>act(async()=>{
  const r=await api({accion:"reconstruir"});await refresh();
  message("Reconstruido: "+r.datos.indexados+" elementos y "+r.datos.relaciones+" relaciones.");
 }));
 $("c12-refresh").addEventListener("click",()=>act(async()=>{await refresh();message("Datos de índice actualizados.");}));
 $("c12-practice-form").addEventListener("submit",e=>act(()=>createPractice(e)));
 $("c12-criterion-form").addEventListener("submit",e=>act(()=>createCriterion(e)));
 $("c12-embed").addEventListener("click",()=>act(async()=>{
  if(!$("c12-embed-consent").checked)throw Error("Autoriza explícitamente el envío de extractos compartidos.");
  const res=await api({accion:"vectores",autorizacion_externa:true});await refresh();
  message("Embeddings generados en este lote: "+res.generados+". "+res.mensaje);
 }));
 $("c12-search-form").addEventListener("submit",e=>{e.preventDefault();act(async()=>{
  const r=await api({accion:"buscar",consulta:$("c12-query").value,
    autorizacion_externa:$("c12-query-embed").checked,limite:15});
  showMatches(r.candidatos);message("Consulta completada en modo "+r.modo+".");
 });});
 $("c12-review-summary").addEventListener("click",()=>act(async()=>{
  const data=await api({accion:"resumen_revision"});
  const target=$("c12-review-metrics");target.replaceChildren();
  if(!data.ultima_ejecucion){target.textContent=data.mensaje;return;}
  const fmt=v=>typeof v==="number"?v.toFixed(3):"Pendiente";
  target.append(elem("p","Última ejecución: "+data.ultima_ejecucion.casos+
   " casos · Top 1: "+data.ultima_ejecucion.aciertos_top1+
   " · Top 5: "+data.ultima_ejecucion.aciertos_top5+
   " · MRR: "+fmt(data.ultima_ejecucion.mrr)));
  target.append(elem("p","Candidatos anotables: "+data.recuperaciones+
   " · Pares con dos revisores: "+data.pares_doble_revision+
   " · Cobertura: "+fmt(data.cobertura)));
  target.append(elem("p","Acuerdo observado: "+fmt(data.acuerdo_observado)+
   " · Kappa de Cohen: "+fmt(data.kappa)+
   " · Precisión en candidatos revisados: "+fmt(data.precision_candidatos_revisados)));
  target.append(elem("p",data.nota,"subtle"));
  message("Revisión de métricas efectuada; no se atribuyen resultados inexistentes.");
 }));
 $("c12-pilot-run").addEventListener("click",()=>act(async()=>{
  const r=await api({accion:"piloto",autorizacion_externa:$("c12-pilot-embed").checked});
  displayPilot(r);message(r.mensaje);
 }));
 $("logout")?.addEventListener("click",reset);
 $("login-form")?.addEventListener("submit",reset);
}
if($("c12-controls"))bind();
})();