(function () {
  "use strict";

  /* ---------- Datos fijos (mismos valores que el script de Python) ---------- */
  var BLOQUES = [
    { limite: 25,  precio: 2.4807,  nombre: "Primeros 25 kWh" },
    { limite: 25,  precio: 5.9337,  nombre: "Siguientes 25 kWh (26-50)" },
    { limite: 50,  precio: 6.2212,  nombre: "Siguientes 50 kWh (51-100)" },
    { limite: 50,  precio: 8.2693,  nombre: "Siguientes 50 kWh (101-150)" },
    { limite: 350, precio: 8.3895,  nombre: "Siguientes 350 kWh (151-500)" },
    { limite: 500, precio: 13.3253, nombre: "Siguientes 500 kWh (501-1000)" },
    { limite: Infinity, precio: 15.1821, nombre: "Excedente de 1000 kWh" }
  ];
  var POTENCIA_PANEL_W = 550, PRECIO_ESTRUCTURA = 35;
  var BATERIA_KWH = 5.12, DOD = 0.80, EFF_BAT = 0.95, VIDA_BAT = 15;
  var INV_AISLADOS = [[3, 650], [5, 1000], [6, 1200], [8, 1700], [10, 2200], [12, 2800]];
  var INV_HIBRIDOS = [[3, 950], [5, 1400], [6, 1650], [8, 2200], [10, 2800], [12, 3400]];
  var MPPT = [[40, 180], [60, 260], [80, 380], [100, 480]];
  var PCT_CABLEADO = 0.08, PCT_INSTALACION = 0.12, TRAMITES_HIB = 200, PCT_MANT = 0.01, ANIOS = 25;
  var PARAM_TIPO = {
    AISLADO: { cobertura: 1.0, rendimiento: 0.65, autonomia: 1.0 },
    HIBRIDO: { cobertura: 0.8, rendimiento: 0.78, fraccionBat: 0.4 }
  };

  /* ---------- Utilidades ---------- */
  function $(id) { return document.getElementById(id); }
  function fmt(n, d) { d = d === undefined ? 2 : d; return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function cs(n) { return "C$ " + fmt(n); }
  function num(id, def) { var v = parseFloat($(id).value); return isFinite(v) && v > 0 ? v : def; }
  function elegir(cat, req) {
    for (var i = 0; i < cat.length; i++) if (cat[i][0] >= req) return [cat[i][0], 1];
    var mayor = cat[cat.length - 1][0];
    return [mayor, Math.ceil(req / mayor)];
  }
  function precioDe(cat, tam) { for (var i = 0; i < cat.length; i++) if (cat[i][0] === tam) return cat[i][1]; return 0; }

  /* ---------- 1. Factura ---------- */
  function factura(kwh) {
    var base = 0, rest = kwh, filas = [];
    for (var i = 0; i < BLOQUES.length; i++) {
      if (rest <= 0) break;
      var b = BLOQUES[i], k = Math.min(rest, b.limite), c = k * b.precio;
      base += c; rest -= k;
      filas.push({ nombre: b.nombre, kwh: k, precio: b.precio, costo: c });
    }
    var fijo, exento;
    if (kwh <= 0) { fijo = 0; exento = true; }
    else if (kwh <= 150) { fijo = 36.0473; exento = true; }
    else if (kwh <= 500) { fijo = 105.0272; exento = false; }
    else if (kwh <= 1000) { fijo = 195.3512; exento = false; }
    else { fijo = 420.1088; exento = false; }
    var sub = base + fijo, iva = exento ? 0 : sub * 0.15, alum = kwh * 0.65, mun = base * 0.01;
    return { base: base, fijo: fijo, iva: iva, alum: alum, mun: mun, total: sub + iva + alum + mun, filas: filas, exento: exento };
  }

  /* ---------- 2. Dimensionamiento ---------- */
  function dimensionar(kwh, P) {
    var tipo = kwh <= P.limite ? "AISLADO" : "HIBRIDO";
    var p = PARAM_TIPO[tipo], kwhDia = kwh / 30;
    var kwhPanelDia = (POTENCIA_PANEL_W / 1000) * P.sol * p.rendimiento;
    var nPaneles = Math.max(2, Math.ceil(kwhDia * p.cobertura / kwhPanelDia));
    var kwp = nPaneles * POTENCIA_PANEL_W / 1000;
    var respaldo = tipo === "AISLADO" ? kwhDia * p.autonomia : kwhDia * p.fraccionBat;
    var capBat = respaldo / (DOD * EFF_BAT);
    var nBat = Math.max(1, Math.ceil(capBat / BATERIA_KWH));
    var picoKw = Math.max(3, kwhDia / 4);
    var cat = tipo === "AISLADO" ? INV_AISLADOS : INV_HIBRIDOS;
    var inv = elegir(cat, picoKw), kwInv = inv[0], nInv = inv[1];

    var items = [
      { nombre: "Panel solar " + POTENCIA_PANEL_W + " W", cant: nPaneles, usd: P.panel },
      { nombre: "Estructura de montaje (por panel)", cant: nPaneles, usd: PRECIO_ESTRUCTURA },
      { nombre: "Batería LiFePO4 48 V " + BATERIA_KWH + " kWh", cant: nBat, usd: P.bateria }
    ];
    var inversorTxt;
    if (tipo === "AISLADO") {
      items.push({ nombre: "Inversor-cargador aislado " + kwInv + " kW", cant: nInv, usd: precioDe(cat, kwInv) });
      var amp = kwp * 1000 / 48 * 1.25, m = elegir(MPPT, amp);
      items.push({ nombre: "Controlador MPPT " + m[0] + " A", cant: m[1], usd: precioDe(MPPT, m[0]) });
      inversorTxt = kwInv + " kW" + (nInv > 1 ? " × " + nInv : "") + " + MPPT";
    } else {
      items.push({ nombre: "Inversor híbrido " + kwInv + " kW (incluye MPPT)", cant: nInv, usd: precioDe(cat, kwInv) });
      inversorTxt = kwInv + " kW" + (nInv > 1 ? " × " + nInv : "");
    }
    var equipos = items.reduce(function (s, it) { return s + it.cant * it.usd; }, 0);
    items.push({ nombre: "Cableado y protecciones", cant: 1, usd: equipos * PCT_CABLEADO });
    items.push({ nombre: "Instalación y mano de obra", cant: 1, usd: equipos * PCT_INSTALACION });
    if (tipo === "HIBRIDO") items.push({ nombre: "Medidor bidireccional / interconexión", cant: 1, usd: TRAMITES_HIB });
    var invUsd = items.reduce(function (s, it) { return s + it.cant * it.usd; }, 0);

    return {
      tipo: tipo, cobertura: p.cobertura, nPaneles: nPaneles, kwp: kwp, nBat: nBat,
      capBat: nBat * BATERIA_KWH, inversorTxt: inversorTxt, items: items,
      invUsd: invUsd, invCs: invUsd * P.fx, bateriasCs: nBat * P.bateria * P.fx
    };
  }

  /* ---------- 3. Finanzas ---------- */
  function finanzas(kwh, s, P) {
    var actual = factura(kwh);
    var kwhRed = kwh * (1 - s.cobertura);
    var nueva = kwhRed > 0 ? factura(kwhRed) : null;
    var totalNueva = nueva ? nueva.total : 0;
    var ahorroMes = actual.total - totalNueva;
    var ahorroAnio = ahorroMes * 12;
    var mant = s.invCs * PCT_MANT;
    var neto = ahorroAnio - mant;
    var r = { actual: actual, nueva: nueva, totalNueva: totalNueva, ahorroMes: ahorroMes, ahorroAnio: ahorroAnio, mant: mant, payback: null, roi: null, ganancia: null };
    if (neto > 0) {
      r.payback = s.invCs / neto;
      r.roi = neto / s.invCs * 100;
      var reemplazos = Math.floor((ANIOS - 1) / VIDA_BAT);
      r.ganancia = neto * ANIOS - reemplazos * s.bateriasCs - s.invCs;
    }
    // Serie acumulada año a año (con reemplazo de baterías en el año 15)
    var serie = [];
    for (var y = 0; y <= ANIOS; y++) {
      var sin = actual.total * 12 * y;
      var con = s.invCs + (totalNueva * 12 + mant) * y + (y >= VIDA_BAT ? s.bateriasCs : 0);
      serie.push({ y: y, sin: sin, con: con });
    }
    r.serie = serie;
    r.equilibrio = null;
    for (var i = 1; i < serie.length; i++) {
      if (serie[i].con <= serie[i].sin) {
        var a = serie[i - 1], b = serie[i];
        var d0 = a.sin - a.con, d1 = b.sin - b.con;
        r.equilibrio = a.y + (d1 === d0 ? 0 : (0 - d0) / (d1 - d0));
        if (a.con <= a.sin) r.equilibrio = a.y;
        break;
      }
    }
    return r;
  }

  /* ---------- Render ---------- */
  var state = null;

  function params() {
    return { fx: num("p-fx", 37.3), sol: num("p-sun", 5.2), limite: num("p-lim", 150), panel: num("p-panel", 165), bateria: num("p-bat", 1250) };
  }

  function billRows(a, b) {
    var rows = [
      ["Energía por bloques", a.base, b ? b.base : 0],
      ["Cargo fijo de comercialización", a.fijo, b ? b.fijo : 0],
      ["IVA 15%" + (a.exento ? " (exento hasta 150 kWh)" : ""), a.iva, b ? b.iva : 0],
      ["Alumbrado público", a.alum, b ? b.alum : 0],
      ["Tasa municipal 1%", a.mun, b ? b.mun : 0]
    ];
    return rows.map(function (r) { return "<tr><td>" + r[0] + "</td><td class='mono'>" + fmt(r[1]) + "</td><td class='mono'>" + fmt(r[2]) + "</td></tr>"; }).join("");
  }

  function render() {
    var kwh = parseFloat($("kwh").value);
    var err = $("kwh-error");
    if (!isFinite(kwh) || kwh <= 0) {
      err.textContent = "Escribe un consumo mayor que cero, por ejemplo 300.";
      $("results").innerHTML = "";
      return;
    }
    err.textContent = "";
    var P = params();
    var s = dimensionar(kwh, P);
    var f = finanzas(kwh, s, P);
    state = { s: s, f: f };
    var hib = s.tipo === "HIBRIDO";

    var why = hib
      ? "Con más de " + fmt(P.limite, 0) + " kWh al mes, un sistema aislado necesitaría un banco de baterías muy grande. El híbrido cubre cerca del 80% con solar y deja a la red como respaldo, con una batería más pequeña."
      : "Con " + fmt(P.limite, 0) + " kWh al mes o menos, un sistema aislado cubre el 100% de tu consumo con un tamaño razonable y sin depender de la red.";

    var costRows = s.items.map(function (it) {
      return "<tr><td>" + it.nombre + "</td><td class='mono'>" + it.cant + "</td><td class='mono'>" + fmt(it.cant * it.usd * P.fx) + "</td></tr>";
    }).join("");

    var kpis;
    if (f.payback === null) {
      kpis = "<div class='kpi main'><div class='label'>Ahorro mensual</div><div class='v'>" + cs(f.ahorroMes) + "</div></div>" +
             "<p class='notice'>El ahorro no alcanza a cubrir el mantenimiento anual. Con estos datos la inversión no se recupera.</p>";
    } else {
      var gan = f.ganancia;
      kpis =
        "<div class='kpi main'><div class='label'>Ahorro mensual</div><div class='v'>" + cs(f.ahorroMes) + "</div><div class='s'>" + cs(f.ahorroAnio) + " al año</div></div>" +
        "<div class='kpi'><div class='label'>Retorno anual (ROI)</div><div class='v'>" + fmt(f.roi) + " %</div><div class='s'>después de mantenimiento</div></div>" +
        "<div class='kpi'><div class='label'>Recuperación</div><div class='v'>" + fmt(f.payback, 1) + " años</div><div class='s'>inversión ÷ ahorro neto anual</div></div>" +
        "<div class='kpi'><div class='label'>Ganancia a " + ANIOS + " años</div><div class='v'>" + (gan < 0 ? "−" : "+") + cs(Math.abs(gan)) + "</div><div class='s'>con mantenimiento y baterías</div></div>";
    }

    var eqTxt;
    if (f.equilibrio === null) eqTxt = "En los " + ANIOS + " años analizados el sistema no llega a pagarse con el ahorro.";
    else eqTxt = "Las líneas se cruzan en el año " + fmt(f.equilibrio, 1) + ": desde ahí el sistema ya costó menos que seguir pagando la factura completa. El salto del año " + VIDA_BAT + " es el reemplazo de baterías.";

    $("results").innerHTML =
      "<section class='section rec'>" +
        "<div class='rec-head'><span class='badge " + (hib ? "hib" : "") + "'>" + (hib ? "HÍBRIDO" : "AISLADO") + "</span><h2>Te conviene un sistema " + (hib ? "híbrido" : "aislado") + "</h2></div>" +
        "<p class='why'>" + why + "</p>" +
        "<div class='specs'>" +
          "<div class='spec'><b>" + s.nPaneles + " × " + POTENCIA_PANEL_W + " W</b><small>PANELES</small></div>" +
          "<div class='spec'><b>" + fmt(s.kwp) + " kWp</b><small>POTENCIA SOLAR</small></div>" +
          "<div class='spec'><b>" + fmt(s.capBat) + " kWh</b><small>" + s.nBat + (s.nBat === 1 ? " BATERÍA" : " BATERÍAS") + "</small></div>" +
          "<div class='spec'><b>" + s.inversorTxt + "</b><small>INVERSOR</small></div>" +
        "</div>" +
      "</section>" +

      "<section class='section'><h2>Ahorro y retorno</h2><div class='kpis'>" + kpis + "</div></section>" +

      "<section class='section'><h2>Costo acumulado a " + ANIOS + " años</h2>" +
        "<div class='chart-box'>" +
          "<div class='legend'><span><i style='border-color:var(--sin-solar)'></i>Sin solar: pagar toda la factura</span><span><i style='border-color:var(--con-solar)'></i>Con solar: inversión, mantenimiento y factura restante</span></div>" +
          "<div id='chart'></div>" +
          "<p class='chart-note'>" + eqTxt + " <button class='link-btn' type='button' id='toggle-table'>Ver como tabla</button></p>" +
          "<div class='tablewrap' id='chart-table' hidden></div>" +
        "</div>" +
      "</section>" +

      "<section class='section'><h2>Costo de cada componente</h2>" +
        "<div class='tablewrap'><table><thead><tr><th>Componente</th><th>Cant.</th><th>Subtotal C$</th></tr></thead><tbody>" + costRows + "</tbody>" +
        "<tfoot><tr><td colspan='2'>Inversión total</td><td class='mono'>" + cs(s.invCs) + "</td></tr>" +
        "<tr><td colspan='2' class='hint'>Equivalente en dólares</td><td class='mono hint'>US$ " + fmt(s.invUsd) + "</td></tr></tfoot></table></div>" +
      "</section>" +

      "<section class='section'><h2>Tu factura eléctrica</h2>" +
        "<div class='tablewrap'><table><thead><tr><th>Concepto</th><th>Hoy C$</th><th>Con solar C$</th></tr></thead><tbody>" +
        billRows(f.actual, f.nueva) +
        "<tr class='total'><td>Total mensual</td><td class='mono'>" + fmt(f.actual.total) + "</td><td class='mono'>" + fmt(f.totalNueva) + "</td></tr></tbody></table></div>" +
        "<details><summary>Ver desglose por bloques de consumo (" + fmt(kwh, 0) + " kWh)</summary>" +
        "<div class='tablewrap'><table><thead><tr><th>Bloque</th><th>kWh</th><th>C$/kWh</th><th>Costo C$</th></tr></thead><tbody>" +
        f.actual.filas.map(function (r) { return "<tr><td>" + r.nombre + "</td><td class='mono'>" + fmt(r.kwh, 1) + "</td><td class='mono'>" + r.precio.toFixed(4) + "</td><td class='mono'>" + fmt(r.costo) + "</td></tr>"; }).join("") +
        "</tbody></table></div></details>" +
      "</section>";

    drawChart();
    var tb = $("toggle-table");
    if (tb) tb.addEventListener("click", function () {
      var box = $("chart-table");
      if (box.hidden) {
        var ys = [0, 5, 10, 15, 20, 25];
        box.innerHTML = "<table><thead><tr><th>Año</th><th>Sin solar C$</th><th>Con solar C$</th></tr></thead><tbody>" +
          ys.map(function (y) { var p = f.serie[y]; return "<tr><td>" + y + "</td><td class='mono'>" + fmt(p.sin, 0) + "</td><td class='mono'>" + fmt(p.con, 0) + "</td></tr>"; }).join("") + "</tbody></table>";
        box.hidden = false; tb.textContent = "Ocultar tabla";
      } else { box.hidden = true; tb.textContent = "Ver como tabla"; }
    });
  }

  /* ---------- Gráfico (SVG a tamaño real del contenedor) ---------- */
  function niceMax(v) {
    var pow = Math.pow(10, Math.floor(Math.log10(v))), n = v / pow;
    var step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * pow;
  }
  function short(v) {
    if (v >= 1e6) return fmt(v / 1e6, v % 1e6 === 0 ? 0 : 1) + " M";
    if (v >= 1e3) return fmt(v / 1e3, 0) + " k";
    return fmt(v, 0);
  }

  function drawChart() {
    var host = $("chart");
    if (!host || !state) return;
    var serie = state.f.serie, eq = state.f.equilibrio;
    var W = Math.max(260, host.clientWidth), H = W < 480 ? 250 : 320;
    var wide = W >= 560;
    var m = { l: 46, r: wide ? 78 : 12, t: 12, b: 32 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var maxV = 0; serie.forEach(function (p) { maxV = Math.max(maxV, p.sin, p.con); });
    var top = niceMax(maxV * 1.02) ;
    var X = function (y) { return m.l + (y / ANIOS) * iw; };
    var Y = function (v) { return m.t + ih - (v / top) * ih; };
    var path = function (k) { return serie.map(function (p, i) { return (i ? "L" : "M") + X(p.y).toFixed(1) + " " + Y(p[k]).toFixed(1); }).join(" "); };

    var g = "";
    for (var t = 0; t <= 4; t++) {
      var v = top / 4 * t, yy = Y(v);
      g += "<line x1='" + m.l + "' x2='" + (W - m.r) + "' y1='" + yy + "' y2='" + yy + "' stroke='var(--line)' stroke-width='1' " + (t === 0 ? "" : "stroke-dasharray='2 4'") + "/>";
      g += "<text x='" + (m.l - 8) + "' y='" + (yy + 4) + "' text-anchor='end' font-size='11' fill='var(--muted)' font-family='IBM Plex Mono, monospace'>" + short(v) + "</text>";
    }
    for (var xx = 0; xx <= ANIOS; xx += 5) {
      g += "<text x='" + X(xx) + "' y='" + (H - 10) + "' text-anchor='middle' font-size='11' fill='var(--muted)' font-family='IBM Plex Mono, monospace'>" + (xx === 0 ? "año 0" : xx) + "</text>";
    }
    var last = serie[serie.length - 1];
    var labels = "";
    if (wide) {
      var ys = [Y(last.sin), Y(last.con)], names = ["Sin solar", "Con solar"];
      if (Math.abs(ys[0] - ys[1]) < 15) { var mid = (ys[0] + ys[1]) / 2; var up = ys[0] < ys[1]; ys[0] = mid + (up ? -8 : 8); ys[1] = mid + (up ? 8 : -8); }
      labels = names.map(function (n, i) { return "<text x='" + (W - m.r + 8) + "' y='" + (ys[i] + 4) + "' font-size='12' fill='var(--ink)' font-family='IBM Plex Sans, sans-serif'>" + n + "</text>"; }).join("");
    }
    var marker = "";
    if (eq !== null) {
      var ex = X(eq), val = eq <= ANIOS ? serie[Math.min(ANIOS, Math.round(eq))].sin : 0;
      var ey = Y(eq * state.f.actual.total * 12);
      marker = "<circle cx='" + ex + "' cy='" + ey + "' r='5' fill='var(--surface)' stroke='var(--ink)' stroke-width='2'/>";
    }

    host.innerHTML =
      "<svg role='img' aria-label='Costo acumulado con y sin sistema solar durante " + ANIOS + " años' width='" + W + "' height='" + H + "' viewBox='0 0 " + W + " " + H + "'>" +
        g +
        "<path d='" + path("sin") + "' fill='none' stroke='var(--sin-solar)' stroke-width='2' stroke-linejoin='round'/>" +
        "<path d='" + path("con") + "' fill='none' stroke='var(--con-solar)' stroke-width='2' stroke-linejoin='round'/>" +
        marker + labels +
        "<line id='cx' y1='" + m.t + "' y2='" + (m.t + ih) + "' stroke='var(--muted)' stroke-width='1' visibility='hidden'/>" +
        "<circle id='d1' r='4.5' fill='var(--sin-solar)' stroke='var(--surface)' stroke-width='2' visibility='hidden'/>" +
        "<circle id='d2' r='4.5' fill='var(--con-solar)' stroke='var(--surface)' stroke-width='2' visibility='hidden'/>" +
        "<rect id='hit' x='" + m.l + "' y='" + m.t + "' width='" + iw + "' height='" + ih + "' fill='transparent'/>" +
      "</svg><div class='tip' id='tip' hidden></div>";

    var svg = host.querySelector("svg"), hit = $("hit"), tip = $("tip");
    function show(ev) {
      var r = svg.getBoundingClientRect();
      var px = ev.clientX - r.left;
      var y = Math.max(0, Math.min(ANIOS, Math.round((px - m.l) / iw * ANIOS)));
      var p = serie[y], x = X(y);
      var cxl = $("cx"); cxl.setAttribute("x1", x); cxl.setAttribute("x2", x); cxl.setAttribute("visibility", "visible");
      var d1 = $("d1"), d2 = $("d2");
      d1.setAttribute("cx", x); d1.setAttribute("cy", Y(p.sin)); d1.setAttribute("visibility", "visible");
      d2.setAttribute("cx", x); d2.setAttribute("cy", Y(p.con)); d2.setAttribute("visibility", "visible");
      var diff = p.sin - p.con;
      tip.innerHTML = "<div><b>Año " + y + "</b></div>" +
        "<div class='r'><span><i class='sw' style='background:var(--sin-solar)'></i>Sin solar</span><b>" + cs(p.sin) + "</b></div>" +
        "<div class='r'><span><i class='sw' style='background:var(--con-solar)'></i>Con solar</span><b>" + cs(p.con) + "</b></div>" +
        "<div class='r'><span>" + (diff >= 0 ? "Ya ganas" : "Aún por recuperar") + "</span><b>" + cs(Math.abs(diff)) + "</b></div>";
      tip.hidden = false;
      var tw = tip.offsetWidth, left = x + 14;
      if (left + tw > W) left = x - tw - 14;
      tip.style.left = Math.max(0, left) + "px";
      tip.style.top = Math.max(0, Math.min(Y(Math.max(p.sin, p.con)), H - tip.offsetHeight - 4)) + "px";
    }
    function hide() {
      tip.hidden = true;
      ["cx", "d1", "d2"].forEach(function (id) { $(id).setAttribute("visibility", "hidden"); });
    }
    hit.addEventListener("pointermove", show);
    hit.addEventListener("pointerdown", show);
    hit.addEventListener("pointerleave", hide);
  }

  /* ---------- Eventos ---------- */
  function setKwh(v) {
    $("kwh").value = v;
    $("kwh-range").value = Math.min(1500, Math.max(20, v));
    syncChips();
    render();
  }
  function syncChips() {
    var v = parseFloat($("kwh").value);
    document.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-pressed", String(parseFloat(c.dataset.kwh) === v)); });
  }
  $("kwh").addEventListener("input", function () {
    var v = parseFloat(this.value);
    if (isFinite(v)) $("kwh-range").value = Math.min(1500, Math.max(20, v));
    syncChips(); render();
  });
  $("kwh-range").addEventListener("input", function () { setKwh(parseFloat(this.value)); });
  document.querySelectorAll(".chip").forEach(function (c) { c.addEventListener("click", function () { setKwh(parseFloat(c.dataset.kwh)); }); });
  ["p-fx", "p-sun", "p-lim", "p-panel", "p-bat"].forEach(function (id) { $(id).addEventListener("input", render); });

  var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(drawChart, 100); });

  window.__solar = { factura: factura, dimensionar: dimensionar, finanzas: finanzas, params: params };
  syncChips();
  render();
})();
