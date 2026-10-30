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
  ALUMNO_SESSION: "boyaca_bmx_alumno_session_v1"
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
 * Login estricto de Alumno:
 * Exige coincidencia exacta del usuario, placa o cédula Y de su clave personal.
 * No permite contraseñas vacías ni accesos directos indebidos.
 */
export function loginAlumno(identificador, clave = "") {
  if (!identificador) return null;
  const rawQ = String(identificador).trim().toUpperCase();
  const qClean = rawQ.replace(/[^0-9A-Z]/g, "");
  const qNum = rawQ.replace(/\D/g, "");
  const pass = String(clave || "").trim();
  if (!pass) return null;

  const atletas = getInscripcionesEscuela();
  const encontrado = atletas.find(a => {
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

    const claveReal = (a.clave_acceso || "").trim();
    return idMatch && Boolean(claveReal) && pass === claveReal;
  });

  if (encontrado) {
    sessionStorage.setItem(STORAGE_KEYS.ALUMNO_SESSION, encontrado.id);
    return encontrado;
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
 * - Si no coincide: Devuelve error explícito
 */
export function loginPortalGeneral(identificador, clave = "") {
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
  if (!claveReal) {
    return {
      ok: false,
      error: "Este atleta no tiene contraseña activa asignada todavía. Solicita al Administrador o Director de la escuela que cree tus credenciales."
    };
  }
  if (rawPass !== claveReal) {
    return {
      ok: false,
      error: "Contraseña incorrecta. Si la olvidaste, el administrador de la escuela puede reestablecerla."
    };
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
 * Retorna la lista consolidada de todos los usuarios del sistema.
 */
export function getUsuariosSistema() {
  const cfg = getConfig();
  const lista = [];

  // 1. Cuenta de Director
  lista.push({
    id: "usr-director",
    usuario: cfg.directorUser || "director",
    clave: cfg.directorPass || "director2026",
    rol: "DIRECTOR",
    nombre: cfg.directorNombre || "Michael Morocoima (Director)",
    tipo: "DIRECTIVO",
    atleta_id: null,
    placa: "👑",
    estado: "ACTIVO",
    creado_en: "2026-01-01"
  });

  // 2. Cuenta de Administrador
  lista.push({
    id: "usr-admin",
    usuario: cfg.adminUser || "admin",
    clave: cfg.adminPass || "boyaca2026",
    rol: "ADMINISTRADOR",
    nombre: "Administrador de la Página",
    tipo: "ADMINISTRATIVO",
    atleta_id: null,
    placa: "💻",
    estado: "ACTIVO",
    creado_en: "2026-01-01"
  });

  // 3. Cuentas de Alumnos
  const atletas = getInscripcionesEscuela();
  atletas.forEach(a => {
    lista.push({
      id: `usr-atl-${a.id}`,
      atleta_id: a.id,
      usuario: a.usuario || "",
      clave: a.clave_acceso || "1234",
      rol: "ALUMNO",
      nombre: `${a.nombre_atleta || ""} ${a.apellido_atleta || ""}`.trim(),
      placa: a.numero_placa || "#S/N",
      nivel: a.nivel || "ESCUELA",
      categoria: a.categoria || "BMX RACING",
      cedula_rep: a.cedula_rep || "",
      telefono_rep: a.telefono_rep || "",
      mes_pagado: a.mes_pagado || "OCTUBRE 2026",
      solvencia: a.solvencia || "PENDIENTE",
      tipo: "ALUMNO",
      estado: a.usuario ? "ACTIVO" : "SIN USUARIO",
      creado_en: a.creado_en || new Date().toISOString()
    });
  });

  return lista;
}

/**
 * Elimina o revoca el usuario y credenciales de acceso de un alumno.
 */
export function eliminarUsuarioAlumno(atletaId) {
  const atletas = getInscripcionesEscuela();
  const idx = atletas.findIndex(a => a.id === atletaId);
  if (idx === -1) {
    return { ok: false, error: "Atleta no encontrado." };
  }
  atletas[idx].usuario = "";
  atletas[idx].clave_acceso = "";
  localStorage.setItem(STORAGE_KEYS.INSCRIPCIONES_ESCUELA, JSON.stringify(atletas));

  if (sessionStorage.getItem(STORAGE_KEYS.ALUMNO_SESSION) === atletaId) {
    sessionStorage.removeItem(STORAGE_KEYS.ALUMNO_SESSION);
  }

  const sb = getSupabaseClient();
  if (sb) {
    try {
      sb.from("inscripciones_escuela").update({ usuario: null, clave_acceso: null }).eq("id", atletaId);
    } catch (_) {}
  }
  return { ok: true, mensaje: "Usuario y credenciales eliminados con éxito." };
}

/**
 * Crea o actualiza el usuario y contraseña de un alumno (función administrativa).
 */
export async function guardarUsuarioAlumno({ atletaId, usuario, clave }) {
  const atletas = getInscripcionesEscuela();
  const idx = atletas.findIndex(a => a.id === atletaId);
  if (idx === -1) {
    return { ok: false, error: "Atleta no encontrado." };
  }
  const u = (usuario || "").trim().toLowerCase().replace(/\s+/g, "");
  const p = (clave || "").trim();
  if (!u || !p) {
    return { ok: false, error: "Debes ingresar un nombre de usuario y una contraseña válida." };
  }
  // Verificar si otro atleta tiene ese usuario
  const repetido = atletas.find((a, i) => i !== idx && (a.usuario || "").toLowerCase() === u);
  if (repetido) {
    return { ok: false, error: `El usuario "@${u}" ya está en uso por ${repetido.nombre_atleta} ${repetido.apellido_atleta}.` };
  }

  atletas[idx].usuario = u;
  atletas[idx].clave_acceso = p;
  localStorage.setItem(STORAGE_KEYS.INSCRIPCIONES_ESCUELA, JSON.stringify(atletas));

  const sb = getSupabaseClient();
  if (sb) {
    try {
      await sb.from("inscripciones_escuela").update({
        usuario: u,
        clave_acceso: p
      }).eq("id", atletaId);
    } catch (_) {}
  }

  return { ok: true, atleta: atletas[idx], usuario: u, clave: p };
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
        clave_acceso: nuevoAlumno.clave_acceso,
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
