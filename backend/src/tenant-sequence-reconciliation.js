const DOCUMENT_TYPES = new Set(["factura", "nota_credito", "guia_remision"]);

async function reconcileTenantDocumentSequences(client, { companyId, snapshotData, backupSequences = [], updatedAt }) {
  if (!companyId) throw httpError(400, "companyId es obligatorio para reconciliar secuenciales.");
  const currentResult = await client.query(
    `SELECT document_type AS "documentType", environment, establishment, emission_point AS "emissionPoint",
            current_value AS "currentValue"
       FROM document_sequences WHERE company_id = $1 FOR UPDATE`,
    [companyId]
  );
  const documentResult = await client.query(
    `SELECT document_type AS "documentType", environment, establishment, emission_point AS "emissionPoint",
            MAX(sequence::int)::int AS "currentValue"
       FROM sales
      WHERE company_id = $1 AND document_type IN ('factura', 'nota_credito') AND sequence ~ '^[0-9]+$'
      GROUP BY document_type, environment, establishment, emission_point
     UNION ALL
     SELECT 'guia_remision' AS "documentType", environment, establishment, emission_point AS "emissionPoint",
            MAX(sequence::int)::int AS "currentValue"
       FROM remission_guides
      WHERE company_id = $1 AND sequence ~ '^[0-9]+$'
      GROUP BY environment, establishment, emission_point`,
    [companyId]
  );

  const candidates = new Map();
  addCandidates(candidates, currentResult.rows, "current");
  addCandidates(candidates, normalizeBackupSequences(backupSequences, companyId), "backup");
  addCandidates(candidates, documentResult.rows, "documents");
  addCandidates(candidates, snapshotSequenceCandidates(snapshotData), "snapshot");

  const reconciled = [];
  for (const candidate of candidates.values()) {
    const currentValue = Math.max(candidate.current, candidate.backup, candidate.documents, candidate.snapshot, 0);
    const id = sequenceKey(companyId, candidate);
    await client.query(
      `INSERT INTO document_sequences
        (id, company_id, document_type, establishment, emission_point, environment, current_value, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT(id) DO UPDATE SET
         current_value = GREATEST(document_sequences.current_value, EXCLUDED.current_value),
         updated_at = EXCLUDED.updated_at`,
      [id, companyId, candidate.documentType, candidate.establishment, candidate.emissionPoint, candidate.environment, currentValue, updatedAt]
    );
    reconciled.push({
      documentType: candidate.documentType,
      environment: candidate.environment,
      establishment: candidate.establishment,
      emissionPoint: candidate.emissionPoint,
      currentValue
    });
  }
  return reconciled;
}

function addCandidates(target, rows, source) {
  for (const row of rows || []) {
    const normalized = normalizeScope(row);
    if (!normalized) continue;
    const key = scopeKey(normalized);
    const candidate = target.get(key) || { ...normalized, current: 0, backup: 0, documents: 0, snapshot: 0 };
    candidate[source] = Math.max(candidate[source], safeCurrentValue(row.currentValue));
    target.set(key, candidate);
  }
}

function normalizeBackupSequences(rows, companyId) {
  return (Array.isArray(rows) ? rows : []).filter((row) => !row.companyId || String(row.companyId) === String(companyId));
}

function snapshotSequenceCandidates(data = {}) {
  const issuer = data?.issuer && typeof data.issuer === "object" ? data.issuer : {};
  const environment = normalizeEnvironment(issuer.environment);
  const establishments = Array.isArray(issuer.establishments) && issuer.establishments.length
    ? issuer.establishments
    : [issuer];
  return establishments.flatMap((establishment) => {
    const scope = {
      environment,
      establishment: normalizeThreeDigits(establishment.establishment || issuer.establishment),
      emissionPoint: normalizeThreeDigits(establishment.emissionPoint || issuer.emissionPoint)
    };
    return [
      { ...scope, documentType: "factura", currentValue: configuredCurrent(establishment.sequential ?? issuer.sequential) },
      { ...scope, documentType: "nota_credito", currentValue: configuredCurrent(establishment.creditNoteSequential ?? issuer.creditNoteSequential) },
      { ...scope, documentType: "guia_remision", currentValue: configuredCurrent(establishment.remissionSequential ?? issuer.remissionSequential) }
    ];
  });
}

function normalizeScope(row = {}) {
  const documentType = String(row.documentType || row.document_type || "");
  if (!DOCUMENT_TYPES.has(documentType)) return null;
  return {
    documentType,
    environment: normalizeEnvironment(row.environment),
    establishment: normalizeThreeDigits(row.establishment),
    emissionPoint: normalizeThreeDigits(row.emissionPoint || row.emission_point)
  };
}

function configuredCurrent(nextValue) {
  return Math.max(0, Math.floor(Number(nextValue || 1)) - 1);
}

function safeCurrentValue(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeEnvironment(value) {
  return String(value || "1") === "2" ? "2" : "1";
}

function normalizeThreeDigits(value) {
  return String(value || "1").replace(/\D/g, "").padStart(3, "0").slice(-3);
}

function scopeKey(scope) {
  return [scope.documentType, scope.environment, scope.establishment, scope.emissionPoint].join(":");
}

function sequenceKey(companyId, scope) {
  return [companyId, scope.documentType, scope.environment, scope.establishment, scope.emissionPoint].join(":");
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = { reconcileTenantDocumentSequences, snapshotSequenceCandidates };
