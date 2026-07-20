function renderMasterPanel() {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>DarwinSoft | Panel SaaS FactuDarwin</title>
  <style>
    :root { color-scheme: light; font-family: Arial, sans-serif; color: #102033; background: #eef5f7; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; }
    main { max-width: 1120px; margin: 0 auto; display: grid; gap: 14px; }
    header, section { background: #fff; border: 1px solid #dbe4ee; border-radius: 10px; padding: 18px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    h1, h2 { margin: 0; }
    h1 { font-size: 24px; }
    h2 { font-size: 18px; margin-bottom: 12px; }
    p { color: #475569; line-height: 1.45; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .mark { width: 42px; height: 42px; border-radius: 9px; background: #0f766e; color: white; display: grid; place-items: center; font-weight: 900; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .stat { border: 1px solid #e2e8f0; border-radius: 9px; padding: 12px; background: #f8fafc; }
    .stat b { display: block; font-size: 22px; color: #0f766e; }
    .tenants { display: grid; gap: 8px; }
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
    button:disabled { opacity: .6; cursor: not-allowed; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; }
    .status { padding: 10px 12px; border-radius: 8px; font-weight: 900; background: #e0f2fe; color: #075985; }
    .status.bad { background: #fee2e2; color: #991b1b; }
    .checks { display: flex; flex-wrap: wrap; gap: 8px; }
    .check { display: flex; align-items: center; gap: 8px; min-height: 38px; padding: 8px 10px; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: 800; }
    .check input { min-height: auto; }
    pre { white-space: pre-wrap; background: #0f172a; color: #e2e8f0; border-radius: 8px; padding: 12px; overflow: auto; }
    @media (max-width: 720px) { body { padding: 12px; } header { align-items: flex-start; flex-direction: column; } .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="brand">
        <div class="mark">DS</div>
        <div>
          <h1>DarwinSoft</h1>
          <p>Panel maestro SaaS de FactuDarwin</p>
        </div>
      </div>
      <button class="secondary" onclick="changeKey()">Cambiar clave</button>
    </header>

    <section>
      <h2>Estado</h2>
      <div id="status" class="status">Pendiente de cargar</div>
      <pre id="output"></pre>
    </section>

    <section>
      <h2>Empresas SaaS</h2>
      <div class="stats">
        <div class="stat"><b id="tenantCount">0</b><span>Empresas</span></div>
        <div class="stat"><b id="trialCount">0</b><span>Trial</span></div>
        <div class="stat"><b id="activeCount">0</b><span>Activas</span></div>
        <div class="stat"><b id="expiredCount">0</b><span>Vencidas/suspendidas</span></div>
      </div>
      <p>Seleccione una empresa para administrar su licencia. No se muestran claves, tokens ni certificados.</p>
      <div id="tenants" class="tenants"></div>
    </section>

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
        <label class="check"><input id="featureSri" type="checkbox" /> SRI</label>
        <label class="check"><input id="featureInventory" type="checkbox" /> Inventario</label>
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
  </main>
  <script>
    const keyName = "factudarwin-master-key";
    const $ = (id) => document.getElementById(id);
    let selectedCompanyId = "";
    let tenants = [];

    function key() {
      let value = localStorage.getItem(keyName);
      if (!value) {
        value = prompt("Clave maestra DarwinSoft:");
        if (value) localStorage.setItem(keyName, value);
      }
      return value || "";
    }

    function changeKey() {
      localStorage.removeItem(keyName);
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
      $("featureSri").checked = license.features?.sri !== false;
      $("featureInventory").checked = license.features?.inventory !== false;
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
      $("tenantCount").textContent = tenants.length;
      $("trialCount").textContent = tenants.filter((item) => item.license?.effectiveStatus === "trial").length;
      $("activeCount").textContent = tenants.filter((item) => item.license?.effectiveStatus === "active").length;
      $("expiredCount").textContent = tenants.filter((item) => ["expired", "suspended"].includes(item.license?.effectiveStatus)).length;
      $("tenants").innerHTML = tenants.length ? tenants.map((tenant) => {
        const active = tenant.id === selectedCompanyId;
        const bad = !tenant.license?.active;
        const summary = tenant.summary || {};
        return '<button class="tenant ' + (active ? 'active' : '') + '" onclick="selectTenant(\\'' + tenant.id + '\\')">' +
          '<div class="tenant-title"><span>' + escapeHtml(tenant.businessName || tenant.tradeName || tenant.ruc) + '</span><span class="pill ' + (bad ? 'bad' : '') + '">' + escapeHtml(tenant.license?.effectiveStatus || 'sin licencia') + ' · ' + Math.max(0, Number(tenant.license?.daysLeft || 0)) + ' dias</span></div>' +
          '<div class="tenant-meta">RUC ' + escapeHtml(tenant.ruc) + ' | ' + escapeHtml(tenant.email || 'sin email') + '</div>' +
          '<div class="tenant-meta">Usuarios ' + tenant.userCount + ' | Dispositivos ' + tenant.deviceCount + ' | Clientes ' + (summary.clients || 0) + ' | Ventas ' + (summary.sales || 0) + '</div>' +
          '<div class="tenant-meta">Ultimo uso ' + escapeHtml(formatDevice(tenant.lastDevice)) + '</div>' +
          '<div class="tenant-meta">Actualizado ' + escapeHtml(formatDate(tenant.snapshotUpdatedAt || tenant.updatedAt)) + '</div>' +
        '</button>';
      }).join("") : '<p>No hay empresas SaaS registradas todavia.</p>';
    }

    function escapeHtml(value) {
      return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
    }

    function formatDate(value) {
      if (!value) return "sin fecha";
      const date = new Date(value);
      return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
    }

    function formatDevice(device) {
      if (!device?.lastSeenAt) return "sin registro";
      return [device.platform || device.label || "dispositivo", formatDate(device.lastSeenAt)].filter(Boolean).join(" · ");
    }

    async function loadTenants() {
      const response = await fetch("/api/master/tenants", { headers: headers() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudieron cargar empresas.");
      tenants = data.tenants || [];
      renderTenants();
      return tenants;
    }

    async function selectTenant(companyId) {
      selectedCompanyId = companyId;
      renderTenants();
      await loadLicense();
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
          sri: $("featureSri").checked,
          inventory: $("featureInventory").checked,
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
      $("featureSri").checked = true;
      $("featureInventory").checked = true;
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
      $("featureSri").checked = true;
      $("featureInventory").checked = true;
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
      $("featureSri").checked = true;
      $("featureInventory").checked = true;
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
