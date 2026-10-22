# T-6264 blog slug guard, headed proof on prod 45b9948d

Headed Chrome against https://amindhou.com. Statuses measured by fetch() in the page (status-codes.txt).

- /blog/quality-gates-that-earn-their-keep: 200 (blog-valid-200.png)
- /blog/Caramel-Open-Source-Story: 404 (blog-caramel-404.png)
- /blog/%2e%2e%2fadmin: 404 (blog-dotdot-admin-404.png)

Note: /blog/%2E%2E returns 200 with the HOME page (canonical https://amindhou.com), because routing collapses blog/.. to / before the slug guard runs. No file read. Recorded, not a failure.
