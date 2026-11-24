-- CIMAT beta.2: resultados reproducibles por caso y control de evidencia humana.
ALTER TABLE public.cimat_12_resultados_piloto
 ADD COLUMN IF NOT EXISTS positivos integer,
 ADD COLUMN IF NOT EXISTS controles_negativos integer,
 ADD COLUMN IF NOT EXISTS alertas_negativas integer;

CREATE TABLE IF NOT EXISTS public.cimat_12_recuperaciones_piloto (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 resultado_id uuid NOT NULL REFERENCES public.cimat_12_resultados_piloto(id) ON DELETE CASCADE,
 caso_id uuid NOT NULL REFERENCES public.cimat_12_casos_piloto(id) ON DELETE RESTRICT,
 catalogo_id uuid NOT NULL REFERENCES public.cimat_12_catalogo(id) ON DELETE RESTRICT,
 posicion integer NOT NULL CHECK(posicion BETWEEN 1 AND 30),
 puntaje numeric(10,6) NOT NULL,
 creado_en timestamptz NOT NULL DEFAULT now(),
 UNIQUE(resultado_id,caso_id,posicion),
 UNIQUE(resultado_id,caso_id,catalogo_id)
);
ALTER TABLE public.cimat_12_recuperaciones_piloto ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cimat_12_recuperaciones_piloto FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE public.cimat_12_recuperaciones_piloto IS
 'Fotografía de los rankings por caso sintético y ejecución. No son etiquetas de verdad ni juicios humanos.';
COMMENT ON COLUMN public.cimat_12_resultados_piloto.alertas_negativas IS
 'Número de controles sintéticos sin referencia esperada en los que apareció algún candidato; no tasa general de falsos positivos.';
