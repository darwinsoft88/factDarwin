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

function normalizeSriEnv(sriEnv) {
  return sriEnv === "production" ? "production" : "test";
}

async function sendToReception(signedXml, sriEnv = config.sriEnv) {
  const env = normalizeSriEnv(sriEnv);
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

  return postSoap(endpoints[env].reception, envelope);
}

async function askAuthorization(accessKey, sriEnv = config.sriEnv) {
  const env = normalizeSriEnv(sriEnv);
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:autorizacionComprobante>
      <claveAccesoComprobante>${accessKey}</claveAccesoComprobante>
    </ec:autorizacionComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;

  return postSoap(endpoints[env].authorization, envelope);
}

async function postSoap(url, envelope) {
  const maxAttempts = 2;
  const timeoutMs = 12_000;

  const requestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "text/xml;charset=UTF-8",
      SOAPAction: ""
    },
    body: envelope,
    ...(sriDispatcher ? { dispatcher: sriDispatcher } : {})
  };

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...requestOptions,
        signal: AbortSignal.timeout(timeoutMs)
      });

      const body = await response.text();

      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          body
        };
      }

      const retryableStatus = [429, 502, 503, 504].includes(response.status);

      if (!retryableStatus || attempt === maxAttempts) {
        const friendly = new Error(
          `El servicio del SRI respondio HTTP ${response.status}. ` +
          `URL: ${url}. Respuesta: ${body.slice(0, 500)}`
        );
        friendly.statusCode = 502;
        throw friendly;
      }

      lastError = new Error(
        `El SRI respondio temporalmente HTTP ${response.status}.`
      );
    } catch (error) {
      if (error?.statusCode === 502) {
        throw error;
      }

      lastError = error;

      const retryable = isRetryableSriConnectionError(error);

      if (!retryable || attempt === maxAttempts) {
        const message =
          error instanceof Error ? error.message : String(error);

        const causeCode = error?.cause?.code
          ? ` Codigo: ${error.cause.code}.`
          : "";

        const tlsHint =
          error?.cause?.code === "ERR_TLS_CERT_ALTNAME_INVALID"
            ? " El certificado TLS del endpoint SRI no coincide con el host. " +
              "Para ambiente de pruebas puede activar " +
              "SRI_ALLOW_INSECURE_TLS=true en backend/.env y reiniciar el backend."
            : "";

        const friendly = new Error(
          `No se pudo conectar con el servicio del SRI después de ` +
          `${attempt} intento(s). URL: ${url}. ` +
          `Detalle: ${message}.${causeCode}${tlsHint}`
        );

        friendly.statusCode = 502;
        throw friendly;
      }
    }

    await delay(attempt * 1500);
  }

  throw lastError;
}

function isRetryableSriConnectionError(error) {
  const code = String(error?.cause?.code || "");
  const name = String(error?.name || "");
  const message = String(error?.message || "").toLowerCase();

  return (
    name === "TimeoutError" ||
    name === "AbortError" ||
    message.includes("timeout") ||
    message.includes("fetch failed") ||
    [
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "EAI_AGAIN",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_HEADERS_TIMEOUT",
      "UND_ERR_SOCKET"
    ].includes(code)
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
module.exports = { askAuthorization, sendToReception };
