// CTruck · admin-create-user
// Crea una cuenta de acceso (email+password) y su perfil en public.users.
// Reglas: super_admin crea administradores (y cualquier rol) asignando empresa;
// admin crea supervisor/driver/helper solo para SU empresa.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Identificar al llamador con su propio JWT
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user: authCaller } } = await caller.auth.getUser();
    if (!authCaller) return json({ error: "No autorizado" }, 401);

    const { data: me } = await admin.from("users").select("*").eq("auth_id", authCaller.id).single();
    if (!me || !me.active || !["super_admin", "admin"].includes(me.role)) {
      return json({ error: "Tu rol no permite crear usuarios" }, 403);
    }

    const b = await req.json();
    const { name, rut, email, password, role } = b;
    let { company_id, truck_id } = b;
    if (!name || !email || !password || !role) return json({ error: "Faltan campos obligatorios" }, 400);
    if (String(password).length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);

    if (me.role === "admin") {
      if (!["supervisor", "driver", "helper"].includes(role)) {
        return json({ error: "Solo el Super Admin puede crear administradores" }, 403);
      }
      company_id = me.company_id; // el admin solo crea dentro de su empresa
      if (!company_id) return json({ error: "Tu perfil no tiene empresa asignada" }, 400);
    } else {
      // super_admin: puede crear cualquier rol; empresa obligatoria salvo super_admin
      if (role !== "super_admin" && !company_id) {
        return json({ error: "Debes asignar una empresa" }, 400);
      }
    }

    const { data: created, error: e1 } = await admin.auth.admin.createUser({
      email: String(email).toLowerCase().trim(),
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (e1) return json({ error: `No se pudo crear la cuenta: ${e1.message}` }, 400);

    const { data: row, error: e2 } = await admin.from("users").insert({
      name, rut: rut ?? "", email: String(email).toLowerCase().trim(), role,
      company_id: role === "super_admin" ? null : company_id,
      truck_id: ["driver", "helper"].includes(role) ? (truck_id ?? null) : null,
      auth_id: created.user.id, active: true,
    }).select().single();
    if (e2) {
      await admin.auth.admin.deleteUser(created.user.id); // rollback
      return json({ error: `No se pudo crear el perfil: ${e2.message}` }, 400);
    }
    return json({ user: row });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
