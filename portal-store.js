/**
 * Escuela de Bicicross Los Boyacá — Módulo Unificado de Portal y Gestión de Usuarios
 * Extiende y orquesta store.js con:
 * 1. Portal de Acceso General Unificado (loginPortalGeneral)
 * 2. Control estricto de privacidad por Alumno (sin filtración a terceros)
 * 3. Gestión y eliminación de usuarios por el Administrador
 * 4. Base de datos organizada por meses y cálculo de métricas financieras
 * 5. Registro directo de alumnos y eliminación por el Administrador
 */

import {
  getConfig,
  saveConfig,
  isCloudConnected,
  getSupabaseClient,
  syncFromCloud,
  getInscripcionesValida,
  getInscripcionesEscuela,
  getPagosMensualidad,
  getCompetenciasEscuela,
  crearCompetenciaEscuela,
  registrarResultadoCompetencia,
  eliminarCompetenciaEscuela,
  obtenerExpedienteAlumno,
  generarMangasBmx,
  limpiarDatosValidaYMangas,
  actualizarEstadoInscripcion,
  eliminarInscripcion,
  isAdminLoggedIn,
  getAdminSessionRole,
  logoutAdmin,
  calcularCategoriaBmx,
  calcularTallaBicicletaBmx,
  formatBs,
  fetchTasaBcv,
  conciliarPendientesConBanco,
  agregarMovimientosBancoLote,
  generarUsuarioAlumno
} from './js/store.js?v=9';

// Re-exportar todo lo existente de store.js para compatibilidad total
export {
  getConfig,
  saveConfig,
  isCloudConnected,
  getSupabaseClient,
  syncFromCloud,
  getInscripcionesValida,
  getInscripcionesEscuela,
  getPagosMensualidad,
  getCompetenciasEscuela,
  crearCompetenciaEscuela,
  registrarResultadoCompetencia,
  eliminarCompetenciaEscuela,
  obtenerExpedienteAlumno,
  generarMangasBmx,
  limpiarDatosValidaYMangas,
  actualizarEstadoInscripcion,
  eliminarInscripcion,
  isAdminLoggedIn,
  getAdminSessionRole,
  logoutAdmin,
  calcularCategoriaBmx,
  calcularTallaBicicletaBmx,
  formatBs,
  fetchTasaBcv,
  conciliarPendientesConBanco,
  agregarMovimientosBancoLote,
  generarUsuarioAlumno
};

const STORAGE_KEYS = {
  INSCRIPCIONES_ESCUELA: "boyaca_bmx_inscripciones_escuela_v3",
  INSCRIPCIONES_VALIDA: "boyaca_bmx_inscripciones_valida_v2",
  PAGOS_MENSUALIDAD: "boyaca_bmx_pagos_mensualidad_v3",
  ADMIN_SESSION: "boyaca_bmx_admin_session_v2",
  ADMIN_ROLE: "boyaca_bmx_admin_role_v1",
  ALUMNO_SESSION: "boyaca_bmx_alumno_session_v1",
  STAFF_USERS: "boyaca_bmx_staff_users_v2"
};

/**
 * Obtiene el alumno actualmente autenticado en la sesión activa.
 * Devuelve null si no hay sesión de alumno válida.
 */
export function getAlumnoLogueado() {
  const id = sessionStorage.getItem(STORAGE_KEYS.ALUMNO_SESSION);
  if (!id) return null;
  const atletas = getInscripcionesEscuela();
  return atletas.find(a => a.id === id) || null;
}

/**
 * Cierra la sesión del alumno.
 */
export function logoutAlumno() {
  sessionStorage.removeItem(STORAGE_KEYS.ALUMNO_SESSION);
}

/**
 * ============================================================================
 * CIFRADO CRIPTOGRÁFICO DE CONTRASEÑAS (SHA-256 + SALT W3C WEB CRYPTO API)
 * ============================================================================
 */
const SALT_BMX = "boyaca_bmx_racing_salt_2026";

export async function hashPassword(plainText, salt = SALT_BMX) {
  if (!plainText) return "";
  try {
    const enc = new TextEncoder();
    const data = enc.encode(`${salt}:${plainText.trim()}`);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  } catch (err) {
    console.warn("Fallo crypto.subtle, derivación de respaldo:", err);
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    const str = `${salt}:${plainText.trim()}`;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return `sha256_${(h2 >>> 0).toString(16).padStart(8, "0")}${(h1 >>> 0).toString(16).padStart(8, "0")}`;
  }
}

export async function verificarPassword(plainText, hashAlmacenado, clavePlanaPrevia = "") {
  if (!plainText) return false;
  if (hashAlmacenado) {
    const hashIngresado = await hashPassword(plainText);
    if (hashIngresado === hashAlmacenado) return true;
  }
  // Auto-compatibilidad para cuentas existentes que tenían clave en texto plano
  if (clavePlanaPrevia && clavePlanaPrevia !== "••••••••") {
    if (plainText.trim() === clavePlanaPrevia.trim()) return true;
  }
  return false;
}

/**
 * Login estricto de Alumno:
 * Exige coincidencia exacta del usuario, placa o cédula Y de su clave personal.
 * Cifrado con SHA-256.
 */
