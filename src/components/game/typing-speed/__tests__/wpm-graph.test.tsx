import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { SeriesPoint } from "../engine/series";
import { WpmGraph } from "../wpm-graph";

afterEach(cleanup);

const points: SeriesPoint[] = [
  { wpm: 10, raw: 20, errors: 0 },
  { wpm: 40.4, raw: 60, errors: 2 },
  { wpm: 52.6, raw: 55, errors: 0 },
  { wpm: 50, raw: 50, errors: 1 },
];

describe("WpmGraph", () => {
  it("is an image labelled with the start, end and peak", () => {
    render(<WpmGraph points={points} variant="full" />);
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      "WPM over time: from 10 to 50, peak 53, 3 errors",
    );
  });
  it("the full variant shows a legend for net, raw and errors", () => {
    render(<WpmGraph points={points} variant="full" />);
    const legend = screen.getByTestId("ts-graph-legend");
    expect(legend).toHaveTextContent("Net WPM");
    expect(legend).toHaveTextContent("Raw WPM");
    expect(legend).toHaveTextContent("Errors");
  });
  it("the live variant has no legend and no error count", () => {
    render(<WpmGraph points={points} variant="live" />);
    expect(screen.queryByTestId("ts-graph-legend")).toBeNull();
    expect(screen.getByRole("img").getAttribute("aria-label")).not.toMatch(/error/);
  });
  it("the live variant draws only the net line", () => {
    const { container } = render(<WpmGraph points={points} variant="live" />);
    expect(container.querySelectorAll("path[data-line]")).toHaveLength(1);
    expect(container.querySelector("path[data-line='net']")).not.toBeNull();
    expect(screen.queryAllByTestId("ts-err")).toHaveLength(0);
  });
  it("the full variant draws net, raw and one mark per second with errors", () => {
    const { container } = render(<WpmGraph points={points} variant="full" />);
    expect(container.querySelector("path[data-line='net']")).not.toBeNull();
    expect(container.querySelector("path[data-line='raw']")).not.toBeNull();
    expect(screen.getAllByTestId("ts-err")).toHaveLength(2);
  });
  it("renders nothing for no points", () => {
    const { container } = render(<WpmGraph points={[]} variant="live" />);
    expect(container.querySelector("svg")).toBeNull();
  });
  it("the full variant draws a dashed ghost line and names it in the legend", () => {
    const { container } = render(
      <WpmGraph points={points} variant="full" ghost={[8, 30, 45, 60]} />,
    );
    const line = container.querySelector("path[data-line='ghost']");
    expect(line).not.toBeNull();
    expect(line).toHaveAttribute("stroke-dasharray");
    expect(screen.getByTestId("ts-graph-legend")).toHaveTextContent("Your best");
  });
  it("keeps a shorter ghost on the run's time axis instead of stretching it", () => {
    const { container } = render(<WpmGraph points={points} variant="full" ghost={[8, 30]} />);
    const endX = (line: string) =>
      Number(
        container
          .querySelector(`path[data-line='${line}']`)
          ?.getAttribute("d")
          ?.match(/L[0-9.]+,/g)
          ?.at(-1)
          ?.slice(1, -1),
      );
    // two ghost points are one step of the run's three
    expect(endX("ghost")).toBeCloseTo(endX("net") / 3, 0);
  });
  it("draws no ghost line without a ghost, and never in the live variant", () => {
    const full = render(<WpmGraph points={points} variant="full" ghost={null} />);
    expect(full.container.querySelector("path[data-line='ghost']")).toBeNull();
    expect(screen.getByTestId("ts-graph-legend")).not.toHaveTextContent("Your best");
    cleanup();
    const live = render(<WpmGraph points={points} variant="live" ghost={[8, 30]} />);
    expect(live.container.querySelector("path[data-line='ghost']")).toBeNull();
  });
});
