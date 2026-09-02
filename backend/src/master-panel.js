const { paymentPanelClientScript, paymentPanelMarkup, paymentPanelStyles, paymentRenewalModalMarkup, paymentReversalModalMarkup, paymentStatusModalMarkup } = require("./master-panel/payments-section");

function renderMasterPanel() {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>DarwinSoft | Panel SaaS FactuDarwin</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: #102033; background: #f1f5f7; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; }
    button, input, select, textarea { font: inherit; }
    .app-shell { min-height: 100vh; display: grid; grid-template-columns: 250px minmax(0, 1fr); }
    .sidebar { position: sticky; top: 0; height: 100vh; padding: 22px 16px; background: #0b2530; color: #fff; display: flex; flex-direction: column; gap: 24px; }
    .brand { display: flex; align-items: center; gap: 11px; padding: 0 7px; }
    .mark { width: 42px; height: 42px; border-radius: 11px; background: #14b8a6; color: white; display: grid; place-items: center; font-weight: 900; box-shadow: 0 8px 22px rgba(20,184,166,.25); }
    .brand-name { font-size: 18px; font-weight: 900; letter-spacing: -.02em; }
    .brand-subtitle { margin-top: 2px; color: #9fb5bd; font-size: 11px; font-weight: 700; }
    .nav { display: grid; gap: 6px; }
    .nav-label { padding: 0 10px 6px; color: #78939d; font-size: 10px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
    .nav-button { min-height: 43px; width: 100%; display: flex; align-items: center; gap: 10px; padding: 0 12px; border: 0; border-radius: 9px; background: transparent; color: #c9d7dc; font-weight: 800; text-align: left; cursor: pointer; }
    .nav-button:hover { background: rgba(255,255,255,.07); color: #fff; }
    .nav-button.active { background: #0f766e; color: #fff; box-shadow: 0 7px 18px rgba(0,0,0,.18); }
    .nav-icon { width: 24px; text-align: center; font-size: 16px; }
    .sidebar-footer { margin-top: auto; padding: 12px; border: 1px solid rgba(255,255,255,.1); border-radius: 10px; background: rgba(255,255,255,.04); }
    .sidebar-footer b { display: block; font-size: 12px; }
    .sidebar-footer span { color: #9fb5bd; font-size: 11px; }
    .workspace { min-width: 0; }
    .topbar { min-height: 76px; padding: 14px 28px; background: rgba(255,255,255,.96); border-bottom: 1px solid #dce6eb; display: flex; align-items: center; justify-content: space-between; gap: 16px; position: sticky; top: 0; z-index: 5; }
    .topbar h1 { margin: 0; font-size: 20px; letter-spacing: -.02em; }
    .topbar p { margin: 3px 0 0; font-size: 12px; }
    .selected-company { padding: 7px 11px; border-radius: 8px; background: #ecfdf5; color: #047857; font-size: 12px; font-weight: 900; }
    .global-status { max-width: 1280px; margin: 14px auto -10px; padding: 0 28px; }
    main { max-width: 1280px; margin: 0 auto; padding: 24px 28px 40px; }
    section { background: #fff; border: 1px solid #dbe4ee; border-radius: 12px; padding: 20px; box-shadow: 0 4px 16px rgba(15,35,45,.035); }
    .panel-view { display: none; gap: 14px; }
    .panel-view.active { display: grid; }
    .page-heading { margin-bottom: 2px; }
    .page-heading h2 { margin-bottom: 4px; }
    .page-heading p { margin: 0; }
    h1, h2 { margin: 0; }
    h2 { font-size: 18px; margin-bottom: 12px; }
    p { color: #536875; line-height: 1.5; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .stat { border: 1px solid #e2e8f0; border-radius: 10px; padding: 15px; background: linear-gradient(145deg,#fff,#f6fafb); }
    .stat b { display: block; font-size: 22px; color: #0f766e; }
    .tenants { display: grid; gap: 8px; }
    .company-tools { display: grid; grid-template-columns: minmax(240px,1fr) minmax(170px,240px); gap: 10px; margin-bottom: 12px; }
    .company-results { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 12px 0 0; color: #64748b; font-size: 12px; font-weight: 800; }
    .company-pagination { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 12px; }
    .tenant { width: 100%; min-height: auto; border: 1px solid #dbe4ee; border-radius: 9px; padding: 12px; background: #fff; color: #102033; text-align: left; display: grid; gap: 5px; }
    .tenant.active { border-color: #0f766e; background: #ecfdf5; }
    .tenant-title { display: flex; justify-content: space-between; gap: 10px; font-weight: 900; }
    .tenant-meta { color: #64748b; font-size: 12px; font-weight: 700; }
    .pill { border-radius: 999px; padding: 3px 8px; background: #dcfce7; color: #047857; font-size: 11px; font-weight: 900; }
    .pill.bad { background: #fee2e2; color: #991b1b; }
    label { display: grid; gap: 6px; font-size: 12px; font-weight: 800; color: #475569; }
    input, select, textarea { min-height: 42px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; font: inherit; }
    textarea { min-height: 88px; resize: vertical; }
    button { border: 0; border-radius: 8px; min-height: 44px; padding: 0 16px; background: #0f766e; color: white; font-weight: 900; cursor: pointer; }
    button.secondary { background: #1f2937; }
    button.danger { background: #b91c1c; }
    button:disabled { opacity: .6; cursor: not-allowed; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; }
    .status { padding: 10px 12px; border-radius: 8px; font-weight: 900; background: #e0f2fe; color: #075985; }
    .status.bad { background: #fee2e2; color: #991b1b; }
    .checks { display: flex; flex-wrap: wrap; gap: 8px; }
    .check { display: flex; align-items: center; gap: 8px; min-height: 38px; padding: 8px 10px; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: 800; }
    .check input { min-height: auto; }
    pre { white-space: pre-wrap; background: #0f172a; color: #e2e8f0; border-radius: 8px; padding: 12px; overflow: auto; max-height: 280px; }
    details summary { cursor: pointer; font-weight: 900; color: #334155; }
    details[open] summary { margin-bottom: 12px; }
    .muted-card { background: #f8fafc; }
    @media (max-width: 900px) {
      .app-shell { grid-template-columns: 1fr; }
      .sidebar { position: static; height: auto; padding: 12px; gap: 12px; }
      .sidebar .brand, .sidebar-footer, .nav-label { display: none; }
      .nav { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
      .nav-button { width: auto; flex: 0 0 auto; padding: 0 12px; }
      .topbar { position: static; padding: 13px 16px; }
      main { padding: 14px 12px 28px; }
      .global-status { margin-top: 10px; padding: 0 12px; }
    }
    @media (max-width: 720px) { .grid, .stats, .company-tools { grid-template-columns: 1fr; } .topbar { align-items: flex-start; } .selected-company { display: none; } section { padding: 15px; } }
    ${paymentPanelStyles}
  </style>
</head>
<body>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="mark">DS</div>
        <div>
          <div class="brand-name">DarwinSoft</div>
          <div class="brand-subtitle">Administracion SaaS</div>
        </div>
      </div>
      <nav class="nav">
        <div class="nav-label">Administracion</div>
        <button class="nav-button active" data-view="overview" onclick="showPanelView('overview')"><span class="nav-icon">⌂</span>Resumen</button>
        <button class="nav-button" data-view="companies" onclick="showPanelView('companies')"><span class="nav-icon">▦</span>Empresas</button>
        <button class="nav-button" data-view="license" onclick="showPanelView('license')"><span class="nav-icon">◆</span>Licencias y modulos</button>
        <button class="nav-button" data-view="payments" onclick="showPanelView('payments')"><span class="nav-icon">$</span>Pagos</button>
        <button class="nav-button" data-view="lifecycle" onclick="showPanelView('lifecycle')"><span class="nav-icon">↻</span>Ciclo de vida</button>
        <button class="nav-button" data-view="backups" onclick="showPanelView('backups')"><span class="nav-icon">⇩</span>Respaldos</button>
      </nav>
      <div class="sidebar-footer"><b>FactuDarwin</b><span>Panel maestro protegido</span></div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <div><h1 id="pageTitle">Resumen general</h1><p>Control operativo de empresas, licencias y accesos.</p></div>
        <div class="actions"><span id="selectedCompanyLabel" class="selected-company">Sin empresa seleccionada</span><button class="secondary" onclick="changeKey()">Cambiar clave</button></div>
      </header>
      <div class="global-status"><div id="status" class="status">Pendiente de cargar</div></div>
      <main>
        <div id="view-overview" class="panel-view active">
          <div class="page-heading"><h2>Vista general</h2><p>Indicadores principales del servicio SaaS.</p></div>
          <div class="stats">
            <div class="stat"><b id="tenantCount">0</b><span>Empresas</span></div>
            <div class="stat"><b id="trialCount">0</b><span>En prueba</span></div>
            <div class="stat"><b id="activeCount">0</b><span>Activas</span></div>
            <div class="stat"><b id="expiredCount">0</b><span>Sin acceso</span></div>
          </div>
          <section><details><summary>Ver diagnostico tecnico de la ultima operacion</summary><pre id="output"></pre></details></section>
        </div>

        <div id="view-companies" class="panel-view">
          <div class="page-heading"><h2>Empresas SaaS</h2><p>Seleccione una empresa para administrarla. No se muestran claves, tokens ni certificados.</p></div>
          <section>
            <div class="company-tools">
              <label>Buscar empresa<input id="companySearch" type="search" maxlength="120" placeholder="RUC, empresa, nombre, correo o administrador" oninput="scheduleCompanySearch()" /></label>
              <label>Estado<select id="companyStatusFilter" onchange="applyCompanyFilters()"><option value="">Todos</option><option value="active">Activas</option><option value="trial">En prueba</option><option value="inactive">Desactivadas</option><option value="archived">Archivadas</option><option value="expired">Vencidas</option><option value="suspended">Suspendidas</option></select></label>
            </div>
            <div id="companyResults" class="company-results">0 empresas encontradas</div>
            <div id="tenants" class="tenants"></div>
            <div class="company-pagination"><button id="companyPrevious" class="secondary" onclick="changeCompanyPage(-1)">Anterior</button><span id="companyPage">Pagina 1 de 1</span><button id="companyNext" class="secondary" onclick="changeCompanyPage(1)">Siguiente</button></div>
          </section>
        </div>

        <div id="view-backups" class="panel-view">
          <div class="page-heading"><h2>Respaldos</h2><p>Herramientas de exportacion y recuperacion por empresa.</p></div>
          <section>
      <h2>Respaldo por empresa</h2>
      <p>Exporta o restaura solo la empresa seleccionada. Antes de restaurar se genera automaticamente un backup completo de PostgreSQL.</p>
      <div class="actions">
        <button onclick="exportTenant()">Exportar empresa</button>
        <button class="secondary" onclick="restoreTenant()">Restaurar empresa</button>
      </div>
      <p></p>
      <label>Backup JSON para restaurar
        <textarea id="tenantBackupJson" placeholder="Pegue aqui el JSON exportado de una empresa"></textarea>
      </label>
          </section>
        </div>

        ${paymentPanelMarkup}

        <div id="view-lifecycle" class="panel-view">
          <div class="page-heading"><h2>Ciclo de vida</h2><p>Control seguro del estado y conservacion de cada cuenta.</p></div>
          <section>
      <h2>Ciclo de vida de la empresa</h2>
      <p>Desactivar y archivar son reversibles. La eliminacion definitiva solo se habilita para cuentas vacias y genera un respaldo PostgreSQL previo.</p>
      <div id="lifecycleAssessment" class="status">Seleccione una empresa para evaluar sus datos.</div>
      <p></p>
      <div class="actions">
        <button class="secondary" onclick="changeTenantLifecycle('deactivate')">Desactivar acceso</button>
        <button class="secondary" onclick="changeTenantLifecycle('archive')">Archivar</button>
        <button onclick="changeTenantLifecycle('reactivate')">Reactivar</button>
        <button id="deleteTenantButton" class="danger" onclick="deleteTenantPermanently()" disabled>Eliminar cuenta vacia</button>
      </div>
          </section>
        </div>

        <div id="view-license" class="panel-view">
          <div class="page-heading"><h2>Licencias y modulos</h2><p>Planes, limites y capacidades habilitadas para la empresa seleccionada.</p></div>
          <section>
      <h2 id="licenseTitle">Licencia legacy</h2>
      <div class="grid">
        <label>Estado
          <select id="statusField">
            <option value="trial">Prueba</option>
            <option value="active">Activa</option>
            <option value="expired">Vencida</option>
            <option value="suspended">Suspendida</option>
          </select>
        </label>
        <label>Plan
          <select id="plan">
            <option value="trial">Demo abierto</option>
            <option value="basico_mensual">Basico mensual</option>
            <option value="basico_anual">Basico anual</option>
            <option value="pro_mensual">Pro mensual</option>
            <option value="pro_anual">Pro anual</option>
            <option value="premium_mensual">Premium mensual</option>
            <option value="premium_anual">Premium anual</option>
          </select>
        </label>
        <label>Inicio
          <input id="startsAt" type="date" />
        </label>
        <label>Vence
          <input id="expiresAt" type="date" />
        </label>
        <label>Max. usuarios
          <input id="maxUsers" type="number" min="1" step="1" />
        </label>
        <label>Max. dispositivos
          <input id="maxDevices" type="number" min="1" step="1" />
        </label>
        <label>Max. puntos de emision
          <input id="maxEmissionPoints" type="number" min="1" step="1" />
        </label>
      </div>
      <p>Modulos incluidos</p>
      <div class="checks">
        <label class="check"><input id="featureSales" type="checkbox" /> Ventas</label>
        <label class="check"><input id="featureDocuments" type="checkbox" /> Documentos</label>
        <label class="check"><input id="featureClients" type="checkbox" /> Clientes</label>
        <label class="check"><input id="featureProducts" type="checkbox" /> Productos</label>
        <label class="check"><input id="featureSri" type="checkbox" /> SRI</label>
        <label class="check"><input id="featureInventory" type="checkbox" /> Inventario</label>
        <label class="check"><input id="featureCash" type="checkbox" /> Caja</label>
        <label class="check"><input id="featureCredits" type="checkbox" /> Creditos</label>
        <label class="check"><input id="featureGuides" type="checkbox" /> Guias de remision</label>
        <label class="check"><input id="featureUsers" type="checkbox" /> Usuarios</label>
        <label class="check"><input id="featureReports" type="checkbox" /> Reportes</label>
        <label class="check"><input id="featureMultiDevice" type="checkbox" /> Multi dispositivo</label>
        <label class="check"><input id="featureMultiEmissionPoint" type="checkbox" /> Multi punto emision</label>
      </div>
      <p></p>
      <label>Notas internas
        <textarea id="notes"></textarea>
      </label>
      <p></p>
      <div class="actions">
        <button onclick="loadLicense()">Cargar licencia</button>
        <button onclick="saveLicense()">Guardar licencia</button>
        <button class="secondary" onclick="activateBasic()">Activar Basico</button>
        <button class="secondary" onclick="activatePro()">Activar Pro</button>
        <button class="secondary" onclick="activatePremium()">Activar Premium</button>
        <button class="secondary" onclick="renew(1)">Renovar 1 mes</button>
        <button class="secondary" onclick="renew(12)">Renovar 1 ano</button>
        <button class="secondary" onclick="suspendLicense()">Suspender</button>
      </div>
          </section>
        </div>
      </main>
    </div>
  </div>
  ${paymentStatusModalMarkup}
  ${paymentRenewalModalMarkup}
  ${paymentReversalModalMarkup}
  <script>
    const keyName = "factudarwin-master-key";
    const $ = (id) => document.getElementById(id);
    let selectedCompanyId = "";
    let tenants = [];
    let tenantPagination = { page: 1, pageSize: 20, total: 0, totalPages: 1 };
    let tenantStats = null;
    let companySearchTimer = null;
    ${paymentPanelClientScript}

    function showPanelView(view) {
      const titles = { overview: "Resumen general", companies: "Empresas SaaS", license: "Licencias y modulos", payments: "Pagos y renovaciones", lifecycle: "Ciclo de vida", backups: "Respaldos" };
      document.querySelectorAll(".panel-view").forEach((element) => element.classList.toggle("active", element.id === "view-" + view));
      document.querySelectorAll(".nav-button").forEach((element) => element.classList.toggle("active", element.dataset.view === view));
      $("pageTitle").textContent = titles[view] || "Panel maestro";
      if (view === "payments" && selectedCompanyId) loadPayments();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function key() {
      let value = sessionStorage.getItem(keyName);
      if (!value) {
        value = prompt("Clave maestra DarwinSoft:");
        if (value) sessionStorage.setItem(keyName, value);
      }
      return value || "";
    }

    function changeKey() {
      sessionStorage.removeItem(keyName);
      key();
      loadAll();
    }

    function headers() {
      return { "Content-Type": "application/json", "x-master-key": key() };
    }

    function setStatus(text, bad = false) {
      $("status").textContent = text;
      $("status").className = bad ? "status bad" : "status";
    }

    function show(value) {
      $("output").textContent = JSON.stringify(value, null, 2);
    }

    function fill(license) {
      $("statusField").value = license.status || "trial";
      $("plan").value = normalizePlan(license.plan || "trial");
      $("startsAt").value = license.startsAt || "";
      $("expiresAt").value = license.expiresAt || "";
      $("maxUsers").value = license.maxUsers || 3;
      $("maxDevices").value = license.maxDevices || 3;
      $("maxEmissionPoints").value = license.maxEmissionPoints || (license.plan === "trial" ? 3 : isAdvancedPlan(license.plan) ? 999 : 1);
      $("featureSales").checked = license.features?.sales !== false;
      $("featureDocuments").checked = license.features?.documents !== false;
      $("featureClients").checked = license.features?.clients !== false;
      $("featureProducts").checked = license.features?.products !== false;
      $("featureSri").checked = license.features?.sri !== false;
      $("featureInventory").checked = license.features?.inventory !== false;
      $("featureCash").checked = license.features?.cash !== false;
      $("featureCredits").checked = license.features?.credits !== false;
      $("featureGuides").checked = license.features?.guides !== false;
      $("featureUsers").checked = license.features?.users !== false;
      $("featureReports").checked = license.features?.reports !== false;
      $("featureMultiDevice").checked = license.features?.multiDevice !== false;
      $("featureMultiEmissionPoint").checked = license.features?.multiEmissionPoint === true || isAdvancedPlan(license.plan) || license.plan === "trial";
      $("notes").value = license.notes || "";
    }

    function normalizePlan(plan) {
      if (plan === "mensual") return "basico_mensual";
      if (plan === "anual") return "basico_anual";
      if (plan === "pro") return "pro_anual";
      return ["trial", "basico_mensual", "basico_anual", "pro_mensual", "pro_anual", "premium_mensual", "premium_anual"].includes(plan) ? plan : "trial";
    }

    function isProPlan(plan) {
      return String(normalizePlan(plan)).startsWith("pro_");
    }

    function isAdvancedPlan(plan) {
      const normalized = String(normalizePlan(plan));
      return normalized.startsWith("pro_") || normalized.startsWith("premium_");
    }

    function renderTenants() {
      $("tenantCount").textContent = tenantStats?.total ?? tenants.length;
      $("trialCount").textContent = tenantStats?.trial ?? tenants.filter((item) => item.status === "trial" && item.license?.effectiveStatus === "trial").length;
      $("activeCount").textContent = tenantStats?.active ?? tenants.filter((item) => ["trial", "active"].includes(item.status) && item.license?.active).length;
      $("expiredCount").textContent = tenantStats?.withoutAccess ?? tenants.filter((item) => ["inactive", "archived", "expired", "suspended"].includes(item.status) || ["expired", "suspended"].includes(item.license?.effectiveStatus)).length;
      const current = selectedTenant();
      $("selectedCompanyLabel").textContent = current ? (current.businessName || current.tradeName || current.ruc) : "Sin empresa seleccionada";
      $("tenants").innerHTML = tenants.length ? tenants.map((tenant) => {
        const active = tenant.id === selectedCompanyId;
        const lifecycleStopped = ["inactive", "archived", "deleted"].includes(tenant.status);
        const bad = lifecycleStopped || !tenant.license?.active;
        const lifecycleLabels = { inactive: "Desactivada", archived: "Archivada", deleted: "Eliminada" };
        const badge = lifecycleStopped
          ? lifecycleLabels[tenant.status]
          : (tenant.license?.effectiveStatus || "sin licencia") + " - " + Math.max(0, Number(tenant.license?.daysLeft || 0)) + " dias";
        const summary = tenant.summary || {};
        return '<button class="tenant ' + (active ? 'active' : '') + '" onclick="selectTenant(\\'' + tenant.id + '\\')">' +
          '<div class="tenant-title"><span>' + escapeHtml(tenant.businessName || tenant.tradeName || tenant.ruc) + '</span><span class="pill ' + (bad ? 'bad' : '') + '">' + escapeHtml(badge) + '</span></div>' +
          '<div class="tenant-meta">RUC ' + escapeHtml(tenant.ruc) + ' | ' + escapeHtml(tenant.email || 'sin email') + ' | Estado ' + escapeHtml(tenant.status || 'sin estado') + '</div>' +
          '<div class="tenant-meta">Administrador ' + escapeHtml(tenant.administratorName || 'sin nombre registrado') + '</div>' +
          '<div class="tenant-meta">Usuarios ' + tenant.userCount + ' | Dispositivos ' + tenant.deviceCount + ' | Clientes ' + (summary.clients || 0) + ' | Ventas ' + (summary.sales || 0) + '</div>' +
          '<div class="tenant-meta">Ultimo uso ' + escapeHtml(formatDevice(tenant.lastDevice)) + '</div>' +
          '<div class="tenant-meta">Actualizado ' + escapeHtml(formatDate(tenant.snapshotUpdatedAt || tenant.updatedAt)) + '</div>' +
        '</button>';
      }).join("") : '<p>No hay empresas SaaS registradas todavia.</p>';
      $("companyResults").textContent = tenantPagination.total + " empresa(s) encontrada(s)";
      $("companyPage").textContent = "Pagina " + tenantPagination.page + " de " + tenantPagination.totalPages;
      $("companyPrevious").disabled = tenantPagination.page <= 1;
      $("companyNext").disabled = tenantPagination.page >= tenantPagination.totalPages;
    }

    function escapeHtml(value) {
      return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
    }

        function formatDate(value) {
         if (!value) return "sin fecha";
         const date = new Date(value);

         return Number.isFinite(date.getTime())
           ? date.toLocaleString("es-EC", {
            timeZone: "America/Guayaquil",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true
          })
         : value;
        }

    function formatDevice(device) {
      if (!device?.lastSeenAt) return "sin registro";
      return [device.platform || device.label || "dispositivo", formatDate(device.lastSeenAt)].filter(Boolean).join(" · ");
    }

    async function loadTenants(page = tenantPagination.page) {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      const query = $("companySearch")?.value.trim() || "";
      const status = $("companyStatusFilter")?.value || "";
      if (query) params.set("q", query);
      if (status) params.set("status", status);
      const response = await fetch("/api/master/tenants?" + params.toString(), { headers: headers() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudieron cargar empresas.");
      tenants = data.tenants || [];
      tenantPagination = data.pagination || { page: 1, pageSize: 20, total: tenants.length, totalPages: 1 };
      tenantStats = data.stats || null;
      if (selectedCompanyId && !tenants.some((tenant) => tenant.id === selectedCompanyId)) selectedCompanyId = "";
      renderTenants();
      return tenants;
    }

    async function selectTenant(companyId) {
      selectedCompanyId = companyId;
      renderTenants();
      await loadLicense();
      await loadLifecycle();
      if ($("view-payments").classList.contains("active")) await loadPayments();
    }

    function scheduleCompanySearch() {
      clearTimeout(companySearchTimer);
      companySearchTimer = setTimeout(() => loadTenants(1).catch((error) => setStatus(error.message, true)), 300);
    }

    function applyCompanyFilters() { loadTenants(1).catch((error) => setStatus(error.message, true)); }

    function changeCompanyPage(direction) {
      const nextPage = Math.min(tenantPagination.totalPages, Math.max(1, tenantPagination.page + direction));
      if (nextPage !== tenantPagination.page) loadTenants(nextPage).catch((error) => setStatus(error.message, true));
    }

    async function loadLifecycle() {
      const tenant = requireSelectedTenant();
      const response = await fetch("/api/master/tenants/" + encodeURIComponent(tenant.id) + "/lifecycle", { headers: headers() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo evaluar la empresa.");
      const assessment = data.assessment || {};
      const reasons = assessment.reasons?.length ? assessment.reasons.join(" ") : "Cuenta vacia: puede eliminarse definitivamente con respaldo previo.";
      $("lifecycleAssessment").textContent = "Estado: " + (tenant.status || "sin estado") + ". " + reasons;
      $("lifecycleAssessment").className = assessment.canDeletePermanently ? "status" : "status bad";
      $("deleteTenantButton").disabled = !assessment.canDeletePermanently;
      show(data);
      return data;
    }

    async function changeTenantLifecycle(action) {
      try {
        const tenant = requireSelectedTenant();
        const labels = { deactivate: "desactivar", archive: "archivar", reactivate: "reactivar" };
        const expected = prompt("Escriba el RUC " + tenant.ruc + " para " + labels[action] + " la empresa:");
        if (!expected) return;
        if (!confirm("Confirma " + labels[action] + " " + currentTenantName() + "?")) return;
        const response = await fetch("/api/master/tenants/" + encodeURIComponent(tenant.id) + "/lifecycle", {
          method: "POST", headers: headers(), body: JSON.stringify({ action, confirmRuc: expected })
        });
        const data = await response.json();
        show(data);
        if (!response.ok) throw new Error(data.error || "No se pudo cambiar el estado.");
        await loadTenants();
        await loadLifecycle();
        setStatus("Estado de empresa actualizado.");
      } catch (error) { setStatus(error.message, true); }
    }

    async function deleteTenantPermanently() {
      try {
        const tenant = requireSelectedTenant();
        const expected = prompt("ELIMINACION DEFINITIVA. Escriba exactamente el RUC " + tenant.ruc + ":");
        if (!expected) return;
        if (!confirm("Esta accion no se puede deshacer. Se creara un respaldo antes de eliminar la cuenta vacia. Continuar?")) return;
        setStatus("Generando respaldo y eliminando cuenta vacia...");
        const response = await fetch("/api/master/tenants/" + encodeURIComponent(tenant.id), {
          method: "DELETE", headers: headers(), body: JSON.stringify({ confirmRuc: expected })
        });
        const data = await response.json();
        show(data);
        if (!response.ok) throw new Error(data.error || "No se pudo eliminar la empresa.");
        selectedCompanyId = "";
        await loadTenants();
        if (tenants[0]) { selectedCompanyId = tenants[0].id; await loadLicense(); await loadLifecycle(); }
        setStatus("Cuenta vacia eliminada despues de crear respaldo.");
      } catch (error) { setStatus(error.message, true); }
    }

    function selectedTenant() {
      return tenants.find((item) => item.id === selectedCompanyId) || null;
    }

    function requireSelectedTenant() {
      const tenant = selectedTenant();
      if (!tenant) throw new Error("Seleccione una empresa primero.");
      return tenant;
    }

    async function exportTenant() {
      try {
        const tenant = requireSelectedTenant();
        setStatus("Exportando " + currentTenantName() + "...");
        const response = await fetch("/api/master/tenants/" + encodeURIComponent(tenant.id) + "/export", { headers: headers() });
        const data = await response.json();
        show(data);
        if (!response.ok) throw new Error(data.error || "No se pudo exportar la empresa.");
        const text = JSON.stringify(data.backup, null, 2);
        $("tenantBackupJson").value = text;
        downloadJson("factudarwin-" + (tenant.ruc || tenant.id) + "-" + new Date().toISOString().slice(0, 10) + ".json", text);
        setStatus("Empresa exportada correctamente.");
      } catch (error) {
        setStatus(error.message, true);
      }
    }

    async function restoreTenant() {
      try {
        const tenant = requireSelectedTenant();
        const raw = $("tenantBackupJson").value.trim();
        if (!raw) throw new Error("Pegue el backup JSON antes de restaurar.");
        const backup = JSON.parse(raw);
        const backupRuc = String(backup?.company?.ruc || "");
        const expected = prompt("Confirme el RUC destino para restaurar " + currentTenantName() + ":", tenant.ruc || backupRuc);
        if (!expected) return;
        if (String(expected).trim() !== String(tenant.ruc || "").trim()) {
          throw new Error("RUC de confirmacion no coincide con la empresa seleccionada.");
        }
        if (!confirm("Restaurar SOLO la empresa " + currentTenantName() + "? Se creara un backup completo antes de aplicar cambios.")) return;
        setStatus("Restaurando empresa...");
        const response = await fetch("/api/master/tenants/" + encodeURIComponent(tenant.id) + "/restore", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ backup, confirmRuc: expected })
        });
        const data = await response.json();
        show(data);
        if (!response.ok) throw new Error(data.error || "No se pudo restaurar la empresa.");
        await loadTenants();
        await loadLicense();
        await loadLifecycle();
        setStatus("Empresa restaurada correctamente.");
      } catch (error) {
        setStatus(error.message, true);
      }
    }

    function downloadJson(filename, text) {
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }

    function readForm() {
      return {
        status: $("statusField").value,
        plan: normalizePlan($("plan").value),
        startsAt: $("startsAt").value,
        expiresAt: $("expiresAt").value,
        maxUsers: Number($("maxUsers").value || 1),
        maxDevices: Number($("maxDevices").value || 1),
        maxEmissionPoints: Number($("maxEmissionPoints").value || 1),
        features: {
          sales: $("featureSales").checked,
          documents: $("featureDocuments").checked,
          clients: $("featureClients").checked,
          products: $("featureProducts").checked,
          sri: $("featureSri").checked,
          inventory: $("featureInventory").checked,
          cash: $("featureCash").checked,
          credits: $("featureCredits").checked,
          guides: $("featureGuides").checked,
          users: $("featureUsers").checked,
          reports: $("featureReports").checked,
          multiDevice: $("featureMultiDevice").checked,
          multiEmissionPoint: $("featureMultiEmissionPoint").checked
        },
        notes: $("notes").value
      };
    }

    async function loadLicense() {
      try {
        setStatus("Cargando...");
        const url = selectedCompanyId ? "/api/master/tenants/" + encodeURIComponent(selectedCompanyId) : "/api/master/license";
        const response = await fetch(url, { headers: headers() });
        const data = await response.json();
        show(data);
        if (!response.ok) throw new Error(data.error || "No se pudo cargar.");
        fill(data.license);
        const tenant = tenants.find((item) => item.id === selectedCompanyId);
        $("licenseTitle").textContent = selectedCompanyId ? "Licencia de " + (tenant?.businessName || selectedCompanyId) : "Licencia legacy";
        setStatus(data.license.active ? "Licencia activa" : "Licencia no activa", !data.license.active);
      } catch (error) {
        setStatus(error.message, true);
      }
    }

    async function saveLicense() {
      try {
        if (!confirm("Guardar cambios de licencia para " + currentTenantName() + "?")) return;
        setStatus("Guardando...");
        const url = selectedCompanyId ? "/api/master/tenants/" + encodeURIComponent(selectedCompanyId) + "/license" : "/api/master/license";
        const response = await fetch(url, { method: "PUT", headers: headers(), body: JSON.stringify({ license: readForm() }) });
        const data = await response.json();
        show(data);
        if (!response.ok) throw new Error(data.error || "No se pudo guardar.");
        fill(data.license);
        await loadTenants();
        setStatus(data.license.active ? "Licencia guardada y activa" : "Licencia guardada no activa", !data.license.active);
      } catch (error) {
        setStatus(error.message, true);
      }
    }

    function renew(months) {
      if (!confirm("Renovar " + currentTenantName() + " por " + (months >= 12 ? "1 ano" : "1 mes") + "?")) return;
      const current = $("expiresAt").value ? new Date($("expiresAt").value + "T00:00:00") : new Date();
      const base = current.getTime() > Date.now() ? current : new Date();
      base.setMonth(base.getMonth() + months);
      const pro = isProPlan($("plan").value);
      $("statusField").value = "active";
      $("plan").value = pro ? (months >= 12 ? "pro_anual" : "pro_mensual") : (months >= 12 ? "basico_anual" : "basico_mensual");
      $("expiresAt").value = base.toISOString().slice(0, 10);
      saveLicense();
    }

    function suspendLicense() {
      if (!confirm("Suspender la licencia de " + currentTenantName() + "? El cliente no podra facturar mientras este suspendida.")) return;
      $("statusField").value = "suspended";
      saveLicense();
    }

    function activatePro() {
      if (!confirm("Activar plan Pro para " + currentTenantName() + "?")) return;
      const base = new Date();
      base.setFullYear(base.getFullYear() + 1);
      $("statusField").value = "active";
      $("plan").value = "pro_anual";
      $("expiresAt").value = base.toISOString().slice(0, 10);
      $("maxEmissionPoints").value = 999;
      $("featureSales").checked = true;
      $("featureDocuments").checked = true;
      $("featureClients").checked = true;
      $("featureProducts").checked = true;
      $("featureSri").checked = true;
      $("featureInventory").checked = true;
      $("featureCash").checked = true;
      $("featureCredits").checked = true;
      $("featureGuides").checked = true;
      $("featureUsers").checked = true;
      $("featureReports").checked = true;
      $("featureMultiDevice").checked = true;
      $("featureMultiEmissionPoint").checked = true;
      $("notes").value = "Licencia Pro activada desde panel maestro";
      saveLicense();
    }

    function activatePremium() {
      if (!confirm("Activar plan Premium para " + currentTenantName() + "?")) return;
      const base = new Date();
      base.setFullYear(base.getFullYear() + 1);
      $("statusField").value = "active";
      $("plan").value = "premium_anual";
      $("expiresAt").value = base.toISOString().slice(0, 10);
      $("maxEmissionPoints").value = 999;
      $("featureSales").checked = true;
      $("featureDocuments").checked = true;
      $("featureClients").checked = true;
      $("featureProducts").checked = true;
      $("featureSri").checked = true;
      $("featureInventory").checked = true;
      $("featureCash").checked = true;
      $("featureCredits").checked = true;
      $("featureGuides").checked = true;
      $("featureUsers").checked = true;
      $("featureReports").checked = true;
      $("featureMultiDevice").checked = true;
      $("featureMultiEmissionPoint").checked = true;
      $("notes").value = "Licencia Premium activada desde panel maestro";
      saveLicense();
    }

    function activateBasic() {
      if (!confirm("Activar plan Basico para " + currentTenantName() + "?")) return;
      const base = new Date();
      base.setMonth(base.getMonth() + 1);
      $("statusField").value = "active";
      $("plan").value = "basico_mensual";
      $("expiresAt").value = base.toISOString().slice(0, 10);
      $("maxEmissionPoints").value = 1;
      $("featureSales").checked = true;
      $("featureDocuments").checked = true;
      $("featureClients").checked = true;
      $("featureProducts").checked = true;
      $("featureSri").checked = true;
      $("featureInventory").checked = true;
      $("featureCash").checked = true;
      $("featureCredits").checked = true;
      $("featureGuides").checked = true;
      $("featureUsers").checked = true;
      $("featureReports").checked = true;
      $("featureMultiDevice").checked = true;
      $("featureMultiEmissionPoint").checked = false;
      $("notes").value = "Licencia Basico mensual activada desde panel maestro";
      saveLicense();
    }

    function currentTenantName() {
      const tenant = tenants.find((item) => item.id === selectedCompanyId);
      return tenant?.businessName || tenant?.tradeName || selectedCompanyId || "licencia legacy";
    }

    async function loadAll() {
      try {
        setStatus("Cargando panel...");
        await loadTenants();
        if (tenants[0]) selectedCompanyId = tenants[0].id;
        renderTenants();
        await loadLicense();
        if (selectedCompanyId) await loadLifecycle();
        $("paymentPaidAt").value = new Date().toISOString().slice(0, 10);
      } catch (error) {
        setStatus(error.message, true);
      }
    }

    loadAll();
  </script>
</body>
</html>`;
}

module.exports = { renderMasterPanel };
