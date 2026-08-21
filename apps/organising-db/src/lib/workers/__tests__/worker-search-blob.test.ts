import { describe, expect, it } from "vitest";
import { workerSearchBlob } from "../worker-search-blob";

describe("workerSearchBlob", () => {
  it("lets a full-name query match first + last", () => {
    const blob = workerSearchBlob({
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@example.com",
      phone: "0400111222",
    });
    expect(blob.includes("jane doe")).toBe(true);
    expect(blob.includes("jane@example.com")).toBe(true);
    expect(blob.includes("0400111222")).toBe(true);
  });

  it("includes preferred name", () => {
    const blob = workerSearchBlob({
      first_name: "Charles",
      last_name: "Brown",
      preferred_name: "Chuck",
    });
    expect(blob.includes("chuck")).toBe(true);
  });
});
