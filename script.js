(() => {
  const root = document.documentElement;

  // ---------- language ----------
  const listeners = [];
  let lang = root.lang === "en" ? "en" : "de";
  const t = (key, ...args) => {
    const v = I18N[lang][key] ?? I18N.de[key] ?? key;
    return typeof v === "function" ? v(...args) : v;
  };

  function applyLang(next, persist) {
    lang = next;
    root.lang = lang;
    document.title = t("meta.title");
    document.querySelector('meta[name="description"]').content = t("meta.description");
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.innerHTML = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
    document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
    if (persist) {
      try { localStorage.setItem("lang", lang); } catch (e) {}
      const url = new URL(location.href);
      url.searchParams.set("lang", lang);
      history.replaceState(history.state, "", url);
    }
    listeners.forEach((fn) => fn(lang));
  }
  document.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => applyLang(b.dataset.lang, true)));

  // ---------- story progress ----------
  // s is a continuous scene index: s = i when scene i sits in the middle of its scroll range.
  const scenes = [...document.querySelectorAll("[data-scene]")];
  let tops = [], heights = [];
  const measure = () => {
    tops = scenes.map((el) => el.getBoundingClientRect().top + scrollY);
    heights = scenes.map((el) => el.offsetHeight);
  };
  function storyProgress() {
    const c = scrollY + innerHeight / 2;
    let i = scenes.length - 1;
    while (i > 0 && c < tops[i]) i--;
    const local = Math.min(Math.max((c - tops[i]) / heights[i], 0), 1);
    return Math.min(Math.max(i + local - 0.5, 0), scenes.length - 1);
  }
  // dealer HP along the story: each project lands a hit (chips × mult)
  const HITS = [[0.9, 10], [1.95, 15], [2.95, 25], [4.95, 100]];
  const MAX_HP = 150;
  const hpAt = (s) => HITS.reduce((hp, [at, dmg]) => (s >= at ? hp - dmg : hp), MAX_HP);
  const neonAt = (s) => s > 4.55 && s < 7.6;

  window.__story = { progress: storyProgress, hpAt, measure, onLang: (fn) => listeners.push(fn), t };

  // ---------- header: HP bar, chapter marks, backing ----------
  const header = document.querySelector(".site-header");
  const hpNum = document.getElementById("hpNum");
  const hpFill = document.getElementById("hpFill");
  const marks = [...document.querySelectorAll("[data-mark]")];
  let shownHp = MAX_HP, hpAnim = 0;

  function countTo(target) {
    cancelAnimationFrame(hpAnim);
    const from = shownHp, start = performance.now(), dur = root.classList.contains("rm") ? 0 : 420;
    const step = (now) => {
      const k = dur ? Math.min((now - start) / dur, 1) : 1;
      shownHp = Math.round(from + (target - from) * (1 - (1 - k) ** 3));
      hpNum.textContent = shownHp;
      if (k < 1) hpAnim = requestAnimationFrame(step);
    };
    hpAnim = requestAnimationFrame(step);
  }

  let lastHp = MAX_HP, ticking = false;
  function onScroll() {
    ticking = false;
    const s = storyProgress();
    const hp = hpAt(s);
    if (hp !== lastHp) {
      if (hp < lastHp) {
        header.classList.remove("hit");
        void header.offsetWidth; // restart the hit flash
        header.classList.add("hit");
      }
      lastHp = hp;
      hpFill.style.transform = `scaleX(${hp / MAX_HP})`;
      countTo(hp);
    }
    const current = Math.round(s);
    marks.forEach((m) => {
      const n = Number(m.dataset.mark);
      if (n === current || (n === 6 && current === 5)) m.setAttribute("aria-current", "step");
      else m.removeAttribute("aria-current");
    });
    header.classList.toggle("scrolled", scrollY > 8);
    root.classList.toggle("neon", neonAt(s));
  }
  const requestTick = () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } };
  addEventListener("scroll", requestTick, { passive: true });
  addEventListener("resize", () => { measure(); requestTick(); });
  new ResizeObserver(() => { measure(); requestTick(); }).observe(document.body);

  // ---------- Bustatro Lite ----------
  const G_HP = 60, HANDS = 5;
  const SUITS = ["♠", "♥", "♦", "♣"];
  const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const $ = (id) => document.getElementById(id);
  const table = $("game");
  const ui = {
    hpFill: $("gHpFill"), hp: $("gHp"), hands: $("gHands"), cheat: $("gCheat"),
    dealer: $("gDealer"), player: $("gPlayer"), dealerTotal: $("gDealerTotal"), playerTotal: $("gPlayerTotal"),
    msg: $("gMsg"), deal: $("gDeal"), hit: $("gHit"), stand: $("gStand"),
  };
  let hp, handsLeft, cheatReady, deck, player, dealer, buffered, inHand, revealed = false;
  let msg = () => t("game.start"), dealLabel = "game.deal";

  function newDeck() {
    const d = [];
    SUITS.forEach((s) => RANKS.forEach((r) => d.push({ r, s })));
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }
  const draw = () => { if (deck.length < 10) deck = newDeck(); return deck.pop(); };
  function total(cards) {
    let sum = 0, aces = 0;
    cards.forEach(({ r }) => {
      if (r === "A") { sum += 11; aces++; } else sum += ["J", "Q", "K"].includes(r) ? 10 : Number(r);
    });
    while (sum > 21 && aces--) sum -= 10;
    return sum;
  }
  const playerScore = () => (buffered ? 21 : total(player));

  function cardEl({ r, s }, hidden = false) {
    const el = document.createElement("div");
    el.className = "gc" + (s === "♥" || s === "♦" ? " red" : "") + (hidden ? " hidden" : "");
    el.innerHTML = hidden ? "" : `<span class="idx"><b>${r}</b><i>${s}</i></span><span class="pip">${s}</span>`;
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", hidden ? t("game.faceDown") : t("game.card", r, s));
    return el;
  }
  function render() {
    ui.dealer.replaceChildren(...dealer.map((c, i) => cardEl(c, i === 1 && !revealed)));
    ui.player.replaceChildren(...player.map((c) => cardEl(c)));
    ui.dealerTotal.textContent = dealer.length ? (revealed ? total(dealer) : "?") : "";
    ui.playerTotal.textContent = player.length ? playerScore() + (buffered ? ` (${t("game.buffered")})` : "") : "";
  }
  function renderHud() {
    ui.hpFill.style.transform = `scaleX(${Math.max(hp, 0) / G_HP})`;
    ui.hp.textContent = Math.max(hp, 0);
    ui.hands.textContent = handsLeft;
    ui.cheat.classList.toggle("used", !cheatReady);
  }
  const say = (fn) => { msg = fn; ui.msg.innerHTML = fn(); };
  const label = (key) => { dealLabel = key; ui.deal.dataset.i18n = key; ui.deal.textContent = t(key); };
  function setButtons(playing) {
    inHand = playing;
    ui.hit.disabled = !playing;
    ui.stand.disabled = !playing;
    ui.deal.disabled = playing;
  }
  function popDamage(n) {
    const el = document.createElement("span");
    el.className = "dmg led";
    el.textContent = "-" + n;
    table.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }
  function resetRun() {
    hp = G_HP; handsLeft = HANDS; cheatReady = true; deck = newDeck();
    player = []; dealer = [];
    label("game.deal");
    renderHud();
  }
  function deal() {
    if (hp <= 0 || handsLeft === 0) resetRun();
    buffered = false; revealed = false;
    player = [draw(), draw()];
    dealer = [draw(), draw()];
    render();
    setButtons(true);
    say(() => t("game.choose"));
    if (total(player) === 21) finish(true);
  }
  function hit() {
    if (!inHand) return;
    player.push(draw());
    const sum = total(player);
    if (sum === 22 && cheatReady) {
      cheatReady = false; buffered = true;
      renderHud(); render();
      say(() => t("game.buffer"));
      setTimeout(stand, 700);
      return;
    }
    render();
    if (sum > 21) finish(false, "bust");
    else if (sum === 21) stand();
  }
  function stand() {
    if (!inHand) return;
    setButtons(false);
    ui.deal.disabled = true;
    revealed = true;
    const step = () => {
      if (total(dealer) < 17) { dealer.push(draw()); render(); setTimeout(step, 450); }
      else { render(); finish(false); }
    };
    render();
    setTimeout(step, 450);
  }
  function finish(natural, reason) {
    setButtons(false);
    revealed = true;
    render();
    handsLeft--;
    const p = playerScore(), d = total(dealer);
    let text;
    if (reason === "bust") {
      text = () => t("game.bust", p);
      table.classList.add("shake");
      setTimeout(() => table.classList.remove("shake"), 400);
    } else if (natural && d !== 21) {
      hp -= 42; popDamage(42);
      text = () => t("game.blackjack", 42);
    } else if (d > 21 || p > d) {
      hp -= p; popDamage(p);
      text = d > 21 ? () => t("game.dealerBust", p) : () => t("game.beats", p, d);
    } else if (p === d) text = () => t("game.push", p);
    else text = () => t("game.lose", d);
    renderHud();
    const left = Math.max(hp, 0);
    if (hp <= 0) { say(() => text() + t("game.won")); label("game.newRun"); }
    else if (handsLeft === 0) { say(() => text() + t("game.lost", left)); label("game.newRun"); }
    else say(text);
  }
  ui.deal.addEventListener("click", deal);
  ui.hit.addEventListener("click", hit);
  ui.stand.addEventListener("click", stand);
  listeners.push(() => {
    ui.msg.innerHTML = msg();
    ui.deal.textContent = t(dealLabel);
    if (player.length) render();
  });

  resetRun();
  applyLang(lang, false);
  measure();
  onScroll();
})();
