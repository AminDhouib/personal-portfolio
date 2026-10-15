import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const { recordVisitAttribution } = vi.hoisted(() => ({ recordVisitAttribution: vi.fn() }));
vi.mock("@/lib/visit-attribution", () => ({ recordVisitAttribution }));

import { VisitAttributionRecorder } from "../visit-attribution-recorder";

describe("VisitAttributionRecorder", () => {
  beforeEach(() => recordVisitAttribution.mockReset());
  afterEach(() => vi.clearAllMocks());

  it("records the visit once, when the app first mounts", () => {
    const { rerender } = render(<VisitAttributionRecorder />);
    rerender(<VisitAttributionRecorder />);
    expect(recordVisitAttribution).toHaveBeenCalledTimes(1);
  });

  it("renders nothing", () => {
    const { container } = render(<VisitAttributionRecorder />);
    expect(container).toBeEmptyDOMElement();
  });
});
