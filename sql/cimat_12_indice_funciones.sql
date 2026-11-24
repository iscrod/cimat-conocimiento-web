-- CIMAT beta.2: indexador reproducible de la Biblioteca y búsqueda híbrida.
ALTER TABLE public.cimat_12_catalogo ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.cimat_12_reindexar_servicio()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_time timestamptz := clock_timestamp(); v_total int; v_links int;
BEGIN
 PERFORM pg_advisory_xact_lock(122901);
 -- Solo el rol service_role puede invocar esta función; ningún usuario tiene EXECUTE.
 WITH fuentes AS (
  SELECT dominio_id, 'proceso'::text tipo,id origen_id,nombre,coalesce(descripcion,'') descripcion,
         coalesce(codigo,'') codigo,documento_id,pagina,'explicito'::text naturaleza
  FROM public.cimat_0852_procesos
  UNION ALL
  SELECT dominio_id,'actividad',id,nombre,coalesce(descripcion,''),coalesce(codigo,''),documento_id,pagina,'explicito'
  FROM public.cimat_0852_actividades
  UNION ALL
  SELECT dominio_id,'tarea',id,nombre,coalesce(descripcion,''),coalesce(codigo,''),documento_id,pagina,'explicito'
  FROM public.cimat_0852_tareas
  UNION ALL
  SELECT dominio_id,'producto',id,nombre,coalesce(descripcion,''),''::text,documento_id,pagina,'explicito'
  FROM public.cimat_0852_productos
  UNION ALL
  SELECT r.dominio_id,'rol',r.rol_id,rr.nombre,coalesce(r.funcion_local,rr.funcion,''),
   coalesce(rr.abreviatura,''),r.documento_id,r.pagina,'explicito'
  FROM public.cimat_0852_roles_dominios r JOIN public.cimat_0852_roles rr ON rr.id=r.rol_id
  UNION ALL
  SELECT dominio_id,'caracteristica',id,nombre,coalesce(descripcion,''),'',documento_id,pagina,'explicito'
  FROM public.cimat_0852_caracteristicas
  UNION ALL
  SELECT dominio_id,'practica',id,nombre,coalesce(descripcion,''),'',documento_id,pagina,
   CASE WHEN naturaleza='explicita' THEN 'explicito' ELSE 'interpretado' END
  FROM public.cimat_12_practicas
  UNION ALL
  SELECT dominio_id,'criterio',id,'Criterio: '||left(texto,160),texto,'',documento_id,pagina,
    CASE WHEN naturaleza='explicito' THEN 'explicito' ELSE 'interpretado' END
  FROM public.cimat_12_criterios
 )
 INSERT INTO public.cimat_12_catalogo(dominio_id,origen_tipo,origen_id,nombre,descripcion,codigo,
   documento_id,pagina,naturaleza,texto_busqueda,huella,indexado_en,activo)
 SELECT f.dominio_id,f.tipo,f.origen_id,f.nombre,f.descripcion,f.codigo,
  f.documento_id,f.pagina,f.naturaleza,
  concat_ws(' ',f.nombre,f.codigo,f.descripcion,
    (SELECT string_agg(a.termino,' ') FROM public.cimat_12_alias a
       JOIN public.cimat_12_catalogo old ON old.id=a.catalogo_id
       WHERE old.dominio_id=f.dominio_id AND old.origen_tipo=f.tipo AND old.origen_id=f.origen_id)),
  md5(concat_ws('|',f.nombre,f.codigo,f.descripcion,f.naturaleza,coalesce(f.documento_id::text,''),coalesce(f.pagina::text,''))),
  v_time,true
 FROM fuentes f
 JOIN public.dominios_conocimiento d ON d.id=f.dominio_id AND d.estado='registrado'
 ON CONFLICT(dominio_id,origen_tipo,origen_id) DO UPDATE
 SET nombre=EXCLUDED.nombre,descripcion=EXCLUDED.descripcion,codigo=EXCLUDED.codigo,
  documento_id=EXCLUDED.documento_id,pagina=EXCLUDED.pagina,naturaleza=EXCLUDED.naturaleza,
  texto_busqueda=EXCLUDED.texto_busqueda,
  embedding=CASE WHEN public.cimat_12_catalogo.huella=EXCLUDED.huella
       THEN public.cimat_12_catalogo.embedding ELSE NULL END,
  modelo_embedding=CASE WHEN public.cimat_12_catalogo.huella=EXCLUDED.huella
       THEN public.cimat_12_catalogo.modelo_embedding ELSE NULL END,
  embedding_actualizado=CASE WHEN public.cimat_12_catalogo.huella=EXCLUDED.huella
       THEN public.cimat_12_catalogo.embedding_actualizado ELSE NULL END,
  huella=EXCLUDED.huella,indexado_en=EXCLUDED.indexado_en,activo=true;
 UPDATE public.cimat_12_catalogo SET activo=false,embedding=NULL,modelo_embedding=NULL
 WHERE indexado_en < v_time AND activo;

 -- Los enlaces son derivados. Se vuelven a generar, sin tocar los registros originales.
 DELETE FROM public.cimat_12_enlaces;
 INSERT INTO public.cimat_12_enlaces(origen_id,destino_id,relacion)
 SELECT t.id,p.id,r.flujo FROM public.cimat_0852_tareas_productos r
 JOIN public.cimat_12_catalogo t ON t.dominio_id=r.dominio_id AND t.origen_tipo='tarea' AND t.origen_id=r.tarea_id AND t.activo
 JOIN public.cimat_12_catalogo p ON p.dominio_id=r.dominio_id AND p.origen_tipo='producto' AND p.origen_id=r.producto_id AND p.activo
 ON CONFLICT DO NOTHING;
 INSERT INTO public.cimat_12_enlaces(origen_id,destino_id,relacion)
 SELECT r.id,t.id,'participa' FROM public.cimat_0852_tareas_roles x
 JOIN public.cimat_12_catalogo r ON r.dominio_id=x.dominio_id AND r.origen_tipo='rol' AND r.origen_id=x.rol_id AND r.activo
 JOIN public.cimat_12_catalogo t ON t.dominio_id=x.dominio_id AND t.origen_tipo='tarea' AND t.origen_id=x.tarea_id AND t.activo
 ON CONFLICT DO NOTHING;
 INSERT INTO public.cimat_12_enlaces(origen_id,destino_id,relacion)
 SELECT p.id,a.id,'contiene' FROM public.cimat_0852_actividades x
 JOIN public.cimat_12_catalogo a ON a.dominio_id=x.dominio_id AND a.origen_tipo='actividad' AND a.origen_id=x.id AND a.activo
 JOIN public.cimat_12_catalogo p ON p.dominio_id=x.dominio_id AND p.origen_tipo='proceso' AND p.origen_id=x.proceso_id AND p.activo
 ON CONFLICT DO NOTHING;
 INSERT INTO public.cimat_12_enlaces(origen_id,destino_id,relacion)
 SELECT a.id,t.id,'contiene' FROM public.cimat_0852_tareas x
 JOIN public.cimat_12_catalogo t ON t.dominio_id=x.dominio_id AND t.origen_tipo='tarea' AND t.origen_id=x.id AND t.activo
 JOIN public.cimat_12_catalogo a ON a.dominio_id=x.dominio_id AND a.origen_tipo='actividad' AND a.origen_id=x.actividad_id AND a.activo
 ON CONFLICT DO NOTHING;
 INSERT INTO public.cimat_12_enlaces(origen_id,destino_id,relacion)
 SELECT a.id,b.id,'precede' FROM public.cimat_0852_precedencias x
 JOIN public.cimat_12_catalogo a ON a.dominio_id=x.dominio_id AND a.origen_tipo='tarea' AND a.origen_id=x.anterior_id AND a.activo
 JOIN public.cimat_12_catalogo b ON b.dominio_id=x.dominio_id AND b.origen_tipo='tarea' AND b.origen_id=x.siguiente_id AND b.activo
 ON CONFLICT DO NOTHING;
 INSERT INTO public.cimat_12_enlaces(origen_id,destino_id,relacion)
 SELECT p.id,c.id,'caracteriza' FROM public.cimat_0852_caracteristicas x
 JOIN public.cimat_12_catalogo p ON p.dominio_id=x.dominio_id AND p.origen_tipo='producto' AND p.origen_id=x.producto_id AND p.activo
 JOIN public.cimat_12_catalogo c ON c.dominio_id=x.dominio_id AND c.origen_tipo='caracteristica' AND c.origen_id=x.id AND c.activo
 ON CONFLICT DO NOTHING;
 INSERT INTO public.cimat_12_enlaces(origen_id,destino_id,relacion)
 SELECT t.id,c.id,'evalua' FROM public.cimat_12_criterios x
 JOIN public.cimat_12_catalogo t ON t.dominio_id=x.dominio_id AND t.origen_tipo=x.objetivo_tipo AND t.origen_id=x.objetivo_id AND t.activo
 JOIN public.cimat_12_catalogo c ON c.dominio_id=x.dominio_id AND c.origen_tipo='criterio' AND c.origen_id=x.id AND c.activo
 ON CONFLICT DO NOTHING;
 SELECT count(*) INTO v_total FROM public.cimat_12_catalogo WHERE activo;
 SELECT count(*) INTO v_links FROM public.cimat_12_enlaces;
 RETURN jsonb_build_object('indexados',v_total,'relaciones',v_links,'actualizado',v_time,
   'sin_vector',(SELECT count(*) FROM public.cimat_12_catalogo WHERE activo AND embedding IS NULL));
