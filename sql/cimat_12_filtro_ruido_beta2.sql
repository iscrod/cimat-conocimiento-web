-- CIMAT beta.2: filtro conservador de ruido textual.
-- Umbral provisional calibrado SOLO con casos ficticios; requiere validación externa.
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
     THEN GREATEST(0.0,1-(c.embedding OPERATOR(extensions.<=>) q.v))::float8 ELSE NULL::float8 END as sim
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
 WHERE s.ranking>=CASE WHEN s.sim IS NULL THEN 0.075 ELSE 0.22 END
 ORDER BY s.ranking DESC,s.nombre
 LIMIT LEAST(GREATEST(p_limite,1),30);
$fn$;
REVOKE ALL ON FUNCTION public.cimat_12_buscar_servicio(text,uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cimat_12_buscar_servicio(text,uuid,text,integer) TO service_role;

