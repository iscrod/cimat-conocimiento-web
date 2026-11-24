import { createClient } from "npm:@supabase/supabase-js@2.57.0";
/** CIMAT beta.2: administración del índice derivado, embeddings opt-in y prueba reproducible.
 * Sin privilegios ni claves de servicio en navegador.
 */
const CORS={
 "Access-Control-Allow-Origin":"https://iscrod.github.io",
 "Access-Control-Allow-Methods":"POST, OPTIONS",
 "Access-Control-Allow-Headers":"authorization, apikey, content-type",
 "Content-Type":"application/json; charset=utf-8","Vary":"Origin"
};
const send=(status:number,obj:Record<string,unknown>)=>new Response(JSON.stringify(obj),{status,headers:CORS});
function str(v:unknown,n=500){return typeof v==="string"?v.trim().slice(0,n):"";}
async function embedding(input:string,kind:"RETRIEVAL_DOCUMENT"|"RETRIEVAL_QUERY"){
 const secret=Deno.env.get("CIMAT_GEMINI_API_KEY");
 const model=Deno.env.get("CIMAT_GEMINI_EMBEDDING_MODEL")||"gemini-embedding-001";
 if(!secret)throw new Error("No hay clave Gemini configurada para embeddings.");
 const controller=new AbortController();const clock=setTimeout(()=>controller.abort(),14000);
 let response:Response;
 try{
  response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+
     encodeURIComponent(model)+":embedContent",{
   method:"POST",signal:controller.signal,
   headers:{"Content-Type":"application/json","x-goog-api-key":secret},
   body:JSON.stringify({model:"models/"+model,content:{parts:[{text:input.slice(0,2800)}]},
     taskType:kind,outputDimensionality:768})
  });
 }finally{clearTimeout(clock);}
 if(!response.ok)throw new Error("El proveedor rechazó los embeddings (HTTP "+response.status+").");
 const body=await response.json();
 const values=body?.embedding?.values;
 if(!Array.isArray(values)||values.length!==768||values.some((x:unknown)=>typeof x!=="number"||!Number.isFinite(x)))
  throw new Error("La respuesta no contiene un vector de 768 dimensiones.");
 return {vector:JSON.stringify(values),model};
}
Deno.serve(async(req:Request)=>{
 try{
  const origin=req.headers.get("origin");
  if(origin&&origin!=="https://iscrod.github.io")return send(403,{mensaje:"Origen no autorizado."});
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  if(req.method!=="POST")return send(405,{mensaje:"Método no permitido."});
  const authHeader=req.headers.get("authorization")||"";
  const token=authHeader.replace(/^Bearer\s+/i,"");
  if(token.length<30)return send(401,{mensaje:"Inicia sesión."});
  const url=Deno.env.get("SUPABASE_URL")||"";
  const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
  if(!url||!secret||!anon)return send(503,{mensaje:"Falta configuración segura de Supabase."});
  const service=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:identity,error:identityError}=await service.auth.getUser(token);
  if(identityError||!identity.user)return send(401,{mensaje:"Credenciales inválidas."});
  const uid=identity.user.id;
  const asUser=createClient(url,anon,{global:{headers:{Authorization:authHeader}},
     auth:{persistSession:false,autoRefreshToken:false}});
  let body:Record<string,unknown>;
  try{body=await req.json();}catch{return send(400,{mensaje:"JSON inválido."});}
  const action=str(body.accion,50);
  const {data:isAdmin,error:permissionError}=await asUser.rpc("mi_acceso_administrador");
  if(permissionError||isAdmin!==true)return send(403,{mensaje:"El Índice Inteligente requiere administración global."});
  if(action==="estado"){
   const [catalog,domains,edges,unembedded,practices,criteria]=await Promise.all([
    service.from("cimat_12_catalogo").select("id",{head:true,count:"exact"}).eq("activo",true),
    service.from("dominios_conocimiento").select("id",{head:true,count:"exact"}).eq("estado","registrado"),
    service.from("cimat_12_enlaces").select("origen_id",{head:true,count:"exact"}),
    service.from("cimat_12_catalogo").select("id",{head:true,count:"exact"}).eq("activo",true).is("embedding",null),
    service.from("cimat_12_practicas").select("id",{head:true,count:"exact"}),
    service.from("cimat_12_criterios").select("id",{head:true,count:"exact"})
   ]);
   return send(200,{mensaje:"Índice consultado.",datos:{
    modelos:domains.count||0,elementos:catalog.count||0,relaciones:edges.count||0,
    sin_vectores:unembedded.count||0,practicas:practices.count||0,criterios_adicionales:criteria.count||0,
    embeddings_configurados:Boolean(Deno.env.get("CIMAT_GEMINI_API_KEY"))
   }});
  }
  if(action==="reconstruir"){
   const {data,error}=await service.rpc("cimat_12_reindexar_servicio");
   if(error)return send(500,{mensaje:"Fallo al reconstruir: "+error.message});
   return send(200,{mensaje:"Índice reconstruido sin modificar la Biblioteca.",datos:data});
  }
  if(action==="dominios"){
   const [domains,items,docs]=await Promise.all([
    service.from("dominios_conocimiento").select("id,titulo,codigo,edicion,estado,empresa_id").eq("estado","registrado").limit(200),
    service.from("cimat_12_catalogo").select("id,dominio_id,origen_tipo,origen_id,nombre,documento_id,pagina,embedding_actualizado")
      .eq("activo",true).order("nombre").limit(1200),
    service.from("documentos_dominio").select("id,dominio_id,nombre_original").limit(200)
   ]);
   if(domains.error||items.error||docs.error)return send(500,{mensaje:"No se pudo consultar el catálogo."});
   return send(200,{modelos:domains.data,elementos:items.data,documentos:docs.data});
  }
  if(action==="practica"){
   const dominio_id=str(body.dominio_id,50),nombre=str(body.nombre,250),descripcion=str(body.descripcion,4000);
   const documento_id=str(body.documento_id,50)||null;
   const pagina=Number(body.pagina)>0?Number(body.pagina):null;
   if(!/^[0-9a-f-]{36}$/i.test(dominio_id)||nombre.length<3)
    return send(400,{mensaje:"Selecciona modelo y nombre de práctica."});
   const {data,error}=await asUser.from("cimat_12_practicas")
    .insert({dominio_id,nombre,descripcion,naturaleza:body.naturaleza==="interpretada"?"interpretada":"explicita",
      documento_id,pagina,fuente_apartado:str(body.apartado,120)})
    .select("id").single();
   if(error)return send(400,{mensaje:error.message});
   return send(200,{mensaje:"Práctica registrada. Reconstruye el índice para incluirla.",id:data.id});
  }
  if(action==="criterio"){
   const dominio_id=str(body.dominio_id,50),objetivo_tipo=str(body.objetivo_tipo,30);
   const objetivo_id=str(body.objetivo_id,50),texto=str(body.texto,1500);
   if(texto.length<8||!["tarea","producto","actividad","proceso","practica"].includes(objetivo_tipo))
     return send(400,{mensaje:"Selecciona un elemento existente y describe el criterio."});
   const {data,error}=await asUser.from("cimat_12_criterios").insert({
    dominio_id,objetivo_tipo,objetivo_id,texto,
    naturaleza:body.naturaleza==="interpretado"?"interpretado":"explicito",
    documento_id:str(body.documento_id,50)||null,
    pagina:Number(body.pagina)>0?Number(body.pagina):null,
    fuente_apartado:str(body.apartado,120),revisado:false
   }).select("id").single();
   if(error)return send(400,{mensaje:error.message});
   return send(200,{mensaje:"Criterio añadido; no se considera verificado hasta su revisión.",id:data.id});
  }
  if(action==="vectores"){
   if(body.autorizacion_externa!==true)return send(400,{mensaje:"Confirma el envío de extractos de normas compartidas al proveedor de embeddings."});
   const {data:publicDomains,error:domainError}=await service.from("dominios_conocimiento")
      .select("id").is("empresa_id",null).eq("estado","registrado").limit(200);
   if(domainError)return send(500,{mensaje:"No se pudieron identificar los modelos compartidos."});
   const ids=(publicDomains||[]).map(x=>x.id);
   if(!ids.length)return send(200,{mensaje:"No hay modelos compartidos.",generados:0});
   const {data:todo,error:pendingError}=await service.from("cimat_12_catalogo")
     .select("id,nombre,texto_busqueda").in("dominio_id",ids)
     .eq("activo",true).is("embedding",null).limit(6);
   if(pendingError)return send(500,{mensaje:pendingError.message});
   let generated=0;let failure="";
   for(const item of todo||[]){
    try{
     const e=await embedding(item.texto_busqueda,"RETRIEVAL_DOCUMENT");
     const {data:ok,error}=await service.rpc("cimat_12_vector_servicio",
       {p_id:item.id,p_vector:e.vector,p_modelo:e.model});
     if(error||!ok)throw new Error(error?.message||"No se actualizó el vector.");
     generated++;
    }catch(e){failure=e instanceof Error?e.message:"Fallo al generar vector.";break;}
   }
   return send(generated||!failure?200:503,{
    mensaje:failure||"Vectores procesados.",generados:generated,
    pendientes_en_lote:Math.max(0,(todo||[]).length-generated),
    aviso:"Solo se vectorizan modelos compartidos; no se envían documentos privados."
   });
  }
  if(action==="buscar"){
   const query=str(body.consulta,700);
   if(query.length<3)return send(400,{mensaje:"Escribe una consulta con significado."});
   let vector:string|null=null;
   let mode="textual";
   if(body.autorizacion_externa===true){
    try{vector=(await embedding(query,"RETRIEVAL_QUERY")).vector;mode="hibrida";}
    catch(e){mode="textual (embeddings no disponibles)";}
   }
   const {data,error}=await service.rpc("cimat_12_buscar_servicio",
     {p_consulta:query,p_usuario:uid,p_embedding:vector,p_limite:Math.min(30,Math.max(1,Number(body.limite)||12))});
   if(error)return send(500,{mensaje:"Error de búsqueda: "+error.message});
   return send(200,{mensaje:"Candidatos recuperados, no equivalen a cumplimiento.",
     modo:mode,candidatos:data||[]});
  }
  if(action==="piloto"){
   const allowSemantic=body.autorizacion_externa===true;
   const {data:cases,error:caseError}=await service.from("cimat_12_casos_piloto").select("*").limit(30);
   if(caseError)return send(500,{mensaje:caseError.message});
   const examples:any[]=[];let hits1=0,hits5=0,reciprocal=0,ms=0,mode="textual",negAlerts=0;
   const positives=(cases||[]).filter((x:any)=>x.esperado_origen_id!==null).length;
   const negatives=(cases||[]).length-positives;
   for(const item of cases||[]){
    let vector:string|null=null;
    if(allowSemantic){try{vector=(await embedding(item.consulta,"RETRIEVAL_QUERY")).vector;mode="hibrida";}catch{}}
    const before=Date.now();
    const {data:found,error}=await service.rpc("cimat_12_buscar_servicio",
      {p_consulta:item.consulta,p_usuario:uid,p_embedding:vector,p_limite:10});
    ms+=Date.now()-before;
    if(error)return send(500,{mensaje:"No se completó el piloto: "+error.message});
    const ranked=found||[];
    const i=ranked.findIndex((x:any)=>x.origen_id===item.esperado_origen_id&&x.origen_tipo===item.esperado_origen_tipo);
    const negative=item.esperado_origen_id===null;
    if(negative){if(ranked.length>0)negAlerts++;}
    else{
     if(i===0)hits1++;
     if(i>=0&&i<5)hits5++;
     if(i>=0)reciprocal+=1/(i+1);
    }
    examples.push({caso_id:item.id,caso:item.titulo,esperado:item.esperado_origen_tipo,
      puesto:item.ocupacion,negativo:negative,rango:i<0?null:i+1,top3:ranked.slice(0,3).map((x:any)=>({id:x.catalogo_id,nombre:x.nombre,tipo:x.origen_tipo,puntaje:x.puntaje}))});
   }
   const total=(cases||[]).length;
   if(!total)return send(422,{mensaje:"No se han definido casos ficticios de prueba."});
   const {error:logError}=await service.from("cimat_12_resultados_piloto").insert({
    configuracion:mode,casos:total,aciertos_top1:hits1,aciertos_top5:hits5,
    falsos_positivos_top5:null,precision_top5:null,recall_top5:null,
    mrr:positives?Number((reciprocal/positives).toFixed(4)):null,tiempo_medio_ms:ms/total,
    notas:"Positivos: "+positives+"; controles negativos: "+negatives+"; alertas en controles: "+negAlerts+". Una referencia positiva conocida por caso positivo; no se estima precisión global ni falsos positivos reales."
   });
   if(logError)return send(500,{mensaje:"No se guardó la ejecución: "+logError.message});
   return send(200,{mensaje:"Piloto sintético ejecutado. NO constituye validación científica con personas.",
     casos:total,positivos:positives,controles_negativos:negatives,
     aciertos_top1:hits1,aciertos_top5:hits5,alertas_controles_negativos:negAlerts,
     mrr:positives?reciprocal/positives:null,
     latencia_media_ms:ms/total,modo:mode,detalles:examples,
     faltante:"Etiquetado experto de relevancia y evaluación con trabajadores reales."});
  }
  if(action==="juicio"){
   const caso_id=str(body.caso_id,50),catalogo_id=str(body.catalogo_id,50);
   const juicio=str(body.juicio,30);
   if(!["relevante","no_relevante","dudoso"].includes(juicio))
      return send(400,{mensaje:"El juicio debe ser relevante, no relevante o dudoso."});
   const {error}=await asUser.from("cimat_12_juicios_expertos").upsert({
    caso_id,catalogo_id,revisor_id:uid,juicio,observacion:str(body.observacion,1000)
   },{onConflict:"caso_id,catalogo_id,revisor_id"});
   if(error)return send(400,{mensaje:error.message});
   return send(200,{mensaje:"Juicio humano registrado; el sistema no lo generó automáticamente."});
  }
  return send(400,{mensaje:"Acción no reconocida."});
 }catch(e){console.error("CIMAT index:",e instanceof Error?e.name:"unknown");
  return send(500,{mensaje:"No se pudo completar la operación. Revisa permisos y configuración."});}
});
