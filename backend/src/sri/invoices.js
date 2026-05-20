const config = require("../config");
const { askAuthorization, sendToReception } = require("./client");
const { signXmlWithP12 } = require("./signXml");

async function signInvoice(xml, companyId = "") {
  const signedXml = await signXmlWithP12(xml, companyId);
  const accessKey = extractAccessKey(signedXml);

  return {
    ok: true,
    accessKey,
    signedXml,
    sriEnv: config.sriEnv,
    warning: "XML firmado con XAdES-BES para SRI Ecuador."
  };
}

async function authorizeInvoice(xml, companyId = "") {
  validateXmlEnvironment(xml);
  const signed = await signInvoice(xml, companyId);
  const documentName = getDocumentName(xml);

  if (!config.allowSriSend) {
    return {
      ...signed,
      sent: false,
      status: "DRY_RUN",
      message: `${documentName} firmada/preparada. Cambie SRI_ALLOW_SEND=true en backend/.env para enviar al SRI.`
    };
  }

  const reception = await sendToReception(signed.signedXml);
  const authorization = signed.accessKey ? await askAuthorization(signed.accessKey) : null;
  const receptionStatus = parseReceptionStatus(reception.body);
  const receptionMessage = parseSriMessages(reception.body);
  const authorizationSummary = authorization ? parseAuthorization(authorization.body) : {};
  const registeredAccessKey = isRegisteredAccessKeyMessage(reception.body) || isRegisteredAccessKeyMessage(receptionMessage);
  const authorizationStatus = authorizationSummary.authorizationStatus;
  let ok = reception.ok && receptionStatus !== "DEVUELTA" && authorizationStatus !== "NO AUTORIZADO";
  let sriMessage = [receptionMessage, authorizationSummary.sriMessage].filter(Boolean).join(" | ");
  let safeAuthorizationSummary = authorizationSummary;

  if (registeredAccessKey && authorizationStatus === "AUTORIZADO") {
    const comparison = compareAuthorizedDocument(signed.signedXml, authorizationSummary.authorizedXml);
    if (comparison.matches) {
      ok = true;
      sriMessage = [sriMessage, "Clave registrada corresponde al mismo comprobante; se recupero autorizacion existente."].filter(Boolean).join(" | ");
    } else {
      ok = false;
      safeAuthorizationSummary = {
        ...authorizationSummary,
        authorizationStatus: "NO AUTORIZADO",
        authorizedXml: ""
      };
      sriMessage = [
        sriMessage,
        `La clave de acceso ya esta registrada pero pertenece a otro comprobante. No se actualizo como autorizado. Diferencias: ${comparison.reason}`
      ].filter(Boolean).join(" | ");
    }
  }

  return {
    ok,
    sent: true,
    status: receptionStatus,
    accessKey: signed.accessKey,
    signedXml: signed.signedXml,
    ...safeAuthorizationSummary,
    sriMessage,
    reception,
    authorization
  };
}

function getDocumentName(xml) {
  if (xml.includes("<notaCredito")) return "Nota de credito";
  if (xml.includes("<guiaRemision")) return "Guia de remision";
  return "Factura";
}

function extractAccessKey(xml) {
  const match = xml.match(/<claveAcceso>([^<]+)<\/claveAcceso>/);
  return match ? match[1] : "";
}

function validateXmlEnvironment(xml) {
  const xmlEnvironment = textBetween(xml, "<ambiente>", "</ambiente>");
  const expectedEnvironment = config.sriEnv === "production" ? "2" : "1";

  if (!xmlEnvironment) {
    const error = new Error("El XML no contiene el campo ambiente.");
    error.statusCode = 400;
    throw error;
  }

  if (xmlEnvironment !== expectedEnvironment) {
    const error = new Error(
      `El ambiente del XML (${xmlEnvironment}) no coincide con el backend (${config.sriEnv}). Use ${expectedEnvironment} para ${config.sriEnv}.`
    );
    error.statusCode = 400;
    throw error;
  }
}

function parseAuthorization(body) {
  const authorizationStatus = textBetween(body, "<estado>", "</estado>");
  const authorizationNumber = textBetween(body, "<numeroAutorizacion>", "</numeroAutorizacion>");
  const authorizationDate = textBetween(body, "<fechaAutorizacion>", "</fechaAutorizacion>");
  const sriEnvironment = textBetween(body, "<ambiente>", "</ambiente>");
  const message = textBetween(body, "<mensaje>", "</mensaje>");
  const additionalInfo = textBetween(body, "<informacionAdicional>", "</informacionAdicional>");
  const authorizedXml = decodeXmlEntities(textBetween(body, "<comprobante>", "</comprobante>"));

  return {
    authorizationStatus,
    authorizationNumber,
    authorizationDate,
    sriEnvironment,
    sriMessage: [message, additionalInfo].filter(Boolean).join(" - "),
    authorizedXml
  };
}

