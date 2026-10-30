import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { extractText, getDocumentProxy } from "npm:unpdf@1.8.1";

const originAllowed = "https://iscrod.github.io";
const cors: Record<string,string> = {
  "Access-Control-Allow-Origin": originAllowed,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json; charset=utf-8"
};
function reply(status:number, message:string, extra:Record<string,unknown>={}):Response {
  return new Response(JSON.stringify({ mensaje:message, ...extra }), { status, headers:cors });
}
function candidates(pages:string[], docId:string) {
  const all:Array<{documento_id:string,pagina:number,codigo:string,titulo:string,tipo:string,estado:string}> = [];
  const seen=new Set<string>();
  // REGLAS FORMALES, NO INTERPRETACIÓN SEMÁNTICA NI EVALUACIÓN DE CUMPLIMIENTO.
  // Una coincidencia solo es un encabezado probable pendiente de revisión experta.
  const numeric=/^((?:\d{1,2}\.){0,5}\d{1,2})[.)]?\s+(.{7,150})$/;
  const codes=/^((?:PM|SI|ENG|SUP|MAN)\.\d+(?:\.\d+)*)\s+(.{7,150})$/i;
  for (let i=0;i<pages.length;i++) {
    let perPage=0;
    for (const raw of pages[i].split(/\r?\n/)) {
      const line=raw.replace(/\s+/g," ").trim();
      if (line.length < 9 || line.length > 180 || /^[.\-\d\s]+$/.test(line)) continue;
      const match=numeric.exec(line) || codes.exec(line);
      if (!match) continue;
      const code=match[1], title=match[2]?.trim();
      if (!title || /[.!?]$/.test(title) || /^\d+$/.test(title)) continue;
      const fingerprint=(i+1)+"|"+line.toLowerCase();
      if(seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      all.push({documento_id:docId,pagina:i+1,codigo:code,
        titulo:title.slice(0,300),tipo:"encabezado",estado:"candidato"});
      perPage++;
      if(perPage>=15 || all.length>=300) break;
    }
    if(all.length>=300) break;
  }
  return all;
}

