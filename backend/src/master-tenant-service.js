function createMasterTenantService({ listTenantAccounts, listTenantAccountsPage, licenseStatus }) {
  return {
    async list(options = {}) {
      if (listTenantAccountsPage) {
        const result = await listTenantAccountsPage(options);
        return { ...result, items: enrich(result.items) };
      }
      if (!listTenantAccounts) return [];
      const tenants = await listTenantAccounts();
      return { items: enrich(tenants), page: 1, pageSize: tenants.length, total: tenants.length, totalPages: 1 };
    }
  };

  function enrich(tenants) {
    return tenants.map((tenant) => ({ ...tenant, license: licenseStatus({ license: tenant.license }) }));
  }
}

module.exports = { createMasterTenantService };
