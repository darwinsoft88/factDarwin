import { AuthorizationResponse } from "../services/backend";
import { shortText } from "./format";

export function userFriendlyActionError(error: unknown, action: "reserve-sequence" | "authorize-invoice" | "sync" | "email" | "generic" = "generic") {
  const raw = error instanceof Error ? error.message : String(error || "");
  const lower = raw.toLowerCase();
  const looksOffline = lower.includes("conexion") || lower.includes("network") || lower.includes("fetch") || lower.includes("failed to fetch") || lower.includes("internet") || lower.includes("servidor");

  if (lower.includes("secuencial") || lower.includes("configurado")) return raw;

  if (looksOffline) {
    if (action === "reserve-sequence") {
      return "No hay internet o el servidor no esta disponible. Para emitir una factura electronica se necesita conexion a internet.";
    }
    if (action === "authorize-invoice") {
      return "No hay internet o el servidor no esta disponible. El documento quedo guardado y puede reintentarse cuando vuelva la conexion.";
    }
    if (action === "sync") {
      return "No hay internet. El cambio quedo guardado en este telefono y se sincronizara automaticamente cuando vuelva la conexion.";
    }
    if (action === "email") {
      return "No hay internet para enviar el correo. Intente nuevamente cuando vuelva la conexion.";
    }
    return "No hay internet o el servidor no esta disponible. Intente nuevamente cuando vuelva la conexion.";
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
  const raw = `${result.error || ""} ${result.message || ""} ${result.status || ""} ${result.authorizationStatus || ""} ${result.sriMessage || ""} ${JSON.stringify(result.reception || {})} ${JSON.stringify(result.authorization || {})}`.toUpperCase();
  const text = shortText([result.error, result.message, result.sriMessage].filter(Boolean).join(" | "), 260);

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
    title: result.ok ? "Respuesta SRI recibida" : "Respuesta SRI con observaciones",
    detail: text || "Revise el detalle tecnico.",
    action: result.ok ? "" : "Use el detalle del documento para revisar la respuesta completa."
  };
}

export function sriUserMessage(result: AuthorizationResponse) {
  const friendly = explainSriResult(result);
  return [friendly.detail, friendly.action].filter(Boolean).join("\n\n");
}
