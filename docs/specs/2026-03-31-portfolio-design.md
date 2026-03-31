# amindhou.com — Personal Portfolio Design Spec

**Owner:** Amin Dhouib
**Domain:** amindhou.com
**Date:** 2026-03-31
**Status:** Approved for implementation

---

## Overview

A personal portfolio for Amin Dhouib (CEO & CTO of Devino Solutions) built with Next.js. The site is a single continuous scroll experience using the **L (Geometric Motion / Studio)** aesthetic — bold weight-contrast typography (900/200), abstract geometric shapes, precise negative space, and choreographed scroll reveals. Three.js wireframe geometry drifts through the entire page as connective tissue, making it feel like one organism rather than separate sections.

The site is self-hosted on Amin's home server via Docker Swarm (Dokploy), secured with Tailscale + Cloudflared, with 99.99% uptime monitoring.

---

## Global Design Rules

### Visual Language
- **Typography:** 900/200 weight contrast. Distinctive display font (NOT Inter/Roboto/system — chosen during implementation). Clean body font via `next/font`.
- **Colors:** Dark default. Green (#22c55e) as primary accent, blue (#6366f1) secondary, purple (#a78bfa) tertiary, amber (#f59e0b) for highlights.
- **Geometric shapes:** Wireframe circles, triangles, and diamonds rendered in Three.js. They float through the entire page, parallax on mouse, and morph between sections. They are the connective thread.
- **Section markers:** Numbered (01, 02, 03...) with colored accent dots on the left.
- **Accent lines:** 2px colored bars beneath metrics, beside service items, as section dividers.
- **Light/Dark mode:** Toggle in navbar. CSS variables + `next-themes`. Dark is default.

### No Emojis — Real Assets Only
- **UI Icons:** Lucide React (`lucide-react`) — consistent stroke-based SVG icons for navigation, actions, section markers, game UI.
- **Brand/Tech Logos:** Simple Icons (`simple-icons`) — 3000+ brand SVGs for GitHub, LinkedIn, React, TypeScript, Docker, AWS, etc.
- **Product Logos:** Actual image assets from devino.ca (`/public/logos/shorty.png`, `unotes.png`, `upup.png`, `caramel.png`, `getitdone.png`).
- **Profile Photo:** Actual photo in `/public/profile.jpg` (green-glow photo from LinkedIn/GitHub).
- **Platform Badges:** App Store, Chrome Web Store, Firefox, npm — SVG icons from Simple Icons.
- **NEVER:** Unicode emojis, placeholder letters, generic stock icons, AI-generated imagery.

### Date-Proof
- All year references use `new Date().getFullYear()` — never hardcoded.
- Blog posts show relative time ("2 weeks ago") or dynamically formatted dates.
- Copyright footer is dynamic.
- No "Est. 2019" or similar hardcoded dates.

---

## Navbar (Always Visible)

```
+-------------------------------------------------------------+
| AMIN DHOUIB   Home  Work  Services  Blog  Games   [sun/moon] [Book a Call ->] |
+-------------------------------------------------------------+
```

- **Always present** at the top of the page (not hidden on hero).
- **Dark/Light toggle:** Lucide Sun/Moon SVG icons. Uses `next-themes`. Preference saved to localStorage.
- **CTA:** "Book a Call" button — solid green, links to Calendly. Always visible.
- **Active indicator:** Green underline on current section via scroll-spy (Intersection Observer).
- **Backdrop:** Semi-transparent with `backdrop-filter: blur()` on scroll. Fully transparent at the very top.
- **Mobile:** Logo + sun/moon + CTA + hamburger (Lucide Menu/X). Burger opens slide-out nav.

---

## Scroll Flow — 11 Beats

### 01. Hero — The Entrance
**Tags:** Three.js, Above fold, SSR content

```
Portfolio / {currentYear}

AMIN          [Profile photo with green glow ring]
DHOUIB

-- Engineer  -- Founder  -- Builder
(green bar)  (blue bar)  (purple bar)

"I build apps people actually use —
 then self-host them on my home server."

[Book a Call]   [Explore (ChevronDown icon)]

(Three.js wireframe geometry floating right side)
```

- **Typography:** Name in 900/200 weight contrast with distinctive display font.
- **Three.js:** Abstract wireframe shapes (circle, triangle, diamond) floating right side. Parallax on mouse move. These persist and morph throughout the entire scroll.
- **Profile pic:** Circular with CSS green glow ring. Positioned asymmetrically (right-offset desktop, centered mobile).
- **CTA:** "Book a Call" (solid green -> Calendly) + "Explore" with Lucide ChevronDown (ghost button, smooth-scrolls).
- **SEO:** All text is real SSR HTML. Three.js is overlay canvas. Google indexes full content immediately.

**Transition:** Geometric shapes drift downward as user scrolls.

---

### 02. Proof Bar — The Numbers
**Tags:** Animated counters, Live data

```
$1M+       100+       30K+       5.0★        99.99%
Revenue    Clients    Users      Rating       Uptime
---(grn)   ---(blue)  ---(cyan)  ---(amber)   ---(grn)

(Server icon) Self-hosted on home server
Docker Swarm  /  Tailscale  /  Cloudflared
```

- **5 metrics:** $1M+ Revenue, 100+ Clients, 30K+ Users Acquired, 5.0 Rating (Lucide Star SVG, filled amber), 99.99% Uptime.
- **Self-hosted callout:** Lucide Server icon + infrastructure description. "Did you know this site runs on my home server?"
- **Animation:** Numbers count up on scroll-in using Framer Motion `useInView` + `useMotionValue`.
- **No section heading:** This is a natural extension of the hero, not a named section.

**Transition:** Thin vertical accent line extends downward.

---

### 03. Work — The Apps
**Tags:** Google Analytics API, Live MAU dots, Detail pages

```
03 -- Work

+-------------------------+  +---------------------------+
| [Shorty logo]           |  | [uNotes logo]             |
| SHORTY                  |  | UNOTES                    |
| AI YouTube & Spotify    |  | 30K+ docs shared          |
| Summarizer              |  | by students               |
| (green dot) 2.1K MAU   |  | (green dot) 5K MAU        |
| +50% MoM               |  |                           |
| [AppStore] [Chrome] ... |  | [AppStore] [Web] ...      |
+-------------------------+  +---------------------------+

+-------------------------+  +---------------------------+
| [Caramel logo]     OSS  |  | [UpUp logo]          OSS  |
| Open-source Honey alt   |  | React file uploader NPM   |
| (green dot) 800 MAU     |  | (green dot) 1.2K MAU      |
| [Chrome] [Firefox]      |  | [npm] [GitHub]            |
+-------------------------+  +---------------------------+

+-------------------------------------------------------+
| [GetItDone logo]                                       |
| Team check-ins, tasks, time tracking                   |
| (green dot) 500 MAU                                    |
+-------------------------------------------------------+
```

- **Logos:** Actual product logo image assets from devino.ca.
- **Platform badges:** Real SVG icons (Apple, Chrome, Firefox, npm, GitHub) from Simple Icons.
- **Live MAU:** Green pulsing dot (CSS animation) + number from Google Analytics Data API (GA4). Fetched server-side via Next.js ISR, cached 24h. Shows last-30-day active users per domain. Note at bottom: "All numbers updated dynamically — last 30 days."
- **OSS badge:** Caramel and UpUp get visible "OSS" tag linking to GitHub repos.
- **Detail pages:** Each card links to `/work/[slug]` with full development story, screenshots, tech stack, store links (content from Contra profile).

#### App Details

**Shorty** (`/work/shorty`)
- AI YouTube & Spotify summarization app — turns videos, podcasts, and documents into quick, digestible takeaways
- 50% month-over-month growth
- Built with: Next.js, Python microservices, Figma, Selenium + TOR
- Platforms:
  - App Store: id6740627456
  - Google Play: ai.shortee.twa
  - Microsoft Store: 9nphlg2cfnwb
  - Chrome Web Store: pndkkfhcfhhhebmmndaiohkbknenlchl
  - Firefox Add-ons: shorty-ai-youtube-summarizer
  - Safari: via App Store
- URL: aishorty.com
- Contra detail: https://contra.com/p/QsA7PFlq-nextjs-figma-python-seleniumandtor-browser-ext-shorty
- Tags: Data Scraper, DevOps Engineer, Fullstack Engineer

**uNotes** (`/work/unotes`)
- Community-driven note-sharing platform with 30,000+ user-uploaded university docs (past papers, exams, assignments, labs)
- 5,000+ active monthly users
- Free and open alternative to Chegg, CourseHero, StuDocu
- Built with: Next.js, TypeScript, AWS
- Platforms:
  - App Store: id6477337434
  - Google Play: net.unotes.twa
  - Microsoft Store: 9nsmfdd0r238
  - Web
- URL: unotes.net
- Contra detail: https://contra.com/p/bve7Lces-nextjs-typescript-aws-u-notes
- Key features: Instant access, community driven, personal profile, search and filter, no login required, offline support

**Caramel** (`/work/caramel`)
- Open-source alternative to Honey — browser extension that automatically applies the best coupon code at checkout, without selling data or hijacking creators' commissions
- Source code public on GitHub: github.com/DevinoSolutions/caramel
- Built with: JavaScript, iOS, macOS
- Platforms:
  - App Store / Safari: id6741873881
  - Chrome Web Store: gaimofgglbackoimfjopicmbmnlccfoe
  - Firefox Add-ons: grabcaramel
- URL: grabcaramel.com
- Contra detail: https://contra.com/p/v3Ek6YPZ-caramel-open-source-alternative-to-honey-coupon-finder

**UpUp** (`/work/upup`)
- Open-source, free, and secure React file upload component with cloud storage integrations (Google Drive, OneDrive, S3)
- Versatile NPM component
- Source code: github.com/DevinoSolutions/upup
- URL: useupup.com
- Contra detail: https://contra.com/p/ZQl3WYFY-g-drive-one-drive-s3-integrations-open-react-file-uploader

**GetItDone** (`/work/getitdone`)
- One dashboard for daily check-ins, task updates, time tracking
- Skip stand-ups and stop tool-hopping
- URL: nowgetitdone.com

**Transition:** Cards stagger-fade as you scroll past.

---

### 04. Services — What I Do
**Tags:** Scroll-triggered reveals

```
04 -- Services

(Bot icon)       AI Automation
--               Web scraping, AI agents, orchestration
                 Python / LangChain / Scrapy / Make

(Code2 icon)     Full Stack Development
--               Web & mobile, end to end
                 Next.js / Prisma / TypeScript / Django / FastAPI

(Cloud icon)     DevOps & Cloud
--               CI/CD, infra, deployment
                 Docker / AWS / Terraform / Jenkins

(Database icon)  Database Management
--               Design, optimize, migrate
                 PostgreSQL / MongoDB / Firebase / Redis

(ShieldCheck)    Security
--               Pentesting, network, DevSecOps
                 Burp Suite / Wireshark / Tailscale

                 [Book a Call (ArrowRight icon)]
```

- **Icons:** Lucide React — Bot, Code2, Cloud, Database, ShieldCheck.
- **Layout:** Vertical list with colored left accent bars (2px). Not boxed cards — lines. Each slides in from left on scroll (staggered Framer Motion).
- **CTA:** "Book a Call" with Lucide ArrowRight -> Calendly. Natural conversion point.

**Transition:** Shapes cluster and slow, shifting energy.

---

### 05. Reviews — Social Proof
**Tags:** Auto-scrolling marquee

```
05 -- What Clients Say

<--- auto-scrolling review cards --->
"Very fast and efficient..."     "Fair rates, excellent team..."
-- John, COO                     -- Jane, CTO

(Star icons x5)  5.0 avg  /  81 reviews
```

- **Stars:** Lucide Star icons (filled amber SVGs).
- **Layout:** Horizontal auto-scrolling marquee. Minimal cards — quote, name, title, thin bottom accent line.
- **Source:** Reviews from devino.ca landing page repo.
- **Compact:** Quick confidence-builder, not a destination.

**Transition:** Marquee flows rightward, geometric shape pulls down.

---

### 06. Open Source — Contributions
**Tags:** GitHub API, Contribution graph

```
06 -- Open Source

+------------------------+ +------------------------+
| [Caramel logo]         | | [UpUp logo]            |
| CARAMEL                | | UPUP                   |
| Open-source Honey alt. | | React file upload      |
| (GitFork icon) 45      | | (GitFork icon) 32      |
| (Star icon) 234        | | (Star icon) 189        |
| [View on GitHub ->]    | | [View on GitHub ->]    |
+------------------------+ +------------------------+

+-------------------------------------------------------+
| GitHub Contribution Graph (live heatmap)                |
| (green squares rendered as CSS grid/SVG, not an image)  |
+-------------------------------------------------------+

CI Stack: Prettier / ESLint / knip / ruff / pyright /
          CodeRabbit / package size limits
```

- **Icons:** Lucide GitFork, Star. GitHub icon from Simple Icons.
- **Contribution graph:** Fetched from GitHub API, rendered as CSS grid or SVG with the site's green accent color.
- **CI badges:** Tool logos as small SVGs showing engineering rigor.
- **Geometric accent:** Wireframe shapes here are all wireframe — reinforcing "open source = transparent."

**Transition:** Green squares lead into education.

---

### 07. Background — Education & Stack
**Tags:** Compact, Tech marquee

```
07 -- Background

(GraduationCap icon)
University of Ottawa
BASc Computer Software Engineering
Summa Cum Laude (A+)

(Languages icon) Fluent: English, French / Working: Arabic

<--- auto-scrolling tech logo marquee --->
[React logo] [TS logo] [Python logo] [Docker logo] [AWS logo] ...
```

- **Icons:** Lucide GraduationCap, Languages.
- **Tech logos:** Real SVG logos from Simple Icons or official sources. Auto-scrolling marquee.
- **Compact:** Education is a credential, not a story. Show it, move on.

**Transition:** Marquee slows, shapes begin bouncing playfully.

---

### 08. The Game — Seamless Scroll Interlude
**Tags:** Three.js/Canvas, Mobile touch, Scroll-triggered

**THE KEY IDEA:** The floating geometric wireframes that have been drifting through the entire page suddenly come alive. They ARE the game. The same circles, triangles, and diamonds that were decorative now become obstacles.

**Game: "Geometric Flow"**
- Your shape (a filled triangle) navigates through a field of wireframe shapes.
- Tap/click to change direction. Endless runner using the site's own visual language.
- No jarring transition — the page itself becomes the game.

**Activation:** As user scrolls to this point, shapes coalesce and "Tap to play" appears. If they don't engage, shapes keep drifting and scroll continues normally. Zero friction.

**Mobile:** Tap-based controls. Same game, responsive canvas.

**Score:** localStorage persistence. High score badge.

**Link:** "Want more?" with Lucide Gamepad2 icon -> `/games` page.

**Game UI icons:** Lucide Play, Pause, Trophy, RotateCcw (restart).

**Why this works:** The game uses the same Three.js shapes, same colors, same wireframe style. It doesn't feel like a separate section — it feels like the page came alive.

**Transition:** Shapes disperse back to drifting state.

---

### 09. Blog — Latest Thinking
**Tags:** MDX, 3 latest posts

```
09 -- Blog

How I Self-Host Everything on a
Home Server with 99.99% Uptime               ->
----
Building an Open-Source Honey
Alternative: The Caramel Story               ->
----
Why I Use AI Agents to Automate
My Entire Dev Workflow                       ->

[View all posts ->]
```

- **Layout:** List-style with Lucide ArrowRight on hover. Title in 700 weight, reading time in muted.
- **Content ideas:**
  - "How I Self-Host Everything on a Home Server with 99.99% Uptime"
  - "Building an Open-Source Honey Alternative: The Caramel Story"
  - "From $0 to $1M: Lessons Building Devino Solutions"
  - "My Full DevSecOps Pipeline: ESLint, knip, CodeRabbit, and Beyond"
  - "Why I Reverse-Engineered a Trading Bot with Burp Suite"
  - "5 Apps, 5 Lessons: What I Learned Shipping Products Nobody Asked For"
- **Tech:** MDX via `next-mdx-remote`. Each post at `/blog/[slug]` with ToC sidebar, Shiki code highlighting, reading time.
- **Dates:** Relative time or dynamically formatted — never hardcoded.

**Transition:** Titles fade as personal section slides in.

---

### 10. Beyond Code — The Human Side
**Tags:** Compact

```
10 -- Beyond Code

(Target icon)     (Palette icon)
Team Sports       Design & Modeling
Soccer, Volley

(Dumbbell icon)   (Rocket icon)
Fitness           Building & Shipping
```

- **Icons:** Lucide Target (sports), Palette (design), Dumbbell (fitness), Rocket (building). NO emojis.
- **Layout:** 2x2 minimal grid. Short text. Intentionally brief — humanizes in 3 seconds.
- **Geometric shapes:** Drift more playfully here (lighter, organic movement).

**Transition:** Shapes converge toward center for finale.

---

### 11. Contact — The Close
**Tags:** Calendly, Final CTA

```
LET'S
BUILD.

[Book a Call (ArrowRight icon)]    <- Calendly

(GitHub) (LinkedIn) (Contra) (YouTube) (Instagram) (Mail)

---
(c) {currentYear} Amin Dhouib / amindhou.com
Hosted on a home server with (Heart icon)

(Three.js shapes settle into static composition)
```

- **Typography:** Massive "LET'S BUILD." in 900 weight.
- **CTA:** Single green button -> Calendly. No form, no friction.
- **Social icons:** Simple Icons SVGs for GitHub, LinkedIn, YouTube, Instagram. Custom SVG for Contra. Lucide Mail for email.
- **Copyright:** `{new Date().getFullYear()}` — dynamic.
- **Heart:** Lucide Heart icon, not emoji.
- **Three.js finale:** Shapes settle into a balanced static composition. Journey ends.

---

## Persistent Elements

### AI Chatbot — Mastra + CopilotKit
**Always present.** Floating green button (Lucide MessageCircle) at bottom-right.

- **Desktop:** Click opens side panel (slide from right).
- **Mobile:** Click opens near-fullscreen modal with Lucide X to close.
- **Backend:** Mastra agent (`@mastra/ai-sdk`). Next.js API route using `handleChatStream` + `createUIMessageStreamResponse`. Agent has tools for: answering skill questions, recommending projects, collecting leads (name + email -> notification to Amin).
- **Frontend:** CopilotKit v2 (`@copilotkit/react-core/v2`). `CopilotPopup` component with custom styling matching geometric theme. Import `@copilotkit/react-ui/v2/styles.css`.
- **Knowledge source:** Curated `.md` file with capabilities, experience, project details + parsed HTML text content from the site.
- **Tracking:** All conversations logged for analytics (what are people asking? what converts?).
- **Actions:** "Interested?" -> collect name + email -> send notification.
- **Icons:** Lucide MessageCircle (float), Bot (header), X (close), Send (submit).

### Bookmark Button
Small bookmark icon (Lucide Bookmark) in the nav. Triggers browser's "Add to bookmarks" / "Add to Home Screen" on mobile.

### Sticky Nav
See Navbar section above. Uses scroll-spy with Intersection Observer for active section highlighting.

---

## Additional Pages

### /work/[slug] — Project Detail Pages
Each app (Shorty, Caramel, uNotes, UpUp, GetItDone) gets a dedicated page with:
- Hero screenshot/video
- Full description (from Contra portfolio content)
- Tech stack breakdown
- Development story
- Store/extension links with proper SVG platform icons
- Live MAU stat (green dot + GA4 number)
- Same geometric design language throughout

### /blog/[slug] — Blog Posts
- Clean reading experience with MDX via `next-mdx-remote`
- Table of contents sidebar on desktop
- Shiki for code syntax highlighting
- Computed reading time
- Share button (Lucide Share2)
- Geometric shapes as subtle page decoration (not distracting during reading)

### /games — Games Arcade
- Collection page with playable mini-games in canvas
- "Geometric Flow" (the main game, expanded version)
- Typing speed test
- Code-themed puzzle
- All mobile-responsive with touch controls
- Same wireframe geometric visual language
- Icons: Lucide Gamepad2, Trophy, RotateCcw

---

## Technical Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router, RSC, SSR) | 16.x (latest: 16.1.6) |
| Language | TypeScript (strict mode) | 5.x |
| Styling | Tailwind CSS + CSS variables + `next-themes` | 4.x |
| 3D | Three.js via `@react-three/fiber` + `@react-three/drei` | Latest (lazy loaded) |
| Animations | Framer Motion (`motion`) | Latest |
| AI Agent Backend | Mastra (`@mastra/ai-sdk`) | Latest |
| AI Chat UI | CopilotKit v2 (`@copilotkit/react-core/v2`) | Latest |
| Blog | MDX via `next-mdx-remote` + Shiki | Latest |
| Icons (UI) | Lucide React | Latest |
| Icons (Brands) | Simple Icons | Latest |
| Fonts | Distinctive display font via `next/font` | TBD |
| APIs | GitHub REST API + Google Analytics Data API (GA4) | — |
| Deployment | Docker on home server via Dokploy | — |
| Domain | amindhou.com | — |
| CI | Prettier, ESLint, knip, ruff, pyright, CodeRabbit, package size limits | — |

---

## Data Integrations

### Google Analytics Data API (GA4)
- **Purpose:** Fetch last-30-day active users per app domain (aishorty.com, unotes.net, grabcaramel.com, useupup.com, nowgetitdone.com).
- **Display:** Green pulsing dot + MAU number on each app card. Note: "Updated dynamically — last 30 days."
- **Fetch strategy:** Server-side in Next.js (RSC or API route). Cached via ISR (revalidate every 24h).

### GitHub REST API
- **Contribution graph:** Fetch contribution data for AminDhouib, render as CSS grid/SVG with green squares.
- **Repo stats:** Stars + forks for Caramel and UpUp repos.
- **Fetch strategy:** Server-side, cached via ISR.

---

## User Profile Reference

- **Name:** Amin Dhouib
- **Role:** CEO & CTO at Devino Solutions (devino.ca)
- **Location:** Ottawa, Canada
- **Education:** University of Ottawa, BASc Computer Software Engineering, Summa Cum Laude (A+)
- **Languages:** Fluent English & French, Working Arabic
- **Favorite Stack:** Next.js, Prisma, TypeScript, Python (Django, FastAPI)
- **Revenue:** $1M+ across projects, 100+ clients, 30K+ users acquired, 5.0 avg rating, 95% on-time completion rate
- **Contra:** contra.com/amin — $25K+ earned, 5.00 rating (9 reviews), 7x hired, $50-75/hr
- **Featured on:** Best freelance Fullstack Engineers 2026, Best Python freelancers 2026
- **GitHub:** github.com/AminDhouib
- **LinkedIn:** linkedin.com/in/amin-dhouib
- **Social:** YouTube (@amin_dhou), Instagram (@amin-dhou)
- **Reviews source:** devino.ca/reviews (also in GitHub repo: github.com/DevinoSolutions/devino-landing-page)
- **Infrastructure:** Self-hosted home server, Docker Swarm via Dokploy, Tailscale + Cloudflared, 99.99% uptime with monitoring

---

## Work Experience (for AI chatbot knowledge base)

1. **CEO & CTO — Devino Solutions** (Jan 2023 - Present)
   - Successfully generated over $1M in project revenue, working with 100+ satisfied clients and earning an average 5-star rating
   - Developed many great B2B relationships (devino.ca/reviews)
   - Published several apps including uNotes (unotes.net) and Shorty (aishorty.com), reaching a cumulative 30K+ monthly active users

2. **GIS Full Stack / Code Migration Modernization Specialist — Fujitsu** (Nov 2022 - Apr 2024)
   - GIS Full Stack: Optimized spatial data storage and query management using PostGIS. Developed dynamic front-end features with jQuery and CSS. Ported old JS/jQuery code to Vue.js (SPAs). Managed backend systems with SQLAlchemy. Automated CI/CD with Jenkins and Azure.
   - Code Migration: Migrated legacy Cobol code to C#. Converted Cobol code to Java. Recreated frontend terminals using React.js.

3. **Senior Full Stack Developer — Math Anex (Acquired)** (Mar 2023 - Jun 2023)
   - Managed webapp hosting using AWS services (EC2, S3, RDS) and NGINX
   - Created and maintained Django REST APIs for data communication between frontend and backend
   - Managed PostgreSQL database migrations using Django's ORM
   - Implemented responsive UI components using React.js
   - Developed scripts to perform cronjobs and automate sending emails using the Sendgrid API

4. **B2B MERN Integration Developer — Left Hook** (Dec 2022 - Feb 2023)
   - Designed integrations between Slack and third-party SaaS using Express.js, Node.js, React.js, MongoDB
   - Worked with webhooks, 3rd party REST APIs, and OAuth
   - Created custom Zapier integration for Freshbooks and AutoTask API

5. **API / AWS Software + DevOps Engineer — RentCheck** (Mar 2022 - Nov 2022)
   - Designed and created many public REST API endpoints with JavaScript/TypeScript
   - Designed B2B integrations with Zapier and Latchel
   - Created AWS Lambda functions with Terraform
   - Managed NoSQL Firebase (GCP) database and used Algolia
   - Built UI tests with Playwright
   - Worked with Bitbucket Pipelines for CI/CD

6. **Scrum Master Software + DevOps — Sirch** (Dec 2021 - Nov 2022)
   - Led a group of developers to create an advanced search engine with NestJS (JavaScript)
   - Managed Git repo and maintained code by constantly performing code reviews
   - Implemented key features with HyperBeam
   - Managed CI/CD pipelines to automate publishing and running tests

7. **Software Developer — Bell** (May 2021 - Jan 2022)
   - Led a group of 5 developers to create a Docker-contained React/JavaScript frontend with Python backend
   - OSINT practices by scrapping publicly available data from social media platforms, analyzing and displaying in graphs
   - Interfaced with stakeholders to adjust changes and implement features

8. **Research Development Software Engineer — Lumenium** (May 2021 - Sep 2021)
   - Created a C# CLI program for cloud file sharing and management
   - Designed key features in Visual Basic on embedded platforms for high performance optical modules
   - Performed in-lab optical wave test experiments with high-tech equipment

9. **CyberSecurity Software Developer — Crypto4A Technologies** (Jan 2020 - Jan 2021)
   - Created services using Java/Python/Bash to manage cryptographic keys (MC-Eliece, RSA, ECC, AES, HSS) from HSM and Yubico's Yubikey
   - Created test cases for low-level C/C++ programs handling HSM hardware logic (80%+ coverage)
   - Developed JavaScript Web Apps interfacing with Crypto4A's Java services via REST API
   - Migrated entire Java/Maven project from JDK8 to JDK11
   - Supervised newly recruited students

10. **Java Software Engineer — Department of National Defence Canada** (May 2019 - Sep 2019)
    - Built foundations for a Java application for DND to create, build, and run automated tests for SOAP Services
    - Worked with JUnit, Oracle MySQL Database, and Hibernate

11. **Software Quality Assurance Developer — Infosys** (May 2018 - Sep 2018)
    - Trained in Software Developer in Test (Selenium, SOAPUI, agile, CI/CD) with 100+ other developers
    - Performed functional testing using Java and Selenium to validate 20+ modules on Infosys's Essence Bank application
    - Produced data-driven testing solution reducing labor time by over 50%

## Additional Contra Portfolio Projects (for AI chatbot context)

- **Syncara** — Healthcare Solutions for Canadians
- **Bitbuy Converter Page** — Webflow + CMS + JS + SEO
- **WooCommerce & ShipStation Sync/Integration** — $500 earned
- **Lugano Caffe** — Shopify + Figma + Photoshop + Illustrator + CSS
- **Chronicler** — AI Messaging Companion
- **Algo Trading Bot** — Reverse Engineering with Burp Suite & Wireshark
- **LinkedIn Auto Apply Jobs Automation**
- **AI Rehabilitation Letter Writer** — Webflow + GCP + GPT
- **AI COVID-19 Data Analysis** — ETL + OpenCV + Scikit-learn
- **GoHighLevel Wix Form Lead Generation**

## Skills & Roles (from Contra, for AI chatbot)

Fullstack Engineer, Data Scraper, DevOps Engineer, Web Designer, Backend Engineer, UX Designer, Web Developer, UX Engineer, Webflow Developer, Data Engineer, iOS Developer, Chrome Extension Developer, UI Designer, WordPress Developer, Shopify Designer, Shopify Developer, Cybersecurity Specialist, Data Scientist, Data Visualizer, Lead Generator, Automation Engineer, Prompt Engineer

## Technologies (comprehensive, for AI chatbot and tech marquee)

Next.js, Python, JavaScript, TypeScript, Figma, Webflow, iOS, AWS, React, Adobe Illustrator, Adobe Photoshop, Selenium, Azure, npm, ShipStation, WooCommerce, WordPress, Shopify, Stripe, Temporal, Burp Suite, Wireshark, Google Cloud Platform, OpenCV, PostgreSQL, Tableau, Go High Level, BeautifulSoup, pandas, Scrapy, TensorFlow, CSS, Make, Zapier, DigitalOcean, Prisma, Django, FastAPI, Docker, Terraform, Jenkins, NestJS, Express.js, Node.js, MongoDB, Firebase, Redis, Algolia, Playwright, Vue.js, jQuery, SQLAlchemy, PostGIS, Java, C#, C, C++, Rust, Ruby, Rails, Tailwind CSS, Framer Motion, Three.js, LangChain

---

## Next Steps

1. Review this spec
2. Create implementation plan (writing-plans skill)
3. Scaffold Next.js 16 project
4. Implement section by section following the scroll flow order
