
const port = Number(Bun.env.PORT || 3000);

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char] || char));
}

function clean(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

// AGORA's public contact route uses the existing sender, with fixed recipients.
const AGORA_ORIGIN = "https://criticaldata.github.io";
const AGORA_RECIPIENTS = ["simon@denemlabs.com", "isaac.gavilanes@yachaytech.edu.ec"];
const agoraHits = new Map<string, number[]>();
let agoraGlobal: number[] = [];
const agoraTopics: Record<string, string> = {
  joining: "Joining AGORA",
  collaboration: "Research collaboration",
  question: "A question about the project",
};

function agoraJson(body: unknown, status = 200, cors = true) {
  const response = json(body, status);
  if (cors) {
    response.headers.set("Access-Control-Allow-Origin", AGORA_ORIGIN);
    response.headers.set("Vary", "Origin");
  }
  return response;
}

function agoraRateAllowed(ip: string, now = Date.now()) {
  const day = now - 86400000;
  // Bound memory as well as messages, even when source IPs vary.
  for (const [key, hits] of agoraHits) {
    const live = hits.filter(stamp => stamp > day);
    if (!live.length) agoraHits.delete(key); else agoraHits.set(key, live);
  }
  agoraGlobal = agoraGlobal.filter(stamp => stamp > day);
  const hits = agoraHits.get(ip) || [];
  if (hits.filter(stamp => stamp > now - 3600000).length >= 3 || hits.length >= 10 ||
      agoraGlobal.filter(stamp => stamp > now - 3600000).length >= 30 || agoraGlobal.length >= 100) return false;
  hits.push(now); agoraHits.set(ip, hits); agoraGlobal.push(now);
  return true;
}

async function readAgoraBody(req: Request) {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new Error("content-type");
  }
  const reader = req.body?.getReader();
  if (!reader) throw new Error("body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > 12000) { await reader.cancel(); throw new Error("size"); }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || Array.isArray(data) || typeof data !== "object") throw new Error("body");
  return data as Record<string, unknown>;
}

function agoraField(body: Record<string, unknown>, name: string, min: number, max: number) {
  const value = body[name];
  if (typeof value !== "string" || value.trim().length < min || value.length > max) throw new Error(name);
  return value.trim();
}

async function handleAgora(req: Request) {
  if (req.headers.get("origin") !== AGORA_ORIGIN) return agoraJson({ error: "origin not allowed" }, 403, false);
  if (req.method === "OPTIONS") {
    const response = new Response(null, { status: 204 });
    response.headers.set("Access-Control-Allow-Origin", AGORA_ORIGIN);
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
    response.headers.set("Access-Control-Max-Age", "600");
    response.headers.set("Vary", "Origin");
    return response;
  }
  if (req.method !== "POST") return agoraJson({ error: "method not allowed" }, 405);
  // Railway's edge appends the visitor address. Never accept a client-supplied To.
  const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",").at(-1)!.trim().slice(0, 80);
  if (!agoraRateAllowed(ip)) return agoraJson({ error: "Please try again later." }, 429);
  let name: string, email: string, topic: string, message: string;
  try {
    const body = await readAgoraBody(req);
    if (Object.keys(body).some(key => !["name", "email", "topic", "message", "website"].includes(key))) throw new Error("fields");
    if (body.website) return agoraJson({ error: "Please leave the website field empty." }, 400);
    name = agoraField(body, "name", 1, 120);
    email = agoraField(body, "email", 3, 254);
    topic = agoraField(body, "topic", 1, 40);
    message = agoraField(body, "message", 10, 5000);
    if (/[\r\n\x00-\x1f]/.test(name) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || !Object.hasOwn(agoraTopics, topic)) throw new Error("fields");
  } catch (error) {
    return agoraJson({ error: "Please check the form fields and try again." }, error instanceof Error && error.message === "size" ? 413 : 400);
  }
  const apiKey = Bun.env.RESEND_API_KEY;
  const from = Bun.env.RESEND_FROM;
  if (!apiKey || !from) return agoraJson({ error: "Contact is temporarily unavailable." }, 503);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        from,
        to: AGORA_RECIPIENTS,
        reply_to: email,
        subject: ("AGORA — " + agoraTopics[topic] + " — " + name).slice(0, 240),
        text: ["New message from the AGORA contact form", "", "Name: " + name, "Email: " + email, "Topic: " + agoraTopics[topic], "", message].join("\n"),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || typeof result.id !== "string") return agoraJson({ error: "Delivery could not be confirmed." }, 502);
    console.log("AGORA contact accepted", result.id);
    return agoraJson({ ok: true });
  } catch {
    return agoraJson({ error: "Delivery could not be confirmed." }, 502);
  }
}

