const paymentPanelStyles = `
  .payment-list { display: grid; gap: 9px; }
  .payment-item { border: 1px solid #dbe4ee; border-radius: 10px; padding: 13px; display: grid; grid-template-columns: minmax(140px,1fr) minmax(100px,.55fr) minmax(180px,.8fr) minmax(230px,1fr) auto; gap: 10px; align-items: center; }
  .payment-main b { display: block; font-size: 16px; color: #0f766e; }
  .payment-meta { color: #64748b; font-size: 11px; font-weight: 700; }
  .payment-actions button { min-height: 36px; padding: 0 11px; }
  .payment-renewal-badge { display: block; width: fit-content; margin-top: 5px; white-space: nowrap; }
  .dialog-backdrop { position: fixed; inset: 0; z-index: 30; display: none; align-items: center; justify-content: center; padding: 18px; background: rgba(5,25,35,.62); }
  .dialog-backdrop.visible { display: flex; }
  .dialog-card { width: min(460px,100%); padding: 20px; border-radius: 13px; background: #fff; box-shadow: 0 24px 70px rgba(0,0,0,.28); }
  .dialog-card h2 { margin-bottom: 5px; }
  @media (max-width: 720px) { .payment-item { grid-template-columns: 1fr 1fr; } .payment-main, .payment-actions { grid-column: 1 / -1; } }
`;

const paymentPanelMarkup = `
  <div id="view-payments" class="panel-view">
    <div class="page-heading"><h2>Pagos y renovaciones</h2><p>Historial financiero interno de la empresa seleccionada. Un pago no cambia automaticamente la licencia.</p></div>
    <section>
      <h2>Registrar pago</h2>
      <div class="grid">
        <label>Valor USD<input id="paymentAmount" type="number" min="0.01" step="0.01" placeholder="0.00" /></label>
        <label>Fecha de pago<input id="paymentPaidAt" type="date" /></label>
        <label>Metodo<select id="paymentMethod"><option value="transfer">Transferencia</option><option value="deposit">Deposito</option><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="other">Otro</option></select></label>
        <label>Estado<select id="paymentStatus"><option value="confirmed">Confirmado</option><option value="pending">Pendiente</option></select></label>
        <label>Inicio del periodo<input id="paymentPeriodStart" type="date" /></label>
        <label>Fin del periodo<input id="paymentPeriodEnd" type="date" /></label>
        <label>Referencia<input id="paymentReference" maxlength="120" placeholder="Transferencia, deposito o comprobante" /></label>
        <label>Observacion<input id="paymentNotes" maxlength="500" placeholder="Detalle interno opcional" /></label>
      </div>
      <p></p><button onclick="createPayment()">Registrar pago</button>
    </section>
    <section>
      <div class="tenant-title"><h2>Historial</h2><span id="paymentsSummary" class="pill">0 pagos</span></div>
      <p id="paymentsEmpty">Seleccione una empresa para consultar sus pagos.</p>
      <div id="paymentsList" class="payment-list"></div>
    </section>
  </div>
`;

const paymentStatusModalMarkup = `
  <div id="paymentStatusModal" class="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="paymentStatusTitle">
    <div class="dialog-card">
      <h2 id="paymentStatusTitle">Cambiar estado del pago</h2>
      <p>Seleccione el nuevo estado. Para anular o reembolsar debe escribir el motivo.</p>
      <label>Nuevo estado<select id="paymentNewStatus"><option value="pending">Pendiente</option><option value="confirmed">Confirmado</option><option value="void">Anulado</option><option value="refunded">Reembolsado</option></select></label>
      <p></p>
      <label>Motivo u observacion<textarea id="paymentStatusReason" placeholder="Obligatorio para anulaciones y reembolsos"></textarea></label>
      <p></p>
      <div class="actions"><button class="secondary" onclick="closePaymentStatusModal()">Cancelar</button><button onclick="savePaymentStatus()">Guardar estado</button></div>
    </div>
  </div>
`;

const paymentRenewalModalMarkup = `
  <div id="paymentRenewalModal" class="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="paymentRenewalTitle">
    <div class="dialog-card">
      <h2 id="paymentRenewalTitle">Aplicar pago a la licencia</h2>
      <p id="paymentRenewalPeriod">Esta operacion activara la licencia durante el periodo registrado en el pago.</p>
      <label>Plan contratado<select id="paymentRenewalPlan"><option value="basico_mensual">Basico mensual</option><option value="basico_anual">Basico anual</option><option value="pro_mensual">Pro mensual</option><option value="pro_anual">Pro anual</option><option value="premium_mensual">Premium mensual</option><option value="premium_anual">Premium anual</option></select></label>
      <p class="status bad">Confirme cuidadosamente: el pago quedara vinculado a esta renovacion y no podra anularse sin gestionar primero la licencia.</p>
      <div class="actions"><button class="secondary" onclick="closePaymentRenewalModal()">Cancelar</button><button onclick="applyPaymentRenewal()">Confirmar y renovar</button></div>
    </div>
  </div>
`;