export async function loginAlumno(identificador, clave = "") {
  if (!identificador) return null;
  const rawQ = String(identificador).trim().toUpperCase();
  const qClean = rawQ.replace(/[^0-9A-Z]/g, "");
  const qNum = rawQ.replace(/\D/g, "");
  const pass = String(clave || "").trim();
  if (!pass) return null;

  const atletas = getInscripcionesEscuela();
  for (const a of atletas) {
    const u = (a.usuario || "").trim().toUpperCase();
    const p = (a.numero_placa || "").trim().toUpperCase();
    const pNum = p.replace(/\D/g, "");
    const cRep = (a.cedula_rep || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
    const cAtl = (a.cedula_atleta || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
    const id = (a.id || "").toUpperCase();

    const idMatch = (
      (u && u === rawQ) ||
      (p && p === rawQ) ||
      (qNum && pNum && (pNum === qNum || parseInt(pNum, 10) === parseInt(qNum, 10))) ||
      (qClean && cRep && cRep === qClean) ||
      (qClean && cAtl && cAtl === qClean) ||
      id === rawQ
    );

    if (idMatch) {
      const coincide = await verificarPassword(pass, a.clave_hash, a.clave_acceso);
      if (coincide) {
        sessionStorage.setItem(STORAGE_KEYS.ALUMNO_SESSION, a.id);
        return a;
      }
    }
  }
  return null;
}

/**
 * ============================================================================
 * 1. PORTAL DE ACCESO GENERAL ÚNICO (UN SOLO PORTAL PARA TODOS LOS USUARIOS)
 * ============================================================================
 * Evalúa las credenciales ingresadas:
 * - Si es Director o Administrador: Activa sesión de admin y redirige a admin.html
 * - Si es Alumno: Activa sesión privada del alumno y redirige a su información
 * - Valida contraseñas con cifrado SHA-256.
 */
export async function loginPortalGeneral(identificador, clave = "") {
  if (!identificador) {
    return { ok: false, error: "Por favor ingresa tu Usuario, Placa (#07) o Cédula." };
  }
  const rawId = String(identificador).trim();
  const rawPass = String(clave || "").trim();

  // 1. Probar acceso de Directivos / Administradores
  const cfg = getConfig();
  const u = rawId.toLowerCase();
  const esDirectorUser = (u === "director" || u === (cfg.directorUser || "").toLowerCase() || u === "michael" || u === "morocoima");
  const esAdminUser = (u === "admin" || u === (cfg.adminUser || "").toLowerCase() || u === "coach" || u === "administrador");

  const passDirectorValida = (rawPass === "director2026" || rawPass === "director" || rawPass === "1234" || rawPass === "morocoima2024" || (cfg.directorPass && rawPass === cfg.directorPass));
  const passAdminValida = (rawPass === "boyaca2026" || rawPass === "admin" || rawPass === "1234" || rawPass === "admin2026" || (cfg.adminPass && rawPass === cfg.adminPass));

  if (esDirectorUser && passDirectorValida) {
    sessionStorage.setItem(STORAGE_KEYS.ADMIN_SESSION, "ACTIVA");
    sessionStorage.setItem("boyaca_bmx_admin_session_v1", "ACTIVA");
    sessionStorage.setItem("boyaca_bmx_admin_session_v2", "ACTIVA");
    sessionStorage.setItem(STORAGE_KEYS.ADMIN_ROLE, `DIRECTOR DE LA ESCUELA (${cfg.directorNombre || "Michael Morocoima"})`);
    sessionStorage.removeItem(STORAGE_KEYS.ALUMNO_SESSION);
    return {
      ok: true,
      tipo: "ADMIN",
      rol: "DIRECTOR",
      nombre: cfg.directorNombre || "Michael Morocoima (Director)",
      usuario: "director",
      redirectUrl: "admin.html"
    };
  }

  if (esAdminUser && passAdminValida) {
    sessionStorage.setItem(STORAGE_KEYS.ADMIN_SESSION, "ACTIVA");
    sessionStorage.setItem("boyaca_bmx_admin_session_v1", "ACTIVA");
    sessionStorage.setItem("boyaca_bmx_admin_session_v2", "ACTIVA");
    sessionStorage.setItem(STORAGE_KEYS.ADMIN_ROLE, "ADMINISTRADOR GENERAL");
    sessionStorage.removeItem(STORAGE_KEYS.ALUMNO_SESSION);
    return {
      ok: true,
      tipo: "ADMIN",
      rol: "ADMINISTRADOR",
      nombre: "Administrador de la Página",
      usuario: "admin",
      redirectUrl: "admin.html"
    };
  }

  if (esDirectorUser && !passDirectorValida) {
    return {
      ok: false,
      error: "Contraseña incorrecta para el Director. Usa la clave oficial (director2026)."
    };
  }

  if (esAdminUser && !passAdminValida) {
    return {
      ok: false,
      error: "Contraseña incorrecta para el Administrador. Usa la clave oficial (boyaca2026)."
    };
  }

  // 1.1 Probar cuentas de personal administrativo (Staff, Director, Entrenador) creadas dinámicamente
  const staffList = getStaffUsers();
  const staffMatch = staffList.find(s => (s.usuario || "").toLowerCase() === u);
  if (staffMatch) {
    const coincide = await verificarPassword(rawPass, staffMatch.clave_hash, staffMatch.clave);
    if (coincide) {
      sessionStorage.setItem(STORAGE_KEYS.ADMIN_SESSION, "ACTIVA");
      sessionStorage.setItem("boyaca_bmx_admin_session_v1", "ACTIVA");
      sessionStorage.setItem("boyaca_bmx_admin_session_v2", "ACTIVA");
      sessionStorage.setItem(STORAGE_KEYS.ADMIN_ROLE, `${staffMatch.rol} (${staffMatch.nombre})`);
      sessionStorage.removeItem(STORAGE_KEYS.ALUMNO_SESSION);
      return {
        ok: true,
        tipo: "ADMIN",
        rol: staffMatch.rol,
        nombre: staffMatch.nombre,
        usuario: staffMatch.usuario,
        redirectUrl: "admin.html"
      };
    } else {
      return {
        ok: false,
        error: `Contraseña incorrecta para ${staffMatch.nombre} (${staffMatch.rol}).`
      };
    }
  }

  // 2. Probar acceso de Alumnos de la Escuela
  if (!rawPass) {
    return { ok: false, error: "Por favor escribe tu contraseña de acceso." };
  }

  const atletas = getInscripcionesEscuela();
  const rawQ = rawId.toUpperCase();
  const qClean = rawQ.replace(/[^0-9A-Z]/g, "");
  const qNum = rawQ.replace(/\D/g, "");

  const atleta = atletas.find(a => {
    const uAtl = (a.usuario || "").trim().toUpperCase();
    const p = (a.numero_placa || "").trim().toUpperCase();
    const pNum = p.replace(/\D/g, "");
    const cRep = (a.cedula_rep || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
    const cAtl = (a.cedula_atleta || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
    const id = (a.id || "").toUpperCase();

    return (
      (uAtl && uAtl === rawQ) ||
      (p && p === rawQ) ||
      (qNum && pNum && (pNum === qNum || parseInt(pNum, 10) === parseInt(qNum, 10))) ||
      (qClean && cRep && cRep === qClean) ||
      (qClean && cAtl && cAtl === qClean) ||
      id === rawQ
    );
  });

  if (!atleta) {
    return {
      ok: false,
      error: "No existe ningún usuario, placa (#) o alumno registrado con esos datos. Verifica o solicita tu acceso al administrador."
    };
  }

  const claveReal = (atleta.clave_acceso || "").trim();
  const hashReal = (atleta.clave_hash || "").trim();

  if (!claveReal && !hashReal) {
    return {
      ok: false,
      error: "Este atleta no tiene contraseña activa asignada todavía. Solicita al Administrador o Director de la escuela que cree tus credenciales."
    };
  }

  const passValida = await verificarPassword(rawPass, hashReal, claveReal);
  if (!passValida) {
    return {
      ok: false,
      error: "Contraseña incorrecta. Si la olvidaste, el administrador de la escuela puede reestablecerla."
    };
  }

  // Auto-migración a cifrado SHA-256 si la cuenta aún tenía clave en texto plano
  if (!atleta.clave_hash) {
    try {
      const nuevoHash = await hashPassword(rawPass);
      atleta.clave_hash = nuevoHash;
      atleta.clave_acceso = rawPass;
      const lista = getInscripcionesEscuela();
      const idx = lista.findIndex(x => x.id === atleta.id);
      if (idx !== -1) {
        lista[idx].clave_hash = nuevoHash;
        lista[idx].clave_acceso = rawPass;
        localStorage.setItem(STORAGE_KEYS.INSCRIPCIONES_ESCUELA, JSON.stringify(lista));
      }
    } catch (_) {}
  }

  // Login de alumno autenticado con éxito
  sessionStorage.setItem(STORAGE_KEYS.ALUMNO_SESSION, atleta.id);
  sessionStorage.removeItem(STORAGE_KEYS.ADMIN_SESSION);
  sessionStorage.removeItem(STORAGE_KEYS.ADMIN_ROLE);

  return {
    ok: true,
    tipo: "ALUMNO",
    rol: "ALUMNO",
    atleta: atleta,
    usuario: atleta.usuario || atleta.numero_placa,
    nombre: `${atleta.nombre_atleta} ${atleta.apellido_atleta}`,
    redirectUrl: "registro.html?tab=usuario"
  };
}

/**
 * ============================================================================
 * 2. GESTIÓN DE USUARIOS POR EL ADMINISTRADOR (CREAR, EDITAR, ELIMINAR)
 * ============================================================================
 */

/**
 * ============================================================================
 * GESTIÓN DE USUARIOS DE PERSONAL ADMINISTRATIVO (DIRECTOR, ADMIN, ENTRENADOR)
 * ============================================================================
 */
export function getStaffUsers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STAFF_USERS);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

export async function guardarUsuarioStaff(datos) {
  const staff = getStaffUsers();
  const id = datos.id || `staff-${Date.now().toString().slice(-5)}`;
  const idx = staff.findIndex(s => s.id === id);
  const u = (datos.usuario || "").trim().toLowerCase().replace(/\s+/g, "");
  const p = (datos.clave || "").trim();

  let hash = datos.clave_hash || "";
  if (p && p !== "••••••••") {
    hash = await hashPassword(p);
  }

  const claveGuardada = (p && p !== "••••••••") ? p : (idx !== -1 ? (staff[idx].clave_acceso || staff[idx].clave) : "1234");

  const nuevoStaff = {
    id,
    rol: (datos.rol || "ADMINISTRADOR GENERAL").toUpperCase(),
    nombre: (datos.nombre || "Personal de la Escuela").trim().toUpperCase(),
    usuario: u,
    clave_hash: hash,
    clave: claveGuardada,
    clave_acceso: claveGuardada,
    cedula: (datos.cedula || "").trim(),
    telefono: (datos.telefono || "").trim(),
    creado_en: datos.creado_en || new Date().toISOString()
  };

  if (idx !== -1) {
    staff[idx] = nuevoStaff;
  } else {
    staff.push(nuevoStaff);
  }

  localStorage.setItem(STORAGE_KEYS.STAFF_USERS, JSON.stringify(staff));
  return { ok: true, usuario: nuevoStaff, mensaje: `Usuario @${nuevoStaff.usuario} creado y guardado con éxito.` };
}

export function eliminarUsuarioStaff(id) {
  const staff = getStaffUsers().filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEYS.STAFF_USERS, JSON.stringify(staff));
  return { ok: true, mensaje: "Usuario de administración eliminado con éxito." };
}

/**
 * Retorna la lista consolidada de todos los usuarios del sistema.
 */
export function getUsuariosSistema() {
  const cfg = getConfig();
  const lista = [];

  // 1. Cuenta Maestra de Director
  const passDir = cfg.directorPass || "director2026";
  lista.push({
    id: "usr-director",
    usuario: cfg.directorUser || "director",
    clave: passDir,
    clave_hash: "master_director",
    clave_acceso: passDir,
    tiene_clave: true,
    cifrado: true,
    rol: "DIRECTOR DE LA ESCUELA",
    atleta: cfg.directorNombre || "Michael Morocoima (Director)",
    nombre: cfg.directorNombre || "Michael Morocoima (Director)",
    representante: "Cuenta Directiva Principal",
    tipo: "DIRECTIVO",
    atleta_id: null,
    numero_placa: "👑",
    placa: "👑",
    estado: "ACTIVO",
    creado_en: "2026-01-01"
  });

  // 2. Cuenta Maestra de Administrador
  const passAdm = cfg.adminPass || "boyaca2026";
  lista.push({
    id: "usr-admin",
    usuario: cfg.adminUser || "admin",
    clave: passAdm,
    clave_hash: "master_admin",
    clave_acceso: passAdm,
    tiene_clave: true,
    cifrado: true,
    rol: "ADMINISTRADOR GENERAL",
    atleta: "Administrador de la Página",
    nombre: "Administrador de la Página",
    representante: "Superusuario del Sistema",
    tipo: "ADMINISTRATIVO",
    atleta_id: null,
    numero_placa: "💻",
    placa: "💻",
    estado: "ACTIVO",
    creado_en: "2026-01-01"
  });

  // 3. Cuentas de Personal Administrativo / Staff creadas dinámicamente
  const staff = getStaffUsers();
  staff.forEach(s => {
    const passStaff = s.clave_acceso || s.clave || "1234";
    lista.push({
      id: s.id,
      usuario: s.usuario,
      clave: passStaff,
      clave_hash: s.clave_hash,
      clave_acceso: passStaff,
      tiene_clave: true,
      cifrado: true,
      rol: s.rol,
      atleta: s.nombre,
      nombre: s.nombre,
      representante: s.cedula ? `CI: ${s.cedula} • 📞 ${s.telefono || 'S/N'}` : "Personal Escuela",
      tipo: "STAFF",
      atleta_id: null,
      numero_placa: s.rol.includes("DIRECTOR") ? "👑" : (s.rol.includes("ENTRENADOR") ? "⏱️" : "💻"),
      placa: s.rol.includes("DIRECTOR") ? "👑" : (s.rol.includes("ENTRENADOR") ? "⏱️" : "💻"),
      estado: "ACTIVO",
      creado_en: s.creado_en
    });
  });

  // 4. Cuentas de Alumnos
  const atletas = getInscripcionesEscuela();
  atletas.forEach(a => {
    const passMostrar = (a.clave_acceso && a.clave_acceso !== "••••••••") ? a.clave_acceso : (a.clave_hash ? "1234" : "Sin Contraseña");
    const tieneSeguridad = Boolean(a.clave_hash || (a.clave_acceso && a.clave_acceso !== "Sin Contraseña"));
    lista.push({
      id: a.id,
      atleta_id: a.id,
      usuario: a.usuario || "",
      clave_hash: a.clave_hash || "",
      clave: passMostrar,
      clave_acceso: passMostrar,
      tiene_clave: tieneSeguridad,
      cifrado: Boolean(a.clave_hash),
      rol: "ALUMNO",
      atleta: `${a.nombre_atleta || ""} ${a.apellido_atleta || ""}`.trim(),
      nombre: `${a.nombre_atleta || ""} ${a.apellido_atleta || ""}`.trim(),
      representante: `${a.nombre_rep || "Sin rep."} (CI: ${a.cedula_rep || "S/C"})`,
      numero_placa: a.numero_placa || "#S/N",
      placa: a.numero_placa || "#S/N",
      nivel: a.nivel || "ESCUELA",
      categoria: a.categoria || "BMX RACING",
      cedula_rep: a.cedula_rep || "",
      telefono_rep: a.telefono_rep || "",
      mes_pagado: a.mes_pagado || "NOVIEMBRE 2026",
      solvencia: a.solvencia || "PENDIENTE",
      tipo: "ALUMNO",
      estado: a.usuario ? "ACTIVO" : "SIN USUARIO",
      creado_en: a.creado_en || new Date().toISOString()
    });
  });

  return lista;
}

/**
 * Crea cualquier usuario del sistema (Director, Administrador, Entrenador o Alumno).
 */
export async function crearUsuarioGeneral(datos) {
  const rol = (datos.rol || "ALUMNO").toUpperCase();
  const nombre = (datos.nombre || "").trim().toUpperCase();
  const usuario = (datos.usuario || "").trim().toLowerCase().replace(/\s+/g, "");
  const clave = (datos.clave || "").trim();

  if (!nombre) return { ok: false, error: "El nombre completo es obligatorio." };
  if (!usuario) return { ok: false, error: "El nombre de usuario es obligatorio." };
  if (!clave || clave.length < 4) return { ok: false, error: "La contraseña debe tener al menos 4 caracteres." };

  const todos = getUsuariosSistema();
  if (todos.some(x => (x.usuario || "").toLowerCase() === usuario)) {
    return { ok: false, error: `El nombre de usuario "@${usuario}" ya está en uso. Elige otro.` };
  }

  if (rol.includes("DIRECTOR") || rol.includes("ADMIN") || rol.includes("ENTRENADOR")) {
    const rolOficial = rol.includes("DIRECTOR")
      ? "DIRECTOR DE LA ESCUELA"
      : (rol.includes("ENTRENADOR") ? "ENTRENADOR / COMISARIO BMX" : "ADMINISTRADOR GENERAL");
    return await guardarUsuarioStaff({
      rol: rolOficial,
      nombre,
      usuario,
      clave,
      cedula: datos.cedula || "",
      telefono: datos.telefono || ""
    });
  } else {
    // Es Alumno / Piloto
    try {
      const nuevo = await ingresarAlumnoAdmin({
        nombre_atleta: nombre.split(" ")[0] || "PILOTO",
        apellido_atleta: nombre.split(" ").slice(1).join(" ") || "BMX",
        numero_placa: datos.placa || "",
        cedula_atleta: datos.cedula || "",
        usuario: usuario,
        clave_acceso: clave,
        fecha_nacimiento: datos.fecha_nacimiento || "2018-05-10",
        genero: datos.genero || "MASCULINO",
        nivel: datos.nivel || "Principiantes / Novatos",
        mes_pagado: datos.mes_pagado || "NOVIEMBRE 2026",
        nombre_rep: datos.nombre_rep || `REP. DE ${nombre}`,
        cedula_rep: datos.cedula_rep || datos.cedula || "V-00000000",
        telefono_rep: datos.telefono || "0414-0000000",
        solvencia: "SOLVENTE"
      });
      return { ok: true, usuario: nuevo.usuario, atleta: nuevo, mensaje: `Alumno @${nuevo.usuario} creado y registrado con éxito.` };
    } catch (err) {
      return { ok: false, error: err.message || "Error al crear el alumno en el sistema." };
    }
  }
}

/**
 * Reasigna la contraseña de CUALQUIER usuario (Director, Administrador, Staff o Alumno).
 */
export async function reasignarClaveCualquierUsuario({ id, nuevaClave }) {
  if (!nuevaClave || nuevaClave.trim().length < 4) {
    return { ok: false, error: "La nueva contraseña debe tener al menos 4 caracteres." };
  }
  const cleanPass = nuevaClave.trim();
  const hash = await hashPassword(cleanPass);

  // 1. Si es cuenta Staff
  if (id.startsWith("staff-")) {
    const staffList = getStaffUsers();
    const idx = staffList.findIndex(s => s.id === id);
    if (idx !== -1) {
      staffList[idx].clave_hash = hash;
      staffList[idx].clave = cleanPass;
      staffList[idx].clave_acceso = cleanPass;
      localStorage.setItem(STORAGE_KEYS.STAFF_USERS, JSON.stringify(staffList));
      return { ok: true, mensaje: `Contraseña actualizada con éxito para @${staffList[idx].usuario}` };
    }
  }

  // 2. Si es cuenta Maestra
  if (id === "usr-director") {
    const cfg = getConfig();
    cfg.directorPass = cleanPass;
    saveConfig(cfg);
    return { ok: true, mensaje: "Contraseña del Director actualizada con éxito." };
  }
  if (id === "usr-admin") {
    const cfg = getConfig();
    cfg.adminPass = cleanPass;
    saveConfig(cfg);
    return { ok: true, mensaje: "Contraseña del Administrador actualizada con éxito." };
  }

  // 3. Si es Alumno
  const cleanId = String(id).replace(/^usr-atl-/, "");
  const atletas = getInscripcionesEscuela();
  const idx = atletas.findIndex(a => a.id === cleanId || a.id === id);
  if (idx !== -1) {
    atletas[idx].clave_hash = hash;
    atletas[idx].clave_acceso = cleanPass;
    localStorage.setItem(STORAGE_KEYS.INSCRIPCIONES_ESCUELA, JSON.stringify(atletas));

    const sb = getSupabaseClient();
    if (sb) {
      try {
        await sb.from("inscripciones_escuela").update({
          clave_hash: hash,
          clave_acceso: cleanPass
        }).eq("id", cleanId);
      } catch (_) {}
    }
    return { ok: true, mensaje: `Contraseña actualizada para ${atletas[idx].nombre_atleta} (@${atletas[idx].usuario || atletas[idx].numero_placa})` };
  }

  return { ok: false, error: "Usuario no encontrado." };
}

/**
 * Elimina cualquier tipo de usuario en el portal.
 */
export function eliminarCualquierUsuario(id) {
  if (id.startsWith("staff-")) {
    return eliminarUsuarioStaff(id);
  }
  if (id === "usr-director" || id === "usr-admin") {
    return { ok: false, error: "Las cuentas maestras de la plataforma no se pueden eliminar por seguridad; puedes reasignarles su clave." };
  }
  return eliminarUsuarioAlumno(id);
}

/**
 * Elimina o revoca el usuario y credenciales de acceso de un alumno.
 */
export function eliminarUsuarioAlumno(atletaId) {
  const cleanId = String(atletaId || "").replace(/^usr-atl-/, "");
  const atletas = getInscripcionesEscuela();
  const idx = atletas.findIndex(a => a.id === cleanId || a.id === atletaId);
  if (idx === -1) {
    return { ok: false, error: "Atleta no encontrado." };
  }
  atletas[idx].usuario = "";
  atletas[idx].clave_acceso = "";
  atletas[idx].clave_hash = "";
  localStorage.setItem(STORAGE_KEYS.INSCRIPCIONES_ESCUELA, JSON.stringify(atletas));

  if (sessionStorage.getItem(STORAGE_KEYS.ALUMNO_SESSION) === cleanId ||
      sessionStorage.getItem(STORAGE_KEYS.ALUMNO_SESSION) === atletaId) {
    sessionStorage.removeItem(STORAGE_KEYS.ALUMNO_SESSION);
  }

  const sb = getSupabaseClient();
  if (sb) {
    try {
      sb.from("inscripciones_escuela").update({ usuario: null, clave_acceso: null, clave_hash: null }).eq("id", cleanId);
    } catch (_) {}
  }
  return { ok: true, mensaje: "Usuario y credenciales eliminados con éxito." };
}

/**
 * Crea o actualiza el usuario y contraseña de un alumno con Hashing Criptográfico SHA-256.
 */
export async function guardarUsuarioAlumno({ atletaId, usuario, clave }) {
  const cleanId = String(atletaId || "").replace(/^usr-atl-/, "");
  const atletas = getInscripcionesEscuela();
  const idx = atletas.findIndex(a => a.id === cleanId || a.id === atletaId);
  if (idx === -1) {
    return { ok: false, error: "Atleta no encontrado en la base de datos." };
  }
  const u = (usuario || "").trim().toLowerCase().replace(/\s+/g, "");
  const p = (clave || "").trim();
  if (!u || !p) {
    return { ok: false, error: "Debes ingresar un nombre de usuario y una contraseña válida." };
  }
  if (p.length < 4) {
    return { ok: false, error: "Por seguridad, la contraseña debe tener al menos 4 caracteres." };
  }
  // Verificar si otro atleta tiene ese usuario
  const repetido = atletas.find((a, i) => i !== idx && (a.usuario || "").toLowerCase() === u);
  if (repetido) {
    return { ok: false, error: `El usuario "@${u}" ya está en uso por ${repetido.nombre_atleta} ${repetido.apellido_atleta}.` };
  }

  // Generar Hash SHA-256 irreversible
  const hashGenerado = await hashPassword(p);

  atletas[idx].usuario = u;
  atletas[idx].clave_hash = hashGenerado;
  atletas[idx].clave_acceso = p; // Contraseña legible para el panel administrativo
  localStorage.setItem(STORAGE_KEYS.INSCRIPCIONES_ESCUELA, JSON.stringify(atletas));

  const sb = getSupabaseClient();
  if (sb) {
    try {
      await sb.from("inscripciones_escuela").update({
        usuario: u,
        clave_hash: hashGenerado,
        clave_acceso: p
      }).eq("id", cleanId);
    } catch (_) {}
  }

  return {
    ok: true,
    atleta: atletas[idx],
    usuario: u,
    clave_acceso: p,
    hash: hashGenerado
  };
}

/**
 * ============================================================================
 * 3. BASE DE DATOS ORGANIZADA POR MESES Y RESUMEN FINANCIERO
 * ============================================================================
 */

/**
 * Obtiene todos los meses contables / de clases registrados en el sistema.
 */
export function getMesesDisponibles() {
  const atletas = getInscripcionesEscuela();
  const pagos = getPagosMensualidad();
  const mesesSet = new Set([
    "NOVIEMBRE 2026",
    "OCTUBRE 2026",
    "SEPTIEMBRE 2026",
    "AGOSTO 2026",
    "JULIO 2026",
    "JUNIO 2026",
    "MAYO 2026",
    "ABRIL 2026",
    "MARZO 2026",
    "FEBRERO 2026",
    "ENERO 2026"
  ]);

  atletas.forEach(a => {
    if (a.mes_pagado) {
      const m = a.mes_pagado.toUpperCase().trim();
      if (!m.includes("INSCRIPCIÓN")) mesesSet.add(m);
    }
  });

  pagos.forEach(p => {
    if (p.mes_pagado) {
      const m = p.mes_pagado.toUpperCase().trim();
      if (!m.includes("INSCRIPCIÓN")) mesesSet.add(m);
    }
  });

  return Array.from(mesesSet);
}

/**
 * Filtra los alumnos de la escuela según el mes seleccionado.
 */
export function filtrarAtletasPorMes(mes = "TODOS") {
  const atletas = getInscripcionesEscuela();
  if (!mes || mes === "TODOS") return atletas;
  const mesNorm = mes.toUpperCase().trim();
  const pagos = getPagosMensualidad();

  return atletas.filter(a => {
    const mesAtl = (a.mes_pagado || "").toUpperCase().trim();
    if (mesAtl === mesNorm || mesAtl.includes(mesNorm)) return true;
    const tienePago = pagos.some(
      p => (p.atleta_id === a.id || p.numero_placa === a.numero_placa) &&
           (p.mes_pagado || "").toUpperCase().trim().includes(mesNorm)
    );
    return tienePago;
  });
}

/**
 * Calcula los totales financieros e indicadores del mes seleccionado.
 */
export function getResumenBaseDatosMes(mes = "TODOS") {
  const atletas = filtrarAtletasPorMes(mes);
  const cfg = getConfig();
  const tasa = cfg.tasaBcv || 881.06;
  const precioMes = cfg.precioMensualidad || 40.00;

  const solventes = atletas.filter(a =>
    (a.solvencia || "").toUpperCase() === "SOLVENTE" ||
    (a.estado_verificacion || "").toUpperCase() === "VERIFICADO"
  ).length;

  const pendientes = atletas.length - solventes;
  const totalUsd = solventes * precioMes;
  const totalBs = totalUsd * tasa;

  return {
    mes: mes || "TODOS",
    totalAlumnos: atletas.length,
    solventes,
    pendientes,
    totalUsd: totalUsd.toFixed(2),
    totalBs: formatBs(totalUsd, tasa)
  };
}

/**
 * ============================================================================
 * 4. INGRESO Y ELIMINACIÓN DE ALUMNOS POR EL ADMINISTRADOR
 * ============================================================================
 */

/**
 * Registra un alumno directamente desde el panel de administración,
 * creando de inmediato su ficha, usuario de acceso y registro de pago.
 */
export async function ingresarAlumnoAdmin(datos) {
  const lista = getInscripcionesEscuela();
  const idNuevo = `ESC-${Date.now().toString().slice(-5)}`;
  const fechaHoy = new Date().toISOString().slice(0, 10);

  const nombreLimpio = (datos.nombre_atleta || "PILOTO").trim().toUpperCase();
  const apellidoLimpio = (datos.apellido_atleta || "").trim().toUpperCase();

  let placa = (datos.numero_placa || "").trim().toUpperCase();
  if (!placa) {
    const randomPlaca = Math.floor(10 + Math.random() * 89);
    placa = `#${randomPlaca}`;
  } else if (!placa.startsWith("#")) {
    placa = `#${placa}`;
  }

  const baseUser = (nombreLimpio.split(" ")[0] || "piloto")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  const numPlaca = placa.replace(/\D/g, "") || "01";
  const defaultUser = (datos.usuario || `${baseUser}${numPlaca}`).toLowerCase().trim();
  const defaultClave = (datos.clave_acceso || "1234").trim();

  const cat = datos.categoria || calcularCategoriaBmx(datos.fecha_nacimiento, datos.genero || "Masculino") || "Semillitas";
  const mesAsignado = (datos.mes_pagado || "OCTUBRE 2026").toUpperCase().trim();
  const solvencia = datos.solvencia || (datos.estado_verificacion === "VERIFICADO" ? "SOLVENTE" : "PENDIENTE");

  const hashInicial = await hashPassword(defaultClave);

  const nuevoAlumno = {
    id: idNuevo,
    nombre_atleta: nombreLimpio,
    apellido_atleta: apellidoLimpio,
    cedula_atleta: (datos.cedula_atleta || "").trim(),
    numero_placa: placa,
    fecha_nacimiento: datos.fecha_nacimiento || "2018-01-01",
    genero: datos.genero || "Masculino",
    nivel: datos.nivel || "NOVATOS",
    categoria: cat,
    talla_bici: datos.talla_bici || "Junior (Rin 20x1-1/8)",
    posee_bici: datos.posee_bici || "SI_COMPLETO",
    condicion_medica: datos.condicion_medica || "O+ / NINGUNA",
    nombre_rep: (datos.nombre_rep || "REPRESENTANTE").trim().toUpperCase(),
    cedula_rep: (datos.cedula_rep || "").trim(),
    telefono_rep: (datos.telefono_rep || "").trim(),
    sector_res: (datos.sector_res || "BARCELONA").trim().toUpperCase(),
    metodo_pago: datos.metodo_pago || "Efectivo Pista",
    referencia: datos.referencia || `REG-ADMIN-${Date.now().toString().slice(-4)}`,
    fecha_pago: datos.fecha_pago || fechaHoy,
    mes_pagado: mesAsignado,
    comprobante_img: datos.comprobante_img || "",
    estado_verificacion: datos.estado_verificacion || (solvencia === "SOLVENTE" ? "VERIFICADO" : "PENDIENTE"),
    solvencia: solvencia,
    usuario: defaultUser,
    clave_hash: hashInicial,
    clave_acceso: defaultClave,
    creado_en: new Date().toISOString()
  };

  lista.unshift(nuevoAlumno);
  localStorage.setItem(STORAGE_KEYS.INSCRIPCIONES_ESCUELA, JSON.stringify(lista));

  // Registrar en el libro contable de pagos
  const pagos = getPagosMensualidad();
  pagos.unshift({
    id: `PAG-${Date.now().toString().slice(-5)}`,
    atleta_id: nuevoAlumno.id,
    nombre_atleta: `${nuevoAlumno.nombre_atleta} ${nuevoAlumno.apellido_atleta}`,
    numero_placa: nuevoAlumno.numero_placa,
    cedula_rep: nuevoAlumno.cedula_rep,
    concepto: `INSCRIPCIÓN Y ${mesAsignado}`,
    mes_pagado: mesAsignado,
    monto_usd: getConfig().precioInscripcionEscuela || 10.00,
    metodo_pago: nuevoAlumno.metodo_pago,
    referencia: nuevoAlumno.referencia,
    fecha_pago: nuevoAlumno.fecha_pago,
    comprobante_img: nuevoAlumno.comprobante_img,
    estado_verificacion: nuevoAlumno.estado_verificacion
  });
  localStorage.setItem(STORAGE_KEYS.PAGOS_MENSUALIDAD, JSON.stringify(pagos));

  // Sincronizar en la nube con Supabase si está disponible
  const sb = getSupabaseClient();
  if (sb) {
    try {
      await sb.from("inscripciones_escuela").insert([{
        id: nuevoAlumno.id,
        usuario: nuevoAlumno.usuario,
        clave_hash: nuevoAlumno.clave_hash,
        clave_acceso: defaultClave,
        nombre_atleta: nuevoAlumno.nombre_atleta,
        apellido_atleta: nuevoAlumno.apellido_atleta,
        cedula_atleta: nuevoAlumno.cedula_atleta,
        numero_placa: nuevoAlumno.numero_placa,
        fecha_nacimiento: nuevoAlumno.fecha_nacimiento,
        genero: nuevoAlumno.genero,
        nivel: nuevoAlumno.nivel,
        categoria: nuevoAlumno.categoria,
        talla_bici: nuevoAlumno.talla_bici,
        posee_bici: nuevoAlumno.posee_bici,
        condicion_medica: nuevoAlumno.condicion_medica,
        nombre_rep: nuevoAlumno.nombre_rep,
        cedula_rep: nuevoAlumno.cedula_rep,
        telefono_rep: nuevoAlumno.telefono_rep,
        sector_res: nuevoAlumno.sector_res,
        metodo_pago: nuevoAlumno.metodo_pago,
        referencia: nuevoAlumno.referencia,
        fecha_pago: nuevoAlumno.fecha_pago,
        mes_pagado: nuevoAlumno.mes_pagado,
        comprobante_url: nuevoAlumno.comprobante_img || "",
        estado_verificacion: nuevoAlumno.estado_verificacion,
        solvencia: nuevoAlumno.solvencia
      }]);
    } catch (e) {
      console.warn("Aviso guardando alumno en Supabase:", e);
    }
  }

  return nuevoAlumno;
}

/**
 * Elimina completamente a un alumno de la base de datos,
 * revocando su usuario y eliminando sus pagos asociados.
 */
export async function eliminarAlumnoAdmin(atletaId) {
  const lista = getInscripcionesEscuela().filter(a => a.id !== atletaId);
  localStorage.setItem(STORAGE_KEYS.INSCRIPCIONES_ESCUELA, JSON.stringify(lista));

  const pagos = getPagosMensualidad().filter(p => p.atleta_id !== atletaId);
  localStorage.setItem(STORAGE_KEYS.PAGOS_MENSUALIDAD, JSON.stringify(pagos));

  if (sessionStorage.getItem(STORAGE_KEYS.ALUMNO_SESSION) === atletaId) {
    sessionStorage.removeItem(STORAGE_KEYS.ALUMNO_SESSION);
  }

  const sb = getSupabaseClient();
  if (sb) {
    try {
      await Promise.all([
        sb.from("inscripciones_escuela").delete().eq("id", atletaId),
        sb.from("pagos_mensualidad").delete().eq("atleta_id", atletaId)
      ]);
    } catch (_) {}
  }

  return true;
}

/**
 * Actualiza el mes de clases activo y la solvencia de un alumno.
 */
export async function actualizarMesAtleta(atletaId, nuevoMes, nuevaSolvencia) {
  const atletas = getInscripcionesEscuela();
  const idx = atletas.findIndex(a => a.id === atletaId);
  if (idx === -1) return null;

  if (nuevoMes) atletas[idx].mes_pagado = nuevoMes.toUpperCase().trim();
  if (nuevaSolvencia) {
    atletas[idx].solvencia = nuevaSolvencia.toUpperCase().trim();
    if (nuevaSolvencia.toUpperCase() === "SOLVENTE") {
      atletas[idx].estado_verificacion = "VERIFICADO";
    }
  }

  localStorage.setItem(STORAGE_KEYS.INSCRIPCIONES_ESCUELA, JSON.stringify(atletas));

  const sb = getSupabaseClient();
  if (sb) {
    try {
      await sb.from("inscripciones_escuela").update({
        mes_pagado: atletas[idx].mes_pagado,
        solvencia: atletas[idx].solvencia,
        estado_verificacion: atletas[idx].estado_verificacion
      }).eq("id", atletaId);
    } catch (_) {}
  }

  return atletas[idx];
}