Bun.serve({
  port,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/agora/contact") return handleAgora(req);
    if (req.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        agora_configured: Boolean(Bun.env.RESEND_API_KEY && Bun.env.RESEND_FROM),
        configured: Boolean(
          Bun.env.RESEND_API_KEY &&
          Bun.env.RESEND_FROM &&
          Bun.env.MAILER_SECRET &&
          Bun.env.MENTORING_TO
        ),
      });
    }
    if (req.method !== "POST" || url.pathname !== "/send") {
      return json({ error: "not found" }, 404);
    }

    const expected = Bun.env.MAILER_SECRET || "";
    const auth = req.headers.get("authorization") || "";
    if (!expected || auth !== "Bearer " + expected) {
      return json({ error: "unauthorized" }, 401);
    }

    const length = Number(req.headers.get("content-length") || 0);
    if (length > 8000) return json({ error: "request too large" }, 413);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad request" }, 400);
    }

    const name = clean(body.name, 100);
    const email = clean(body.email, 254);
    const topic = clean(body.topic, 180);
    const experience = clean(body.experience, 1500);
    const project = clean(body.project, 2500);
    const link = clean(body.link, 500);

    if (!name || !email || !topic || !experience || !project) {
      return json({ error: "missing fields" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "invalid email" }, 400);
    }

    const apiKey = Bun.env.RESEND_API_KEY || "";
    const from = Bun.env.RESEND_FROM || "";
    const to = Bun.env.MENTORING_TO || "";
    if (!apiKey || !from || !to) return json({ error: "not configured" }, 503);

    const safe = {
      name: escapeHtml(name),
      email: escapeHtml(email),
      topic: escapeHtml(topic),
      experience: escapeHtml(experience).replace(/\n/g, "<br>"),
      project: escapeHtml(project).replace(/\n/g, "<br>"),
      link: escapeHtml(link),
    };
    const subject = ("Mentoring request — " + topic + " — " + name)
      .replace(/[\r\n]+/g, " ")
      .slice(0, 240);
    const textBody = [
      "Name: " + name,
      "Email: " + email,
      "Project or topic: " + topic,
      "",
      "Experience:",
      experience,
      "",
      "Project and mentoring goal:",
      project,
      "",
      "Relevant link: " + (link || "Not provided"),
    ].join("\n");
    const htmlBody = `
      <h2>New mentoring request</h2>
      <p><strong>Name:</strong> ${safe.name}<br>
      <strong>Email:</strong> <a href="mailto:${safe.email}">${safe.email}</a><br>
      <strong>Project or topic:</strong> ${safe.topic}</p>
      <h3>Experience</h3>
      <p>${safe.experience}</p>
      <h3>Project and mentoring goal</h3>
      <p>${safe.project}</p>
      <p><strong>Relevant link:</strong> ${link ? `<a href="${safe.link}">${safe.link}</a>` : "Not provided"}</p>
      <hr>
      <p style="color:#666;font-size:12px">Sent from the mentoring form on simon.heilles.org.</p>
    `;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject,
        html: htmlBody,
        text: textBody,
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Resend delivery failed", response.status, JSON.stringify(result));
      return json({ error: "delivery failed" }, 502);
    }
    const emailId = result.id || null;
    console.log("Resend accepted", emailId || "unknown");
    if (emailId) {
      setTimeout(async () => {
        try {
          const check = await fetch("https://api.resend.com/emails/" + encodeURIComponent(emailId), {
            headers: { Authorization: "Bearer " + apiKey },
          });
          const details = await check.json().catch(() => ({}));
          console.log("Resend delivery", emailId, details.last_event || ("http_" + check.status));
        } catch (error) {
          console.error("Resend status check failed", emailId, String(error));
        }
      }, 3000);
    }
    return json({ ok: true, id: emailId });
  },
});

