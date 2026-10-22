/**
 * The first <button> in document order whose name matches, found without testing-library's role
 * scan.
 *
 * `screen.getAllByRole("button", { name })[0]` is expensive on a big page: for every element that
 * has no explicit role, testing-library asks jsdom `matches()` against each of aria-query's ~100
 * implicit-role selectors, so one query over the Super Voltorb Flip board (hundreds of div and span
 * nodes) costs hundreds of milliseconds, and the tests that call it in a helper or a loop spent
 * a third or more of their time there (measured with --cpu-prof, T-6247). This reads the page's buttons
 * and compares their name directly.
 *
 * The name is the aria-label, else the text, whitespace collapsed, matched exactly for a string and
 * by `test` for a RegExp, as testing-library does. It does NOT apply the accessibility filter
 * (aria-hidden, hidden subtrees) or aria-labelledby, so use it only where the test already means
 * "the first such button, whichever column it is in"; keep `getByRole` where the test is about
 * what is or is not exposed to assistive technology.
 */
export function firstButton(name: string | RegExp, root: ParentNode = document): HTMLElement {
  for (const el of root.querySelectorAll<HTMLElement>("button")) {
    const label = (el.getAttribute("aria-label") ?? el.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (typeof name === "string" ? label === name : name.test(label)) return el;
  }
  throw new Error(`no button named ${String(name)}`);
}