Deno.serve(async (req:Request):Promise<Response> => {
  const origin=req.headers.get("origin");
  if(origin && origin!==originAllowed) return reply(403,"Origen no permitido.");
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST") return reply(405,"Método no permitido.");
  const rawToken=req.headers.get("Authorization") || "";
  if(!/^Bearer [A-Za-z0-9_.-]{30,}$/.test(rawToken))
    return reply(401,"Debes iniciar sesión para procesar documentos.");
  const token=rawToken.substring(7);
  let payload:unknown;
  try {payload=await req.json()} catch {return reply(400,"Solicitud JSON inválida.");}
  const documentoId=(payload && typeof payload==="object" && "documento_id" in payload)
    ? (payload as {documento_id:unknown}).documento_id:null;
  if(typeof documentoId!=="string" || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(documentoId))
    return reply(400,"Identificador documental inválido.");

  const url=Deno.env.get("SUPABASE_URL"), secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    anon=Deno.env.get("SUPABASE_ANON_KEY");
  if(!url || !secret || !anon) return reply(503,"Servicio no configurado.");
  const service=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  try {
    const {data:verified,error:authErr}=await service.auth.getUser(token);
    if(authErr || !verified.user?.id || !verified.user.email_confirmed_at)
      return reply(401,"Sesión inválida o sin confirmar.");
    const caller=createClient(url,anon,{
      global:{headers:{Authorization:"Bearer "+token}},
      auth:{persistSession:false,autoRefreshToken:false}
    });
    const {data:allowed,error:grantErr}=await caller.rpc("mi_acceso_administrador");
    if(grantErr || allowed!==true)
      return reply(403,"Solo administración global puede procesar documentos.");

    const {data:doc,error:docErr}=await service.from("documentos_dominio")
      .select("id,nombre_original,ruta_storage,tipo_mime,tamano_bytes,sha256,uso_autorizado_declarado")
      .eq("id",documentoId).single();
    if(docErr || !doc) return reply(404,"Documento inexistente.");
    if(doc.uso_autorizado_declarado!==true) return reply(403,"Documento sin autorización de uso.");
    if(doc.tipo_mime!=="application/pdf") return reply(415,"En esta versión solo se procesan archivos PDF.");
    if(doc.tamano_bytes > 4*1024*1024) return reply(413,"El procesador inicial admite PDF de hasta 4 MB.");

    const {data:already,error:alreadyErr}=await service.from("documento_analisis")
      .select("total_paginas,paginas_con_texto,candidatos,estado").eq("documento_id",documentoId).maybeSingle();
    if(alreadyErr) return reply(500,"No se pudo consultar el registro del análisis.");
    if(already) return reply(200,"Este archivo ya está indexado. Se conservó la revisión existente.",{...already,ya_procesado:true});

    const {data:blob,error:storageErr}=await service.storage.from("cimat-privado").download(doc.ruta_storage);
    if(storageErr || !blob) return reply(404,"No se encontró el archivo en el almacenamiento privado.");
    if(blob.size>4*1024*1024) return reply(413,"Archivo supera el límite de procesamiento de 4 MB.");
    const bytes=new Uint8Array(await blob.arrayBuffer());
    if(bytes.length<10 || new TextDecoder("ascii").decode(bytes.slice(0,5))!=="%PDF-")
      return reply(422,"El archivo no tiene una estructura PDF reconocible.");
    if(doc.sha256) {
      const digest=await crypto.subtle.digest("SHA-256",bytes);
      const hash=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
      if(hash.toLowerCase()!==String(doc.sha256).toLowerCase())
        return reply(409,"El archivo y su huella SHA-256 no coinciden. Revisa el registro documental.");
    }
    const pdf=await getDocumentProxy(bytes,{maxImageSize:8_388_608,isEvalSupported:false});
    if(pdf.numPages>200) return reply(413,"Esta versión admite documentos de hasta 200 páginas.");
    const extracted=await extractText(pdf);
    const pages=(Array.isArray(extracted.text)?extracted.text:[String(extracted.text || "")])
      .map(s=>String(s).replace(/\u0000/g,"").trim());
    if(pages.length!==pdf.numPages) return reply(500,"No coinciden las páginas extraídas con el PDF.");
    if(pages.some(p=>p.length>60000) || pages.reduce((s,p)=>s+p.length,0)>2_000_000)
      return reply(413,"El texto del documento supera el límite de procesamiento.");

    const rows=pages.map((texto,i)=>({documento_id:documentoId,pagina:i+1,texto}));
    // El texto no se envía a la respuesta: permanece en PostgreSQL con RLS.
    for(let i=0;i<rows.length;i+=20) {
      const {error}=await service.from("documento_paginas").upsert(rows.slice(i,i+20),
        {onConflict:"documento_id,pagina"});
      if(error) throw new Error("No fue posible almacenar el índice por páginas: "+error.code);
    }
    const found=candidates(pages,documentoId);
    for(let i=0;i<found.length;i+=25) {
      const {error}=await service.from("documento_secciones").upsert(found.slice(i,i+25),
        {onConflict:"documento_id,pagina,titulo",ignoreDuplicates:true});
      if(error) throw new Error("No fue posible almacenar los encabezados candidatos: "+error.code);
    }

    const info={documento_id:documentoId,estado:pages.some(p=>p.length>0)?"procesado":"sin_texto",
      total_paginas:pages.length,paginas_con_texto:pages.filter(p=>p.length>0).length,
      caracteres:pages.reduce((s,p)=>s+p.length,0),candidatos:found.length,
      procesado_por:verified.user.id,motor:"unpdf-1.8.1 + reglas-v1"};
    const {error:saveErr}=await service.from("documento_analisis").insert(info);
    if(saveErr) throw new Error("No se pudo confirmar el análisis: "+saveErr.code);
    const {error:auditErr}=await service.from("auditoria").insert({
      actor_id:verified.user.id,accion:"PROCESAR_DOCUMENTO",
      entidad:"documentos_dominio",entidad_id:documentoId,
      detalles:{paginas:pages.length,con_texto:info.paginas_con_texto,candidatos:found.length,motor:info.motor}
    });
    if(auditErr) console.error("Auditoría procesamiento fallida",auditErr.code);
    return reply(200,info.estado==="sin_texto"
      ?"Documento registrado, pero no contiene texto extraíble. Puede requerir OCR."
      :"Texto extraído y encabezados candidatos guardados. Requieren revisión humana.",
      {estado:info.estado,total_paginas:pages.length,paginas_con_texto:info.paginas_con_texto,
        caracteres:info.caracteres,candidatos:found.length});
  } catch(err) {
    console.error("Error de análisis",err instanceof Error?err.message:"desconocido");
    return reply(500,"No fue posible procesar el PDF. Revisa si está protegido, dañado o es compatible con el motor de extracción.");
  }
});
