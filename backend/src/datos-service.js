const config = require("./config");

async function lookupIdentification(identifier) {
  const clean = String(identifier || "").replace(/\D/g, "");
  if (!/^\d{10}$|^\d{13}$/.test(clean)) {
    const error = new Error("Ingrese una cedula de 10 digitos o RUC de 13 digitos.");
    error.statusCode = 400;
    throw error;
  }
  if (!config.datosApi.token) {
    const error = new Error("Configure DATOS_API_TOKEN en backend/.env para consultar datos personales.");
    error.statusCode = 503;
    throw error;
  }

  const type = clean.length === 13 ? "ruc" : "cedula";
  const payload = type === "ruc" ? await requestRucWithFallback(clean) : await requestDatosApi(type, clean);
  return type === "ruc" ? normalizeRuc(clean, payload) : normalizeCedula(clean, payload);
}

async function requestRucWithFallback(clean) {
  let lastError;
  try {
    return await requestDatosApi("ruc", clean);
  } catch (error) {
    lastError = error;
    if (error?.statusCode && error.statusCode < 500 && !isPermissionError(error)) throw error;
  }
  try {
    return await requestDatosApi("ruclite", clean);
  } catch (error) {
    lastError = error;
    if (error?.statusCode && error.statusCode < 500 && !isPermissionError(error)) throw error;
  }
  try {
    const cedulaPayload = await requestDatosApi("cedula", clean.slice(0, 10));
    const cedula = normalizeCedula(clean.slice(0, 10), cedulaPayload);
    return {
      data: {
        main: [{
          numeroRuc: clean,
          razonSocial: cedula.name,
          estadoContribuyenteRuc: cedula.status,
          tipoContribuyente: "PERSONA NATURAL",
          obligadoLlevarContabilidad: "NO",
          contribuyenteEspecial: "NO"
        }],
        addit: []
      }
    };
  } catch (error) {
    lastError = error;
  }
  throw lastError;
}

async function requestDatosApi(type, clean) {
  const endpoint = type === "ruc" ? "ruc" : type === "ruclite" ? "ruclite" : "cedula";
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await requestDatosApiOnce(endpoint, clean);
    } catch (error) {
      lastError = error;
      if (error?.statusCode && error.statusCode < 500) throw error;
      if (attempt < 2) await wait(700);
    }
  }
  throw lastError;
}

async function requestDatosApiOnce(endpoint, clean) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const response = await fetch(`${config.datosApi.url}/api/${endpoint}/${clean}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.datosApi.token}`
    },
    signal: controller.signal
  }).catch((error) => {
    const serviceError = new Error(error?.name === "AbortError"
      ? "El servicio de datos no respondio a tiempo. Intente nuevamente."
      : "No hay conexion con el servicio de datos.");
    serviceError.statusCode = 504;
    throw serviceError;
  }).finally(() => clearTimeout(timeout));
  const payload = await safeJson(response);
  if (!response.ok) {
    const error = new Error(serviceErrorMessage(payload, response.status));
    error.statusCode = response.status;
    throw error;
  }
  return payload;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeCedula(identifier, payload) {
  const response = payload?.data?.response || payload?.data || {};
  const name = text(response.nombreCompleto || [response.apellidos, response.nombres].filter(Boolean).join(" "));
  if (!name) {
    const error = new Error(text(payload?.data?.Info) || "No se encontraron datos para la cedula ingresada.");
    error.statusCode = 404;
    throw error;
  }

  return {
    ok: true,
    type: "cedula",
    identificationType: "05",
    identification: text(response.identificacion) || identifier,
    name,
    businessName: name,
    tradeName: name,
    status: text(response.estado),
    address: "",
    raw: payload
  };
}

function normalizeRuc(identifier, payload) {
  const main = Array.isArray(payload?.data?.main) ? payload.data.main[0] : payload?.data?.main || payload?.data || {};
  const establishments = Array.isArray(payload?.data?.addit) ? payload.data.addit : [];
  const matriz = establishments.find((item) => text(item.matriz).toUpperCase() === "SI") || establishments[0] || {};
  const businessName = text(main.razonSocial || payload?.data?.nombreCompleto);
  if (!businessName) {
    const error = new Error("No se encontraron datos para el RUC ingresado.");
    error.statusCode = 404;
    throw error;
  }

  const tradeName = text(matriz.nombreFantasiaComercial) || businessName;
  const taxpayerType = /SOCIEDAD|JURID/i.test(text(main.tipoContribuyente)) ? "juridica" : "natural";
  return {
    ok: true,
    type: "ruc",
    identificationType: "04",
    identification: text(main.numeroRuc) || identifier,
    name: businessName,
    businessName,
    tradeName,
    address: text(matriz.direccionCompleta),
    status: text(main.estadoContribuyenteRuc),
    taxpayerType,
    accountingRequired: yesNo(main.obligadoLlevarContabilidad),
    specialTaxpayer: yesNo(main.contribuyenteEspecial),
    establishments: establishments.map((item) => ({
      tradeName: text(item.nombreFantasiaComercial),
      establishment: text(item.numeroEstablecimiento),
      address: text(item.direccionCompleta),
      status: text(item.estado),
      matriz: text(item.matriz)
    })),
    raw: payload
  };
}

function serviceErrorMessage(payload, status) {
  const message = text(payload?.data?.error || payload?.message || payload?.error);
  if (/invalid ability/i.test(message)) {
    return "El token de WebServices.ec no tiene permiso para este tipo de consulta. Active api:ruc, api:ruc_lite o api:cedula en webservices.ec.";
  }
  return message || `No se pudo consultar el servicio de datos (${status}).`;
}

function isPermissionError(error) {
  return error?.statusCode === 403 && /permiso|ability|api:/i.test(error.message || "");
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function yesNo(value) {
  return text(value).toUpperCase() === "SI" ? "SI" : "NO";
}

function text(value) {
  return String(value || "").trim();
}

module.exports = { lookupIdentification };
