import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "../..");

describe("catalog synchronization architecture", () => {
  test.each(["ClientsScreen.tsx", "ProductsScreen.tsx", "InventoryScreen.tsx", "CashClosingScreen.tsx", "UsersScreen.tsx"])("%s uses the transactional writer without scheduling a full snapshot", (file) => {
    const screen = fs.readFileSync(path.join(root, "screens", file), "utf8");
    const shell = fs.readFileSync(path.join(root, "components/AppMainShell.tsx"), "utf8");

    expect(screen).toContain("persistMutation: PersistMutation");
    expect(screen).toContain('{ skipAutoBackup: true, syncState: "pending" }');
    expect(screen).not.toContain("await persist(nextData)");
    expect(shell).toContain(`<${file.replace(".tsx", "")}`);
    expect(shell).toContain("persistMutation={persistMutation}");
  });

  test("quick client editing from sales uses the same fast durable path", () => {
    const hook = fs.readFileSync(path.join(root, "hooks/useQuickSaleClientEditor.ts"), "utf8");
    expect(hook).toContain("persistMutation: PersistMutation");
    expect(hook).toContain('{ skipAutoBackup: true, syncState: "pending" }');
    expect(hook).not.toContain("await persist(nextData)");
  });
});
