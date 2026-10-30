/* CIMAT Web v0.4.0 - prototipo sin dependencias externas de JavaScript.
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
  let adminCompanies = [];
  let adminUsers = [];

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
    if (opts.prefer) headers['Prefer'] = opts.prefer;

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
    $('company-count').textContent = '—';
    $('report-count').textContent = '—';
    $('companies-preview').textContent = 'Consultando permisos...';
    $('profile-status').textContent = '';
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
        : 'No se encontró un perfil visible.';
      $('profile-name').value = profile?.nombre || '';
      $('profile-surname').value = profile?.apellidos || '';
      $('profile-form').querySelector('button').disabled = !profile;
    } else {
      $('profile').textContent = 'No fue posible consultar el perfil: revisa los permisos.';
      $('profile-form').querySelector('button').disabled = true;
    }

    if (results[1].status === 'fulfilled') {
      const companies = results[1].value;
      $('company-count').textContent = String(companies.length);
      $('companies-preview').textContent = companies.length
        ? companies.map((e) => e.nombre).join(' · ')
        : 'No tienes empresas asignadas.';
      renderList('companies', companies, function (e) {
        return '<div class="item"><strong>' + escapeHTML(e.nombre) +
          '</strong><p>' + escapeHTML(e.sector) + ' · ' +
          escapeHTML(e.estado) + '</p></div>';
      }, 'No hay empresas asignadas a este usuario.');
    } else {
      $('company-count').textContent = '—';
      $('companies-preview').textContent = 'Consulta restringida.';
      $('companies').textContent = 'No fue posible consultar las empresas. Revisa los permisos RLS.';
    }

    if (results[2].status === 'fulfilled') {
      const reports = results[2].value;
      $('report-count').textContent = String(reports.length);
      renderList('reports', reports, function (r) {
        return '<div class="item"><strong>' + escapeHTML(r.titulo) +
          '</strong><p>' + escapeHTML(r.resumen_consolidado) + '</p></div>';
      }, 'Todavía no hay informes aprobados para esta cuenta.');
    } else {
      $('report-count').textContent = '—';
      $('reports').textContent = 'Informes no disponibles: consulta restringida o error de conexión.';
    }
    await checkAdministrator(session);

  }

  // El cambio de pestaña modifica solamente la presentación, nunca los permisos.
  document.querySelectorAll('.tabs [data-view]').forEach(function (button) {
    button.addEventListener('click', function () {
      const selected = button.dataset.view;
      document.querySelectorAll('.tabs [data-view]').forEach(function (item) {
        const active = item.dataset.view === selected;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', String(active));
      });
      document.querySelectorAll('[data-panel]').forEach(function (panel) {
        panel.classList.toggle('hidden', panel.dataset.panel !== selected);
      });
    });
  });



  async function checkAdministrator(session) {
    const status = $('admin-status');
    const controls = $('admin-controls');
    controls.classList.add('hidden');
    $('admin-users-controls').classList.add('hidden');
    status.textContent = 'Comprobando autorización...';
    adminCompanies = [];
    try {
      const isAdmin = await api('/rest/v1/rpc/mi_acceso_administrador', {
        method: 'POST', token: session.access_token, body: {}
      });
      if (isAdmin !== true) {
        status.textContent = 'Tu cuenta no tiene permiso global de administración. El alta y edición de empresas están deshabilitadas.';
        return;
      }
      const companies = await api(
        '/rest/v1/empresas?select=id,nombre,descripcion,sector,tamano,pais,estado,activa&order=nombre.asc',
        { token: session.access_token }
      );
      adminCompanies = companies;
      updateCompanySelect();
      controls.classList.remove('hidden');
      status.textContent = 'Acceso administrativo autorizado. Organizaciones registradas: ' + companies.length + '.';
      await loadAdminUsers(session);
    } catch (error) {
      status.textContent = 'No fue posible comprobar el permiso administrativo: ' +
        String(error.message || 'Error desconocido');
    }
  }


  function fillRoleCompanySelect() {
    const target = $('role-company');
    const selected = target.value;
    target.replaceChildren();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'Selecciona una empresa';
    target.append(empty);
    adminCompanies.forEach(function (company) {
      const opt = document.createElement('option');
      opt.value = company.id;
      opt.textContent = company.nombre + (company.activa ? '' : ' [inactiva]');
      target.append(opt);
    });
    if (adminCompanies.some((company) => company.id === selected)) target.value = selected;
  }

  function fillRoleUserSelect() {
    const target = $('role-user');
    const selected = target.value;
    target.replaceChildren();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'Selecciona un usuario';
    target.append(empty);
    adminUsers.forEach(function (user) {
      const opt = document.createElement('option');
      opt.value = user.id;
      const label = [user.nombre, user.apellidos].filter(Boolean).join(' ');
      opt.textContent = (label || user.email) + ' · ' + user.email + (user.confirmado ? '' : ' [sin confirmar]');
      opt.disabled = !user.confirmado;
      target.append(opt);
    });
    if (adminUsers.some((u) => u.id === selected && u.confirmado)) target.value = selected;
  }

  function renderRoleDirectory() {
    const target = $('role-directory');
    const selected = $('role-user').value;
    const chosen = selected ? adminUsers.filter((u) => u.id === selected) : adminUsers;
    if (!chosen.length) {
      target.textContent = 'No hay cuentas disponibles para mostrar.';
      return;
    }
    target.innerHTML = chosen.map(function (user) {
      const label = [user.nombre, user.apellidos].filter(Boolean).join(' ');
      const assignments = Array.isArray(user.asignaciones) ? user.asignaciones : [];
      const rows = assignments.map(function (a) {
        return '<div class="role-entry">' +
          '<span>' + escapeHTML(a.empresa) + ' · ' + escapeHTML(a.rol) +
          ' <small>(' + (a.activo ? 'Activo' : 'Inactivo') + ')</small></span>' +
          '<button type="button" class="outline role-edit" data-user="' + escapeHTML(user.id) +
          '" data-company="' + escapeHTML(a.empresa_id) +
          '" data-rol="' + escapeHTML(a.rol) +
          '" data-activo="' + (a.activo ? 'true' : 'false') +
          '">Editar</button></div>';
      }).join('');
      return '<div class="directory-user"><strong>' + escapeHTML(label || user.email) +
        '</strong><div class="subtle">' + escapeHTML(user.email) + '</div>' +
        (rows || '<div class="subtle">Sin asignaciones</div>') + '</div>';
    }).join('');
  }

  async function loadAdminUsers(session) {
    const controls = $('admin-users-controls');
    const status = $('role-status');
    controls.classList.add('hidden');
    try {
      const users = await api('/rest/v1/rpc/admin_listar_usuarios', {
        method: 'POST', token: session.access_token, body: {}
      });
      if (!Array.isArray(users)) throw new Error('Formato de directorio inesperado.');
      if (!currentSession || currentSession.user.id !== session.user.id) return;
      adminUsers = users;
      fillRoleCompanySelect();
      fillRoleUserSelect();
      renderRoleDirectory();
      controls.classList.remove('hidden');
      status.classList.remove('error');
      status.textContent = 'Directorio administrativo disponible: ' + users.length +
        ' cuenta(s). Solo puedes asignar cuentas confirmadas.';
    } catch (error) {
      controls.classList.add('hidden');
      $('admin-status').textContent += ' Directorio de usuarios no disponible: ' +
        String(error.message || 'Error de permisos.');
    }
  }

  $('role-user').addEventListener('change', renderRoleDirectory);
  $('role-directory').addEventListener('click', function (event) {
    const button = event.target.closest('button.role-edit');
    if (!button) return;
    const user = adminUsers.find((u) => u.id === button.dataset.user);
    const company = adminCompanies.find((c) => c.id === button.dataset.company);
    if (!user || !company) return;
    $('role-user').value = user.id;
    $('role-company').value = company.id;
    $('role-name').value = button.dataset.rol;
    $('role-active').checked = button.dataset.activo === 'true';
    renderRoleDirectory();
    $('role-status').textContent = 'Asignación seleccionada. Cambia el estado o el rol y guarda.';
    $('role-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('role-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    const status = $('role-status');
    const button = $('role-save');
    status.classList.remove('error');
    const session = currentSession;
    if (!session || Date.now() >= session.expires_at) {
      status.classList.add('error');
      status.textContent = 'Sesión caducada. Inicia sesión nuevamente.';
      return;
    }
    const userId = $('role-user').value;
    const companyId = $('role-company').value;
    const role = $('role-name').value;
    const active = $('role-active').checked;
    if (!userId || !companyId || !['entrevistado','experto','empresa','entrenador'].includes(role)) {
      status.classList.add('error');
      status.textContent = 'Selecciona una cuenta confirmada, una empresa y un rol válido.';
      return;
    }
    button.disabled = true;
    status.textContent = 'Guardando asignación...';
    try {
      await api('/rest/v1/rpc/admin_guardar_rol', {
        method: 'POST', token: session.access_token,
        body: {
          p_usuario_id: userId, p_empresa_id: companyId,
          p_rol: role, p_activo: active
        }
      });
      await loadAdminUsers(session);
      $('role-user').value = userId;
      renderRoleDirectory();
      status.classList.remove('error');
      status.textContent = 'Asignación ' + (active ? 'activada' : 'desactivada') +
        ' correctamente. Los permisos de las sesiones se verifican en el servidor.';
    } catch (error) {
      status.classList.add('error');
      status.textContent = 'No fue posible guardar la asignación: ' +
        String(error.message || 'Error desconocido.');
    } finally {
      button.disabled = false;
    }
  });

  function updateCompanySelect() {
    const select = $('company-id');
    select.replaceChildren();
    const first = document.createElement('option');
    first.value = '';
    first.textContent = '+ Registrar empresa nueva';
    select.append(first);
    adminCompanies.forEach(function (company) {
      const option = document.createElement('option');
      option.value = company.id;
      option.textContent = company.nombre;
      select.append(option);
    });
  }

  function clearCompanyForm() {
    $('company-form').reset();
    $('company-id').value = '';
    $('company-active').checked = true;
    $('company-country').value = 'México';
    $('company-status').textContent = '';
  }

  $('company-reset').addEventListener('click', clearCompanyForm);

  $('company-id').addEventListener('change', function () {
    const item = adminCompanies.find((company) => company.id === $('company-id').value);
    if (!item) { clearCompanyForm(); return; }
    $('company-name').value = item.nombre || '';
    $('company-description').value = item.descripcion || '';
    $('company-sector').value = item.sector || '';
    $('company-size').value = item.tamano || '';
    $('company-country').value = item.pais || '';
    $('company-state').value = item.estado || '';
    $('company-active').checked = item.activa === true;
    $('company-status').textContent = 'Editando: ' + item.nombre;
  });

  $('company-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    const status = $('company-status');
    const button = $('company-save');
    status.classList.remove('error');
    const session = currentSession;

    if (!session || Date.now() >= session.expires_at) {
      status.classList.add('error');
      status.textContent = 'Tu sesión ha caducado. Cierra sesión y vuelve a entrar.';
      return;
    }
    const id = $('company-id').value;
    const payload = {
      nombre: $('company-name').value.trim(),
      descripcion: $('company-description').value.trim() || null,
      sector: $('company-sector').value.trim() || null,
      tamano: $('company-size').value || null,
      pais: $('company-country').value.trim() || null,
      estado: $('company-state').value.trim() || null
    };
    if (!payload.nombre || payload.nombre.length > 200) {
      status.classList.add('error');
      status.textContent = 'El nombre de la organización es obligatorio (máximo 200 caracteres).';
      return;
    }
    if (id) payload.activa = $('company-active').checked;

    button.disabled = true;
    status.textContent = 'Guardando cambios...';
    try {
      const path = id
        ? '/rest/v1/empresas?id=eq.' + encodeURIComponent(id) +
          '&select=id,nombre,descripcion,sector,tamano,pais,estado,activa'
        : '/rest/v1/empresas?select=id,nombre,descripcion,sector,tamano,pais,estado,activa';
      const result = await api(path, {
        method: id ? 'PATCH' : 'POST',
        body: payload, token: session.access_token,
        prefer: 'return=representation'
      });
      if (!Array.isArray(result) || result.length !== 1) {
        throw new Error('La operación no fue autorizada por las políticas de seguridad.');
      }
      await checkAdministrator(session);
      // Actualizar el resumen sin alterar la asignación de usuarios.
      const companiesVisible = await api(
        '/rest/v1/empresas?select=id,nombre,sector,estado&order=nombre.asc',
        { token: session.access_token }
      );
      $('company-count').textContent = String(companiesVisible.length);
      $('companies-preview').textContent = companiesVisible.length
        ? companiesVisible.map((company) => company.nombre).join(' · ')
        : 'No hay organizaciones visibles.';
      renderList('companies', companiesVisible, function (company) {
        return '<div class="item"><strong>' + escapeHTML(company.nombre) +
          '</strong><p>' + escapeHTML(company.sector) + ' · ' +
          escapeHTML(company.estado) + '</p></div>';
      }, 'No hay organizaciones visibles.');
      clearCompanyForm();
      status.textContent = 'Empresa ' + (id ? 'actualizada' : 'registrada') + ' correctamente.';
    } catch (error) {
      status.classList.add('error');
      status.textContent = 'No fue posible guardar: ' + String(error.message || 'Error desconocido');
    } finally {
      button.disabled = false;
    }
  });

  const validConfig = /^https:\/\/[a-z0-9.-]+$/i.test(root) &&
                      /^(sb_publishable_|eyJ)/.test(key);

  if (!validConfig) {
    visible('setup', true);
    visible('login', false);
    notice('Falta configurar la URL o la clave publica de Supabase.');
    return;
  }

  $('profile-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!currentSession || Date.now() >= currentSession.expires_at) {
      $('profile-status').classList.add('error');
      $('profile-status').textContent = 'Tu sesión ha caducado. Cierra sesión y vuelve a ingresar.';
      return;
    }

    const name = $('profile-name').value.trim();
    const surname = $('profile-surname').value.trim();
    const status = $('profile-status');
    const button = $('profile-form').querySelector('button[type="submit"]');
    status.classList.remove('error');

    if (!name || !surname || name.length > 150 || surname.length > 150) {
      status.classList.add('error');
      status.textContent = 'Escribe un nombre y apellidos válidos.';
      return;
    }

    button.disabled = true;
    status.textContent = 'Guardando perfil...';
    try {
      const updated = await api(
        '/rest/v1/perfiles?id=eq.' + encodeURIComponent(currentSession.user.id) +
        '&select=nombre,apellidos',
        {
          method: 'PATCH',
          token: currentSession.access_token,
          prefer: 'return=representation',
          body: { nombre: name, apellidos: surname }
        }
      );
      if (!Array.isArray(updated) || updated.length !== 1) {
        throw new Error('La actualización no fue aplicada por las políticas de seguridad.');
      }
      $('profile').textContent = [updated[0].nombre, updated[0].apellidos].filter(Boolean).join(' ');
      status.textContent = 'Perfil actualizado correctamente.';
    } catch (error) {
      status.classList.add('error');
      status.textContent = 'No se pudo guardar: ' + String(error.message || 'Error desconocido');
    } finally {
      button.disabled = false;
    }
  });

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
      const msg = String(error.message || '');
      if (/email.not.confirmed|email_not_confirmed/i.test(msg)) {
        notice('Tu correo aún no está confirmado en Supabase. Confírmalo o pide a un administrador que verifique la cuenta antes de iniciar sesión.');
      } else if (/invalid.login.credentials|invalid_credentials/i.test(msg)) {
        notice('Correo o contraseña incorrectos. Comprueba que sean los registrados en Supabase.');
      } else {
        notice('No fue posible iniciar sesión (' + msg + ').');
      }
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
