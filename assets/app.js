/* 2027 国考 · 山东岗位地图 */
(function () {
  "use strict";

  var JOBS = [], PROV = null, CITYIDX = {}, CITYCACHE = {};
  var PROFILE = { gender:"", edu:"", degree:"", political:"", fresh:"", majors:[], grass:"", service:"", english:"" };
  var MCACHE = {};

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var NS = "http://www.w3.org/2000/svg";
  var AVG_RATIO = 41;   // 山东省平均竞争比

  var EDU_ORDER = { "专科":1, "本科":2, "硕士":3, "博士":4 };

  function eduCheck(req, user) {
    var u = EDU_ORDER[user] || 0, r = (req || "").replace(/\s/g, "");
    if (!r) return ["verify", "学历要求未写明"];
    if (r.indexOf("仅限博士") >= 0) return [u === 4 ? "ok" : "no", "限定博士研究生"];
    if (r.indexOf("仅限硕士") >= 0) return [u === 3 ? "ok" : "no", "限定硕士研究生"];
    if (r.indexOf("仅限本科") >= 0) return [u === 2 ? "ok" : "no", "限定本科"];
    if (r.indexOf("本科或硕士") >= 0) return [(u === 2 || u === 3) ? "ok" : "no", "本科或硕士研究生"];
    if (r.indexOf("硕士") >= 0 && r.indexOf("及以上") >= 0) return [u >= 3 ? "ok" : "no", "硕士研究生及以上"];
    if (r.indexOf("本科") >= 0 && r.indexOf("及以上") >= 0) return [u >= 2 ? "ok" : "no", "本科及以上"];
    if ((r.indexOf("专科") >= 0 || r.indexOf("大专") >= 0) && r.indexOf("及以上") >= 0) return [u >= 1 ? "ok" : "no", "专科及以上"];
    return ["verify", "学历需人工核对：" + req];
  }

  function degreeCheck(req, user) {
    var r = (req || "").replace(/\s/g, "");
    if (!r || r.indexOf("不限") >= 0) return ["ok", "学位不限"];
    if (user === "无") return ["no", "岗位要求有学位"];
    return ["ok", "要求学位：" + req];
  }

  function polCheck(req, user) {
    var r = (req || "").replace(/\s/g, "");
    if (!r || r.indexOf("不限") >= 0) return ["ok", "政治面貌不限"];
    if (r.indexOf("中共党员或共青团员") >= 0) {
      return [(user === "中共党员" || user === "共青团员") ? "ok" : "no", "党员或团员"];
    }
    if (r.indexOf("中共党员") >= 0) return [user === "中共党员" ? "ok" : "no", "要求中共党员"];
    return ["verify", "政治面貌需核对：" + req];
  }

  function genderCheck(rule, user) {
    if (rule === "male_only") return [user === "男" ? "ok" : "no", "岗位仅限男性"];
    if (rule === "female_only") return [user === "女" ? "ok" : "no", "岗位仅限女性"];
    if (rule === "male_preferred") return ["verify", "备注提到适合男性，非硬性限制"];
    if (rule === "female_preferred") return ["verify", "备注提到适合女性，非硬性限制"];
    return ["ok", "无性别限制"];
  }

  function majorCheck(req, majors) {
    if (!majors || !majors.length) return null;
    var r = (req || "").replace(/\s/g, "");
    if (!r) return ["verify", "岗位未写专业要求"];
    if (r === "不限" || r.indexOf("专业不限") >= 0) return ["ok", "专业不限"];

    var parts = r.split(/[、，,；;\/]+/).filter(Boolean);
    for (var m = 0; m < majors.length; m++) {
      var u = String(majors[m]).replace(/\s/g, "");
      if (!u) continue;
      if (r.indexOf(u) >= 0) return ["ok", "专业命中：" + u];
      for (var i = 0; i < parts.length; i++) {
        var c = parts[i].replace(/^\d{4,6}/, "");
        if (!c) continue;
        if (c === u || c.indexOf(u) >= 0) return ["ok", "专业命中：" + c];
      }
    }
    for (var j = 0; j < parts.length; j++) {
      var p = parts[j].replace(/^\d{4,6}/, "");
      if (p.indexOf("类") >= 0) {
        var base = p.replace(/类$/, "");
        for (var k = 0; k < majors.length; k++) {
          var mk = String(majors[k]);
          if (base.length >= 2 && mk.indexOf(base.slice(0, 2)) >= 0) {
            return ["verify", "岗位要求「" + p + "」，需按专业目录核对"];
          }
        }
      }
    }
    return ["verify", "你的专业不在岗位要求里，需核对专业目录"];
  }


  function serviceCheck(job, mine) {
    if (!mine) return null;
    var req = (job.service_project || "").replace(/\s/g, "");
    if (!req || req === "无限制" || req === "无") {
      return mine === "none" ? ["ok", "岗位不要求服务基层项目经历"] : ["ok", "岗位不要求，你有经历也可报"];
    }
    if (mine === "none") {
      return ["no", "岗位要求服务基层项目经历：" + (job.service_project || "").slice(0, 30)];
    }
    // 岗位要求的具体项目里，包含我这一项吗
    var map = { "村官": "大学生村官", "三支一扶": "三支一扶", "西部志愿者": "西部计划",
                "特岗教师": "特设岗位", "退役士兵": "退役士兵" };
    var key = map[mine] || mine;
    if (req.indexOf(key) >= 0) return ["ok", "你的服务基层经历符合：「" + key + "」"];
    return ["no", "岗位只招特定服务基层项目人员，你的经历不匹配"];
  }

  function englishCheck(job, mine) {
    if (!mine) return null;
    var req = job.english_req || "none";
    var lvl = { "none": 0, "cet4": 4, "cet6": 6 };
    var r = lvl[req] || 0, m = lvl[mine] || 0;
    if (r === 0) return ["ok", "岗位无英语等级要求"];
    if (m >= r) return ["ok", r === 4 ? "岗位要求英语四级 425+" : "岗位要求英语六级 425+"];
    return ["no", r === 4 ? "岗位要求英语四级 425+，你未达标" : "岗位要求英语六级 425+，你未达标"];
  }

  function grassCheck(need, have) {
    need = Number(need) || 0; have = Number(have) || 0;
    if (need === 0) return ["ok", "无基层年限要求"];
    return [have >= need ? "ok" : "no", "要求基层 " + need + " 年，你填 " + have + " 年"];
  }

  function freshCheck(note, fresh) {
    var n = note || "";
    if (/仅限20\d\d届|限20\d\d届|20\d\d届高校毕业生/.test(n)) {
      return [fresh === "应届" ? "ok" : "verify", "涉及应届身份，需核对毕业年度"];
    }
    if (/应届毕业生/.test(n)) return [fresh === "应届" ? "ok" : "verify", "备注提到应届毕业生"];
    return ["ok", ""];
  }

  function matchJob(job) {
    if (MCACHE[job.id]) return MCACHE[job.id];
    var rs = [];
    function add(p) { if (p && p[1]) rs.push({ st: p[0], text: p[1] }); }

    if (PROFILE.gender) add(genderCheck(job.gender_rule, PROFILE.gender));
    if (PROFILE.edu) add(eduCheck(job.education, PROFILE.edu));
    if (PROFILE.degree) add(degreeCheck(job.degree, PROFILE.degree));
    if (PROFILE.political) add(polCheck(job.political, PROFILE.political));
    if (PROFILE.majors.length) add(majorCheck(job.major_text, PROFILE.majors));
    if (PROFILE.grass) add(grassCheck(job.grassroots_years, PROFILE.grass));
    if (PROFILE.service) add(serviceCheck(job, PROFILE.service));
    if (PROFILE.english) add(englishCheck(job, PROFILE.english));
    if (PROFILE.fresh) add(freshCheck(job.note_raw, PROFILE.fresh));

    var status = "ok";
    for (var i = 0; i < rs.length; i++) {
      if (rs[i].st === "no") { status = "no"; break; }
      if (rs[i].st === "verify") status = "verify";
    }
    MCACHE[job.id] = { status: status, reasons: rs };
    return MCACHE[job.id];
  }

  function resetCache() { MCACHE = {}; }

  var KEY = "guokao_sd_v2";
  var ENROLL_KEY = "guokao_enroll_v1";
  var ENROLL = {};   // { 职位代码: { pending, approved, ts } }

  function loadEnroll() {
    try {
      var s = localStorage.getItem(ENROLL_KEY);
      if (s) ENROLL = JSON.parse(s) || {};
    } catch (e) { ENROLL = {}; }
  }
  function saveEnroll() {
    try { localStorage.setItem(ENROLL_KEY, JSON.stringify(ENROLL)); } catch (e) {}
  }
  function enrollOf(job) {
    var e = ENROLL[(job.dept_code || "") + "|" + job.job_code];
    if (!e) return null;
    return e;
  }
  function dataAge(ts) {
    var h = (Date.now() - ts) / 3600000;
    return h;
  }
  function fmtAge(ts) {
    var h = dataAge(ts);
    if (h < 1) return Math.round(h * 60) + " 分钟前";
    if (h < 24) return Math.round(h) + " 小时前";
    return Math.round(h / 24) + " 天前";
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(PROFILE)); } catch (e) {} }
  function load() {
    try {
      var s = localStorage.getItem(KEY);
      if (s) {
        var o = JSON.parse(s);
        for (var k in PROFILE) if (o[k] !== undefined) PROFILE[k] = o[k];
        if (!Array.isArray(PROFILE.majors)) PROFILE.majors = [];
      }
    } catch (e) {}
  }

  function show(id) {
    $$(".screen").forEach(function (s) { s.classList.remove("active"); });
    $("#screen-" + id).classList.add("active");
    window.scrollTo(0, 0);
  }

  function bindSegs() {
    $$(".seg").forEach(function (seg) {
      var key = seg.getAttribute("data-key");
      $$("button", seg).forEach(function (b) {
        if (PROFILE[key] === b.getAttribute("data-val")) b.classList.add("on");
        b.addEventListener("click", function () {
          $$("button", seg).forEach(function (x) { x.classList.remove("on"); });
          b.classList.add("on");
          PROFILE[key] = b.getAttribute("data-val");
          save(); ready();
        });
      });
    });
  }

  function renderMajors() {
    var box = $("#major-chips");
    box.innerHTML = "";
    PROFILE.majors.forEach(function (m, i) {
      var c = document.createElement("span");
      c.className = "chip";
      c.innerHTML = "<b>" + esc(m) + "</b><i>✕</i>";
      c.querySelector("i").addEventListener("click", function () {
        PROFILE.majors.splice(i, 1);
        save(); renderMajors(); ready();
      });
      box.appendChild(c);
    });
    $("#major-hint").textContent = PROFILE.majors.length
      ? "已选 " + PROFILE.majors.length + " 个，命中任意一个即可"
      : "不填则专业不参与筛选";
  }

  function addMajor(v) {
    v = (v || "").trim();
    if (!v) return;
    for (var i = 0; i < PROFILE.majors.length; i++) {
      if (PROFILE.majors[i] === v) return;
    }
    PROFILE.majors.push(v);
    save(); renderMajors(); ready();
  }

  function bindMajors() {
    $("#major-add-btn").addEventListener("click", function () {
      addMajor($("#major-input").value);
      $("#major-input").value = "";
    });
    $("#major-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        addMajor(this.value);
        this.value = "";
      }
    });
  }

  function ready() {
    $("#btn-go").disabled = !(PROFILE.gender && PROFILE.edu);
  }

  function cityStats(cityName) {
    var ok = 0, verify = 0, people = 0, total = 0;
    for (var i = 0; i < JOBS.length; i++) {
      var j = JOBS[i];
      if (j.city !== cityName) continue;
      total++;
      var m = matchJob(j);
      if (m.status === "ok") { ok++; people += j.headcount; }
      else if (m.status === "verify") verify++;
    }
    return { ok: ok, verify: verify, people: people, total: total };
  }

  function fillFor(n, max) {
    if (n === 0) return "#3d1114";
    var t = Math.min(1, Math.sqrt(n / Math.max(max, 1)));
    // 暗红 → 鎏金
    var r = Math.round(122 + 120 * t);
    var g = Math.round(38 + 137 * t);
    var b = Math.round(44 + 11 * t);
    return "rgb(" + r + "," + g + "," + b + ")";
  }


  function layerOf(svg) {
    var l = svg.querySelector("#map-layer");
    if (!l) {
      l = document.createElementNS(NS, "g");
      l.setAttribute("id", "map-layer");
      svg.appendChild(l);
    }
    return l;
  }

  function newLayer(svg) {
    var old = svg.querySelector("#map-layer");
    if (old) old.remove();
    var l = document.createElementNS(NS, "g");
    l.setAttribute("id", "map-layer");
    svg.appendChild(l);
    return l;
  }

  function centroidOf(d) {
    var m = d.match(/[ML](-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g);
    if (!m || !m.length) return null;
    var sx = 0, sy = 0;
    m.forEach(function (seg) {
      var p = seg.slice(1).split(",");
      sx += parseFloat(p[0]); sy += parseFloat(p[1]);
    });
    return [sx / m.length, sy / m.length];
  }

  function addText(svg, x, y, cls, txt) {
    var t = document.createElementNS(NS, "text");
    t.setAttribute("x", x); t.setAttribute("y", y);
    t.setAttribute("class", cls);
    t.textContent = txt;
    svg.appendChild(t);
  }

  function renderProvince() {
    var svg = $("#map-prov");
    svg.innerHTML = "";
    svg.setAttribute("viewBox", PROV.viewBox);
    var layer = newLayer(svg);

    var stats = {}, maxOk = 1, totalOk = 0, totalPeople = 0, totalVerify = 0;
    PROV.cities.forEach(function (c) {
      var s = cityStats(c.name);
      stats[c.name] = s;
      totalOk += s.ok; totalPeople += s.people; totalVerify += s.verify;
      if (s.ok > maxOk) maxOk = s.ok;
    });
    $("#prov-summary").textContent =
      "明确符合 " + totalOk + " 个 · 招录 " + totalPeople + " 人 · 需核实 " + totalVerify + " 个";

    PROV.cities.forEach(function (c) {
      var s = stats[c.name];
      var p = document.createElementNS(NS, "path");
      p.setAttribute("d", c.d);
      p.setAttribute("fill", fillFor(s.ok, maxOk));
      p.setAttribute("class", "region");
      if (s.ok === 0) p.setAttribute("opacity", ".5");
      var t = document.createElementNS(NS, "title");
      t.textContent = c.name + "：可报 " + s.ok + " 个 / 招 " + s.people + " 人";
      p.appendChild(t);
      p.__name = c.name;
      p.__city = c.name;
      p.addEventListener("click", function (ev) {
        provinceDive(svg, p, c.name);
      });
      layer.appendChild(p);

      var cen = centroidOf(c.d);
      if (cen) {
        addText(layer, cen[0], cen[1], "clabel", c.name.replace(/市$/, ""));
        if (s.ok > 0) addText(layer, cen[0], cen[1] + 26, "cnum", String(s.ok));
      }
    });

    var list = $("#city-list");
    list.innerHTML = "";
    PROV.cities.slice().sort(function (a, b) { return stats[b.name].ok - stats[a.name].ok; })
      .forEach(function (c) {
        var s = stats[c.name];
        var d = document.createElement("div");
        d.className = "city-card";
        d.innerHTML =
          '<div><div class="n">' + esc(c.name) + '</div>' +
          '<div class="s">共 ' + s.total + ' 个 · 需核实 ' + s.verify + '</div></div>' +
          '<div class="cnt"><b>' + s.ok + '</b>可报 · ' + s.people + '人</div>';
        d.addEventListener("click", function () { openCity(c.name); });
        list.appendChild(d);
      });
  }


  /* ---------------- 省 -> 市：先放大，再进市 ---------------- */
  var PDIVE = { path: null, timer: null };

  function provinceDive(svg, pathEl, cityName) {
    if (PDIVE.path === pathEl) {
      // 再点一次 = 直接进入
      openCity(cityName);
      return;
    }
    if (PDIVE.timer) { clearTimeout(PDIVE.timer); }
    resetDive(svg);

    $$(".region", svg).forEach(function (r2) {
      if (r2 === pathEl) r2.classList.add("lifted");
      else r2.classList.add("sunk");
    });
    $$(".clabel, .cnum", svg).forEach(function (t) { t.style.opacity = ".12"; });
    PDIVE.path = pathEl;

    zoomToPath(svg, pathEl);

    PDIVE.timer = setTimeout(function () {
      openCity(cityName);
      PDIVE.path = null;
    }, 640);
  }

  function openCity(name) {
    var psvg = document.querySelector("#map-prov");
    if (psvg) resetDive(psvg);
    PDIVE.path = null;
    var adcode = CITYIDX[name];
    $("#city-title").textContent = name;
    show("city");
    $("#map-city").innerHTML = "";
    $("#district-list").innerHTML = '<div class="empty">加载区县边界…</div>';
    if (!adcode) { $("#district-list").innerHTML = '<div class="empty">缺少该市边界</div>'; return; }
    if (CITYCACHE[adcode]) { renderCity(name, CITYCACHE[adcode]); return; }
    fetch("data/shapes/city_" + adcode + ".json")
      .then(function (r) { return r.json(); })
      .then(function (d) { CITYCACHE[adcode] = d; renderCity(name, d); })
      .catch(function () { $("#district-list").innerHTML = '<div class="empty">区县边界加载失败</div>'; });
  }

  function renderCity(cityName, shapeData) {
    var svg = $("#map-city");
    svg.innerHTML = "";
    svg.setAttribute("viewBox", shapeData.viewBox);
    var layer = newLayer(svg);
    resetDive(svg);

    var agg = { "__pending__": { ok:0, verify:0, people:0, total:0 } };
    shapeData.districts.forEach(function (d) { agg[d.name] = { ok:0, verify:0, people:0, total:0 }; });

    var list = JOBS.filter(function (j) { return j.city === cityName; });
    list.forEach(function (j) {
      var m = matchJob(j);
      var key = j.district || "__pending__";
      if (!agg[key]) agg[key] = { ok:0, verify:0, people:0, total:0 };
      var a = agg[key];
      a.total++;
      if (m.status === "ok") { a.ok++; a.people += j.headcount; }
      else if (m.status === "verify") a.verify++;
    });

    var totalOk = 0, totalPeople = 0;
    Object.keys(agg).forEach(function (k) { totalOk += agg[k].ok; totalPeople += agg[k].people; });
    $("#city-summary").textContent = "可报 " + totalOk + " 个 · 招录 " + totalPeople + " 人";

    var maxOk = 1;
    Object.keys(agg).forEach(function (k) { if (agg[k].ok > maxOk) maxOk = agg[k].ok; });

    shapeData.districts.forEach(function (d) {
      var a = agg[d.name] || { ok:0, people:0, total:0, verify:0 };
      var p = document.createElementNS(NS, "path");
      p.setAttribute("d", d.d);
      p.setAttribute("fill", fillFor(a.ok, maxOk));
      p.setAttribute("class", "region");
      var t = document.createElementNS(NS, "title");
      t.textContent = d.name + "：可报 " + a.ok + " 个 / 招 " + a.people + " 人";
      p.appendChild(t);
      var dJobs = JOBS.filter(function (j) {
        return j.city === cityName && j.district === d.name;
      });
      p.__name = d.name;
      p.__jobs = dJobs;
      p.addEventListener("click", function () { diveDistrict(svg, p, d.name, dJobs); });
      layer.appendChild(p);

      var c = centroidOf(d.d);
      if (c) {
        addText(layer, c[0], c[1], "dlabel", d.name.replace(/(区|县|市)$/, ""));
        if (a.ok > 0) addText(layer, c[0], c[1] + 26, "dnum", a.ok + "个/" + a.people + "人");
      }
    });

    var box = $("#district-list");
    box.innerHTML = "";
    var rows = Object.keys(agg).map(function (k) {
      var a = agg[k];
      return { key: k, name: k === "__pending__" ? "市级 / 待确认" : k,
               ok: a.ok, verify: a.verify, people: a.people, total: a.total };
    }).sort(function (x, y) { return y.ok - x.ok; });

    rows.forEach(function (r) {
      var d = document.createElement("div");
      d.className = "city-card";
      d.innerHTML =
        '<div><div class="n">' + esc(r.name) + '</div>' +
        '<div class="s">岗位 ' + r.total + ' 个 · 需核实 ' + r.verify + '</div></div>' +
        '<div class="cnt"><b>' + r.ok + '</b>可报 · 招 ' + r.people + ' 人</div>';
      d.addEventListener("click", function () { openDistrict(cityName, r.name, r.key); });
      box.appendChild(d);
    });
  }

  /* ---------------- 区县下钻：先放大，再散点 ---------------- */
  var DIVE = { path: null, timer: null };

  function resetDive(svg) {
    if (DIVE.timer) { clearTimeout(DIVE.timer); DIVE.timer = null; }
    var layer = svg.querySelector("#map-layer");
    if (layer) layer.style.transform = "";
    $$(".jobdot, .jobline, .joblabel, .dive-hint", svg).forEach(function (el) { el.remove(); });
    $$(".region", svg).forEach(function (r2) { r2.classList.remove("lifted", "sunk"); });
    $$(".dlabel, .dnum, .clabel, .cnum", svg).forEach(function (t) { t.style.opacity = ""; });
    DIVE.path = null;
  }

  function zoomToPath(svg, pathEl) {
    var layer = svg.querySelector("#map-layer");
    if (!layer) return null;
    var bb = pathEl.getBBox();
    var vb = (svg.getAttribute("viewBox") || "0 0 1000 600").split(/\s+/).map(Number);
    var vw = vb[2] || 1000, vh = vb[3] || 600;
    // 目标：让该区县占据约 62% 画幅
    var k = Math.min(vw / (bb.width * 1.6), vh / (bb.height * 1.6));
    k = Math.max(1.1, Math.min(k, 5.5));
    var cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
    var tx = vw / 2 - cx * k;
    var ty = vh / 2 - cy * k;
    layer.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + k + ")";
    return { k: k, cx: cx, cy: cy };
  }

  function scatterJobs(svg, pathEl, dname, jobs, zoom) {
    var L = layerOf(svg);
    var vb = (svg.getAttribute("viewBox") || "0 0 1000 600").split(/\s+/).map(Number);
    var vw = vb[2] || 1000, vh = vb[3] || 600;

    var rect = svg.getBoundingClientRect();
    var k = (zoom && zoom.k) ? zoom.k : 1;
    var ppu = (rect.width / vw) * k;
    if (!ppu || !isFinite(ppu) || ppu <= 0) ppu = 0.76;
    function U(px) { return px / ppu; }

    var bb = pathEl.getBBox();
    var cx = bb.x + bb.width / 2;
    var cy = bb.y + bb.height / 2;
    var n = jobs.length;

    if (!n) {
      var t0 = document.createElementNS(NS, "text");
      t0.setAttribute("x", cx); t0.setAttribute("y", cy);
      t0.setAttribute("class", "dive-hint");
      t0.setAttribute("font-size", U(12));
      t0.setAttribute("fill", "#f2d675");
      t0.setAttribute("text-anchor", "middle");
      t0.setAttribute("paint-order", "stroke");
      t0.setAttribute("stroke", "rgba(30,3,6,.95)");
      t0.setAttribute("stroke-width", U(3));
      t0.textContent = "此区暂无符合条件的岗位";
      L.appendChild(t0);
      return;
    }

    // ---- 圆点布局：螺旋分布，避免重叠 ----
    var dotR = U(11);
    var minGap = U(26);
    var placed = [];

    function tooClose(x, y) {
      for (var i = 0; i < placed.length; i++) {
        var dx = placed[i].x - x, dy = placed[i].y - y;
        if (Math.sqrt(dx * dx + dy * dy) < minGap) return true;
      }
      return false;
    }

    jobs.forEach(function (j, idx) {
      var e = enrollOf(j);
      var px, py, tries = 0;
      // 螺旋搜索空位
      var golden = 2.399963;
      do {
        var ang = idx * golden + tries * golden;
        var rad = (U(22) + tries * U(13)) * (1 + Math.floor(tries / 6) * 0.35);
        px = cx + Math.cos(ang) * rad;
        py = cy + Math.sin(ang) * rad * 0.82;
        // 限制在区县内
        if (px < bb.x + U(6)) px = bb.x + U(6);
        if (px > bb.x + bb.width - U(6)) px = bb.x + bb.width - U(6);
        if (py < bb.y + U(6)) py = bb.y + U(6);
        if (py > bb.y + bb.height - U(6)) py = bb.y + bb.height - U(6);
        tries++;
      } while (tooClose(px, py) && tries < 60);

      placed.push({ x: px, y: py, j: j, e: e });
    });

    // ---- 绘制圆点 ----
    placed.forEach(function (o) {
      var j = o.j, e = o.e;

      var g = document.createElementNS(NS, "g");
      g.setAttribute("class", "jobdot " + (e ? "has-data" : "no-data"));

      // 外圈光晕
      if (e) {
        var halo = document.createElementNS(NS, "circle");
        halo.setAttribute("cx", o.x); halo.setAttribute("cy", o.y);
        halo.setAttribute("r", dotR * 1.55);
        halo.setAttribute("fill", "rgba(242,214,117,.18)");
        g.appendChild(halo);
      }

      var c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", o.x); c.setAttribute("cy", o.y);
      c.setAttribute("r", dotR);
      c.setAttribute("class", "core");
      c.setAttribute("stroke-width", U(1.4));
      g.appendChild(c);

      // 圆内显示招录人数
      var pt = document.createElementNS(NS, "text");
      pt.setAttribute("x", o.x);
      pt.setAttribute("y", o.y + U(3.6));
      pt.setAttribute("text-anchor", "middle");
      pt.setAttribute("font-size", U(11));
      pt.setAttribute("font-weight", "700");
      pt.setAttribute("font-family", "Georgia,serif");
      pt.setAttribute("fill", e ? "#3a060a" : "#2a0406");
      pt.setAttribute("pointer-events", "none");
      pt.textContent = j.headcount;
      g.appendChild(pt);

      g.addEventListener("click", function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        openJobPop(j, ev);
      });
      L.appendChild(g);
    });

    // 顶部提示
    var hint = document.createElementNS(NS, "text");
    hint.setAttribute("x", vw / 2);
    hint.setAttribute("y", U(14));
    hint.setAttribute("class", "dive-hint");
    hint.setAttribute("font-size", U(10.5));
    hint.setAttribute("fill", "#f2d675");
    hint.setAttribute("text-anchor", "middle");
    hint.setAttribute("letter-spacing", U(1));
    hint.setAttribute("paint-order", "stroke");
    hint.setAttribute("stroke", "rgba(30,3,6,.95)");
    hint.setAttribute("stroke-width", U(3));
    hint.textContent = dname + " · " + n + " 个岗位（点圆点看详情）";
    L.appendChild(hint);
  }


  function diveDistrict(svg, pathEl, dname, jobs) {
    if (DIVE.path === pathEl) { resetDive(svg); return; }
    resetDive(svg);

    $$(".region", svg).forEach(function (r2) {
      if (r2 === pathEl) r2.classList.add("lifted");
      else r2.classList.add("sunk");
    });
    $$(".dlabel, .dnum, .clabel, .cnum", svg).forEach(function (t) { t.style.opacity = ".12"; });
    DIVE.path = pathEl;

    var zoom = zoomToPath(svg, pathEl);
    // 等放大动画走完再撒点
    DIVE.timer = setTimeout(function () {
      scatterJobs(svg, pathEl, dname, jobs, zoom);
    }, 620);
  }

  /* ---------------- 岗位悬浮窗（以点击点为中心） ---------------- */
  function closeJobPop() {
    var m = document.querySelector(".jobpop-mask");
    var p2 = document.querySelector(".jobpop");
    if (m) m.remove();
    if (p2) p2.remove();
  }

  function openJobPop(job, ev) {
    closeJobPop();
    var m = matchJob(job);
    var e = enrollOf(job);
    var bt = m.status === "ok" ? "明确符合" : m.status === "verify" ? "需核实" : "不符合";

    var mask = document.createElement("div");
    mask.className = "jobpop-mask";
    mask.addEventListener("click", closeJobPop);
    document.body.appendChild(mask);

    var pop = document.createElement("div");
    pop.className = "jobpop";

    var kv = function (k, v) {
      if (v === undefined || v === null || v === "") return "";
      return '<div class="kv"><div class="k">' + k + '</div><div class="v">' + esc(v) + '</div></div>';
    };

    var rl = m.reasons.map(function (r) {
      return '<li class="' + r.st + '">' + esc(r.text) + '</li>';
    }).join("");

    var total = e ? (e.pending + e.approved) : null;
    var ratio = e ? (total / (job.headcount || 1)).toFixed(1) : null;

    pop.innerHTML =
      '<button class="jobpop-close" id="jobpop-x">✕</button>' +
      '<h3>' + esc(job.position_name) + '</h3>' +
      '<div class="pop-sub">' + esc(job.dept_name) + '</div>' +
      '<div><span class="badge ' + m.status + '">' + bt + '</span>' + (e ? avgTagJS(job) : "") + '</div>' +
      '<div class="pop-grid">' +
        '<div class="pop-cell"><div class="k">招录</div><div class="v">' + job.headcount + '</div></div>' +
        '<div class="pop-cell"><div class="k">报考</div><div class="v">' + (total === null ? "—" : total) + '</div></div>' +
        '<div class="pop-cell"><div class="k">待审核</div><div class="v">' + (e ? e.pending : "—") + '</div></div>' +
        '<div class="pop-cell"><div class="k">报录比</div><div class="v">' + (ratio === null ? "—" : ratio) + '</div></div>' +
      '</div>' +
      '<ul class="reason">' + rl + '</ul>' +
      kv("工作地点", job.location_raw) +
      kv("学历", job.education) +
      kv("学位", job.degree) +
      kv("专业", job.major_text) +
      kv("政治面貌", job.political) +
      kv("基层年限", job.grassroots_years ? job.grassroots_years + " 年" : "无限制") +
      kv("英语要求", job.english_req === "cet4" ? "四级 425+" : job.english_req === "cet6" ? "六级 425+" : "无要求") +
      kv("服务基层项目", job.service_project) +
      kv("省均对比", avgCompareText(job)) +
      '<div class="note-box">' + esc(job.note_raw || "无备注") + '</div>';

    document.body.appendChild(pop);

    // 以点击点为中心定位
    var vw = window.innerWidth, vh2 = window.innerHeight;
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    var cx = ev && ev.clientX ? ev.clientX : vw / 2;
    var cy = ev && ev.clientY ? ev.clientY : vh2 / 2;

    var left = Math.max(10, Math.min(cx - pw / 2, vw - pw - 10));
    var top = cy - ph / 2;
    if (top < 70) top = 70;
    if (top + ph > vh2 - 20) top = Math.max(70, vh2 - ph - 20);

    pop.style.left = left + "px";
    pop.style.top = top + "px";
    // 缩放原点对着点击点
    pop.style.setProperty("--tx", (cx - left) + "px");
    pop.style.setProperty("--ty", (cy - top) + "px");

    var x = pop.querySelector("#jobpop-x");
    if (x) x.addEventListener("click", closeJobPop);
  }

  function openDistrict(cityName, dname, key) {
    var jobs = JOBS.filter(function (j) {
      if (j.city !== cityName) return false;
      if (key === "__pending__") return !j.district;
      if (key) return (j.district || "__pending__") === key;
      return j.district === dname;
    });
    jobs.forEach(function (j) { j.__m = matchJob(j); });
    var order = { ok: 0, verify: 1, no: 2 };
    jobs.sort(function (a, b) {
      var d = order[a.__m.status] - order[b.__m.status];
      return d !== 0 ? d : b.headcount - a.headcount;
    });

    var okN = jobs.filter(function (j) { return j.__m.status === "ok"; });
    var head = okN.reduce(function (s, j) { return s + j.headcount; }, 0);

    var html = "<h2>" + esc(dname) + "</h2>";
    html += '<div class="sub">' + esc(cityName) + " · 岗位 " + jobs.length +
            " 个 · 可报 " + okN.length + " 个 · 招录 " + head + " 人</div>";

    if (!jobs.length) {
      html += '<div class="empty">这个区县在当前条件下没有岗位</div>';
    } else {
      jobs.forEach(function (j, i) {
        var m = j.__m;
        var bt = m.status === "ok" ? "明确符合" : m.status === "verify" ? "需核实" : "不符合";
        html +=
          '<div class="job st-' + m.status + (m.status === "no" ? " dim" : "") + '" data-i="' + i + '">' +
            '<h3>' + esc(j.bureau) + " · " + esc(j.position_name) + "</h3>" +
            '<div class="meta">' + esc(j.dept_name) + "</div>" +
            '<div class="row">' +
              '<span class="badge ' + m.status + '">' + bt + "</span>" +
              "<span>招 <b>" + j.headcount + "</b> 人</span>" +
              "<span>报名 <b>" + (enrollOf(j) ? ((enrollOf(j).pending||0)+(enrollOf(j).approved||0)) : "暂无") + "</b></span>" +
              "<span>报录比 <b>" + (enrollOf(j) ? ratioText(j).split("（")[0] : "暂无") + "</b>" + avgTagJS(j) + "</span>" +
            "</div>" +
          "</div>";
      });
    }
    $("#drawer-body").innerHTML = html;

    $$("#drawer-body .job").forEach(function (el) {
      el.addEventListener("click", function () {
        openDetail(jobs[Number(el.getAttribute("data-i"))]);
      });
    });
    $("#drawer").classList.add("on");
  }

  function openDetail(job) {
    var m = matchJob(job);
    var bt = m.status === "ok" ? "明确符合" : m.status === "verify" ? "需核实" : "不符合";
    var rl = m.reasons.map(function (r) {
      return '<li class="' + r.st + '">' + esc(r.text) + "</li>";
    }).join("");
    function kv(k, v) {
      if (v === undefined || v === null || v === "") return "";
      return '<div class="kv"><div class="k">' + k + '</div><div class="v">' + esc(v) + "</div></div>";
    }
    $("#detail-body").innerHTML =
      "<h2>" + esc(job.position_name) + "</h2>" +
      '<div class="sub">' + esc(job.dept_name) + " / " + esc(job.bureau) + "</div>" +
      '<div><span class="badge ' + m.status + '">' + bt + "</span></div>" +
      '<ul class="reason">' + rl + "</ul>" +
      kv("部门代码", job.dept_code) +
      kv("职位代码", job.job_code) +
      kv("招考人数", job.headcount + " 人") +
      kv("报名人数", enrollText(job, "pending")) +
      kv("审核通过", enrollText(job, "approved")) +
      kv("报录比", ratioText(job)) +
      kv("省均对比", avgCompareText(job)) +
      kv("工作地点", job.location_raw) +
      kv("学历", job.education) +
      kv("学位", job.degree) +
      kv("专业", job.major_text) +
      kv("政治面貌", job.political) +
      kv("基层年限", job.grassroots_years ? job.grassroots_years + " 年" : "无限制") +
      kv("服务基层项目", job.service_project) +
      kv("英语要求", job.english_req === "cet4" ? "四级 425+" : job.english_req === "cet6" ? "六级 425+" : "无要求") +
      kv("考试类别", job.exam_type) +
      '<div class="note-box">' + esc(job.note_raw || "无备注") + "</div>";
    $("#detail").classList.add("on");
  }



  /* ---------------- 粘贴解析 ---------------- */

  var IDX_PAIR = {};    // "用人司局|职位代码" -> job
  var IDX_CODE = {};    // "职位代码" -> [jobs]

  function buildIndex() {
    IDX_PAIR = {}; IDX_CODE = {};
    JOBS.forEach(function (j) {
      var k = (j.bureau || "") + "|" + j.job_code;
      if (!IDX_PAIR[k]) IDX_PAIR[k] = j;
      if (!IDX_CODE[j.job_code]) IDX_CODE[j.job_code] = [];
      IDX_CODE[j.job_code].push(j);
    });
  }

  function findJob(code, bureau) {
    if (bureau) {
      var hit = IDX_PAIR[(bureau || "") + "|" + code];
      if (hit) return hit;
    }
    var arr = IDX_CODE[code];
    return (arr && arr.length === 1) ? arr[0] : null;
  }

  function parsePaste(text) {
    var lines = String(text || "").split(/\r?\n/);
    var rows = [];
    lines.forEach(function (line) {
      if (!line.trim()) return;
      var cols = line.split(/\t/).map(function (s) { return s.trim(); });
      if (cols.length < 5) return;

      // 找 12 位职位代码
      var ci = -1;
      for (var i = 0; i < cols.length; i++) {
        var v = cols[i].replace(/[\s\.]/g, "");
        if (/^\d{12}$/.test(v)) { ci = i; break; }
      }
      if (ci < 0) return;

      // 代码后面的纯数字列，依次当作 招考人数 / 待审查 / 审核通过
      var nums = [];
      for (var k = ci + 1; k < cols.length; k++) {
        var raw = cols[k].replace(/[\s,]/g, "");
        if (raw === "" || raw === "-" || raw === "——") continue;
        if (/^\d+$/.test(raw)) nums.push(parseInt(raw, 10));
      }
      if (nums.length < 3) return;

      // 用人司局通常在代码列前面第 2 列
      var bureau = "";
      if (ci >= 2) bureau = cols[ci - 2];
      else if (ci >= 1) bureau = cols[ci - 1];

      rows.push({
        code: cols[ci].replace(/[\s\.]/g, ""),
        bureau: bureau,
        headcount: nums[0],
        pending: nums[1],
        approved: nums[2]
      });
    });
    return rows;
  }

  function applyPaste(text) {
    var rows = parsePaste(text);
    if (!rows.length) {
      $("#paste-msg").innerHTML = '<span class="stale">没解析到数据，确认复制的是收藏页表格</span>';
      $("#paste-report").innerHTML = "";
      return;
    }
    var now = Date.now();
    var hit = 0, miss = 0, changed = [];
    rows.forEach(function (r) {
      var job = findJob(r.code, r.bureau);
      if (!job) { miss++; return; }
      hit++;
      var old = ENROLL[job.dept_code + "|" + r.code];
      if (old && (old.pending !== r.pending || old.approved !== r.approved)) {
        changed.push({
          code: r.code,
          job: job,
          dPending: r.pending - old.pending,
          dApproved: r.approved - old.approved,
          hours: Math.max((now - old.ts) / 3600000, 0.1)
        });
      }
      ENROLL[job.dept_code + "|" + r.code] = { pending: r.pending, approved: r.approved, ts: now };
    });
    saveEnroll();

    $("#paste-msg").innerHTML = '已保存 <b>' + hit + '</b> 条' +
      (miss ? '，未匹配 ' + miss + ' 条' : "");

    var rep = '<div>数据时间：' + new Date(now).toLocaleString("zh-CN") + '</div>';
    if (changed.length) {
      rep += '<div style="margin-top:8px"><b>和上次比：</b></div>';
      changed.slice(0, 12).forEach(function (c) {
        var rate = (c.dApproved / c.hours).toFixed(1);
        rep += '<div>' + esc(c.job.bureau).slice(0, 18) + " · " +
               esc(c.job.position_name).slice(0, 14) +
               "　待审 " + (c.dPending >= 0 ? "+" : "") + c.dPending +
               "　通过 " + (c.dApproved >= 0 ? "+" : "") + c.dApproved +
               "　<b>" + rate + "/小时</b></div>";
      });
    } else {
      rep += '<div style="margin-top:8px;color:#8fa3c8">这是第一次导入这个批次，明后天再粘一次就能看到增速</div>';
    }
    $("#paste-report").innerHTML = rep;

    MCACHE = {};
    renderProvince();
  }



  function enrollText(job, field) {
    var e = enrollOf(job);
    if (!e) return "暂无数据";
    var v = e[field];
    return v + " 人（" + fmtAge(e.ts) + "）";
  }

  function ratioText(job) {
    var e = enrollOf(job);
    if (!e) return "暂无数据";
    var hc = job.headcount || 1;
    var total = (e.pending || 0) + (e.approved || 0);
    return (total / hc).toFixed(2) + ":1（" + fmtAge(e.ts) + "）";
  }

  function avgTagJS(job) {
    var e = enrollOf(job);
    if (!e) return "";
    var r = ((e.pending || 0) + (e.approved || 0)) / (job.headcount || 1);
    if (r < AVG_RATIO * 0.8) return '<span class="avg-tag avg-good">低于省均</span>';
    if (r > AVG_RATIO * 1.5) return '<span class="avg-tag avg-bad">远高于省均</span>';
    return "";
  }

  function avgTagHtml(job) {
    return avgTagJS(job);
  }

  function avgCompareText(job) {
    var e = enrollOf(job);
    if (!e) return "暂无数据（山东省平均 " + AVG_RATIO + ":1）";
    var r = ((e.pending || 0) + (e.approved || 0)) / (job.headcount || 1);
    var pct = Math.round(r / AVG_RATIO * 100);
    if (pct < 80) return "低于省均（" + pct + "% of 41:1）";
    if (pct > 150) return "远高于省均（" + pct + "% of 41:1）";
    return "接近省均（" + pct + "% of 41:1）";
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  window.__goMap = function () {
    try {
      resetCache();
      renderProvince();
      show("province");
    } catch (e) {
      var tip = document.querySelector(".tip");
      if (tip) tip.innerHTML = '<span style="color:#f87171">出错：' + e.message + '</span>';
      console.error(e);
    }
  };

  function init() {
    load();

    Promise.all([
      fetch("data/jobs.json").then(function (r) { return r.json(); }),
      fetch("data/shapes/province.json").then(function (r) { return r.json(); }),
      fetch("data/shapes/index.json").then(function (r) { return r.json(); }),
      fetch("data/enroll.json").then(function (r) { return r.json(); }).catch(function () { return null; })
    ]).then(function (res) {
      JOBS = res[0];
      PROV = res[1];
      res[2].cities.forEach(function (c) { CITYIDX[c.name] = c.adcode; });
      buildIndex();
      // 服务端预置的报名数据（来自用户收藏页）
      if (res[3]) {
        Object.keys(res[3]).forEach(function (code) {
          var item = res[3][code];
          var job = IDX_CODE[code] && IDX_CODE[code][0];
          var key = (job ? job.dept_code : "") + "|" + code;
          if (!ENROLL[key]) ENROLL[key] = { pending: item.pending, approved: item.approved, ts: item.ts };
        });
        saveEnroll();
      }
      bindSegs();
      bindMajors();
      renderMajors();
      ready();
    }).catch(function (e) {
      document.body.innerHTML =
        '<div style="padding:40px;color:#f87171;font-family:sans-serif">数据加载失败：' +
        e.message + "<br><br>请用本地服务打开，不能直接双击 html</div>";
    });

    $("#btn-go").addEventListener("click", function () {
      try {
        resetCache();
        renderProvince();
        show("province");
      } catch (err) {
        var tip = document.querySelector(".tip");
        if (tip) tip.innerHTML = '<span style="color:#f87171">渲染出错：' + err.message + '</span>';
        console.error("MAPERROR", err);
      }
    });

    $$("[data-go]").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = b.getAttribute("data-go");
        if (t === "province") { renderProvince(); }
        show(t);
      });
    });

    $("#drawer-close").addEventListener("click", function () {
      $("#drawer").classList.remove("on");
    });
    $("#drawer").addEventListener("click", function (e) {
      if (e.target.id === "drawer") $("#drawer").classList.remove("on");
    });
    loadEnroll();
    $("#btn-paste").addEventListener("click", function () {
      $("#paste-drawer").classList.add("on");
    });
    $("#paste-close").addEventListener("click", function () {
      $("#paste-drawer").classList.remove("on");
    });
    $("#paste-drawer").addEventListener("click", function (e) {
      if (e.target.id === "paste-drawer") $("#paste-drawer").classList.remove("on");
    });
    $("#paste-parse").addEventListener("click", function () {
      applyPaste($("#paste-area").value);
    });

    // 兜底：如果上面的绑定因任何原因没生效，这里再挂一次
    if (!$("#btn-go").onclick) {
      $("#btn-go").onclick = function () {
        try { resetCache(); renderProvince(); show("province"); }
        catch (e) { console.error(e); }
      };
    }

    $("#detail-close").addEventListener("click", function () {
      $("#detail").classList.remove("on");
    });
    $("#detail").addEventListener("click", function (e) {
      if (e.target.id === "detail") $("#detail").classList.remove("on");
    });

    // 自检
    setTimeout(function () {
      var b = document.getElementById("btn-go");
      var tip = document.querySelector(".tip");
      if (b && tip) {
        tip.textContent = "自检 → 找到按钮:" + !!b + " disabled:" + b.disabled +
          " 已挂载onclick:" + (typeof b.onclick === "function") +
          " JOBS:" + JOBS.length + " PROV:" + (PROV ? "有" : "无");
      }
    }, 1500);
  }

  document.addEventListener("DOMContentLoaded", init);
})();