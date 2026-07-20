jest.mock("react-native", () => ({
  Alert: { alert: jest.fn() }
}));

import { checkGrossPriceLoss, checkSaleItemLoss } from "../lossProtection";

describe("loss protection", () => {
  it("detects product loss using net price against cost", () => {
    const loss = checkGrossPriceLoss(1, 0.15, 0.9);

    expect(loss.hasLoss).toBe(true);
    expect(loss.displayUnitPrice).toBe(1);
    expect(loss.netUnitPrice).toBeCloseTo(0.87, 2);
    expect(loss.lossPerUnit).toBe(0.03);
  });

  it("detects sale line loss after discount", () => {
    const loss = checkSaleItemLoss({
      quantity: 2,
      unitPrice: 1,
      cost: 0.95,
      discount: 0.2,
      ivaRate: 0.15
    });

    expect(loss.hasLoss).toBe(true);
    expect(loss.netUnitPrice).toBe(0.9);
    expect(loss.lossPerUnit).toBe(0.05);
  });
});
