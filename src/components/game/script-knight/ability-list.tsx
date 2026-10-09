import type { AbilitySpec } from "./engine/core/ability";

/** The abilities this floor grants: name, Action or Sense, and the upstream description. */
export function AbilityList({ abilities }: { abilities: readonly AbilitySpec[] }) {
  return (
    <section aria-label="Abilities" className="text-xs">
      <h3 className="mb-1.5 font-mono text-[11px] tracking-wider text-(--muted) uppercase">
        Abilities
      </h3>
      <ul className="space-y-1">
        {abilities.map((ability) => (
          <li key={ability.name} className="rounded-md border border-(--border) px-2 py-1">
            <span className="font-mono text-(--foreground)">warrior.{ability.name}()</span>
            <span className="ml-2 text-[10px] tracking-wide text-[#4ade80] uppercase">
              {ability.isAction ? "Action" : "Sense"}
            </span>
            <p className="mt-0.5 text-(--muted)">{ability.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
