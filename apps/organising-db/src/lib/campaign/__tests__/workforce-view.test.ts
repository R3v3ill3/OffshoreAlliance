import { describe, expect, it } from "vitest";
import {
  pickDefaultWorkforceView,
  resolveWorkforceView,
} from "../workforce-view";

describe("pickDefaultWorkforceView", () => {
  it("gives a pointer device the wall chart", () => {
    expect(pickDefaultWorkforceView(false)).toBe("wall-chart");
  });

  it("gives a touch device the list", () => {
    expect(pickDefaultWorkforceView(true)).toBe("list");
  });
});

describe("resolveWorkforceView", () => {
  it("honours an explicit list on a desktop", () => {
    expect(resolveWorkforceView("list", false)).toBe("list");
  });

  it("honours an explicit wall chart on a touch device", () => {
    expect(resolveWorkforceView("wall-chart", true)).toBe("wall-chart");
  });

  it("follows the device when the param is absent", () => {
    expect(resolveWorkforceView(null, true)).toBe("list");
    expect(resolveWorkforceView(null, false)).toBe("wall-chart");
  });

  it("falls back to the device default for an unrecognised value", () => {
    // The Activists section reuses ?view= for its own tabs (?view=register),
    // so an unknown value must mean "no preference", not an error.
    expect(resolveWorkforceView("register", true)).toBe("list");
    expect(resolveWorkforceView("register", false)).toBe("wall-chart");
  });

  it("does not treat an empty string as a preference", () => {
    expect(resolveWorkforceView("", false)).toBe("wall-chart");
    expect(resolveWorkforceView("", true)).toBe("list");
  });
});