function parseReceptionStatus(body) {
  const response = textBetween(body, "<RespuestaRecepcionComprobante>", "</RespuestaRecepcionComprobante>");
  return textBetween(response || body, "<estado>", "</estado>");
}

function isRegisteredAccessKeyMessage(value) {
  return /CLAVE\s+ACCESO\s+REGISTRADA/i.test(value || "") || /<identificador>\s*43\s*<\/identificador>/i.test(value || "");
}

function compareAuthorizedDocument(sentXml, authorizedXml) {
  if (!authorizedXml) {
    return { matches: false, reason: "El SRI no devolvio XML autorizado para comparar." };
  }

  const sent = documentFingerprint(sentXml);
  const authorized = documentFingerprint(authorizedXml);
  const differences = Object.keys(sent).filter((key) => sent[key] !== authorized[key]);

  return {
    matches: differences.length === 0,
    reason: differences.length === 0
      ? ""
      : differences.map((key) => `${key} enviado=${sent[key] || "(vacio)"} autorizado=${authorized[key] || "(vacio)"}`).join("; ")
  };
}

function documentFingerprint(xml) {
  const root = xml.includes("<guiaRemision") ? "guia" : xml.includes("<notaCredito") ? "nota_credito" : "factura";
  const common = {
    root,
    codDoc: textBetween(xml, "<codDoc>", "</codDoc>"),
    ruc: textBetween(xml, "<ruc>", "</ruc>"),
    estab: textBetween(xml, "<estab>", "</estab>"),
    ptoEmi: textBetween(xml, "<ptoEmi>", "</ptoEmi>"),
    secuencial: textBetween(xml, "<secuencial>", "</secuencial>")
  };

  if (root === "guia") {
    return {
      ...common,
      transportista: textBetween(xml, "<rucTransportista>", "</rucTransportista>"),
      destinatario: textBetween(xml, "<identificacionDestinatario>", "</identificacionDestinatario>"),
      placa: textBetween(xml, "<placa>", "</placa>"),
      inicio: textBetween(xml, "<fechaIniTransporte>", "</fechaIniTransporte>"),
      fin: textBetween(xml, "<fechaFinTransporte>", "</fechaFinTransporte>"),
      detalle: normalizeXmlText(textBetween(xml, "<detalles>", "</detalles>"))
    };
  }

  if (root === "nota_credito") {
    return {
      ...common,
      fecha: textBetween(xml, "<fechaEmision>", "</fechaEmision>"),
      comprador: textBetween(xml, "<identificacionComprador>", "</identificacionComprador>"),
      docModificado: textBetween(xml, "<numDocModificado>", "</numDocModificado>"),
      fechaSustento: textBetween(xml, "<fechaEmisionDocSustento>", "</fechaEmisionDocSustento>"),
      subtotal: textBetween(xml, "<totalSinImpuestos>", "</totalSinImpuestos>"),
      total: textBetween(xml, "<valorModificacion>", "</valorModificacion>"),
      detalle: normalizeXmlText(textBetween(xml, "<detalles>", "</detalles>"))
    };
  }

  return {
    ...common,
    fecha: textBetween(xml, "<fechaEmision>", "</fechaEmision>"),
    comprador: textBetween(xml, "<identificacionComprador>", "</identificacionComprador>"),
    subtotal: textBetween(xml, "<totalSinImpuestos>", "</totalSinImpuestos>"),
    total: textBetween(xml, "<importeTotal>", "</importeTotal>"),
    detalle: normalizeXmlText(textBetween(xml, "<detalles>", "</detalles>"))
  };
}

function normalizeXmlText(value) {
  return (value || "").replace(/<ds:Signature[\s\S]*?<\/ds:Signature>/g, "").replace(/\s+/g, "");
}

function parseSriMessages(body) {
  const messages = [];
  const regex = /<mensaje>\s*<identificador>[\s\S]*?<\/tipo>\s*<\/mensaje>/g;
  let match;

  while ((match = regex.exec(body)) !== null) {
    const block = match[0];
    const id = textBetween(block, "<identificador>", "</identificador>");
    const message = textBetween(block, "<mensaje>", "</mensaje>");
    const additionalInfo = textBetween(block, "<informacionAdicional>", "</informacionAdicional>");
    const type = textBetween(block, "<tipo>", "</tipo>");
    const parts = [
      id ? `Codigo ${id}` : "",
      message,
      additionalInfo,
      type ? `Tipo ${type}` : ""
    ].filter(Boolean);

    if (parts.length > 0) messages.push(parts.join(" - "));
  }

  return messages.join(" | ");
}

function textBetween(value, open, close) {
  const start = value.indexOf(open);
  if (start < 0) return "";

  const end = value.indexOf(close, start + open.length);
  if (end < 0) return "";

  return value.slice(start + open.length, end);
}

function decodeXmlEntities(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

module.exports = { authorizeInvoice, signInvoice };
