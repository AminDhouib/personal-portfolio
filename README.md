# T-6265 blog JSON-LD, headed proof on prod 45b9948d

On /blog/quality-gates-that-earn-their-keep both application/ld+json scripts JSON.parse cleanly (Person/Organization/WebSite graph, and BlogPosting) and no raw "<" survives in either script text (jsonld-parse.txt). blog-jsonld-overlay.png is a screenshot of the page with a text box injected by execute_script showing those live values; the overlay is not part of the site.
