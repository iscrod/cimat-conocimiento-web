/* CIMAT v0.8.2a: auditoría determinista, no modifica registros.
   Las alertas son hipótesis de revisión, no decisiones de conformidad. */
(function (root) {
  "use strict";
  const categories = {
    jerarquia:"Jerarquía", duplicados:"Posibles duplicados",
    relaciones:"Relaciones", fuentes:"Evidencias", cobertura:"Cobertura"
  };
  const priorities = {alta:0,media:1,baja:2};
  function normalize(text) {
    return String(text||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLocaleLowerCase("es").replace(/\[[^\]]*\]/g," ")
      .replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
  }
  function titleKey(text) {
    return normalize(text).split(" ").filter(x=>x && !new Set(["de","del","la","el","los","las","un","una","al"]).has(x)).join(" ");
  }
  function audit({elements=[],relations=[],evidence=[],domainLabel=""}) {
    const nodes=elements.filter(n=>n.estado!=="descartado");
    const edges=relations.filter(e=>e.estado!=="descartado");
    const byId=new Map(nodes.map(n=>[n.id,n]));
    const proof=new Map();
    for(const e of evidence) {
      if(!proof.has(e.elemento_id))proof.set(e.elemento_id,[]);
      proof.get(e.elemento_id).push(e);
    }
    const iso29110=/29110/.test(domainLabel);
    const issues=[],keys=new Set();
    function add(category,severity,title,detail,proposal,elementId=null,relationId=null,page=null,otherId=null) {
      const key=[category,title,elementId,relationId,otherId].join("|");
      if(keys.has(key))return;
      keys.add(key);
      issues.push({id:key,category,severity,title,detail,proposal,elementId,relationId,otherId,
        page:page || (elementId&&byId.get(elementId)?.pagina) || null});
    }
    const structural=new Map();
    for(const n of nodes) {
      const code=String(n.codigo||"").trim().toUpperCase();
      const rank=/^(GP|IS)(?:\.(\d+))?(?:\.(\d+))?$/.exec(code);
      if(rank && iso29110){
        const expected=rank[3]?"tarea":rank[2]?"actividad":"proceso";
        if(n.tipo!==expected && !["rol","producto","componente"].includes(n.tipo)) {
          add("jerarquia","alta",code+" · clasificación incompatible con la numeración",
            "Registrado como «"+n.tipo+"». En el esquema GP/IS del perfil básico, este código corresponde a «"+expected+"».",
            "Contrastar la tabla de origen y reclasificar solo con evidencia.",n.id,null,n.pagina);
        }
        if(["proceso","actividad","tarea"].includes(n.tipo)) {
          if(!structural.has(code))structural.set(code,[]);
          structural.get(code).push(n);
        }
      }
      if(iso29110 && ["proceso","actividad"].includes(n.tipo) &&
         /^(?:TABLA|FIGURA)\s*\d+/i.test(code)) {
        add("jerarquia","media",code+" · identificador editorial",
          "Este código parece identificar una tabla o figura y no un proceso/actividad.",
          "Conservar la referencia documental y comprobar el código normativo real.",n.id);
      }
      if(iso29110 && n.tipo==="proceso" && /^\d+(?:\.\d+){1,3}$/.test(code)) {
        add("jerarquia","media",code+" · posible referencia externa",
          "El código numérico no sigue la nomenclatura de los procesos principales GP/IS. Puede ser una referencia a otra norma o un apartado.",
          "Verificar en el PDF si pertenece al perfil básico o solamente se menciona como referencia.",n.id);
      }
      const refs=proof.get(n.id)||[];
      if(refs.length===0 && !/cita literal:/i.test(n.descripcion||"")) {
        add("fuentes","media",(code||n.titulo)+" · sin cita registrada",
          "La ficha carece de una cita textual en la tabla de evidencias, aunque puede contar con página de origen.",
          "Comprobar la página y registrar la evidencia documental antes de aprobar.",n.id);
      }
      if(!n.documento_id || !Number.isInteger(n.pagina) || n.pagina<1) {
        add("fuentes","media",(code||n.titulo)+" · referencia incompleta",
          "No tiene documento y página física asociados de forma completa.",
          "Asociar la edición documental y la página de donde procede la información.",n.id);
      }
    }
    if(iso29110){
      for(const [code,arr] of structural) {
        const kinds=[...new Set(arr.filter(n=>["proceso","actividad","tarea"].includes(n.tipo)).map(n=>n.tipo))];
        if(kinds.length>1) {
          add("jerarquia","alta",code+" · conflicto de categorías",
            arr.map(n=>n.tipo+": "+n.titulo).join(" | "),
            "Revisar la tabla de actividades y conservar una clasificación canónica por código.",arr[0]?.id,null,arr[0]?.pagina,arr[1]?.id);
        }
      }
      for(const prefix of ["GP","IS"]) {
        const max=prefix==="GP"?4:6;
        for(let i=1;i<=max;i++){
          const code=prefix+"."+i;
          if(!nodes.some(n=>String(n.codigo||"").toUpperCase()===code && n.tipo==="actividad")){
            const alternative=nodes.find(n=>String(n.codigo||"").toUpperCase()===code);
            add("cobertura","alta",code+" · actividad no registrada correctamente",
              alternative?"Existe una ficha con ese código, pero su tipo es «"+alternative.tipo+"».":"No existe una ficha de actividad con este código en el modelo extraído.",
              "Verificar la sección de actividades del PDF y corregir o agregar la ficha.",alternative?.id||null,null,alternative?.pagina||null);
          }
        }
      }
      const taskGroups=new Map();
      for(const n of nodes) {
        const m=/^(GP|IS)\.(\d+)\.(\d+)$/i.exec(String(n.codigo||""));
        if(!m || n.tipo!=="tarea")continue;
        const group=m[1].toUpperCase()+"."+m[2];
        if(!taskGroups.has(group))taskGroups.set(group,[]);
        taskGroups.get(group).push({n,number:Number(m[3])});
      }
      for(const [group,tasks] of taskGroups) {
        const parent=nodes.find(n=>String(n.codigo||"").toUpperCase()===group && n.tipo==="actividad");
        if(!parent) {
          add("jerarquia","alta",group+" · tareas sin actividad válida",
            "Se encontraron "+tasks.length+" tarea(s) codificadas bajo "+group+", pero no hay ficha de actividad correctamente clasificada.",
            "Revisar la actividad de origen y vincular las tareas mediante «contiene».",tasks[0].n.id,null,tasks[0].n.pagina);
        }
        if(tasks.length>=2){
          const seen=new Set(tasks.map(t=>t.number));
          const max=Math.min(100,Math.max(...seen));
          const missing=[];
          for(let i=1;i<=max;i++)if(!seen.has(i))missing.push(group+"."+i);
          if(missing.length){
            add("cobertura","media",group+" · posibles tareas faltantes",
              "Códigos intermedios ausentes del modelo: "+missing.join(", ")+". La ausencia en el modelo no demuestra ausencia en la norma.",
              "Consultar la tabla de tareas de la actividad y recuperar las fichas no extraídas.",parent?.id||tasks[0].n.id);
          }
        }
      }
    }
    // Coincidencia exacta o canónica del título. No se fusionan estados de producto.
    const groups=new Map();
    for(const n of nodes) {
      const key=n.tipo+"|"+titleKey(n.titulo);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(n);
    }
    for(const arr of groups.values()) {
      if(arr.length<2 || !titleKey(arr[0].titulo) || titleKey(arr[0].titulo).length<5)continue;
      const first=arr[0],second=arr[1];
      add("duplicados","media",first.titulo+" · "+arr.length+" fichas similares",
        arr.map(n=>(n.codigo||"s/c")+" · "+n.titulo+" (PDF pág. "+(n.pagina||"?")+")").join(" | "),
        "Comparar contenido, función, estados y fuentes. Unificar solo si representan la misma entidad.",first.id,null,first.pagina,second.id);
    }
    const incidence=new Map();
    for(const e of edges) {
      incidence.set(e.origen_id,(incidence.get(e.origen_id)||0)+1);
      incidence.set(e.destino_id,(incidence.get(e.destino_id)||0)+1);
      const src=byId.get(e.origen_id),dest=byId.get(e.destino_id);
      if(!src||!dest) {
        add("relaciones","alta","Relación con elemento no disponible",
          "El vínculo apunta a un elemento descartado o inexistente.",
          "Revisar extremos del vínculo.",null,e.id,e.pagina);
        continue;
      }
      const a=src.tipo,b=dest.tipo;
      let conflict=false;
      if(e.tipo==="contiene"){
        conflict=iso29110 && !((a==="proceso"&&b==="actividad") ||
          (a==="actividad"&&b==="tarea") || (a==="producto"&&b==="componente"));
      }else if(e.tipo==="participa"){
        conflict=(a!=="rol"||!["proceso","actividad","tarea"].includes(b));
      }else if(e.tipo==="ejecuta"){
        conflict=(a!=="rol"||!["actividad","tarea"].includes(b));
      }else if(["utiliza","genera","actualiza"].includes(e.tipo)){
        conflict=!(["proceso","actividad","tarea"].includes(a)&&["producto","componente"].includes(b));
      }else if(e.tipo==="precede"){
        conflict=!(["actividad","tarea"].includes(a)&&["actividad","tarea"].includes(b));
      }
      if(conflict){
        add("relaciones","alta","Relación «"+e.tipo+"» por revisar",
          (src.codigo||src.titulo)+" ["+a+"] → "+(dest.codigo||dest.titulo)+" ["+b+"]",
          "Comprobar orientación y semántica en la página original. No invertir ni eliminar automáticamente.",src.id,e.id,e.pagina);
      }
      if(!e.documento_id || !Number.isInteger(e.pagina) || e.pagina<1 ||
         !/cita literal:/i.test(e.detalle||"")) {
        add("fuentes","media","Relación sin evidencia verificable",
          (src.codigo||src.titulo)+" → "+e.tipo+" → "+(dest.codigo||dest.titulo)+
            ". Falta la cita textual y/o la referencia documental completa.",
          "Verificar el vínculo y completar la cita, documento y página.",src.id,e.id,e.pagina);
      }
    }
    for(const n of nodes) {
      if(["proceso","actividad","tarea","producto","rol"].includes(n.tipo) && !incidence.has(n.id)){
        add("relaciones","baja",(n.codigo||n.titulo)+" · elemento aislado",
          "No tiene relaciones activas en el modelo; puede faltar una conexión o ser una referencia externa.",
          "Comprobar si debe relacionarse con actividad, tarea, rol o producto.",n.id);
      }
    }
    issues.sort((a,b)=>priorities[a.severity]-priorities[b.severity] ||
      a.category.localeCompare(b.category,"es") || a.title.localeCompare(b.title,"es"));
    return {issues,summary:{
      elements:nodes.length,relations:edges.length,evidence:evidence.length,
      total:issues.length,high:issues.filter(x=>x.severity==="alta").length,
      medium:issues.filter(x=>x.severity==="media").length,
      low:issues.filter(x=>x.severity==="baja").length,
      scope:iso29110?"ISO/IEC 29110":"General"
    },categories};
  }
  root.CIMAT_AUDITORIA_CORE={audit,categories};
})(window);