END; $fn$;
REVOKE ALL ON FUNCTION public.cimat_12_reindexar_servicio() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cimat_12_reindexar_servicio() TO service_role;

-- Consultar candidatos del índice sin exponer tablas. La identidad se verifica en la Edge Function.
CREATE OR REPLACE FUNCTION public.cimat_12_buscar_servicio(
 p_consulta text,p_usuario uuid,p_embedding text DEFAULT NULL,p_limite integer DEFAULT 12
)
RETURNS TABLE(catalogo_id uuid,origen_id uuid,dominio_id uuid,origen_tipo text,nombre text,
 descripcion text,codigo text,modelo text,edicion text,documento_id uuid,pagina integer,
 naturaleza text,puntaje double precision,similitud double precision,relaciones jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
 WITH q AS (SELECT websearch_to_tsquery('spanish'::regconfig,left(coalesce(p_consulta,''),450)) as t,
  CASE WHEN p_embedding IS NOT NULL THEN p_embedding::extensions.vector(768) ELSE NULL::extensions.vector(768) END as v),
 ranked AS (
 SELECT c.*,d.titulo as modelo,d.edicion,
   CASE WHEN c.fts @@ q.t THEN ts_rank_cd(c.fts,q.t) ELSE 0 END::float8 as ft,
   extensions.similarity(left(c.nombre,450),left(p_consulta,450))::float8 as tr,
   CASE WHEN q.v IS NOT NULL AND c.embedding IS NOT NULL
     THEN GREATEST(0.0,1-(c.embedding <=> q.v))::float8 ELSE NULL::float8 END as sim
 FROM public.cimat_12_catalogo c
 JOIN public.dominios_conocimiento d ON d.id=c.dominio_id
 CROSS JOIN q
 WHERE c.activo AND d.estado='registrado'
   AND (d.empresa_id IS NULL OR EXISTS (
      SELECT 1 FROM public.usuario_empresa_rol u JOIN public.empresas e ON e.id=u.empresa_id
      WHERE u.empresa_id=d.empresa_id AND u.usuario_id=p_usuario AND u.activo AND e.activa))
 ),
 scored AS (
 SELECT *,CASE WHEN sim IS NULL THEN (0.65*LEAST(1,ft)+0.35*tr)
    ELSE (0.70*sim+0.20*LEAST(1,ft)+0.10*tr) END AS ranking
 FROM ranked
 )
 SELECT s.id,s.origen_id,s.dominio_id,s.origen_tipo,s.nombre,s.descripcion,s.codigo,
   s.modelo,s.edicion,s.documento_id,s.pagina,s.naturaleza,s.ranking,s.sim,
   (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',l.relacion,
        'id',related.id,'nombre',related.nombre,'origen_tipo',related.origen_tipo)
        ORDER BY l.relacion,related.nombre),'[]'::jsonb)
     FROM public.cimat_12_enlaces l JOIN public.cimat_12_catalogo related ON
      (related.id=l.origen_id OR related.id=l.destino_id)
     WHERE (l.origen_id=s.id OR l.destino_id=s.id) AND related.id<>s.id AND related.activo
   ) AS relaciones
 FROM scored s
 WHERE s.ranking>=CASE WHEN s.sim IS NULL THEN 0.015 ELSE 0.22 END
 ORDER BY s.ranking DESC,s.nombre
 LIMIT LEAST(GREATEST(p_limite,1),30);
$fn$;
REVOKE ALL ON FUNCTION public.cimat_12_buscar_servicio(text,uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cimat_12_buscar_servicio(text,uuid,text,integer) TO service_role;

-- Actualización de un vector: servicio únicamente, longitud fija garantizada por el tipo.
CREATE OR REPLACE FUNCTION public.cimat_12_vector_servicio(
 p_id uuid,p_vector text,p_modelo text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
 UPDATE public.cimat_12_catalogo SET
  embedding=p_vector::extensions.vector(768),modelo_embedding=left(p_modelo,120),
  embedding_actualizado=clock_timestamp()
 WHERE id=p_id AND activo;
 RETURN FOUND;
END $fn$;
REVOKE ALL ON FUNCTION public.cimat_12_vector_servicio(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cimat_12_vector_servicio(uuid,text,text) TO service_role;

-- Administración por Edge con Auth validada. Ninguna API client de búsqueda directa.
