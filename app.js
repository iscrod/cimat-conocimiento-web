import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
const $ = id => document.getElementById(id);
const config = window.CIMAT_CONFIG ?? {};
const ready = /^https:\/\//.test(config.SUPABASE_URL || '') && /^(sb_publishable_|eyJ)/.test(config.SUPABASE_PUBLISHABLE_KEY || '');
const show = (id, yes) => $(id).classList.toggle('hidden', !yes);
const notify = message => { $('notice').textContent = message || ''; };
const safe = value => String(value ?? '').replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let supabase;
if (!ready) { show('setup',true); }
else {
  supabase = createClient(config.SUPABASE_URL,config.SUPABASE_PUBLISHABLE_KEY);
  $('login-form').addEventListener('submit',async event=>{
    event.preventDefault();notify('');
    const {error}=await supabase.auth.signInWithPassword({email:$('email').value,password:$('password').value});
    $('password').value='';
    if(error)notify('No se pudo iniciar sesión. Verifica tus credenciales.');
  });
  $('logout').addEventListener('click',async()=>{await supabase.auth.signOut();});
  supabase.auth.onAuthStateChange((_event,session)=>{window.setTimeout(()=>render(session),0);});
  supabase.auth.getSession().then(({data})=>render(data.session)).catch(()=>notify('No se pudo comprobar la sesión.'));
}
async function render(session){
  show('login',!session);show('workspace',!!session);notify('');
  if(!session)return;
  $('identity').textContent=session.user.email ?? 'Usuario';
  const [profile, companies, reports]=await Promise.all([
    supabase.from('perfiles').select('nombre,apellidos,fecha_registro').eq('id',session.user.id).maybeSingle(),
    supabase.from('empresas').select('id,nombre,sector,estado').order('nombre'),
    supabase.from('informes_empresa').select('id,titulo,resumen_consolidado,participantes_grupo,empresa_id').order('creado_en',{ascending:false}).limit(30)
  ]);
  $('profile').textContent=profile.error?'Sin permiso para consultar el perfil.':profile.data?[profile.data.nombre,profile.data.apellidos].filter(Boolean).join(' ')||'Perfil sin nombre configurado':'Perfil no disponible';
  if(companies.error){$('companies').textContent='No se pudo consultar empresas: revisa permisos RLS.';}
  else {$('companies').innerHTML=companies.data.length?companies.data.map(e=>`<div class="item"><strong>${safe(e.nombre)}</strong><p>${safe(e.sector)} · ${safe(e.estado)}</p></div>`).join(''):'No hay empresas disponibles para este usuario.';}
  if(reports.error){$('reports').textContent='Informes no disponibles: acceso restringido o falta configurar permisos.';}
  else {$('reports').innerHTML=reports.data.length?reports.data.map(r=>`<div class="item"><strong>${safe(r.titulo)}</strong><p>${safe(r.resumen_consolidado)}</p></div>`).join(''):'No existen informes aprobados visibles para esta cuenta.';}
}
