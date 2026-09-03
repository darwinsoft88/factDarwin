import fs from "node:fs";
import path from "node:path";

describe("DismissibleNotice", () => {
  it("no reinicia el temporizador cuando cambia la identidad de onDismiss", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/DismissibleNotice.tsx"), "utf8");
    expect(source).toContain("const onDismissRef = React.useRef(onDismiss)");
    expect(source).toContain("setTimeout(() => onDismissRef.current(), autoDismissMs)");
    expect(source).toContain("}, [autoDismissMs, message]);");
    expect(source).not.toContain("[autoDismissMs, message, onDismiss]");
  });
});
