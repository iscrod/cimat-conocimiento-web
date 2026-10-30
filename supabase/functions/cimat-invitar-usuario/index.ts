// El despliegue requiere secretos proporcionados por el entorno de Supabase Edge Functions.
// Esta implementación valida el usuario y el rol administrativo dentro de la función.
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const sitio = "https://iscrod.github.io/cimat-conocimiento-web/";
const origenPermitido = "https://iscrod.github.io";
const cors = {
  "Access-Control-Allow-Origin": origenPermitido,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json; charset=utf-8"
};
function respuesta(status: number, mensaje: string) {
  return new Response(JSON.stringify({ mensaje }), { status, headers: cors });
}
Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (origin && origin !== origenPermitido) {
    return respuesta(403, "Origen no permitido.");
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "POST") {
    return respuesta(405, "Método no permitido.");
  }
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ") || authHeader.length < 30) {
    return respuesta(401, "Debes iniciar sesión.");
  }
  const token = authHeader.slice(7).trim();
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publishKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !serviceKey || !publishKey) {
    console.error("Faltan secretos incorporados de Supabase");
    return respuesta(503, "El servicio de invitaciones no está configurado.");
  }

  try {
    // La función valida el JWT aunque verify_jwt=false a nivel de plataforma.
    // Es necesario para aceptar sesiones ES256 sin depender del gateway heredado.
    const service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: verified, error: identityError } = await service.auth.getUser(token);
    if (identityError || !verified?.user?.id || !verified.user.email_confirmed_at) {
      return respuesta(401, "Sesión no válida o correo no confirmado.");
    }

    const caller = createClient(url, publishKey, {
      global: { headers: { Authorization: "Bearer " + token } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: allowed, error: permissionError } = await caller.rpc("mi_acceso_administrador");
    if (permissionError || allowed !== true) {
      return respuesta(403, "Solo el administrador global puede invitar usuarios.");
    }

    let payload: Record<string, unknown>;
    try {
      payload = await request.json();
    } catch {
      return respuesta(400, "El cuerpo de la solicitud no es válido.");
    }
    const email = String(payload.email ?? "").trim().toLowerCase();
    const nombre = String(payload.nombre ?? "").trim();
    const apellidos = String(payload.apellidos ?? "").trim();
    if (email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        nombre.length < 1 || nombre.length > 100 ||
        apellidos.length < 1 || apellidos.length > 150) {
      return respuesta(400, "Introduce un correo válido, nombre y apellidos.");
    }
    if (email === verified.user.email?.toLowerCase()) {
      return respuesta(400, "Tu cuenta ya existe. No necesitas invitarte.");
    }

    const { data: invited, error: inviteError } = await service.auth.admin.inviteUserByEmail(
      email,
      { redirectTo: sitio, data: { nombre, apellidos } }
    );
    if (inviteError) {
      const message = inviteError.message.toLowerCase();
      if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
        return respuesta(409, "Esa cuenta ya existe. Selecciónala en el directorio y asígnale un rol.");
      }
      if (message.includes("email address not authorized") || message.includes("not authorized to send")) {
        return respuesta(403, "Supabase solo puede escribir a correos del equipo del proyecto. Para invitar a participantes externos configura un proveedor SMTP en Authentication.");
      }
      if (inviteError.status === 429) {
        return respuesta(429, "Supabase alcanzó el límite temporal de envío de correos.");
      }
      console.error("Error al enviar invitación", inviteError.status);
      return respuesta(502, "Supabase no pudo enviar la invitación. Revisa la configuración de correo.");
    }
    if (invited?.user?.id) {
      const { error: auditError } = await service.from("auditoria").insert({
        actor_id: verified.user.id,
        accion: "INVITAR_USUARIO",
        entidad: "auth.users",
        entidad_id: invited.user.id,
        detalles: { canal: "email", fase: "invitacion" }
      });
      if (auditError) console.error("Invitación enviada sin evento de auditoría", auditError.code);
    }
    return respuesta(200,
      "Invitación enviada. Cuando la persona confirme su cuenta y establezca su contraseña, asígnale una empresa y un rol desde el directorio."
    );
  } catch (error) {
    console.error("Fallo interno de invitación", error instanceof Error ? error.name : "error");
    return respuesta(500, "No se pudo procesar la invitación.");
  }
});
