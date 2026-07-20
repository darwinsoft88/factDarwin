import { AuthorizationResponse } from "../services/backend";
import { shortText } from "./format";

function sanitizeSriRaw(raw: string) {
  return raw
    .replace(/RucCertificado:\s*\d+/gi, "RucCertificado")
    .replace(/RucCertificado:\d+/gi, "RucCertificado")
    .replace(/RucComprobante:\s*\d+/gi, "RucComprobante")
    .replace(/RucComprobante:\d+/gi, "RucComprobante");
}

export function userFriendlyActionError(error: unknown, action: "reserve-sequence" | "authorize-invoice" | "sync" | "email" | "generic" = "generic") {
  const raw = error instanceof Error ? error.message : String(error || "");
  const lower = raw.toLowerCase();
  const looksOffline = lower.includes("conexion") || lower.includes("network") || lower.includes("fetch") || lower.includes("failed to fetch") || lower.includes("internet") || lower.includes("servidor");

  if (lower.includes("secuencial") || lower.includes("configurado")) return raw;

  if (looksOffline) {
    if (action === "reserve-sequence") {
      return "No se pudo conectar con el servidor para reservar la secuencia. Revise la conexion con el servidor y vuelva a intentar.";
    }
    if (action === "authorize-invoice") {
      return "No se pudo completar el envio con el servidor o el SRI. El documento quedo guardado y puede reintentarse desde pendientes.";
    }
    if (action === "sync") {
      return "No se pudo sincronizar con el servidor. El cambio quedo guardado en este dispositivo y se reintentara automaticamente cuando el servidor este disponible.";
    }
    if (action === "email") {
      return "No se pudo enviar el correo en este momento. Revise la conexion con el servidor e intente nuevamente.";
    }
    return "No se pudo conectar con el servidor. Intente nuevamente cuando el servicio este disponible.";
  }

  if (lower.includes("licencia")) return raw;
  if (lower.includes("permiso")) return "Su usuario no tiene permiso para realizar esta accion.";
  return raw || "No se pudo completar la accion. Intente nuevamente.";
}

export function formatSriResult(result: AuthorizationResponse) {
  const friendly = explainSriResult(result);
  return [
    "RESULTADO BACKEND / SRI",
    `Resumen: ${friendly.title}`,
    friendly.detail,
    friendly.action ? `Accion sugerida: ${friendly.action}` : "",
    "",
    JSON.stringify(
      {
        ok: result.ok,
        sent: result.sent,
        status: result.status,
        message: result.message,
        accessKey: result.accessKey,
        authorizationStatus: result.authorizationStatus,
        authorizationNumber: result.authorizationNumber,
        authorizationDate: result.authorizationDate,
        sriEnvironment: result.sriEnvironment,
        sriMessage: result.sriMessage,
        reception: result.reception,
        authorization: result.authorization,
        error: result.error
      },
      null,
      2
    ),
    "",
    "XML FIRMADO",
    result.signedXml || "No se recibio XML firmado."
  ].filter((line) => line !== "").join("\n");
}

export function explainSriResult(result: AuthorizationResponse) {
  const raw = sanitizeSriRaw(`${result.error || ""} ${result.message || ""} ${result.status || ""} ${result.authorizationStatus || ""} ${result.sriMessage || ""} ${JSON.stringify(result.reception || {})} ${JSON.stringify(result.authorization || {})}`).toUpperCase();
  const text = shortText([result.error, result.message, result.sriMessage].filter(Boolean).join(" | "), 260);

  if (raw.includes("RUCERTIFICADO") || raw.includes("FIRMA INVALIDA")) {
    return {
      title: "Problema de firma electronica",
      detail: "No se encontro la firma .p12 de la empresa activa. Revise que la empresa haya cargado su certificado .p12 y la contrasena correcta.",
      action: "Suba el .p12 correcto y su clave en configuracion de la empresa activa."
    };
  }

  if (result.authorizationStatus === "AUTORIZADO" || raw.includes("<ESTADO>AUTORIZADO</ESTADO>")) {
    return {
      title: "Documento autorizado",
      detail: result.authorizationNumber ? `Autorizacion SRI: ${result.authorizationNumber}.` : "El SRI autorizo el comprobante.",
      action: ""
    };
  }
  if (raw.includes("CLAVE ACCESO REGISTRADA") || raw.includes("<IDENTIFICADOR>43</IDENTIFICADOR>")) {
    return {
      title: "Clave de acceso ya registrada",
      detail: "El SRI ya conoce ese documento. Si corresponde al mismo comprobante, use Reintentar para recuperar la autorizacion; si no, revise la numeracion.",
      action: "Verifique fecha, RUC, establecimiento y punto de emision."
    };
  }
  if (raw.includes("AMBIENTE") && raw.includes("NO COINCIDE")) {
    return {
      title: "Ambiente SRI no coincide",
      detail: text || "La app y el servidor estan configurados con ambientes diferentes.",
      action: "Revise el ambiente configurado antes de volver a emitir."
    };
  }
  if (raw.includes("CERTIFICADO") || raw.includes(".P12") || raw.includes("SRI_CERT_PASSWORD") || raw.includes("FIRMA")) {
    return {
      title: "Problema de firma electronica",
      detail: text || "No se pudo firmar el comprobante.",
      action: "Revise el certificado y su contrasena en configuracion."
    };
  }
  if (raw.includes("DEVUELTA")) {
    return {
      title: "Documento devuelto por recepcion SRI",
      detail: text || "El SRI recibio el comprobante pero lo devolvio por validacion.",
      action: "Abra el detalle del documento y revise la informacion tributaria."
    };
  }
  if (raw.includes("NO AUTORIZADO") || raw.includes("RECHAZADA") || raw.includes("ERROR")) {
    return {
      title: "Documento no autorizado",
      detail: text || "El SRI no autorizo el comprobante.",
      action: "Revise el detalle, corrija el comprobante y use Reintentar."
    };
  }
  if (result.sent === false || result.status === "DRY_RUN") {
    return {
      title: "Documento preparado en pruebas",
      detail: result.message || "El servidor preparo el documento pero no lo envio al SRI.",
      action: "Active SRI_ALLOW_SEND=true solo cuando este listo para enviar al SRI."
    };
  }

  return {
    title: result.ok ? "Factura en revision SRI" : "Respuesta SRI con observaciones",
    detail: text || "El SRI recibio el comprobante, pero aun no devolvio una autorizacion final.",
    action: "Revise el documento y use Reintentar si queda pendiente."
  };
}

export function sriUserMessage(result: AuthorizationResponse) {
  const friendly = explainSriResult(result);
  return [friendly.detail, friendly.action].filter(Boolean).join("\n\n");
}
