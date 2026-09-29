(function () {
  "use strict";
  const D = window.MM_DATA || { episodes: [], replays: {}, flows: { base: [], perturbed: [] }, summary: {} };
  const NS = "http://www.w3.org/2000/svg";
  const $ = (sel, root) => (root || document).querySelector(sel);

  /* ---------------------------------------------------------------- helpers */
  function h(tag, attrs, kids) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of [].concat(kids || [])) if (c != null) el.append(c);
    return el;
  }
  function s(tag, attrs, parent) {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs || {}) {
      if (k === "style") el.style.cssText = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else el.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(el);
    return el;
  }
  const fmt1 = (v) => (v == null ? "n/a" : v.toFixed(1));
  const pct = (n, of) => Math.round((100 * n) / of) + "%";
  function key(color, cls) { return h("i", { class: "key " + (cls || ""), style: "background:" + color }); }
  function lin(d0, d1, r0, r1) { return (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0); }
  function logs(d0, d1, r0, r1) { const a = Math.log10(d0), b = Math.log10(d1); return (v) => r0 + ((Math.log10(v) - a) / (b - a)) * (r1 - r0); }

  /* tooltip: value first, label second */
  const tip = $("#tip");
  function showTip(evt, value, rows) {
    tip.replaceChildren(h("strong", { text: value }));
    for (const r of rows || []) {
      tip.append(h("div", { class: "row" }, [r.color ? h("i", { class: "line", style: "background:" + r.color }) : null, h("span", { text: r.text })]));
    }
    tip.hidden = false;
    let x, y;
    if (evt && evt.clientX != null && evt.type !== "focus") { x = evt.clientX; y = evt.clientY; }
    else { const b = evt.target.getBoundingClientRect(); x = b.left + b.width / 2; y = b.top; }
    const w = tip.offsetWidth, hh = tip.offsetHeight;
    let left = x + 14, top = y - hh - 10;
    if (left + w > window.innerWidth - 8) left = x - w - 14;
    if (top < 8) top = y + 16;
    tip.style.left = Math.max(8, left) + "px"; tip.style.top = top + "px";
  }
  function hideTip() { tip.hidden = true; }
  function bindTip(el, fn) {
    el.setAttribute("tabindex", "0");
    const on = (e) => { const r = fn(); showTip(e, r[0], r[1]); };
    el.addEventListener("pointermove", on);
    el.addEventListener("focus", on);
    el.addEventListener("pointerleave", hideTip);
    el.addEventListener("blur", hideTip);
  }
  window.addEventListener("scroll", hideTip, { passive: true });

  /* re-render charts at their real width */
  function responsive(el, draw) {
    let last = 0;
    const run = () => { const w = Math.round(el.clientWidth); if (w && w !== last) { last = w; el.replaceChildren(); draw(el, w); } };
    if ("ResizeObserver" in window) new ResizeObserver(run).observe(el);
    run();
    return () => { last = 0; run(); };
  }

  function axisX(g, scale, ticks, y0, y1, label) {
    for (const t of ticks) {
      const x = scale(t.v);
      s("line", { x1: x, x2: x, y1: y0, y2: y1, style: "stroke: var(--grid)" }, g);
      const tg = s("g", { class: "tick" }, g);
      s("text", { x: x, y: y1 + 16, "text-anchor": "middle", text: t.l }, tg);
    }
    if (label) s("text", { x: scale(ticks[ticks.length - 1].v), y: y1 + 32, "text-anchor": "end", text: label, style: "fill: var(--muted)" }, g);
  }

  /* ---------------------------------------------------------------- diagnosis */
  const DIAG = [
    { m: "Qwen3.8-Flash-Next", a: 36.25, p: 55.0, c: 65.0, o: 52.08, lat: 276, prim: [[23, 48], [0, 19], [6, 13]] },
    { m: "HY-Embodied-0.5 MoT-2B", a: 20.0, p: 50.0, c: 47.5, o: 39.17, lat: 402, prim: [[10, 48], [3, 19], [3, 13]] },
    { m: "Hy-Embodied-VLM-1.0 A3B", a: 18.75, p: 43.75, c: 50.0, o: 37.5, lat: 592, prim: [[15, 48], [0, 19], [0, 13]] },
    { m: "Cosmos3-Nano", a: 18.75, p: 50.0, c: 62.5, o: 43.75, lat: 3035, prim: [[13, 48], [0, 19], [2, 13]] },
    { m: "GLM-5.3-Flash", a: 37.5, p: 52.5, c: 58.75, o: 49.58, lat: 403, prim: [[20, 48], [3, 19], [7, 13]] },
    { m: "GPT-6 Astra", a: 60.0, p: 76.25, c: 82.5, o: 72.92, lat: 8724, prim: [[28, 48], [12, 19], [8, 13]] },
  ];
  const CAPS = [["a", "Action", "var(--c1)"], ["p", "Progress", "var(--c2)"], ["c", "Completion", "var(--c3)"]];

  responsive($("#chart-diag"), (el, W) => {
    const narrow = W < 420, L = narrow ? 118 : 172, R = 14, T = 8, rowH = 34, H = T + DIAG.length * rowH + 30;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H }, el);
    const x = lin(0, 100, L, W - R);
    axisX(svg, x, [0, 25, 50, 75, 100].map((v) => ({ v, l: v + "%" })), T, T + DIAG.length * rowH);
    DIAG.forEach((d, i) => {
      const y = T + i * rowH + rowH / 2;
      const name = narrow ? d.m.replace("Hy-Embodied-VLM-1.0", "Hy-VLM-1.0").replace("HY-Embodied-0.5", "HY-0.5").replace(" MoT-2B", "").replace(" A3B", "") : d.m;
      s("text", { x: 0, y: y + 4, text: name, style: "fill: var(--ink); font-weight: 500" }, svg);
      const vals = CAPS.map((c) => d[c[0]]);
      s("line", { x1: x(Math.min(...vals)), x2: x(Math.max(...vals)), y1: y, y2: y, "stroke-width": 2, style: "stroke: var(--line-2)" }, svg);
      CAPS.forEach(([k, label, color]) => {
        const g = s("g", { class: "hit" }, svg);
        s("circle", { cx: x(d[k]), cy: y, r: 12, style: "fill: transparent; stroke: none" }, g);
        s("circle", { cx: x(d[k]), cy: y, r: 5.5, "stroke-width": 2, style: `fill: ${color}; stroke: var(--surface)` }, g);
        bindTip(g, () => [d[k].toFixed(2) + "%", [{ color, text: label + " · " + d.m }]]);
      });
    });
  });

  responsive($("#chart-latency"), (el, W) => {
    const L = 40, R = 16, T = 10, B = 40, H = Math.min(300, Math.max(240, W * 0.62));
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H }, el);
    const x = logs(180, 14000, L, W - R), y = lin(30, 80, H - B, T);
    axisX(svg, x, [{ v: 300, l: "0.3 s" }, { v: 1000, l: "1 s" }, { v: 3000, l: "3 s" }, { v: 10000, l: "10 s" }], T, H - B, "latency per query");
    for (const v of [30, 40, 50, 60, 70, 80]) {
      s("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), style: "stroke: var(--grid)" }, svg);
      s("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", text: v + "%", class: "tick", style: "fill: var(--muted)" }, svg);
    }
    const lab = {
      "Qwen3.8-Flash-Next": [8, -9, "start"], "GLM-5.3-Flash": [8, 15, "start"], "HY-Embodied-0.5 MoT-2B": [8, -8, "start"],
      "Hy-Embodied-VLM-1.0 A3B": [8, 15, "start"], "Cosmos3-Nano": [-9, 4, "end"], "GPT-6 Astra": [-10, 4, "end"],
    };
    const short = { "HY-Embodied-0.5 MoT-2B": "HY-Embodied-0.5", "Hy-Embodied-VLM-1.0 A3B": "Hy-Embodied-VLM-1.0" };
    for (const d of DIAG) {
      const g = s("g", { class: "hit" }, svg);
      s("circle", { cx: x(d.lat), cy: y(d.o), r: 12, style: "fill: transparent" }, g);
      s("circle", { cx: x(d.lat), cy: y(d.o), r: 5.5, "stroke-width": 2, style: "fill: var(--c1); stroke: var(--surface)" }, g);
      const [dx, dy, anchor] = lab[d.m];
      s("text", { x: x(d.lat) + dx, y: y(d.o) + dy, "text-anchor": anchor, text: short[d.m] || d.m, style: "fill: var(--ink)" }, svg);
      bindTip(g, () => [d.o.toFixed(2) + "% overall", [{ text: d.m }, { text: d.lat.toLocaleString() + " ms per query" }]]);
    }
  });

  /* ---------------------------------------------------------------- main results */
  let resultGroup = "ft";
  const MAIN = [];
  for (const row of document.querySelectorAll('.full-results tbody tr')) {
    if (row.classList.contains('result-group')) { resultGroup = MAIN.length ? 'zs' : 'ft'; continue; }
    const cells = [...row.cells];
    const values = cells.slice(2).map(cell => { const value = parseFloat(cell.textContent); return Number.isFinite(value) ? value : null; });
    MAIN.push({g: row.classList.contains('result-ours') ? 'ours' : resultGroup, m:cells[0].textContent, c:cells[1].textContent, b:values.slice(0,4), p:values.slice(4,9), bt:values.slice(9,11), pt:values.slice(11,13)});
  }
  let split = "base";

  const drawScatter = responsive($("#chart-scatter"), (el, W) => {
    const base = split === "base";
    const L = 44, R = 18, T = 14, B = 42, H = Math.min(380, Math.max(260, W * 0.46));
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H }, el);
    const x = logs(4, 3000, L, W - R), y = lin(0, 100, H - B, T);
    axisX(svg, x, [10, 30, 100, 300, 1000].map((v) => ({ v, l: v >= 1000 ? "1,000 s" : v + " s" })), T, H - B, "wall time per episode (log)");
    for (const v of [0, 25, 50, 75, 100]) {
      s("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), style: "stroke: var(--grid)" }, svg);
      s("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", text: v + "%", style: "fill: var(--muted)" }, svg);
    }
    const ours = MAIN.find((r) => r.g === "ours");
    const ce = (base ? ours.bt : ours.pt)[1];
    const pts = [];
    for (let t = 4; t <= 3000; t *= 1.04) { const v = (ce * t) / 60; if (v > 100) break; pts.push(`${x(t).toFixed(1)},${y(v).toFixed(1)}`); }
    s("polyline", { points: pts.join(" "), fill: "none", "stroke-dasharray": "4 4", "stroke-width": 1.5, style: "stroke: var(--muted)" }, svg);
    const tEnd = (100 * 60) / ce;
    s("text", { x: x(tEnd) + 6, y: y(96), text: "equal cost-efficiency", style: "fill: var(--muted); font-size: 11.5px" }, svg);
    s("text", { x: x(6.3), y: y(0) - 12, text: "direct zero-shot VLAs: 0%", style: "fill: var(--ink-2); font-size: 11.5px" }, svg);
    const order = MAIN.filter((r) => r.g !== "ours").concat([ours]);
    for (const r of order) {
      const sr = (base ? r.b : r.p), tm = (base ? r.bt : r.pt);
      const avg = sr[sr.length - 1];
      if (avg == null || tm[0] == null) continue;
      const color = r.g === "ft" ? "var(--c1)" : r.g === "zs" ? "var(--c3)" : "var(--c2)";
      const g = s("g", { class: "hit" }, svg);
      const cx = x(tm[0]), cy = y(avg);
      s("circle", { cx, cy, r: 12, style: "fill: transparent" }, g);
      s("circle", { cx, cy, r: r.g === "ours" ? 7.5 : 5, "stroke-width": 2, style: `fill: ${color}; stroke: var(--surface)` }, g);
      const name = r.m ? r.m : r.parent + ", " + r.c;
      bindTip(g, () => [avg.toFixed(1) + "% success", [{ color, text: name + (r.m && r.c ? " · " + r.c : "") }, { text: tm[0].toFixed(1) + " s per episode" }]]);
      if (r.g === "ours") {
        s("text", { x: cx + 11, y: cy + 16, text: "MotorMind " + avg.toFixed(1) + "%", style: "fill: var(--ink); font-weight: 700; font-size: 13px" }, svg);
      }
    }
  });

  function setSplit(v) {
    split = v;
    $("#split-base").setAttribute("aria-pressed", String(v === "base"));
    $("#split-pert").setAttribute("aria-pressed", String(v === "pert"));
    drawScatter();
  }
  $("#split-base").addEventListener("click", () => setSplit("base"));
  $("#split-pert").addEventListener("click", () => setSplit("pert"));


  /* ---------------------------------------------------------------- adaptive, real robot, backbone */
  (function adaptive() {
    const cols = [["Dynamic Reasoning", 10], ["Scene Shift", 10], ["Dynamic Manipulation", 5], ["Prompt Shift", 5]];
    const rows = [["π0.5", [0, 70, 0, 20]], ["GR00T N1.5", [0, 10, 0, 0]], ["MolmoAct2", [20, 50, 40, 0]], ["CaP-X", [30, 20, 20, 60]], ["MotorMind", [70, 90, 80, 60]]];
    $("#tbl-adaptive thead").append(h("tr", {}, [h("th", { text: "Method" }), ...cols.map(([c, n]) => h("th", {}, [c, h("br"), h("span", { class: "muted", style: "font-weight:400", text: n + " tasks" })]))]));
    const best = cols.map((_, i) => Math.max(...rows.map((r) => r[1][i])));
    for (const [m, v] of rows) {
      $("#tbl-adaptive tbody").append(h("tr", { class: m === "MotorMind" ? "ours" : "" }, [h("td", { text: m }), ...v.map((x, i) => h("td", { class: x === best[i] ? "best" : "", text: x + "%" }))]));
    }
    const lists = [
      ["Scene Shift: the instruction stays fixed while the target or receiver is displaced", [
        ["put the ketchup in the wooden tray", "Receiver during transport; 1 displacement"], ["put the bowl on the plate", "Receiver during transport; 1 displacement"],
        ["put the wine bottle on the rack", "Target before grasping; 1 displacement"], ["put the cream cheese in the bowl", "Receiver during transport; 1 displacement"],
        ["put the bbq sauce in the wooden tray", "Target before grasping; 2 displacements"], ["put the milk in the basket", "Receiver during transport; 2 displacements"],
        ["put the chocolate pudding in the bowl", "Receiver during transport; 2 displacements"], ["put the salad dressing in the wooden tray", "Target before grasping; 3 displacements"],
        ["put the orange juice in the basket", "Target before grasping; 3 displacements"], ["put the butter in the bowl", "Receiver during transport; 3 displacements"]]],
      ["Dynamic Manipulation: a named target on a single-pass conveyor at 1.5 mm/s", [
        ["pick up the red mug from the conveyor belt and place it in the basket"], ["pick up the alphabet soup from the conveyor belt and place it in the basket"],
        ["pick up the ketchup from the conveyor belt and place it in the red basket"], ["pick up the blue-and-white cream cheese box from the conveyor belt and place it in the wooden tray"],
        ["pick up the green ketchup from the conveyor belt and place it in the basket"]]],
      ["Dynamic Reasoning: the moving target is described, not named", [
        ["pick up the packaged product containing liquid from the conveyor belt and place it in the basket", "Contents: liquid"],
        ["pick up the edible item from the conveyor belt and place it in the basket", "Category: edible item"],
        ["pick up the beverage meant for drinking from the conveyor belt and place it in the basket", "Purpose: beverage"],
        ["pick up the drinking vessel that is not a bowl from the conveyor belt and place it in the basket", "Category exclusion"],
        ["pick up the cup that is not red from the conveyor belt and place it in the basket", "Attribute exclusion"],
        ["pick up the object that is between the two bowls in the initial arrangement on the conveyor belt and place it in the basket", "Initial spatial relation"],
        ["Select the second distinct food item over the entire episode, then pick it up downstream of the yellow line and place it in the basket.", "Cumulative temporal counting"],
        ["pick up the bottled product used to season food rather than to drink from the conveyor belt and place it in the basket", "Purpose: seasoning"],
        ["pick up the drink made from fruit from the conveyor belt and place it in the basket", "Contents: fruit drink"],
        ["pick up the food item that is between the two cups in the initial arrangement on the conveyor belt and place it in the basket", "Category and spatial relation"]]],
      ["Prompt Shift: the instruction changes after a physical trigger, without a reset", [
        ["put the ketchup in the wooden tray", "Then: “Change of plan: put the ketchup on the plate instead of in the wooden tray.”"],
        ["Put the chocolate pudding on the plate.", "Then: “Change of plan: put the chocolate pudding in the wooden tray instead of on the plate.”"],
        ["Put the chocolate pudding on the plate.", "Then: “First put the chocolate pudding down on the table, turn on the stove and keep it on, and then continue putting the chocolate pudding on the plate.”"],
        ["put the chocolate pudding on the plate", "Then: “Avoid the obstacle and continue putting the chocolate pudding on the plate.”"],
        ["Put the BBQ sauce in the wooden tray.", "Then: “Change of plan: leave the BBQ sauce on the table and put only the chocolate pudding in the wooden tray.”"]]],
    ];
    const box = $("#adaptive-tasks");
    for (const [title, items] of lists) {
      box.append(h("h4", { text: title, style: "margin-top:14px" }));
      box.append(h("ol", { style: "margin:4px 0 0;padding-left:22px;font-size:15px" }, items.map(([a, b]) => h("li", {}, [a, b ? h("span", { class: "muted", text: " · " + b }) : null]))));
    }
  })();

  (function realRobot() {
    const t = $("#tbl-real");
    t.querySelector("thead").append(
      h("tr", {}, [h("th", { text: "Object", rowspan: 2 }), h("th", { text: "Direct perception", colspan: 2, style: "text-align:center" }), h("th", { text: "Human perturbation", colspan: 2, style: "text-align:center" }), h("th", { text: "Avg.", rowspan: 2 })]),
      h("tr", {}, ["Bowl", "Box", "Bowl", "Box"].map((c) => h("th", { text: c, style: "text-align:right" }))));
    const rows = [["Blue cube", [100, 100, 100, 100], 100], ["Corn", [100, 100, 100, 80], 95], ["Battery", [90, 100, 80, 90], 90], ["Average", [97, 100, 93, 90], 95]];
    for (const [o, v, a] of rows) {
      const avg = o === "Average";
      t.querySelector("tbody").append(h("tr", { class: avg ? "ours" : "" }, [h("td", { text: o }), ...v.map((x) => h("td", { text: x + "%" })), h("td", { text: a + "%", class: avg ? "best" : "" })]));
    }
    const sem = [["Task 1", 4], ["Task 2", 5], ["Task 3", 5], ["Task 4", 3]];
    for (const [n, k] of sem) {
      $("#bars-semantic").append(h("div", { class: "bar-row" }, [h("span", { class: "lab", text: n }),
        h("div", { class: "track" }, [h("div", { class: "seg-fill", style: `width:${k * 20}%;background:var(--c1)` }), k < 5 ? h("div", { class: "seg-fill rest", style: `flex:1` }) : null]),
        h("span", { class: "val", text: `${k * 20}% (${k}/5)` })]));
    }
  })();

  function columns(el, W, cats, series, fmt, max, unit) {
    const L = 34, R = 6, T = 18, B = 26, H = 190;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H }, el);
    const y = lin(0, max, H - B, T);
    const ticks = unit === "s" ? [0, 100, 200, 300, 400] : [0, 25, 50, 75, 100];
    for (const v of ticks) {
      s("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), style: "stroke: var(--grid)" }, svg);
      s("text", { x: L - 5, y: y(v) + 4, "text-anchor": "end", text: v + (unit === "%" ? "%" : ""), style: "fill: var(--muted); font-size: 11px" }, svg);
    }
    if (unit === "s") s("text", { x: L - 5, y: T - 8, "text-anchor": "end", text: "s", style: "fill: var(--muted); font-size: 11px" }, svg);
    const band = (W - L - R) / cats.length, bw = Math.min(22, band / 3);
    cats.forEach((c, i) => {
      const cx = L + band * i + band / 2;
      s("text", { x: cx, y: H - 8, "text-anchor": "middle", text: c, style: "fill: var(--ink-2)" }, svg);
      series.forEach((sr, j) => {
        const v = sr.v[i], x0 = cx - bw - 1 + j * (bw + 2), y0 = y(v), hgt = y(0) - y0;
        const g = s("g", { class: "hit" }, svg);
        s("path", { d: `M${x0},${y(0)}V${y0 + 4}q0,-4 4,-4h${bw - 8}q4,0 4,4V${y(0)}z`, style: `fill: ${sr.color}` }, g);
        s("text", { x: x0 + bw / 2, y: y0 - 5, "text-anchor": "middle", text: fmt(v), style: "fill: var(--ink-2); font-size: 10.5px" }, svg);
        bindTip(g, () => [fmt(v) + (unit === "s" ? " s" : "%"), [{ color: sr.color, text: sr.name + " · " + c }]]);
        void hgt;
      });
    });
  }
  const BB = { cats: ["Spatial", "Object", "Goal"], q: { sr: [70, 80, 50], t: [199.0, 196.1, 234.9] }, g: { sr: [80, 100, 70], t: [370.4, 287.9, 280.9] } };
  responsive($("#chart-bb-sr"), (el, W) => columns(el, W, BB.cats, [{ name: "Qwen3.8-Flash-Next", color: "var(--c1)", v: BB.q.sr }, { name: "GPT-6 Sol", color: "var(--c3)", v: BB.g.sr }], (v) => String(v), 100, "%"));
  responsive($("#chart-bb-time"), (el, W) => columns(el, W, BB.cats, [{ name: "Qwen3.8-Flash-Next", color: "var(--c1)", v: BB.q.t }, { name: "GPT-6 Sol", color: "var(--c3)", v: BB.g.t }], (v) => v.toFixed(0), 400, "s"));

  /* ---------------------------------------------------------------- shared labels */
  const FAM = { goal: "Goal", spatial: "Spatial", object: "Object" };
  const OUT = { success: ["Success", "good", "var(--good)"], out_of_budget: ["Out of budget", "", "var(--neutral)"], false_done: ["False done", "bad", "var(--bad)"] };
  const PHYS = { empty_grasp: ["Empty grasp", "var(--c3)"], wrong_object: ["Wrong object", "var(--c4)"], dropped: ["Dropped", "var(--c6)"], misplaced: ["Misplaced", "var(--c5)"], knocked: ["Knocked", "var(--c6)"] };
  const VLM = {
    grounding: ["Grounding", "var(--c1)", "grounding"], false_completion: ["Completion", "var(--c2)", "completion"], off_task_target: ["Planning", "var(--c3)", "planning"],
    missed_progress: ["Progress check", "var(--c4)", "progress"], false_progress: ["Progress check", "var(--c4)", "progress"], missed_failure: ["Failure monitor", "var(--c5)", "monitor"],
  };
  const ROLE = { planner: "Planner", executor: "Executor", monitor: "Monitor", verifier: "Verifier", memory: "Memory", gate: "Controller", harness: "Harness" };
  const byId = {};
  for (const e of D.episodes) byId[e.id] = e;
  const replayOf = {};
  for (const k in D.replays) replayOf[D.replays[k].id] = k;

  /* ---------------------------------------------------------------- replays */
  const FPS = 4;
  const video = $("#rp-video"), logEl = $("#rp-log"), stripEl = $("#rp-strip"), clock = $("#rp-clock"), playBtn = $("#rp-play");
  const ICON_PLAY = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z"/></svg>';
  let RP = null, segs = [], logItems = [], lastFrame = -1, rate = 0.5, raf = 0;

  /* the picker: successes by task, then recoveries and failure examples */
  const TASKS = {};
  for (const e of D.episodes) {
    const list = (TASKS[e.fam] = TASKS[e.fam] || []);
    const t = (list[e.row] = list[e.row] || { lang: "", slugs: [] });
    if (e.pert === "Base") t.lang = e.lang;
  }
  for (const slug in D.replays) {
    const r = D.replays[slug], e = byId[r.id];
    if (r.group === "success" && e) TASKS[e.fam][e.row].slugs.push(slug);
  }
  const pickerBox = $("#rp-picker");
  const suiteSeg = h("div", { class: "seg", role: "group", "aria-label": "Task suite" });
  const taskList = h("div", { class: "tasklist" });
  let suite = "goal", curSlug = null;
  for (const fam of ["goal", "spatial", "object"]) {
    const n = (TASKS[fam] || []).reduce((a, t) => a + (t ? t.slugs.length : 0), 0);
    suiteSeg.append(h("button", { type: "button", "data-suite": fam, "aria-pressed": "false", onclick: () => { suite = fam; drawTasks(); } },
      [FAM[fam], h("span", { class: "muted", style: "font-weight:500", text: " " + n })]));
  }
  function drawTasks() {
    for (const b of suiteSeg.children) b.setAttribute("aria-pressed", String(b.dataset.suite === suite));
    taskList.replaceChildren();
    (TASKS[suite] || []).forEach((t, row) => {
      if (!t) return;
      const chips = t.slugs.map((slug) => {
        const e = byId[D.replays[slug].id];
        return h("button", { type: "button", class: "chip sm", "data-slug": slug, "aria-pressed": String(slug === curSlug),
          title: e.lang + " · " + Math.round(e.t) + " s", onclick: () => loadReplay(slug, false) },
          [(e.pert === "Base" ? "Base" : e.pert) + " · s" + e.seed, h("span", { class: "n", text: Math.round(e.t) + " s" })]);
      });
      taskList.append(h("div", { class: "trow" + (chips.length ? "" : " none") }, [
        h("span", { class: "tid", text: FAM[suite][0] + (row + 1) }),
        h("span", { class: "tl", text: t.lang, title: t.lang }),
        chips.length ? h("span", { class: "tchips" }, chips) : h("span", { class: "tnone", text: "no success in 10 runs" })]));
    });
  }
  const groupChips = (g) => h("div", { class: "opts" }, Object.keys(D.replays).filter((k) => D.replays[k].group === g).map((slug) =>
    h("button", { type: "button", class: "chip", "data-slug": slug, "aria-pressed": "false", text: D.replays[slug].label, onclick: () => loadReplay(slug, false) })));
  pickerBox.append(
    h("div", { class: "grp-head" }, [h("span", { class: "grp-label" }, [key("var(--good)", "dot"), "Successful episodes, two per task"]), suiteSeg]),
    taskList,
    h("div", { class: "grp-row" }, [
      h("div", { class: "grp" }, [h("span", { class: "grp-label" }, [key("var(--c1)", "dot"), "Recovered after a failure"]), groupChips("recovered")]),
      h("div", { class: "grp" }, [h("span", { class: "grp-label" }, [key("var(--c2)", "dot"), "Failure examples"]), groupChips("failure")])]));
  drawTasks();

  /* each replay's timeline and log is its own script, loaded on first use */
  const RCACHE = {}, waiting = {};
  window.MM_REPLAY = (slug, data) => { RCACHE[slug] = data; for (const f of waiting[slug] || []) f(); delete waiting[slug]; };
  function fetchReplay(slug, cb) {
    if (RCACHE[slug]) return cb();
    if (waiting[slug]) { waiting[slug].push(cb); return; }
    waiting[slug] = [cb];
    const sc = document.createElement("script");
    sc.src = "./static/research/replays/" + slug + ".js";
    sc.onerror = () => {
      delete waiting[slug];
      if (slug === curSlug) logEl.replaceChildren(h("li", { class: "loading", text: "The log for this episode could not be loaded." }));
    };
    document.head.appendChild(sc);
  }

  function errSubgoals(e) {
    const out = new Set();
    for (const v of e.vlm) out.add(v.sg);
    for (const p of e.phys) if (!p[2]) out.add(p[1]);
    return out;
  }

  function loadReplay(slug, scroll) {
    const r = D.replays[slug];
    if (!r) return;
    const e = byId[r.id];
    curSlug = slug; RP = null; lastFrame = -1; segs = []; logItems = [];
    if (r.group === "success" && e.fam !== suite) { suite = e.fam; drawTasks(); }
    for (const b of pickerBox.querySelectorAll(".chip")) b.setAttribute("aria-pressed", String(b.dataset.slug === slug));
    $("#rp-task").textContent = e.lang;
    const o = OUT[e.out];
    $("#rp-meta").replaceChildren(
      h("span", { class: "pill " + o[1] }, [key(o[2], e.out === "false_done" ? "x" : "dot"), o[0]]),
      h("span", { class: "pill", text: FAM[e.fam] + " · " + (e.pert === "Base" ? "base" : e.pert + " perturbation") + " · seed " + e.seed }),
      h("span", { class: "pill", text: Math.round(e.t) + " s · " + e.sg + " subgoals · " + e.rp + (e.rp === 1 ? " replan" : " replans") }));
    $("#rp-gt").replaceChildren();
    stripEl.replaceChildren();
    clock.textContent = "";
    logEl.replaceChildren(h("li", { class: "loading", text: "Loading the log…" }));
    video.src = "./static/research/replays/" + slug + ".mp4";
    video.playbackRate = rate;
    video.addEventListener("loadedmetadata", () => { video.playbackRate = rate; sync(true); }, { once: true });
    setPlayIcon();
    fetchReplay(slug, () => { if (curSlug === slug) renderReplay(slug); });
    if (scroll) document.getElementById("replays").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderReplay(slug) {
    const r = D.replays[slug], d = RCACHE[slug], e = byId[r.id];
    RP = d; lastFrame = -1;
    const gt = $("#rp-gt");
    gt.replaceChildren("Simulator goal at the end: ", h("code", { text: d.goal || "n/a" }));
    const want = { grounding: "grounding", planning: "off_task_target", completion: "false_completion", monitor: "missed_failure" }[slug];
    const firstErr = e.vlm.find((v) => v.k === want) || e.vlm[0];
    if (r.group === "failure" && firstErr) {
      const [name] = VLM[firstErr.k] || [firstErr.k];
      const why = firstErr.gt ? "Ground truth: " + firstErr.gt + "." : firstErr.located ? "The model localized " + firstErr.located + ", " + firstErr.off_target_mm + " mm from the target." : "";
      gt.append(h("span", { class: "why" }, [h("b", { text: name + " error in " + firstErr.sg + ". " }), why]));
    }
    // subgoal strip
    const bad = errSubgoals(e);
    segs = [];
    d.frames.forEach(([, sg], i) => {
      const last = segs[segs.length - 1];
      if (last && last.sg === sg) last.end = i; else segs.push({ sg, start: i, end: i });
    });
    stripEl.replaceChildren();
    for (const sgm of segs) {
      const n = sgm.end - sgm.start + 1;
      sgm.el = h("button", { type: "button", class: bad.has(sgm.sg) ? "err" : "", style: `flex:${n} 1 0`, title: (sgm.sg || "setup") + " · " + d.frames[sgm.start][0].toFixed(0) + " s",
        "aria-label": "Jump to " + (sgm.sg || "setup"), onclick: () => seekFrame(sgm.start) });
      stripEl.append(sgm.el);
    }
    // log
    logEl.replaceChildren();
    logItems = d.log.map(([t, role, title, text, style]) => {
      const li = h("li", { class: style === "subgoal" ? "subgoal" : style === "rejected" ? "rejected" : style === "key" ? "key-ev" : "" });
      li.append(h("button", { type: "button", onclick: () => seekTime(t) }, [
        h("span", { class: "t", text: Math.round(t) + " s" }),
        h("span", { class: "ttl" }, [key("var(--r-" + role + ")", "dot"), h("span", { class: "who", text: ROLE[role] }), h("span", { text: title })]),
        text ? h("span", { class: "txt", text }) : null]));
      logEl.append(li);
      return { t, li };
    });
    logEl.scrollTop = 0;
    sync(true);
  }

  function frameIndex() { return RP ? Math.max(0, Math.min(RP.frames.length - 1, Math.floor(video.currentTime * FPS + 1e-3))) : 0; }
  function seekFrame(i) { video.currentTime = (i + 0.5) / FPS; sync(true); }
  function seekTime(t) {
    let i = RP.frames.findIndex((f) => f[0] >= t);
    if (i < 0) i = RP.frames.length - 1;
    seekFrame(i);
  }
  function sync(force) {
    if (!RP) return;
    const i = frameIndex();
    if (i === lastFrame && !force) return;
    lastFrame = i;
    const [t, sg] = RP.frames[i];
    clock.replaceChildren("t = ", h("b", { text: t.toFixed(0) + " s" }), "  ·  " + (sg || "setup"));
    for (const sgm of segs) {
      sgm.el.classList.toggle("now", i >= sgm.start && i <= sgm.end);
      sgm.el.classList.toggle("past", sgm.end < i);
    }
    let cur = -1;
    logItems.forEach((it, k) => { if (it.t <= t + 0.05) cur = k; });
    logItems.forEach((it, k) => { it.li.classList.toggle("now", k === cur); it.li.classList.toggle("future", k > cur); });
    if (cur >= 0) {
      const li = logItems[cur].li;
      const target = li.offsetTop - logEl.clientHeight * 0.35;
      logEl.scrollTo({ top: Math.max(0, target), behavior: "auto" });
    }
  }
  function tick() { sync(false); if (!video.paused && !video.ended) raf = requestAnimationFrame(tick); }
  function setPlayIcon() {
    const playing = !video.paused && !video.ended;
    playBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
  }
  playBtn.addEventListener("click", () => {
    if (video.paused || video.ended) {
      if (video.ended) video.currentTime = 0;
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    } else video.pause();
  });
  video.addEventListener("play", () => { setPlayIcon(); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); });
  video.addEventListener("pause", () => { setPlayIcon(); sync(true); });
  video.addEventListener("ended", () => { setPlayIcon(); sync(true); });
  video.addEventListener("seeked", () => sync(true));
  for (const b of document.querySelectorAll(".controls .seg button")) {
    b.addEventListener("click", () => {
      rate = parseFloat(b.dataset.rate); video.playbackRate = rate;
      for (const o of document.querySelectorAll(".controls .seg button")) o.setAttribute("aria-pressed", String(o === b));
    });
  }
  loadReplay(D.replays["o4-base-s0"] ? "o4-base-s0" : Object.keys(D.replays)[0], false);

  /* ---------------------------------------------------------------- failure analysis charts */
  function barRow(label, segments, total, max, value) {
    const track = h("div", { class: "track" });
    let used = 0;
    for (const sg of segments) {
      if (!sg.n) continue;
      used += sg.n;
      const el = h("div", { class: "seg-fill", style: `width:calc(${(100 * sg.n) / max}% - 2px);background:${sg.color}` });
      bindTip(el, () => [sg.n + (sg.unit || ""), [{ color: sg.color, text: sg.label }]]);
      track.append(el);
    }
    if (total != null && total > used) {
      const rest = h("div", { class: "seg-fill rest", style: `width:calc(${(100 * (total - used)) / max}% - 2px)` });
      bindTip(rest, () => [String(total - used), [{ text: "Not recovered · " + label }]]);
      track.append(rest);
    }
    return h("div", { class: "bar-row" }, [h("span", { class: "lab", text: label }), track, h("span", { class: "val", text: value })]);
  }
  function scale(el, ticks) {
    el.append(h("div", { class: "bar-row scale-row", "aria-hidden": "true" }, [h("span"), h("div", { class: "scale" }, ticks.map((t) => h("span", { text: String(t) }))), h("span", { class: "val" })]));
  }

  (function recovery() {
    const ev = (D.summary.physical_events) || {};
    const order = ["empty_grasp", "dropped", "wrong_object", "misplaced", "knocked"];
    const box = $("#bars-recovery");
    for (const k of order) {
      const x = ev[k]; if (!x) continue;
      box.append(barRow(PHYS[k][0], [{ n: x.recovered.n, color: "var(--c1)", label: "Recovered · " + PHYS[k][0] }], x.n, 140,
        `${x.recovered.n} of ${x.n} (${Math.round(x.recovered.pct)}%)`));
    }
    scale(box, [0, 35, 70, 105, 140]);
  })();

  (function decisions() {
    const by = D.summary.vlm_errors_by_perturbation || {};
    const box = $("#bars-decision");
    for (const p of ["Base", "Semantic", "Object", "Position", "Task"]) {
      const r = by[p] || {};
      const segsD = [
        { n: r.grounding || 0, color: "var(--c1)", label: "Grounding · " + p },
        { n: r.false_completion || 0, color: "var(--c2)", label: "Completion · " + p },
        { n: r.off_task_target || 0, color: "var(--c3)", label: "Planning · " + p },
        { n: (r.missed_progress || 0) + (r.false_progress || 0), color: "var(--c4)", label: "Progress check · " + p },
        { n: r.missed_failure || 0, color: "var(--c5)", label: "Failure monitor · " + p },
      ];
      const total = segsD.reduce((a, b) => a + b.n, 0);
      box.append(barRow(p, segsD, null, 60, total + " errors"));
    }
    scale(box, [0, 15, 30, 45, 60]);
  })();

  (function claims() {
    const st = D.summary.claim_states || {}, rs = D.summary.claim_responses || {};
    const list = (el, items) => {
      for (const [label, n] of items) el.append(barRow(label, [{ n, color: "var(--c2)", label }], null, 71, `${n} (${pct(n, 71)})`));
    };
    list($("#bars-claim-state"), [["Target moved, off its goal", st["target moved but off its goal"]], ["Wrong object moved", st["a wrong object moved instead"]], ["Target still in gripper", st["target still in the gripper"]], ["Articulation not met", st["articulated goal not met"]]]);
    list($("#bars-claim-response"), [["Refused: no measured event", rs["refused: no measured event behind it"]], ["Ignored; plan continued", rs["not acted on; the plan continued"]], ["Ended the episode", rs["ended the episode"]]]);
  })();

  /* sankey: last unrecovered failure -> outcome */
  let flowSplit = "perturbed";
  const MID = [["No failure", "var(--no-fail)"], ["Recovered", "var(--c1)"], ["Stuck", "var(--c2)"], ["Empty grasp", "var(--c3)"], ["Wrong object", "var(--c4)"], ["Misplaced", "var(--c5)"], ["Dropped", "var(--c6)"]];
  const OUTS = [["success", "Success", "var(--good)"], ["false_done", "False done", "var(--bad)"], ["out_of_budget", "Out of budget", "var(--neutral)"]];
  const drawFlow = responsive($("#chart-flow"), (el, W) => {
    const links = D.flows[flowSplit] || [];
    const total = links.reduce((a, l) => a + l[2], 0) || 1;
    const narrow = W < 560;
    const H = 330, T = 8, gap = 9, nodeW = 12;
    const xL = narrow ? 118 : 190, xR = W - (narrow ? 118 : 190) - nodeW;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H }, el);
    const sumBy = (f) => { const m = {}; for (const l of links) m[f(l)] = (m[f(l)] || 0) + l[2]; return m; };
    const midN = sumBy((l) => l[0]), outN = sumBy((l) => l[1]);
    const mids = MID.filter(([m]) => midN[m]), outs = OUTS.filter(([o]) => outN[o]);
    const kL = (H - T * 2 - gap * (mids.length - 1)) / total, kR = (H - T * 2 - gap * (outs.length - 1)) / total;
    const k = Math.min(kL, kR);
    const place = (list, counts) => { const pos = {}; let y = T; for (const [n] of list) { pos[n] = { y, h: counts[n] * k, off: 0 }; y += counts[n] * k + gap; } return pos; };
    const pm = place(mids, midN), po = place(outs, outN);
    const outOrder = OUTS.map((o) => o[0]), midOrder = MID.map((m) => m[0]);
    const sorted = links.slice().sort((a, b) => midOrder.indexOf(a[0]) - midOrder.indexOf(b[0]) || outOrder.indexOf(a[1]) - outOrder.indexOf(b[1]));
    const inOff = {};
    for (const [m, o, n] of sorted) {
      const hgt = n * k, y0 = pm[m].y + pm[m].off, y1 = po[o].y + (inOff[o] || 0);
      pm[m].off += hgt; inOff[o] = (inOff[o] || 0) + hgt;
      const x0 = xL + nodeW, x1 = xR, mx = (x0 + x1) / 2;
      const color = MID.find((q) => q[0] === m)[1];
      const g = s("g", { class: "hit" }, svg);
      s("path", { d: `M${x0},${y0}C${mx},${y0} ${mx},${y1} ${x1},${y1}L${x1},${y1 + hgt}C${mx},${y1 + hgt} ${mx},${y0 + hgt} ${x0},${y0 + hgt}Z`, style: `fill: ${color}; opacity: .42` }, g);
      bindTip(g, () => [n + " episodes (" + pct(n, total) + ")", [{ color, text: m + " → " + OUTS.find((q) => q[0] === o)[1] }]]);
    }
    const label = (x, y, anchor, a, b) => {
      const t = s("text", { x, y, "text-anchor": anchor }, svg);
      s("tspan", { text: a, style: "fill: var(--ink); font-weight: 600" }, t);
      s("tspan", { text: "  " + b, style: "fill: var(--muted)" }, t);
    };
    // label y positions for the left column, pushed apart so small nodes stay legible
    let prev = -Infinity;
    for (const [m, color] of mids) {
      const p = pm[m];
      s("rect", { x: xL, y: p.y, width: nodeW, height: Math.max(2, p.h), rx: 2, style: `fill: ${color}` }, svg);
      const ly = Math.max(p.y + p.h / 2 + 4, prev + 15); prev = ly;
      label(xL - 8, ly, "end", m, midN[m] + " · " + pct(midN[m], total));
    }
    prev = -Infinity;
    for (const [o, name, color] of outs) {
      const p = po[o];
      s("rect", { x: xR, y: p.y, width: nodeW, height: Math.max(2, p.h), rx: 2, style: `fill: ${color}` }, svg);
      const ly = Math.max(p.y + p.h / 2 + 4, prev + 15); prev = ly;
      label(xR + nodeW + 8, ly, "start", name, outN[o] + " · " + pct(outN[o], total));
    }
  });
  function setFlow(v) {
    flowSplit = v;
    $("#flow-base").setAttribute("aria-pressed", String(v === "base"));
    $("#flow-pert").setAttribute("aria-pressed", String(v === "perturbed"));
    drawFlow();
  }
  $("#flow-base").addEventListener("click", () => setFlow("base"));
  $("#flow-pert").addEventListener("click", () => setFlow("perturbed"));

  /* four worked examples */
  (function examples() {
    const EX = [
      { kind: "grounding", slug: "grounding", title: "Localized a distractor", task: "pick the alphabet soup and place it in the basket",
        said: "the alphabet soup, the small rectangular box …", saidWho: "VLM target", gt: "found on the butter; the robot lifts the butter, 395 mm from the soup" },
      { kind: "planning", slug: "planning", title: "Off-task target", task: "put the bowl on the plate",
        said: "The robot reports that it is HOLDING the blue carton.", saidWho: "Plan", gt: "the blue carton is the cream cheese; the task object is the bowl" },
      { kind: "completion", slug: "completion", title: "False task completion", task: "pick the akita black bowl on the ramekin and place it on the plate",
        said: "… moved from the ramekin to the plate. The ramekin … is now empty.", saidWho: "VLM", gt: "the target bowl is still on the ramekin" },
      { kind: "monitor", slug: "monitor", title: "Missed wrong object", task: "lift ketchup and put it in basket",
        said: "… while still holding the red ketchup bottle, meeting the subgoal's … requirements.", saidWho: "VLM", gt: "the BBQ sauce is in the gripper; the ketchup never moved" },
    ];
    const color = { grounding: "var(--c1)", planning: "var(--c3)", completion: "var(--c2)", monitor: "var(--c5)" };
    const tag = { grounding: "Grounding", planning: "Planning", completion: "Completion", monitor: "Failure monitor" };
    const box = $("#examples");
    for (const x of EX) {
      box.append(h("article", { class: "ex" }, [
        h("div", { class: "shots" }, [
          h("img", { src: `./static/research/frame-${x.kind}-scene.webp`, class: "zoomable", alt: "Scene camera at the error", loading: "lazy", width: 480, height: 480 }),
          h("img", { src: `./static/research/frame-${x.kind}-wrist.webp`, class: "zoomable", alt: "Wrist camera at the error", loading: "lazy", width: 480, height: 480 })]),
        h("div", { class: "in" }, [
          h("span", { class: "etag" }, [key(color[x.kind]), tag[x.kind]]),
          h("h4", { text: x.title }),
          h("span", { class: "task", text: "Task: " + x.task }),
          h("q", { text: x.said, title: x.saidWho }),
          h("span", { class: "gtl" }, [h("b", { text: "Ground truth: " }), x.gt]),
          h("button", { type: "button", class: "btn", onclick: () => loadReplay(x.slug, true) }, "Replay episode"),
        ])]));
    }
  })();

  /* ---------------------------------------------------------------- failure-image viewer */
  const box = $("#lightbox"), boxImg = $("#lightbox-img");
  for (const img of document.querySelectorAll("img.zoomable")) {
    img.setAttribute("tabindex", "0");
    const open = () => { boxImg.src = img.src; boxImg.alt = img.alt; if (box.showModal) box.showModal(); };
    img.addEventListener("click", open);
    img.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  }
  $("#lightbox-close").addEventListener("click", () => box.close());
  box.addEventListener("click", (e) => { if (e.target === box) box.close(); });

})();
