import { Mail } from "lucide-react";
import { socialLinks } from "@/data/nav";
import { SiIcon } from "@/components/ui/tech-icon";

export function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
    </svg>
  );
}

export function ContraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm4.5 16.5a7.44 7.44 0 0 1-5.25 2.25A7.493 7.493 0 0 1 3.75 12a7.493 7.493 0 0 1 7.5-6.75 7.44 7.44 0 0 1 5.25 2.25l-1.5 1.5a5.24 5.24 0 0 0-3.75-1.5A5.244 5.244 0 0 0 6 12.75 5.244 5.244 0 0 0 11.25 18c1.38 0 2.63-.54 3.54-1.41L16.5 16.5z" />
    </svg>
  );
}

export function SocialIcon({ icon, className }: { icon: string; className?: string }) {
  if (icon === "linkedin") return <LinkedInIcon className={className} />;
  if (icon === "contra") return <ContraIcon className={className} />;
  return <SiIcon slug={icon} className={className} />;
}

interface SocialLinksProps {
  size?: string;
  limit?: number;
  showEmail?: boolean;
  className?: string;
}

export function SocialLinks({ size = "h-4 w-4", limit, showEmail, className }: SocialLinksProps) {
  const links = limit ? socialLinks.slice(0, limit) : socialLinks;
  return (
    <div className={className}>
      {links.map((link) => (
        <a
          key={link.name}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="-m-2 inline-flex items-center justify-center p-2 text-(--muted) transition-colors hover:text-(--foreground)"
          aria-label={link.name}
        >
          <SocialIcon icon={link.icon} className={size} />
        </a>
      ))}
      {showEmail && (
        <a
          href="mailto:amin@devino.ca"
          className="-m-2 inline-flex items-center justify-center p-2 text-(--muted) transition-colors hover:text-(--foreground)"
          aria-label="Email"
        >
          <Mail className={size} />
        </a>
      )}
    </div>
  );
}
