import { createClient } from "npm:@supabase/supabase-js@2.57.0";
/* CIMAT 1.0.0-beta.2: actualización del índice derivado y vectores.
 * Solo administradores globales autenticados; secretos exclusivos del servidor.
 */
const ORIGIN="https://iscrod.github.io";
const HEADERS={"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":ORIGIN,
 "Access-Control-Allow-Headers":"authorization, apikey, content-type",
 "Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
const reply=(status:number,value:Record<string,unknown>)=>new Response(JSON.stringify(value),{status,headers:HEADERS});
const MODEL="gemini-embedding-001";
Deno.serve(async(req:Request)=>{
 if(req.headers.get("origin") && req.headers.get("origin")!==ORIGIN)return reply(403,{mensaje:"Origen no permitido"});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:HEADERS});
 if(req.method!=="POST")return reply(405,{mensaje:"Método no permitido"});
 const key=Deno.env.get("CIMAT_GEMINI_API_KEY")||"";
 const url=Deno.env.get("SUPABASE_URL")||"";
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
 if(!url||!serviceKey||!anon)return reply(503,{mensaje:"Configuración incompleta"});
 const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token)return reply(401,{mensaje:"Sesión requerida"});
 const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authError}=await service.auth.getUser(token);
 if(authError||!auth.user?.id)return reply(401,{mensaje:"Sesión inválida"});
 const asUser=createClient(url,anon,{global:{headers:{Authorization:"Bearer "+token}},
   auth:{persistSession:false,autoRefreshToken:false}});
 const {data:admin,error:adminError}=await asUser.rpc("mi_acceso_administrador");
 if(adminError||admin!==true)return reply(403,{mensaje:"Acceso exclusivo de administración global"});
 let body:any={};try{body=await req.json();}catch{return reply(400,{mensaje:"JSON inválido"})}
 const action=body.accion;
 if(!["estado","actualizar"].includes(action))return reply(400,{mensaje:"Acción desconocida"});
 if(action==="actualizar"){
  const {error}=await service.rpc("cimat_102_reconstruir_indice");
  if(error)return reply(500,{mensaje:"No se pudo reconstruir el índice: "+error.message});
 }
 const [{count:total,error:e1},{count:pending,error:e2}]=await Promise.all([
  service.from("cimat_102_indice").select("id",{head:true,count:"exact"}),
  service.from("cimat_102_indice").select("id",{head:true,count:"exact"}).is("embedding",null)
 ]);
 if(e1||e2)return reply(500,{mensaje:"Error consultando estado del índice"});
 let nuevos=0,errores=0;
 if(action==="actualizar" && body.generar_embeddings===true && key){
  const batch=Math.min(Math.max(Number(body.lote)||10,1),20);
  const {data:entries,error:e}=await service.from("cimat_102_indice")
   .select("id,texto_busqueda,fingerprint").is("embedding",null).limit(batch);
  if(e)return reply(500,{mensaje:"No fue posible recuperar los elementos pendientes"});
  for(const x of entries||[]){
   try{
    const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+
      MODEL+":embedContent",{
      method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},
      body:JSON.stringify({model:"models/"+MODEL,
       content:{parts:[{text:String(x.texto_busqueda||"").slice(0,5500)}]},
       taskType:"RETRIEVAL_DOCUMENT",outputDimensionality:768})
    });
    if(!response.ok){errores++;if([401,403,429].includes(response.status))break;continue}
    const val=await response.json();
    const vector=val?.embedding?.values;
    if(!Array.isArray(vector)||vector.length!==768||vector.some((n:any)=>!Number.isFinite(n))){
      errores++;continue;
    }
    const {data:saved,error:writeError}=await service.from("cimat_102_indice")
      .update({embedding:"["+vector.join(",")+"]",embedding_modelo:MODEL})
      .eq("id",x.id).eq("fingerprint",x.fingerprint).select("id");
    if(writeError||!saved?.length)errores++;else nuevos++;
   }catch(_){errores++}
  }
 }
 return reply(200,{mensaje:"Índice consultado",elementos:total||0,
  pendientes_iniciales:pending||0,embeddings_nuevos:nuevos,errores,
  modelo_embedding:MODEL,proveedor_configurado:!!key,
  nota:"Los elementos existentes se conservaron. El índice es derivado; no determina cumplimiento."});
});
