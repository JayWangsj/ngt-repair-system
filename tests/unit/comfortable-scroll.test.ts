import { describe, expect, it } from "vitest";
import { planComfortableScroll } from "@/lib/comfortable-scroll";

describe("comfortable interaction scrolling", () => {
  it("keeps a fully visible ordinary input in place", () => {
    expect(
      planComfortableScroll({
        top: 220,
        bottom: 264,
        viewportHeight: 800,
        scrollTop: 400,
        scrollHeight: 2400,
      }),
    ).toBeNull();
  });

  it("keeps a dropdown in place when its expected panel has room", () => {
    expect(
      planComfortableScroll({
        top: 180,
        bottom: 224,
        viewportHeight: 800,
        scrollTop: 300,
        scrollHeight: 2400,
        spaceBelow: 340,
      }),
    ).toBeNull();
  });

  it("moves a low dropdown to 38 percent of the viewport", () => {
    expect(
      planComfortableScroll({
        top: 600,
        bottom: 644,
        viewportHeight: 800,
        scrollTop: 400,
        scrollHeight: 2400,
        spaceBelow: 340,
      }),
    ).toEqual({ top: 696, behavior: "smooth" });
  });

  it("uses immediate scrolling when reduced motion is requested", () => {
    expect(
      planComfortableScroll({
        top: 750,
        bottom: 794,
        viewportHeight: 800,
        scrollTop: 100,
        scrollHeight: 1800,
        reducedMotion: true,
      }),
    ).toEqual({ top: 546, behavior: "auto" });
  });

  it("brings a control obscured above the viewport back to the target", () => {
    expect(
      planComfortableScroll({
        top: -20,
        bottom: 24,
        viewportHeight: 800,
        scrollTop: 500,
        scrollHeight: 2400,
      }),
    ).toEqual({ top: 176, behavior: "smooth" });
  });
});
