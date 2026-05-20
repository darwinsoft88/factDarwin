const config = require("../config");
const { endpoints } = require("./endpoints");
const { Agent } = require("undici");

const sriDispatcher = config.sriAllowInsecureTls
  ? new Agent({
      connect: {
        rejectUnauthorized: false
      }
    })
  : undefined;

async function sendToReception(signedXml) {
  const xmlBase64 = Buffer.from(signedXml, "utf8").toString("base64");
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.recepcion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:validarComprobante>
      <xml>${xmlBase64}</xml>
    </ec:validarComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;

  return postSoap(endpoints[config.sriEnv].reception, envelope);
}

async function askAuthorization(accessKey) {
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:autorizacionComprobante>
      <claveAccesoComprobante>${accessKey}</claveAccesoComprobante>
    </ec:autorizacionComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;

  return postSoap(endpoints[config.sriEnv].authorization, envelope);
}

async function postSoap(url, envelope) {
  let response;
  const requestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "text/xml;charset=UTF-8",
      SOAPAction: ""
    },
    body: envelope,
    ...(sriDispatcher ? { dispatcher: sriDispatcher } : {})
  };

  try {
    response = await fetch(url, requestOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const causeCode = error?.cause?.code ? ` Codigo: ${error.cause.code}.` : "";
    const tlsHint =
      error?.cause?.code === "ERR_TLS_CERT_ALTNAME_INVALID"
        ? " El certificado TLS del endpoint SRI no coincide con el host. Para ambiente de pruebas puede activar SRI_ALLOW_INSECURE_TLS=true en backend/.env y reiniciar el backend."
        : "";
    const friendly = new Error(`No se pudo conectar con el servicio del SRI. URL: ${url}. Detalle: ${message}.${causeCode}${tlsHint}`);
    friendly.statusCode = 502;
    throw friendly;
  }

  const body = await response.text();

  if (!response.ok) {
    const friendly = new Error(`El servicio del SRI respondio HTTP ${response.status}. URL: ${url}. Respuesta: ${body.slice(0, 500)}`);
    friendly.statusCode = 502;
    throw friendly;
  }

  return {
    ok: response.ok,
    status: response.status,
    body
  };
}

module.exports = { askAuthorization, sendToReception };