const paymentReversalModalMarkup = `
  <div id="paymentReversalModal" class="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="paymentReversalTitle">
    <div class="dialog-card">
      <h2 id="paymentReversalTitle">Revertir renovacion</h2>
      <p>Se restaurara la licencia que tenia la empresa antes de aplicar este pago.</p>
      <label>Motivo de la reversion<textarea id="paymentReversalReason" maxlength="500" placeholder="Ej. Pago aplicado a la empresa equivocada"></textarea></label>
      <p class="status bad">Esta accion solo es posible si no existe una renovacion posterior.</p>
      <div class="actions"><button class="secondary" onclick="closePaymentReversalModal()">Cancelar</button><button class="danger" onclick="reversePaymentRenewal()">Confirmar reversion</button></div>
    </div>
  </div>
`;

const paymentPanelClientScript = String.raw`
    let payments = [];
    let selectedPaymentId = "";

    function renderPayments() {
      const confirmedTotal = payments.filter((item) => item.status === "confirmed").reduce((sum, item) => sum + Number(item.amount || 0), 0);
      $("paymentsSummary").textContent = payments.length + " pago(s) | Confirmados $" + confirmedTotal.toFixed(2);
      $("paymentsEmpty").style.display = payments.length ? "none" : "block";
      $("paymentsEmpty").textContent = selectedCompanyId ? "Esta empresa todavia no tiene pagos registrados." : "Seleccione una empresa para consultar sus pagos.";
      const statusLabels = { pending: "Pendiente", confirmed: "Confirmado", void: "Anulado", refunded: "Reembolsado" };
      const methodLabels = { transfer: "Transferencia", deposit: "Deposito", cash: "Efectivo", card: "Tarjeta", other: "Otro" };
      $("paymentsList").innerHTML = payments.map((payment) => {
        const bad = ["void", "refunded"].includes(payment.status);
        const period = payment.periodStart || payment.periodEnd ? (payment.periodStart || "-") + " a " + (payment.periodEnd || "-") : "Sin periodo asociado";
        const renewalLabel = payment.licenseReversedAt
          ? '<span class="pill bad payment-renewal-badge">Renovacion revertida</span>'
          : payment.licenseAppliedAt ? '<span class="pill payment-renewal-badge">Licencia aplicada hasta ' + escapeHtml(payment.licenseExpiresAt || payment.periodEnd || "-") + '</span>' : '';
        const renewalButton = payment.status === "confirmed" && payment.periodStart && payment.periodEnd && !payment.licenseAppliedAt
          ? '<button onclick="openPaymentRenewalModal(\'' + payment.id + '\')">Renovar licencia</button>' : '';
        const reversalButton = payment.licenseAppliedAt && payment.licensePrevious && !payment.licenseReversedAt
          ? '<button class="danger" onclick="openPaymentReversalModal(\'' + payment.id + '\')">Revertir renovacion</button>' : '';
        return '<div class="payment-item">' +
          '<div class="payment-main"><b>$' + Number(payment.amount || 0).toFixed(2) + ' ' + escapeHtml(payment.currency || "USD") + '</b><span class="payment-meta">' + escapeHtml(methodLabels[payment.paymentMethod] || payment.paymentMethod) + '</span></div>' +
          '<div><div class="payment-meta">FECHA</div><strong>' + escapeHtml(payment.paidAt || "-") + '</strong></div>' +
          '<div><div class="payment-meta">PERIODO</div><strong>' + escapeHtml(period) + '</strong></div>' +
          '<div><span class="pill ' + (bad ? 'bad' : '') + '">' + escapeHtml(statusLabels[payment.status] || payment.status) + '</span><div class="payment-meta">' + escapeHtml(payment.reference || "Sin referencia") + '</div>' + renewalLabel + '</div>' +
          '<div class="payment-actions"><button class="secondary" onclick="openPaymentStatusModal(\'' + payment.id + '\')">Cambiar estado</button>' + renewalButton + reversalButton + '</div>' +
        '</div>';
      }).join("");
    }

    async function loadPayments() {
      try {
        const tenant = requireSelectedTenant();
        const response = await fetch("/api/master/tenants/" + encodeURIComponent(tenant.id) + "/payments", { headers: headers() });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No se pudieron cargar los pagos.");
        payments = data.payments || [];
        renderPayments();
      } catch (error) { payments = []; renderPayments(); setStatus(error.message, true); }
    }

    async function createPayment() {
      try {
        const tenant = requireSelectedTenant();
        const payload = { amount: Number($("paymentAmount").value), paidAt: $("paymentPaidAt").value, paymentMethod: $("paymentMethod").value, status: $("paymentStatus").value, periodStart: $("paymentPeriodStart").value, periodEnd: $("paymentPeriodEnd").value, reference: $("paymentReference").value, notes: $("paymentNotes").value };
        if (!confirm("Registrar pago de $" + Number(payload.amount || 0).toFixed(2) + " para " + currentTenantName() + "?")) return;
        const response = await fetch("/api/master/tenants/" + encodeURIComponent(tenant.id) + "/payments", { method: "POST", headers: headers(), body: JSON.stringify(payload) });
        const data = await response.json(); show(data);
        if (!response.ok) throw new Error(data.error || "No se pudo registrar el pago.");
        $("paymentAmount").value = ""; $("paymentReference").value = ""; $("paymentNotes").value = "";
        await loadPayments(); setStatus("Pago registrado correctamente.");
      } catch (error) { setStatus(error.message, true); }
    }

    function openPaymentStatusModal(paymentId) {
      const payment = payments.find((item) => item.id === paymentId);
      if (!payment) { setStatus("Pago no encontrado.", true); return; }
      selectedPaymentId = paymentId; $("paymentNewStatus").value = payment.status; $("paymentStatusReason").value = ""; $("paymentStatusModal").classList.add("visible");
    }

    function closePaymentStatusModal() { selectedPaymentId = ""; $("paymentStatusModal").classList.remove("visible"); }

    async function savePaymentStatus() {
      try {
        const tenant = requireSelectedTenant();
        const payment = payments.find((item) => item.id === selectedPaymentId);
        if (!payment) throw new Error("Pago no encontrado.");
        const status = $("paymentNewStatus").value;
        const notes = $("paymentStatusReason").value.trim();
        if (status === payment.status) { closePaymentStatusModal(); return; }
        if (["void", "refunded"].includes(status) && notes.length < 3) throw new Error("Escriba el motivo de la anulacion o el reembolso.");
        const response = await fetch("/api/master/tenants/" + encodeURIComponent(tenant.id) + "/payments/" + encodeURIComponent(selectedPaymentId), { method: "PATCH", headers: headers(), body: JSON.stringify({ status, notes }) });
        const data = await response.json(); show(data);
        if (!response.ok) throw new Error(data.error || "No se pudo cambiar el estado.");
        closePaymentStatusModal(); await loadPayments(); setStatus("Estado del pago actualizado.");
      } catch (error) { setStatus(error.message, true); }
    }

    function openPaymentRenewalModal(paymentId) {
      const payment = payments.find((item) => item.id === paymentId);
      if (!payment) { setStatus("Pago no encontrado.", true); return; }
      selectedPaymentId = paymentId;
      $("paymentRenewalPeriod").textContent = "La licencia quedara activa desde " + payment.periodStart + " hasta " + payment.periodEnd + ".";
      $("paymentRenewalModal").classList.add("visible");
    }

    function closePaymentRenewalModal() { selectedPaymentId = ""; $("paymentRenewalModal").classList.remove("visible"); }

    async function applyPaymentRenewal() {
      try {
        const tenant = requireSelectedTenant();
        const payment = payments.find((item) => item.id === selectedPaymentId);
        if (!payment) throw new Error("Pago no encontrado.");
        const plan = $("paymentRenewalPlan").value;
        const response = await fetch("/api/master/tenants/" + encodeURIComponent(tenant.id) + "/payments/" + encodeURIComponent(payment.id) + "/apply-renewal", {
          method: "POST", headers: headers(), body: JSON.stringify({ plan })
        });
        const data = await response.json(); show(data);
        if (!response.ok) throw new Error(data.error || "No se pudo renovar la licencia.");
        closePaymentRenewalModal();
        await Promise.all([loadPayments(), loadLicense()]);
        setStatus("Pago aplicado: licencia renovada hasta " + data.license.expiresAt + ".");
      } catch (error) { setStatus(error.message, true); }
    }

    function openPaymentReversalModal(paymentId) {
      const payment = payments.find((item) => item.id === paymentId);
      if (!payment) { setStatus("Pago no encontrado.", true); return; }
      selectedPaymentId = paymentId;
      $("paymentReversalReason").value = "";
      $("paymentReversalModal").classList.add("visible");
    }

    function closePaymentReversalModal() { selectedPaymentId = ""; $("paymentReversalModal").classList.remove("visible"); }

    async function reversePaymentRenewal() {
      try {
        const tenant = requireSelectedTenant();
        const payment = payments.find((item) => item.id === selectedPaymentId);
        if (!payment) throw new Error("Pago no encontrado.");
        const reason = $("paymentReversalReason").value.trim();
        if (reason.length < 5) throw new Error("Escriba un motivo de al menos 5 caracteres.");
        const response = await fetch("/api/master/tenants/" + encodeURIComponent(tenant.id) + "/payments/" + encodeURIComponent(payment.id) + "/reverse-renewal", {
          method: "POST", headers: headers(), body: JSON.stringify({ reason })
        });
        const data = await response.json(); show(data);
        if (!response.ok) throw new Error(data.error || "No se pudo revertir la renovacion.");
        closePaymentReversalModal();
        await Promise.all([loadPayments(), loadLicense()]);
        setStatus("Renovacion revertida y licencia anterior restaurada.");
      } catch (error) { setStatus(error.message, true); }
    }
`;

module.exports = { paymentPanelClientScript, paymentPanelMarkup, paymentPanelStyles, paymentRenewalModalMarkup, paymentReversalModalMarkup, paymentStatusModalMarkup };
