import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { faqs } from "@/data/faq";
import { Faq } from "../faq";

describe("Faq section", () => {
  it("renders each question as a heading inside a native disclosure", () => {
    const { container } = render(<Faq faqs={faqs} />);
    const details = container.querySelectorAll("details");
    expect(details).toHaveLength(faqs.length);
    faqs.forEach((faq, i) => {
      const summary = details[i]!.querySelector("summary");
      expect(summary).toContainElement(screen.getByRole("heading", { name: faq.question }));
    });
  });

  it("keeps every answer in the markup even while collapsed", () => {
    render(<Faq faqs={faqs} />);
    for (const faq of faqs) expect(screen.getByText(faq.answer)).toBeInTheDocument();
  });

  it("opens an answer when its question is activated", () => {
    const { container } = render(<Faq faqs={faqs} />);
    const first = container.querySelector("details")!;
    expect(first.open).toBe(false);
    fireEvent.click(first.querySelector("summary")!);
    expect(first.open).toBe(true);
  });

  it("points unanswered questions at Amin AI", () => {
    render(<Faq faqs={faqs} />);
    expect(screen.getByRole("link", { name: "Ask Amin AI" })).toHaveAttribute("href", "/ai");
  });
});
