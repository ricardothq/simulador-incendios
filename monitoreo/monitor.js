// ---------- Constantes del modelo (empírico, simplificado) ----------
const P_REF = 101.325;   // kPa, presión de referencia
const X_REF = 0.21;      // fracción de O2 en aire
const V0 = 1.0;          // cm/s, velocidad base en aire a nivel del mar
const D0 = 10.0;         // mm, diámetro base de la llama
const PO2_LIMITE = 12;   // kPa, por debajo la llama se apaga
const PO2_PLENA = 18;    // kPa, por encima la llama se propaga sin penalización
const MASA0 = 0.02;      // g/s, masa quemada en aire a nivel del mar
const Y0 = 0.01;         // rendimiento de humo base en aire (1 %)
const VOLUMEN = 2;       // m³, volumen del recinto

let humo = 0;            // mg/m³, concentración actual
let particulas = [];

// ---------- Elementos ----------
const $ = (id) => document.getElementById(id);
const inO2 = $("inO2"), inP = $("inP");
const canvas = $("escena"), ctx = canvas.getContext("2d");

// ---------- Cálculo ----------
function calcular(o2Pct, presion) {
  const X = o2Pct / 100;
  const pO2 = X * presion;
  const factor = Math.min(1, Math.max(0, (pO2 - PO2_LIMITE) / (PO2_PLENA - PO2_LIMITE)));
  const v = V0 * Math.pow(X / X_REF, 1.6) * Math.pow(presion / P_REF, 0.5) * factor;
  const d = D0 * Math.pow(X / X_REF, -0.2) * Math.pow(presion / P_REF, -0.33);
  const apagada = pO2 <= PO2_LIMITE;
  // Humo: masa quemada (g/s) × rendimiento de humo (fracción)
  const masa = apagada ? 0 : MASA0 * (v / V0) * (d / D0);
  const rendimiento = Math.min(0.2, Y0 * Math.pow(X_REF / X, 1.5) * Math.pow(P_REF / presion, 0.3));
  const humoMgS = masa * 1000 * rendimiento;
  return { pO2, v, d, apagada, humoMgS };
}

// ---------- Estado de la animación ----------
const LARGO_CM = 20;            // largo de la tira
const PX_POR_CM = 38;           // escala horizontal
const X0 = 60;                  // inicio de la tira en px
let quemado = 0;                // cm quemados
let tPrev = performance.now();

function actualizarTextos(r) {
  const o2 = parseFloat(inO2.value), p = parseFloat(inP.value);
  $("outO2").textContent = o2.toFixed(1);
  $("outP").textContent = p.toFixed(1);
  $("outPO2").textContent = r.pO2.toFixed(1);
  $("outD").textContent = r.d.toFixed(1);
  $("outV").textContent = r.v.toFixed(2);
  $("outDist").textContent = quemado.toFixed(1);
  $("outHumo").textContent = humo.toFixed(2);
  $("outProd").textContent = r.humoMgS.toFixed(2);
  $("lblVent").textContent = parseFloat($("inVent").value).toFixed(3) + " 1/s";
  $("lblO2").textContent = o2 + "%";
  $("lblP").textContent = p.toFixed(1) + " kPa";
  const e = $("estado");
  e.classList.toggle("apagada", r.apagada);
  if (r.apagada) e.textContent = "Sin llama: la presión parcial de O₂ es muy baja para sostener la combustión.";
  else if (r.v < V0 * 0.5) e.textContent = "Llama débil: se propaga más lento que en aire normal.";
  else if (r.v > V0 * 3) e.textContent = "Combustión muy rápida: el fuego avanza varias veces más que en aire.";
  else e.textContent = "Llama estable";
}

