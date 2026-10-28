/* CIMAT Web v0.1.2 - prototipo sin dependencias externas de JavaScript.
 * API de autenticacion Supabase Auth y consultas PostgREST.
 * Solo utiliza clave PUBLICA y JWT del usuario; RLS protege los datos.
 * La sesion se conserva temporalmente en sessionStorage, no en GitHub.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const config = window.CIMAT_CONFIG || {};
  const root = String(config.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(config.SUPABASE_PUBLISHABLE_KEY || '');
  const storageKey = 'cimat_v012_sesion';
  let currentSession = null;

  function visible(id, yes) {
    const element = $(id);
    if (element) element.classList.toggle('hidden', !yes);
  }

  function notice(message) {
    $('notice').textContent = message || '';
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  async function api(path, options) {
    const opts = options || {};
    const headers = { 'apikey': key, 'Accept': 'application/json' };
    if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(root + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: 'no-store'
    });

    const raw = await response.text();
    let data = {};
    if (raw) {
      try { data = JSON.parse(raw); } catch (_) { data = {}; }
    }
    if (!response.ok) {
      const detail = data.error_description || data.msg || data.message || '';
      throw new Error('HTTP ' + response.status + (detail ? ': ' + detail : ''));
    }
    return data;
  }

  function readSession() {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (!stored) return null;
      const session = JSON.parse(stored);
      if (session && session.access_token && session.user && session.user.id &&
          Date.now() < session.expires_at) return session;
    } catch (_) {}
    return null;
  }

  function saveSession(session) {
    currentSession = session;
    try { sessionStorage.setItem(storageKey, JSON.stringify(session)); } catch (_) {}
  }

  function clearSession() {
    currentSession = null;
    try { sessionStorage.removeItem(storageKey); } catch (_) {}
  }

  function showLogin() {
    visible('login', true);
    visible('workspace', false);
    $('password').value = '';
  }

  function renderList(id, rows, template, emptyMessage) {
    $(id).innerHTML = rows.length ? rows.map(template).join('') : escapeHTML(emptyMessage);
  }

  async function renderWorkspace(session) {
    visible('login', false);
    visible('setup', false);
    visible('workspace', true);
    $('identity').textContent = session.user.email || 'Usuario autenticado';
    $('profile').textContent = 'Cargando...';
    $('companies').textContent = 'Cargando...';
    $('reports').textContent = 'Cargando...';
    notice('');

    const queries = [
      '/rest/v1/perfiles?select=nombre,apellidos,fecha_registro&id=eq.' +
        encodeURIComponent(session.user.id) + '&limit=1',
      '/rest/v1/empresas?select=id,nombre,sector,estado&order=nombre.asc',
      '/rest/v1/informes_empresa?select=id,titulo,resumen_consolidado,participantes_grupo,empresa_id&order=creado_en.desc&limit=30'
    ];
    const results = await Promise.allSettled(
      queries.map((url) => api(url, { token: session.access_token }))
    );

    if (results[0].status === 'fulfilled') {
      const profile = results[0].value[0];
      $('profile').textContent = profile
        ? ([profile.nombre, profile.apellidos].filter(Boolean).join(' ') || 'Perfil registrado sin nombre')
        : 'No se encontro un perfil visible.';
    } else {
      $('profile').textContent = 'No fue posible consultar el perfil. Revisa permisos o conexion.';
    }

    if (results[1].status === 'fulfilled') {
      renderList('companies', results[1].value, function (e) {
        return '<div class="item"><strong>' + escapeHTML(e.nombre) +
          '</strong><p>' + escapeHTML(e.sector) + ' · ' +
          escapeHTML(e.estado) + '</p></div>';
      }, 'No hay empresas asignadas a este usuario.');
    } else {
      $('companies').textContent = 'No fue posible consultar las empresas. Revisa los permisos RLS.';
    }

    if (results[2].status === 'fulfilled') {
      renderList('reports', results[2].value, function (r) {
        return '<div class="item"><strong>' + escapeHTML(r.titulo) +
          '</strong><p>' + escapeHTML(r.resumen_consolidado) + '</p></div>';
      }, 'Todavia no hay informes aprobados para esta cuenta.');
    } else {
      $('reports').textContent = 'Informes no disponibles: consulta restringida o error de conexion.';
    }
  }

  const validConfig = /^https:\/\/[a-z0-9.-]+$/i.test(root) &&
                      /^(sb_publishable_|eyJ)/.test(key);

  if (!validConfig) {
    visible('setup', true);
    visible('login', false);
    notice('Falta configurar la URL o la clave publica de Supabase.');
    return;
  }

  // El formulario ya es visible por defecto en index.html.
  $('login-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    const button = $('login-form').querySelector('button[type="submit"]');
    button.disabled = true;
    notice('Comprobando credenciales...');
    try {
      const response = await api('/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: { email: $('email').value.trim(), password: $('password').value }
      });
      if (!response.access_token || !response.user || !response.user.id) {
        throw new Error('Respuesta de autenticacion incompleta.');
      }
      const session = {
        access_token: response.access_token,
        user: { id: response.user.id, email: response.user.email },
        expires_at: Date.now() + Math.max(60, (response.expires_in || 3600) - 60) * 1000
      };
      saveSession(session);
      $('password').value = '';
      await renderWorkspace(session);
    } catch (error) {
      console.error('CIMAT: fallo de autenticacion', error.message);
      notice('No fue posible iniciar sesion (' + error.message +
        '). Verifica las credenciales y el acceso a Supabase.');
      $('password').value = '';
    } finally {
      button.disabled = false;
    }
  });

  $('logout').addEventListener('click', async function () {
    const token = currentSession && currentSession.access_token;
    clearSession();
    showLogin();
    notice('Sesion cerrada.');
    if (token) {
      try { await api('/auth/v1/logout', { method: 'POST', token: token }); }
      catch (_) { /* La sesion del navegador ya se elimino. */ }
    }
  });

  const existingSession = readSession();
  if (existingSession) {
    currentSession = existingSession;
    renderWorkspace(existingSession).catch(function (error) {
      clearSession();
      showLogin();
      notice('La sesion anterior no pudo recuperarse: ' + error.message);
    });
  } else {
    clearSession();
    showLogin();
  }
})();
