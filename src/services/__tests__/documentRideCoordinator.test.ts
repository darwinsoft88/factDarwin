import { fetchDocumentRide } from "../backend";
import {
  getCachedDocumentRide,
  resetDocumentRideCoordinatorForTests,
  trackDocumentSync,
  waitForDocumentSync
} from "../documentRideCoordinator";

jest.mock("../backend", () => ({ fetchDocumentRide: jest.fn() }));

const fetchRideMock = fetchDocumentRide as jest.MockedFunction<typeof fetchDocumentRide>;

describe("document RIDE coordinator", () => {
  beforeEach(() => {
    resetDocumentRideCoordinatorForTests();
    fetchRideMock.mockReset();
  });

  it("waits only for the synchronization of the requested document", async () => {
    let finish!: (value: boolean) => void;
    const pending = new Promise<boolean>((resolve) => { finish = resolve; });
    trackDocumentSync("https://api.example", "sale-1", "factura", pending);

    await expect(waitForDocumentSync("https://api.example", "sale-2", "factura")).resolves.toBe(true);
    const waiting = waitForDocumentSync("https://api.example", "sale-1", "factura");
    finish(true);
    await expect(waiting).resolves.toBe(true);
  });

  it("deduplicates concurrent and repeated RIDE downloads", async () => {
    fetchRideMock.mockResolvedValue({ filename: "ride.pdf", mimeType: "application/pdf", pdfBase64: "cGRm" });
    const payload = { documentId: "sale-1", documentType: "factura" as const };

    const [first, second] = await Promise.all([
      getCachedDocumentRide("https://api.example", payload, "token"),
      getCachedDocumentRide("https://api.example", payload, "token")
    ]);
    const third = await getCachedDocumentRide("https://api.example", payload, "token");

    expect(first).toEqual(second);
    expect(third).toEqual(first);
    expect(fetchRideMock).toHaveBeenCalledTimes(1);
  });

  it("does not retain a failed RIDE request", async () => {
    fetchRideMock
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({ filename: "ride.pdf", mimeType: "application/pdf", pdfBase64: "cGRm" });
    const payload = { documentId: "sale-1", documentType: "factura" as const };

    await expect(getCachedDocumentRide("https://api.example", payload, "token")).rejects.toThrow("temporary");
    await expect(getCachedDocumentRide("https://api.example", payload, "token")).resolves.toMatchObject({ filename: "ride.pdf" });
    expect(fetchRideMock).toHaveBeenCalledTimes(2);
  });

  it("isolates cached PDFs between authenticated sessions", async () => {
    fetchRideMock.mockResolvedValue({ filename: "ride.pdf", mimeType: "application/pdf", pdfBase64: "cGRm" });
    const payload = { documentId: "sale-1", documentType: "factura" as const };

    await getCachedDocumentRide("https://api.example", payload, "company-a-token");
    await getCachedDocumentRide("https://api.example", payload, "company-b-token");

    expect(fetchRideMock).toHaveBeenCalledTimes(2);
  });
});