// ---------- Dibujo ----------
function dibujarLlama(x, y, diamPx, tiempo, apagada) {
  if (apagada) {
    // brasa tenue que no sostiene llama
    ctx.fillStyle = "rgba(212,80,30,0.5)";
    ctx.beginPath(); ctx.arc(x, y - 3, 4, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const parpadeo = 1 + 0.06 * Math.sin(tiempo * 0.011) + 0.04 * Math.sin(tiempo * 0.027);
  const w = diamPx / 2;
  const h = diamPx * 2.3 * parpadeo;
  const sway = Math.sin(tiempo * 0.006) * w * 0.15;

  const capas = [
    { k: 1.0, color: "rgba(226,90,24,0.9)" },
    { k: 0.68, color: "rgba(250,170,40,0.95)" },
    { k: 0.36, color: "rgba(255,240,170,1)" },
  ];
  for (const c of capas) {
    const ww = w * c.k, hh = h * c.k;
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.moveTo(x - ww, y);
    ctx.bezierCurveTo(x - ww * 1.1, y - hh * 0.45, x - ww * 0.3 + sway, y - hh * 0.7, x + sway, y - hh);
    ctx.bezierCurveTo(x + ww * 0.3 + sway, y - hh * 0.7, x + ww * 1.1, y - hh * 0.45, x + ww, y);
    ctx.quadraticCurveTo(x, y + ww * 0.5, x - ww, y);
    ctx.fill();
  }
  // base azulada
  ctx.fillStyle = "rgba(70,120,255,0.6)";
  ctx.beginPath(); ctx.ellipse(x, y - 2, w * 0.7, w * 0.25, 0, 0, Math.PI * 2); ctx.fill();
}

function dibujar(r, tiempo) {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const yTira = H - 70;
  const largoPx = LARGO_CM * PX_POR_CM;
  const frente = X0 + quemado * PX_POR_CM;

  // parte quemada
  ctx.fillStyle = "#2a2623";
  ctx.fillRect(X0, yTira, quemado * PX_POR_CM, 16);
  // parte sin quemar
  ctx.fillStyle = "#d9c79a";
  ctx.fillRect(frente, yTira, largoPx - quemado * PX_POR_CM, 16);

  // regla
  ctx.strokeStyle = "#6f8587"; ctx.fillStyle = "#93a5a6"; ctx.font = "12px sans-serif";
  ctx.beginPath();
  for (let cm = 0; cm <= LARGO_CM; cm += 2) {
    const x = X0 + cm * PX_POR_CM;
    ctx.moveTo(x, yTira + 26); ctx.lineTo(x, yTira + 34);
    ctx.fillText(cm, x - 4, yTira + 48);
  }
  ctx.stroke();
  ctx.fillText("cm", X0 + largoPx + 8, yTira + 48);

  // humo: partículas que suben desde la llama
  for (const p of particulas) {
    ctx.fillStyle = "rgba(190,200,200," + (p.vida * 0.35).toFixed(3) + ")";
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }

  // cota del diámetro de la llama
  const diamPx = r.d * 5; // 5 px por mm
  dibujarLlama(frente, yTira, diamPx, tiempo, r.apagada);
  if (!r.apagada) {
    ctx.strokeStyle = "#93a5a6"; ctx.beginPath();
    ctx.moveTo(frente - diamPx / 2, yTira + 14); ctx.lineTo(frente + diamPx / 2, yTira + 14);
    ctx.stroke();
    ctx.fillStyle = "#e6ece9";
    ctx.fillText("Ø " + r.d.toFixed(1) + " mm", frente + diamPx / 2 + 8, yTira - 6);
  }
}

// ---------- Bucle en tiempo real ----------
function cuadro(ahora) {
  const dt = Math.min(0.05, (ahora - tPrev) / 1000);
  tPrev = ahora;
  const r = calcular(parseFloat(inO2.value), parseFloat(inP.value));
  quemado += r.v * dt;
  if (quemado >= LARGO_CM) quemado = 0;   // reinicia la tira al llegar al final

  // acumulación de humo: dC/dt = producción/volumen − ventilación·C
  const vent = parseFloat($("inVent").value);
  humo = Math.max(0, humo + (r.humoMgS / VOLUMEN - vent * humo) * dt);

  // partículas visuales proporcionales a la producción de humo
  const frente = X0 + quemado * PX_POR_CM, yBase = canvas.height - 70;
  if (Math.random() < Math.min(1, r.humoMgS * 6 * dt * 20)) {
    particulas.push({ x: frente + (Math.random() - 0.5) * 10, y: yBase - r.d * 5 * 2.3, r: 3 + Math.random() * 3, vida: 1 });
  }
  for (const p of particulas) {
    p.y -= 40 * dt; p.x += Math.sin(p.y * 0.05) * 0.4; p.r += 4 * dt; p.vida -= 0.25 * dt;
  }
  particulas = particulas.filter((p) => p.vida > 0 && p.y > 0);

  actualizarTextos(r);
  dibujar(r, ahora);
  requestAnimationFrame(cuadro);
}

// ---------- Eventos ----------
document.querySelectorAll(".presets button[data-o2]").forEach((b) => {
  b.addEventListener("click", () => {
    inO2.value = b.dataset.o2;
    inP.value = b.dataset.p;
  });
});
$("reiniciar").addEventListener("click", () => { quemado = 0; humo = 0; particulas = []; });

requestAnimationFrame(cuadro);
