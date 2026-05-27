import { sanitizeDecimalInput, sanitizeIntegerInput } from "../numbers";

describe("number input sanitizers", () => {
  it("keeps only digits and one decimal separator", () => {
    expect(sanitizeDecimalInput("12abc,34.56")).toBe("12.3456");
    expect(sanitizeDecimalInput("10..5x")).toBe("10.5");
  });

  it("keeps only digits for integer inputs", () => {
    expect(sanitizeIntegerInput("001-a02 b")).toBe("00102");
  });
});
