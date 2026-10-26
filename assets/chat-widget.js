/* Embeddable website chat assistant.
 *
 * Usage: define window.ChatWidgetConfig, then load this script.
 *   - No `endpoint`  -> demo mode: answers from the `faqs` list in the browser.
 *   - With `endpoint` -> AI mode: POSTs the conversation to your server (see samples/ai-chatbot-server).
 * The widget lives in a Shadow DOM so the host site's CSS can't affect it (and vice versa).
 */
(() => {
  const cfg = Object.assign({
    name: "Assistant",
    subtitle: "Typically replies instantly",
    greeting: "Hi! How can I help you today?",
    color: "#2f5bea",
    whatsapp: "",
    endpoint: "",
    openOnLoad: false,
    bottom: 20, // px from the bottom edge; raise it if the site has its own sticky bottom bar
    suggestions: [],
    faqs: [],
    fallback: "I'm not sure about that one. Would you like to ask the team directly?",
  }, window.ChatWidgetConfig || {});

  const STOP = new Set("the and for you your are can what how does with this that have has from about any our much will when where which who did was get".split(" "));
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Score each FAQ by keyword hits; multi-word keywords count double. Prefix match handles plurals ("prices" ~ "price").
  function bestFaq(text) {
    const lower = text.toLowerCase(), words = norm(text);
    let best = null, top = 0;
    for (const f of cfg.faqs) {
      let s = 0;
      for (const k of f.keywords) {
        if (k.includes(" ")) s += lower.includes(k) ? 2 : 0;
        else if (words.some((w) => w.startsWith(k) || k.startsWith(w) && w.length > 3)) s += 1;
      }
      if (s > top) { top = s; best = f; }
    }
    return best;
  }

  const contactIn = (t) => (t.match(/[\w.+-]+@[\w-]+\.[\w.]+/) || t.match(/\+?\d[\d\s-]{8,}\d/) || [])[0];

  function demoReply(text) {
    if (/^\s*(hi|hello|hey|namaste|good (morning|evening|afternoon))\b/i.test(text)) {
      return { text: `Hello! 👋 ${cfg.greeting.replace(/^Hi!?\s*/i, "")}` };
    }
    const contact = contactIn(text);
    if (contact) {
      return { text: `Thank you! The team will contact you at ${contact} shortly. You can also message them on WhatsApp right now.`, handoff: true };
    }
    const f = bestFaq(text);
    return f ? { text: f.a, handoff: !!f.handoff } : { text: cfg.fallback, handoff: true };
  }

  const history = []; // [{role, content}] sent to the AI endpoint

  async function getReply(text) {
    if (!cfg.endpoint) return demoReply(text);
    try {
      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      return { text: data.reply, handoff: /whatsapp|call us|contact the team/i.test(data.reply) };
    } catch {
      return demoReply(text); // keep helping even if the server is down
    }
  }

  // ── UI ──
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;right:20px;bottom:${cfg.bottom}px;z-index:2147483000`;
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
  <style>
    :host { --c: ${cfg.color}; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; margin: 0; }
    .fab { width: 60px; height: 60px; border-radius: 50%; border: 0; background: var(--c); color: #fff; cursor: pointer;
      box-shadow: 0 10px 30px -8px rgba(0,0,0,.4); display: grid; place-items: center; transition: transform .2s; }
    .fab:hover { transform: scale(1.06); }
    .panel { position: absolute; right: 0; bottom: 76px; width: 370px; height: 540px; max-height: calc(100vh - 110px);
      background: #fff; border-radius: 20px; box-shadow: 0 24px 60px -12px rgba(0,0,0,.35); display: none;
      flex-direction: column; overflow: hidden; color: #1b1f24; }
    .panel.open { display: flex; animation: up .25s ease-out; }
    @keyframes up { from { opacity: 0; transform: translateY(12px); } }
    header { background: var(--c); color: #fff; padding: 16px 18px; display: flex; align-items: center; gap: 12px; }
    .avatar { width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,.2); display: grid; place-items: center; font-size: 20px; }
    header b { display: block; font-size: 16px; }
    header small { opacity: .85; font-size: 12px; }
    .tag { margin-left: auto; font-size: 11px; font-weight: 700; background: rgba(255,255,255,.22); padding: 3px 8px; border-radius: 999px; }
    .close { background: none; border: 0; color: #fff; font-size: 22px; cursor: pointer; padding: 0 2px 0 6px; }
    .log { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; background: #f6f7f9; }
    .msg { max-width: 82%; padding: 10px 14px; border-radius: 16px; font-size: 14.5px; line-height: 1.45; white-space: pre-wrap; }
    .bot { background: #fff; border: 1px solid #e6e8ec; border-bottom-left-radius: 4px; align-self: flex-start; }
    .me { background: var(--c); color: #fff; border-bottom-right-radius: 4px; align-self: flex-end; }
    .typing span { display: inline-block; width: 7px; height: 7px; margin: 0 2px; border-radius: 50%; background: #9aa1ab; animation: b 1s infinite; }
    .typing span:nth-child(2) { animation-delay: .15s; } .typing span:nth-child(3) { animation-delay: .3s; }
    @keyframes b { 50% { transform: translateY(-4px); opacity: .5; } }
    .wa { align-self: flex-start; display: inline-flex; gap: 8px; align-items: center; background: #25d366; color: #fff; text-decoration: none;
      font-weight: 700; font-size: 13.5px; padding: 9px 14px; border-radius: 999px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 14px 0; background: #fff; }
    .chip { border: 1px solid var(--c); color: var(--c); background: #fff; border-radius: 999px; padding: 6px 12px; font-size: 13px; cursor: pointer; }
    .chip:hover { background: var(--c); color: #fff; }
    form { display: flex; gap: 8px; padding: 12px 14px 14px; background: #fff; }
    input { flex: 1; border: 1.5px solid #e1e4e8; border-radius: 999px; padding: 11px 16px; font: inherit; font-size: 14.5px; outline: none; }
    input:focus { border-color: var(--c); }
    .send { width: 44px; border: 0; border-radius: 50%; background: var(--c); color: #fff; cursor: pointer; display: grid; place-items: center; }
    @media (max-width: 480px) { .panel { position: fixed; inset: 0; width: auto; height: auto; max-height: none; border-radius: 0; bottom: 0; } }
  </style>
  <div class="panel" role="dialog" aria-label="${esc(cfg.name)} chat">
    <header>
      <div class="avatar">💬</div>
      <div><b>${esc(cfg.name)}</b><small>● ${esc(cfg.subtitle)}</small></div>
      ${cfg.endpoint ? "" : '<span class="tag" title="Answers come from the FAQ list. Client versions connect to an AI model.">Demo</span>'}
      <button class="close" aria-label="Close chat">×</button>
    </header>
    <div class="log" aria-live="polite"></div>
    <div class="chips"></div>
    <form><input placeholder="Type your question…" aria-label="Message" autocomplete="off" maxlength="500">
      <button class="send" aria-label="Send"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 20.5 21 12 3 3.5v6.6L15 12 3 13.9z"/></svg></button></form>
  </div>
  <button class="fab" aria-label="Open chat"><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.5 3 2 6.8 2 11.5c0 2.4 1.2 4.6 3.1 6.1L4 21l4-1.8c1.2.4 2.6.6 4 .6 5.5 0 10-3.8 10-8.5S17.5 3 12 3Z"/></svg></button>`;

  const $ = (s) => root.querySelector(s);
  const panel = $(".panel"), log = $(".log"), input = $("input"), chips = $(".chips");

  function add(cls, html) {
    const el = document.createElement("div");
    el.className = cls;
    el.innerHTML = html;
    log.append(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function waLink() {
    const lastQ = [...history].reverse().find((m) => m.role === "user")?.content || "";
    return `https://wa.me/${cfg.whatsapp}?text=${encodeURIComponent(`Hi, I was chatting on your website. ${lastQ}`)}`;
  }

  async function send(text) {
    text = text.trim();
    if (!text) return;
    chips.style.display = "none";
    add("msg me", esc(text));
    history.push({ role: "user", content: text });
    const typing = add("msg bot typing", "<span></span><span></span><span></span>");
    const [reply] = await Promise.all([getReply(text), new Promise((r) => setTimeout(r, 650))]);
    typing.remove();
    add("msg bot", esc(reply.text));
    history.push({ role: "assistant", content: reply.text });
    if (reply.handoff && cfg.whatsapp) add("wa", "Chat on WhatsApp →").outerHTML =
      `<a class="wa" href="${waLink()}" target="_blank" rel="noopener">Chat on WhatsApp →</a>`;
  }

  function toggle(open = !panel.classList.contains("open")) {
    panel.classList.toggle("open", open);
    if (open && !log.children.length) add("msg bot", esc(cfg.greeting));
    if (open) setTimeout(() => input.focus(), 50);
  }

  cfg.suggestions.forEach((s) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = s;
    b.onclick = () => send(s);
    chips.append(b);
  });
  $(".fab").onclick = () => toggle();
  $(".close").onclick = () => toggle(false);
  $("form").onsubmit = (e) => { e.preventDefault(); const t = input.value; input.value = ""; send(t); };

  document.body.append(host);
  if (cfg.openOnLoad) toggle(true);
  window.ChatWidget = { open: () => toggle(true), close: () => toggle(false), send };
})();
