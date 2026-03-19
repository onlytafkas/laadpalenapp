import { describe, expect, it } from "vitest";
import {
  APP_NAME,
  appNameWithVersion,
  appVersion,
  appVersionLabel,
  bumpSemVer,
  validateSemVer,
} from "@/lib/version";

describe("version", () => {
  it("accepts a valid SemVer 2.0.0 version", () => {
    expect(validateSemVer("1.2.3")).toBe("1.2.3");
    expect(validateSemVer("1.2.3-rc.1+build.5")).toBe(
      "1.2.3-rc.1+build.5"
    );
  });

  it("rejects versions that do not match SemVer 2.0.0", () => {
    expect(() => validateSemVer("v1.0.0")).toThrow(/invalid semantic version/i);
    expect(() => validateSemVer("01.0.0")).toThrow(/invalid semantic version/i);
  });

  it("bumps versions according to SemVer major, minor, and patch rules", () => {
    expect(bumpSemVer("1.0.0", "patch")).toBe("1.0.1");
    expect(bumpSemVer("1.0.1", "minor")).toBe("1.1.0");
    expect(bumpSemVer("1.1.0", "major")).toBe("2.0.0");
    expect(bumpSemVer("1.2.3-rc.1+build.5", "patch")).toBe("1.2.4");
  });

  it("exports the validated package version and display labels", () => {
    expect(appVersion).toBe("1.3.0");
    expect(appVersionLabel).toBe("v1.3.0");
    expect(appNameWithVersion).toBe(`${APP_NAME} v1.3.0`);
  });
});