# AGORA contact form

Public entry: https://criticaldata.github.io/agoraworkshop/contact.html

The static page posts JSON to the existing Simon-owned `portfolio-mailer` Railway Function at `/agora/contact`. Its sender uses the Function's existing Resend configuration; no provider credentials are exposed to the browser or stored here.

`portfolio-mailer.ts` is the full deployed Function source snapshot, including its pre-existing authenticated `/send` mentoring route. Before changing that Function, fetch its current deployed code and reconcile concurrent changes; this file is not an automatic Railway deployment source. The website itself deploys via the existing GitHub Pages workflow when `website/**` changes on `master`.

AGORA recipients are fixed server-side to the two addresses previously published on the live AGORA onboarding/resources pages. Client-provided recipient fields are rejected. The public endpoint requires the GitHub Pages origin, bounded JSON fields, and valid email/name/topic/message inputs. A honeypot, limits of three requests per IP per hour / ten per day, and global limits of thirty per hour / one hundred per day bound unsolicited traffic. Limits are in memory and reset when the single Function replica restarts; origin checking is an additional browser guard, not authentication. Messages are not stored by this code. Provider acceptance IDs, not message contents, are logged. No automatic response is sent to the visitor.

Validation:

```sh
node ops/contact/test-mailer.mjs
node --check website/contact.js
bun build ops/contact/portfolio-mailer.ts --target=bun --outfile /tmp/agora-contact-mailer-check.js
```

All outbound delivery calls in the test are mocked. Production validation uses `/health`, CORS `OPTIONS`, rejection of an invalid payload, and rejection of foreign origins. It does not send a real test message. A successful provider response means the request was accepted for delivery; inbox delivery is not claimed as tested.

Deployment on 19 November 2026: Railway Function deployment `ffd7602d-d09f-4fd7-a7f7-6c9eb7ff1251`, SUCCESS. Existing mentoring health and AGORA sender configuration both report true. Recipient routing and failure behavior were verified against mocked provider calls. Browser visual QA was unavailable because the computer-use tool exposed no browsers; HTML links, form semantics, and responsive stylesheet rules were checked locally.
