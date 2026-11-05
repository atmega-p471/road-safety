'use strict';

// ============================================================================
// 0. КОНСТАНТЫ МОДЕЛИ
//    Система (6): dX_i/dt = 1/X_i^norm * (П f_ij(X_j) * SUM E+ - П f_ik(X_k) * SUM E-)
//    Целевая функция (1): Z = SUM_i gamma_i * INT (X_i* - X_i(t))^2 dt, gamma_i = 1/15
// ============================================================================
const MODEL = Object.freeze({
  H: 0.125,              // шаг интегрирования
  T_MAX: 1.0,            // горизонт машинного времени: t = 0 ... 1
  X_MIN: 0.25,           // нижняя граница допустимой области (условие (3))
  X_MAX: 1.00,           // верхняя граница допустимой области
  X_P2_MAX: 1.18,        // выброс X7 для плана p2 (демонстрация нарушения (3))
  DX_LIMIT: 1.5,         // предохранитель для правой части (устойчивость RK4)
  NORM_DEFAULT: 19.55,   // X_i^norm: калибровка под Z(p1) = 1.6031 статьи
  P3_RATE: 0.4604,       // интенсивность мероприятий плана p3 (калибровка под Z(p3) = 1.8573)
  X_STAR_DEFAULT: 0.5,
  Z_SAMPLES: 400,
  Z_MONTHS: 11.0,        // в статье Z берется на 11-месячном интервале
  WEIGHT: 1 / 15
});

// ============================================================================
// 1. СПРАВОЧНИКИ ПОКАЗАТЕЛЕЙ X1..X13, ФАКТОРОВ E1..E6 И 76 ФУНКЦИЙ
// ============================================================================
const X_VARS = [
  { id: 1,  code: 'X1',  sub: 'X<sub>1</sub>',  name: 'Общее количество ДТП в РФ (в год)', init: 0.89, color: '#2563eb' },
  { id: 2,  code: 'X2',  sub: 'X<sub>2</sub>',  name: 'Количество погибших в ДТП', init: 1.00, color: '#dc2626' },
  { id: 3,  code: 'X3',  sub: 'X<sub>3</sub>',  name: 'Количество раненых в ДТП', init: 0.86, color: '#ea580c' },
  { id: 4,  code: 'X4',  sub: 'X<sub>4</sub>',  name: 'Тяжесть последствий ДТП', init: 1.00, color: '#d97706' },
  { id: 5,  code: 'X5',  sub: 'X<sub>5</sub>',  name: 'Количество погибших на 10 000 ТС', init: 0.95, color: '#65a30d' },
  { id: 6,  code: 'X6',  sub: 'X<sub>6</sub>',  name: 'Количество пострадавших на 100 тыс. жителей', init: 0.87, color: '#16a34a' },
  { id: 7,  code: 'X7',  sub: 'X<sub>7</sub>',  name: 'Количество ДТП из-за нарушения ПДД водителями', init: 0.84, color: '#0d9488' },
  { id: 8,  code: 'X8',  sub: 'X<sub>8</sub>',  name: 'Количество ДТП по вине нетрезвых водителей', init: 1.00, color: '#0891b2' },
  { id: 9,  code: 'X9',  sub: 'X<sub>9</sub>',  name: 'Количество ДТП по вине пешеходов', init: 1.00, color: '#0284c7' },
  { id: 10, code: 'X10', sub: 'X<sub>10</sub>', name: 'Количество ДТП с участием детей', init: 0.95, color: '#4f46e5' },
  { id: 11, code: 'X11', sub: 'X<sub>11</sub>', name: 'Количество ДТП по вине тех. неисправных ТС', init: 1.00, color: '#7c3aed' },
  { id: 12, code: 'X12', sub: 'X<sub>12</sub>', name: 'Количество ДТП из-за плохих дорог', init: 0.95, color: '#c026d3' },
  { id: 13, code: 'X13', sub: 'X<sub>13</sub>', name: 'Количество ДТП с тяжкими последствиями', init: 0.62, color: '#e11d48' }
];

const DEFAULT_E = [
  { id: 1, code: 'E1', name: 'ТС старше 10 лет',     d3: 0.002,  d2: -0.010,  d1: 0.05, d0: 0.35 },
  { id: 2, code: 'E2', name: 'Износ ТС (k₂)',        d3: 0.005,  d2: -0.020,  d1: 0.40, d0: 0.00 },
  { id: 3, code: 'E3', name: 'Фото-видео фиксация',  d3: -0.001, d2: 0.010,   d1: 0.25, d0: 1.40 },
  { id: 4, code: 'E4', name: 'Выданные ВУ',          d3: 0.001,  d2: -0.005,  d1: 0.15, d0: 1.10 },
  { id: 5, code: 'E5', name: 'Протяженность дорог',  d3: 0.000,  d2: 0.002,   d1: 0.18, d0: 1.15 },
  { id: 6, code: 'E6', name: 'Штрафы за ПДД',        d3: -0.002, d2: 0.015,   d1: 0.22, d0: 1.30 }
];

const DEFAULT_F76 = [
  { idx: 1,  eq: 1,  arg: 7,  sign: '+', c0: 5.66,     c1: -11.34,   c2: 6.7,      c3: -0.15 },
  { idx: 2,  eq: 1,  arg: 8,  sign: '+', c0: -0.04126, c1: 2.448,    c2: -1.508,   c3: 0.04 },
  { idx: 3,  eq: 1,  arg: 9,  sign: '+', c0: 0.2447,   c1: 1.644,    c2: -0.9536,  c3: 0.02 },
  { idx: 4,  eq: 1,  arg: 10, sign: '+', c0: -1.636,   c1: 5.242,    c2: -2.647,   c3: -0.08 },
  { idx: 5,  eq: 1,  arg: 11, sign: '+', c0: 0.6583,   c1: 0.8366,   c2: -0.5839,  c3: 0.01 },
  { idx: 6,  eq: 1,  arg: 12, sign: '+', c0: -0.2865,  c1: 2.739,    c2: -1.555,   c3: 0.05 },
  { idx: 7,  eq: 2,  arg: 4,  sign: '+', c0: -7.633,   c1: 18.17,    c2: -9.542,   c3: 0.32 },
  { idx: 8,  eq: 2,  arg: 5,  sign: '+', c0: 0.7821,   c1: -0.3914,  c2: 0.6021,   c3: -0.02 },
  { idx: 9,  eq: 2,  arg: 8,  sign: '+', c0: 0.3846,   c1: 0.8609,   c2: -0.2409,  c3: 0.01 },
  { idx: 10, eq: 2,  arg: 9,  sign: '+', c0: 0.6607,   c1: 0.08955,  c2: 0.2619,   c3: -0.01 },
  { idx: 11, eq: 2,  arg: 11, sign: '+', c0: 0.667,    c1: 0.4408,   c2: -0.09477, c3: 0.00 },
  { idx: 12, eq: 3,  arg: 6,  sign: '+', c0: 0.8616,   c1: -0.8331,  c2: 0.9748,   c3: -0.03 },
  { idx: 13, eq: 3,  arg: 7,  sign: '+', c0: 3.3,      c1: -6.247,   c2: 3.961,    c3: -0.11 },
  { idx: 14, eq: 3,  arg: 8,  sign: '+', c0: -0.1302,  c1: 2.757,    c2: -1.76,    c3: 0.06 },
  { idx: 15, eq: 3,  arg: 9,  sign: '+', c0: 0.2173,   c1: 1.784,    c2: -1.09,    c3: 0.03 },
  { idx: 16, eq: 3,  arg: 10, sign: '+', c0: -1.527,   c1: 5.105,    c2: -2.635,   c3: 0.09 },
  { idx: 17, eq: 3,  arg: 11, sign: '+', c0: 0.6634,   c1: 0.863,    c2: -0.6441,  c3: 0.02 },
  { idx: 18, eq: 3,  arg: 12, sign: '+', c0: -0.3488,  c1: 2.92,     c2: -1.68,    c3: 0.05 },
  { idx: 19, eq: 3,  arg: 13, sign: '+', c0: 0.9822,   c1: -0.4798,  c2: 0.4747,   c3: -0.01 },
  { idx: 20, eq: 4,  arg: 2,  sign: '+', c0: 4.203,    c1: -8.259,   c2: 5.004,    c3: -0.14 },
  { idx: 21, eq: 4,  arg: 5,  sign: '+', c0: 0.8014,   c1: -0.2235,  c2: 0.3295,   c3: -0.01 },
  { idx: 22, eq: 4,  arg: 7,  sign: '+', c0: 13.45,    c1: -27.19,   c2: 14.61,    c3: -0.45 },
  { idx: 23, eq: 4,  arg: 8,  sign: '+', c0: 1.307,    c1: -1.625,   c2: 1.314,    c3: -0.04 },
  { idx: 24, eq: 4,  arg: 9,  sign: '+', c0: 1.258,    c1: -1.485,   c2: 1.191,    c3: -0.03 },
  { idx: 25, eq: 4,  arg: 11, sign: '+', c0: 0.8697,   c1: -0.3526,  c2: 0.4726,   c3: -0.01 },
  { idx: 26, eq: 5,  arg: 2,  sign: '+', c0: -11.88,   c1: 26.66,    c2: -13.82,   c3: 0.42 },
  { idx: 27, eq: 5,  arg: 4,  sign: '+', c0: -22.02,   c1: 49.49,    c2: -26.52,   c3: 0.81 },
  { idx: 28, eq: 5,  arg: 7,  sign: '+', c0: 38.45,    c1: -83.88,   c2: 46.54,    c3: -1.35 },
  { idx: 29, eq: 5,  arg: 8,  sign: '+', c0: 2.214,    c1: -4.525,   c2: 3.319,    c3: -0.10 },
  { idx: 30, eq: 5,  arg: 11, sign: '+', c0: 0.7075,   c1: -0.3949,  c2: 0.7298,   c3: -0.02 },
  { idx: 31, eq: 6,  arg: 3,  sign: '+', c0: -24.14,   c1: 51.93,    c2: -26.82,   c3: 0.85 },
  { idx: 32, eq: 6,  arg: 7,  sign: '+', c0: 23.62,    c1: -51.14,   c2: 28.61,    c3: -0.91 },
  { idx: 33, eq: 6,  arg: 8,  sign: '+', c0: 3.09,     c1: -6.099,   c2: 3.925,    c3: -0.12 },
  { idx: 34, eq: 6,  arg: 9,  sign: '+', c0: -3.505,   c1: 11.51,    c2: -7.203,   c3: 0.24 },
  { idx: 35, eq: 6,  arg: 10, sign: '+', c0: -8.241,   c1: 19.29,    c2: -10.12,   c3: 0.33 },
  { idx: 36, eq: 6,  arg: 11, sign: '+', c0: 1.093,    c1: -1.175,   c2: 1.041,    c3: -0.03 },
  { idx: 37, eq: 6,  arg: 13, sign: '+', c0: 4.137,    c1: -8.122,   c2: 4.89,     c3: -0.16 },
  { idx: 38, eq: 7,  arg: 1,  sign: '+', c0: 5.629,    c1: -10.94,   c2: 6.304,    c3: -0.19 },
  { idx: 39, eq: 7,  arg: 8,  sign: '+', c0: -0.1963,  c1: 3.037,    c2: -1.998,   c3: 0.06 },
  { idx: 40, eq: 7,  arg: 13, sign: '+', c0: 0.4072,   c1: 0.9857,   c2: -0.4329,  c3: 0.01 },
  { idx: 41, eq: 7,  arg: 2,  sign: '-', c0: -3.958,   c1: 10.96,    c2: -6.108,   c3: 0.18 },
  { idx: 42, eq: 7,  arg: 5,  sign: '-', c0: 0.9006,   c1: -0.12,    c2: 0.1586,   c3: -0.00 },
  { idx: 43, eq: 7,  arg: 10, sign: '-', c0: -2.191,   c1: 6.821,    c2: -3.712,   c3: 0.11 },
  { idx: 44, eq: 8,  arg: 1,  sign: '+', c0: -22.85,   c1: 50.16,    c2: -26.57,   c3: 0.84 },
  { idx: 45, eq: 8,  arg: 7,  sign: '+', c0: 19.54,    c1: -41.06,   c2: 22.32,    c3: -0.72 },
  { idx: 46, eq: 8,  arg: 9,  sign: '+', c0: 2.42,     c1: -5.52,    c2: 4.121,    c3: -0.13 },
  { idx: 47, eq: 8,  arg: 11, sign: '+', c0: 0.4247,   c1: 0.4742,   c2: 0.09459,  c3: 0.00 },
  { idx: 48, eq: 8,  arg: 12, sign: '+', c0: -1.334,   c1: 3.766,    c2: -1.604,   c3: 0.05 },
  { idx: 49, eq: 9,  arg: 1,  sign: '+', c0: -28.67,   c1: 61.63,    c2: -32.11,   c3: 1.02 },
  { idx: 50, eq: 9,  arg: 10, sign: '+', c0: -0.1188,  c1: -0.09897, c2: 1.208,    c3: -0.04 },
  { idx: 51, eq: 9,  arg: 11, sign: '+', c0: 0.3864,   c1: 0.6083,   c2: 0.03076,  c3: 0.00 },
  { idx: 52, eq: 9,  arg: 12, sign: '+', c0: -2.228,   c1: 6.437,    c2: -3.462,   c3: 0.11 },
  { idx: 53, eq: 9,  arg: 2,  sign: '-', c0: 0.5683,   c1: -1.561,   c2: 1.977,    c3: -0.06 },
  { idx: 54, eq: 9,  arg: 3,  sign: '-', c0: 0.2059,   c1: -0.8103,  c2: 1.516,    c3: -0.05 },
  { idx: 55, eq: 10, arg: 1,  sign: '+', c0: -10.03,   c1: 22.52,    c2: -11.54,   c3: 0.37 },
  { idx: 56, eq: 10, arg: 7,  sign: '+', c0: 9.906,    c1: -20.46,   c2: 11.55,    c3: -0.38 },
  { idx: 57, eq: 10, arg: 8,  sign: '+', c0: 0.07909,  c1: 1.751,    c2: -0.8586,  c3: 0.03 },
  { idx: 58, eq: 10, arg: 9,  sign: '+', c0: 0.7868,   c1: -0.199,   c2: 0.4145,   c3: -0.01 },
  { idx: 59, eq: 10, arg: 13, sign: '+', c0: 2.516,    c1: -4.355,   c2: 2.828,    c3: -0.09 },
  { idx: 60, eq: 10, arg: 2,  sign: '-', c0: 0.4189,   c1: 0.1803,   c2: 0.3874,   c3: -0.01 },
  { idx: 61, eq: 10, arg: 3,  sign: '-', c0: -2.821,   c1: 6.925,    c2: -3.135,   c3: 0.10 },
  { idx: 62, eq: 11, arg: 1,  sign: '+', c0: -44.62,   c1: 95.98,    c2: -50.77,   c3: 1.62 },
  { idx: 63, eq: 11, arg: 8,  sign: '+', c0: -0.3553,  c1: 0.9116,   c2: 0.4587,   c3: -0.02 },
  { idx: 64, eq: 11, arg: 12, sign: '+', c0: -0.7184,  c1: 1.451,    c2: -0.01177, c3: 0.00 },
  { idx: 65, eq: 12, arg: 1,  sign: '+', c0: -5.698,   c1: 14.12,    c2: -7.567,   c3: 0.24 },
  { idx: 66, eq: 12, arg: 7,  sign: '+', c0: -0.87,    c1: 3.832,    c2: -2.118,   c3: 0.07 },
  { idx: 67, eq: 12, arg: 8,  sign: '+', c0: -0.06734, c1: 2.088,    c2: -1.05,    c3: 0.03 },
  { idx: 68, eq: 12, arg: 11, sign: '+', c0: 0.6877,   c1: 0.4022,   c2: -0.1139,  c3: 0.00 },
  { idx: 69, eq: 13, arg: 1,  sign: '+', c0: 21.28,    c1: -45.46,   c2: 25.14,    c3: -0.81 },
  { idx: 70, eq: 13, arg: 2,  sign: '+', c0: -5.782,   c1: 14.9,     c2: -8.365,   c3: 0.27 },
  { idx: 71, eq: 13, arg: 3,  sign: '+', c0: 3.563,    c1: -7.182,   c2: 4.534,    c3: -0.15 },
  { idx: 72, eq: 13, arg: 4,  sign: '+', c0: -10.67,   c1: 26.38,    c2: -15.09,   c3: 0.49 },
  { idx: 73, eq: 13, arg: 5,  sign: '+', c0: 0.852,    c1: -0.3886,  c2: 0.3563,   c3: -0.01 },
  { idx: 74, eq: 13, arg: 6,  sign: '+', c0: 0.8457,   c1: -1.364,   c2: 1.424,    c3: -0.04 },
  { idx: 75, eq: 13, arg: 7,  sign: '+', c0: -8.522,   c1: 18.81,    c2: -9.412,   c3: 0.30 },
  { idx: 76, eq: 13, arg: 8,  sign: '+', c0: -1.521,   c1: 6.326,    c2: -4.161,   c3: 0.14 }
];

// Связи уравнений (6): какие функции входят в положительный/отрицательный темпы
// и какие внешние факторы E (индексы 0..5) их умножают.
const EQ_LINKS = [
  { p: [1, 2, 3, 4, 5, 6],               pe: [0, 1, 3], n: [],            ne: [2, 4, 5] },    // dX1
  { p: [7, 8, 9, 10, 11],                pe: [1],       n: [],            ne: [2, 3, 4, 5] }, // dX2
  { p: [12, 13, 14, 15, 16, 17, 18, 19], pe: [0, 1],    n: [],            ne: [3, 5] },       // dX3
  { p: [20, 21, 22, 23, 24, 25],         pe: [1],       n: [],            ne: [2, 3, 4, 5] }, // dX4
  { p: [26, 27, 28, 29, 30],             pe: [0, 1],    n: [],            ne: [2, 3, 4, 5] }, // dX5
  { p: [31, 32, 33, 34, 35, 36, 37],     pe: [],        n: [],            ne: [2, 3, 5] },    // dX6
  { p: [38, 39, 40],                     pe: [0, 5],    n: [41, 42, 43],  ne: [2, 3, 4] },    // dX7
  { p: [44, 45, 46, 47, 48],             pe: [0, 1],    n: [],            ne: [3, 5] },       // dX8
  { p: [49, 50, 51, 52],                 pe: [0],       n: [53, 54],      ne: [] },           // dX9
  { p: [55, 56, 57, 58, 59],             pe: [0],       n: [60, 61],     ne: [2, 3, 4, 5] },  // dX10
  { p: [62, 63, 64],                     pe: [],        n: [],            ne: [1, 3, 5] },    // dX11
  { p: [65, 66, 67, 68],                 pe: [1],       n: [],            ne: [3] },          // dX12
  { p: [69, 70, 71, 72, 73, 74, 75, 76], pe: [1],       n: [],            ne: [2, 3, 4, 5] }  // dX13
];

// ============================================================================
// 2. СОСТОЯНИЕ
// ============================================================================
let funcs76 = JSON.parse(JSON.stringify(DEFAULT_F76));
let E_FACTORS = JSON.parse(JSON.stringify(DEFAULT_E));

let activeEqFilter = 'all';
let activePlan = 'p1';
let simulations = {};        // результаты по планам p1/p2/p3
let lastSimulation = null;   // активный план
let charts = {};
let activeDynamicsCategory = 'all';
let hiddenState = new Array(13).fill(false);
let yZoomOn = false;

const REFERENCE_Z = { p1: 'Z(p₁) = 1.6031', p3: 'Z(p₃) = 1.8573' };

// ============================================================================
// 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================
function num(v, fallback = 0) {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function elValue(id, fallback) {
  const el = document.getElementById(id);
  return el ? num(el.value, fallback) : fallback;
}

// ============================================================================
// 4. МОДЕЛЬ: УРАВНЕНИЯ (5)-(6), ИНТЕГРИРОВАНИЕ, ЦЕЛЕВАЯ ФУНКЦИЯ (1)
// ============================================================================
function evalF(idx, X) {
  const f = funcs76[idx - 1];
  const x = X[f.arg - 1];
  return f.c0 + f.c1 * x + f.c2 * x * x + f.c3 * x * x * x;
}

function evalE(e, t) {
  return e.d0 + e.d1 * t + e.d2 * t * t + e.d3 * t * t * t;
}

// План p2: неконтролируемый рост X7 (демонстрация выхода из области (3));
// план p3: половинная интенсивность мероприятий.
function applyPlanRate(rate, i, plan) {
  if (plan === 'p2' && i === 6) return 0.22 + 0.3 * rate;
  if (plan === 'p3') return MODEL.P3_RATE * rate;
  return rate;
}

function computeDerivatives(t, X, params) {
  const E = E_FACTORS.map(e => evalE(e, t));
  const out = new Array(13);

  for (let i = 0; i < 13; i++) {
    const link = EQ_LINKS[i];

    let pos = 1;
    for (let k = 0; k < link.p.length; k++) pos *= evalF(link.p[k], X);
    let neg = 1;
    for (let k = 0; k < link.n.length; k++) neg *= evalF(link.n[k], X);

    let sumPos = 0;
    for (let k = 0; k < link.pe.length; k++) sumPos += E[link.pe[k]];
    let sumNeg = 0;
    for (let k = 0; k < link.ne.length; k++) sumNeg += E[link.ne[k]];

    let rate = (pos * sumPos - neg * sumNeg) / params.norm;
    if (!Number.isFinite(rate)) rate = 0;
    rate = applyPlanRate(rate, i, params.plan);
    out[i] = clamp(rate, -MODEL.DX_LIMIT, MODEL.DX_LIMIT);
  }

  return out;
}

// Метод Рунге-Кутты 4-го порядка, t = 0 ... 1 с шагом h = 0.125
function solveSystem(params) {
  const H = MODEL.H;
  const steps = Math.round(MODEL.T_MAX / H);
  const tArr = [];
  const series = Array.from({ length: 13 }, () => []);

  const hiBound = (i) => (params.plan === 'p2' && i === 6 ? MODEL.X_P2_MAX : MODEL.X_MAX);
  const lim = (i, v) => clamp(v, MODEL.X_MIN, hiBound(i));

  let X = X_VARS.map((v, i) => lim(i, v.init));

  for (let s = 0; s <= steps; s++) {
    const t = +(s * H).toFixed(6);
    tArr.push(t);
    for (let i = 0; i < 13; i++) series[i].push(X[i]);
    if (s === steps) break;

    const k1 = computeDerivatives(t, X, params);

    const X2 = X.map((v, i) => lim(i, v + 0.5 * H * k1[i]));
    const k2 = computeDerivatives(t + 0.5 * H, X2, params);

    const X3 = X.map((v, i) => lim(i, v + 0.5 * H * k2[i]));
    const k3 = computeDerivatives(t + 0.5 * H, X3, params);

    const X4 = X.map((v, i) => lim(i, v + H * k3[i]));
    const k4 = computeDerivatives(t + H, X4, params);

    X = X.map((v, i) => lim(i, v + (H / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])));
  }

  return { tArr, series, fittedPolys: series.map(y => fitQuadratic(tArr, y)) };
}

// Аппроксимация решения квадратичным полиномом (раздел 3.4 статьи)
function fitQuadratic(tArr, yArr) {
  const n = tArr.length;
  let s0 = n, s1 = 0, s2 = 0, s3 = 0, s4 = 0, sy = 0, sty = 0, st2y = 0;

  for (let i = 0; i < n; i++) {
    const t = tArr[i], y = yArr[i], t2 = t * t;
    s1 += t; s2 += t2; s3 += t2 * t; s4 += t2 * t2;
    sy += y; sty += t * y; st2y += t2 * y;
  }

  const det3 = (m) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

  const A = [[s4, s3, s2], [s3, s2, s1], [s2, s1, s0]];
  let D = det3(A);
  if (Math.abs(D) < 1e-12) D = 1e-12;

  const Da = det3([[st2y, s3, s2], [sty, s2, s1], [sy, s1, s0]]);
  const Db = det3([[s4, st2y, s2], [s3, sty, s1], [s2, sy, s0]]);
  const Dc = det3([[s4, s3, st2y], [s3, s2, sty], [s2, s1, sy]]);

  return { a: Da / D, b: Db / D, c: Dc / D };
}

// Целевая функция (1): Z = (1/15) * INT_0^1 SUM (X* - X_i(t))^2 dt * 11
// (11 — длина интервала статьи в месяцах; машинное время t in [0;1] — его нормированная шкала)
function computeObjective(sim, params) {
  const N = MODEL.Z_SAMPLES;
  const dt = MODEL.T_MAX / N;
  let acc = 0;

  for (let s = 0; s <= N; s++) {
    const t = s * dt;
    const w = (s === 0 || s === N) ? 1 : (s % 2 === 1 ? 4 : 2);
    let dev = 0;

    for (let i = 0; i < 13; i++) {
      const q = sim.fittedPolys[i];
      const v = q.a * t * t + q.b * t + q.c;
      const d = params.xStar - v;
      dev += d * d;
    }
    // X14 = X15 = 1 (показатели, не входящие в модель)
    dev += 2 * Math.pow(1 - params.xStar, 2);

    acc += w * dev;
  }

  const integral = (dt / 3) * acc;
  return { Z: integral * MODEL.WEIGHT * MODEL.Z_MONTHS, integral };
}

function checkBounds(sim) {
  let worst = null;
  for (let i = 0; i < 13; i++) {
    for (const v of sim.series[i]) {
      let over = 0;
      if (v > MODEL.X_MAX + 1e-9) over = v - MODEL.X_MAX;
      else if (v < MODEL.X_MIN - 1e-9) over = MODEL.X_MIN - v;
      if (over > 0 && (!worst || over > worst.over)) {
        worst = { i, v, over, high: v > MODEL.X_MAX };
      }
    }
  }
  return worst ? { ok: false, i: worst.i, v: worst.v, high: worst.high } : { ok: true };
}

// ============================================================================
// 5. ВВОД КОЭФФИЦИЕНТОВ
// ============================================================================
function renderAllFormulasInline() {
  const container = document.getElementById('allFormulasInlineContainer');
  if (!container) return;

  const filtered = activeEqFilter === 'all'
    ? funcs76
    : funcs76.filter(f => f.eq === activeEqFilter);

  let html = filtered.map(f => {
    const targetVar = X_VARS[f.eq - 1];
    const targetName = targetVar.name.replace(/\s*\([^)]*\)\s*$/, '');
    return `
      <div class="p-3 bg-slate-50 hover:bg-blue-50/40 rounded-xl border border-slate-200 transition space-y-2">
        <div class="flex items-center justify-between text-[11px] font-bold text-slate-700">
          <span class="flex items-center gap-2">
            <span class="px-2 py-0.5 bg-blue-600 text-white rounded font-mono text-xs">f<sub>${f.idx}</sub></span>
            <span>Уравнение dX<sub>${f.eq}</sub>/dt (${targetName})</span>
          </span>
          <span class="text-[10px] font-mono font-normal text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200 shrink-0">
            Аргумент: X<sub>${f.arg}</sub> → X<sub>${f.eq}</sub>
          </span>
        </div>

        <div class="flex items-center flex-wrap gap-1.5 font-mono text-xs text-slate-800 bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
          <span class="font-bold text-blue-700 shrink-0 text-sm">
            f<sub>${f.idx}</sub>(X<sub>${f.arg}</sub>) =
          </span>

          <input type="number" step="0.01" value="${f.c3}" data-f="${f.idx}" data-c="c3"
            oninput="updateFunc76Coeff(${f.idx}, 'c3', this.value)"
            class="w-14 h-7 text-center font-bold text-xs border border-blue-400 focus:border-blue-600 rounded bg-blue-50/40 text-blue-950 focus:bg-white outline-none"
            title="c3 при X^3">
          <span class="font-bold text-slate-700">X<sub>${f.arg}</sub><sup>3</sup> +</span>

          <input type="number" step="0.01" value="${f.c2}" data-f="${f.idx}" data-c="c2"
            oninput="updateFunc76Coeff(${f.idx}, 'c2', this.value)"
            class="w-14 h-7 text-center font-bold text-xs border border-blue-400 focus:border-blue-600 rounded bg-blue-50/40 text-blue-950 focus:bg-white outline-none"
            title="c2 при X^2">
          <span class="font-bold text-slate-700">X<sub>${f.arg}</sub><sup>2</sup> +</span>

          <input type="number" step="0.01" value="${f.c1}" data-f="${f.idx}" data-c="c1"
            oninput="updateFunc76Coeff(${f.idx}, 'c1', this.value)"
            class="w-14 h-7 text-center font-bold text-xs border border-blue-400 focus:border-blue-600 rounded bg-blue-50/40 text-blue-950 focus:bg-white outline-none"
            title="c1 при X">
          <span class="font-bold text-slate-700">X<sub>${f.arg}</sub> +</span>

          <input type="number" step="0.01" value="${f.c0}" data-f="${f.idx}" data-c="c0"
            oninput="updateFunc76Coeff(${f.idx}, 'c0', this.value)"
            class="w-14 h-7 text-center font-bold text-xs border border-blue-400 focus:border-blue-600 rounded bg-blue-50/40 text-blue-950 focus:bg-white outline-none"
            title="Свободный член c0">
        </div>
      </div>
    `;
  }).join('');

  if (activeEqFilter === 'all') {
    html += `
      <div class="pt-5 border-t border-slate-200 space-y-3">
        <div class="bg-blue-50/90 border border-blue-200 rounded-xl p-4 space-y-2 text-xs text-slate-700">
          <div class="font-bold text-blue-900 text-xs uppercase tracking-wide flex items-center gap-1.5">
            <span>📌 Внешние факторы E₁ … E₆ и машинное время t (шаг h = 0.125, горизонт 0 … 1)</span>
          </div>
          <p class="leading-relaxed text-[11px] text-slate-600">
            <b>Машинное время t</b> вычисляется автоматически от 0 до 1 с шагом 0.125 (9 узлов).
            <b>Факторы E(t)</b> задают внешнюю среду: <span class="font-mono bg-white px-1.5 py-0.5 rounded border text-blue-800 font-bold">E(t) = d₃·t³ + d₂·t² + d₁·t + d₀</span>.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${E_FACTORS.map((e, idx) => `
            <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 font-mono text-xs">
              <div class="font-bold text-slate-800 font-sans text-xs">${e.code}: ${e.name}</div>
              <div class="flex items-center gap-1 flex-wrap bg-white p-2 rounded border border-slate-200">
                <span class="text-blue-700 font-bold shrink-0">${e.code}(t)=</span>
                <input type="number" step="0.001" value="${e.d3}" oninput="updateECoeff(${idx}, 'd3', this.value)" class="w-14 h-7 text-center border rounded bg-blue-50/30 text-xs font-bold" title="d3 при t^3">t³+
                <input type="number" step="0.01" value="${e.d2}" oninput="updateECoeff(${idx}, 'd2', this.value)" class="w-14 h-7 text-center border rounded bg-blue-50/30 text-xs font-bold" title="d2 при t^2">t²+
                <input type="number" step="0.01" value="${e.d1}" oninput="updateECoeff(${idx}, 'd1', this.value)" class="w-14 h-7 text-center border rounded bg-blue-50/30 text-xs font-bold" title="d1 при t">t+
                <input type="number" step="0.01" value="${e.d0}" oninput="updateECoeff(${idx}, 'd0', this.value)" class="w-14 h-7 text-center border rounded bg-blue-50/30 text-xs font-bold" title="d0 свободный член">
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function setEqFilter(val) {
  activeEqFilter = val === 'all' ? 'all' : parseInt(val, 10);
  renderAllFormulasInline();
}

function updateFunc76Coeff(funcIdx, coeffName, val) {
  const item = funcs76.find(f => f.idx === funcIdx);
  if (!item) return;
  const parsed = num(val, NaN);
  if (Number.isFinite(parsed)) item[coeffName] = parsed;
  runAllCalculations();
}

function updateECoeff(eIdx, coeffName, val) {
  const parsed = num(val, NaN);
  if (Number.isFinite(parsed)) E_FACTORS[eIdx][coeffName] = parsed;
  runAllCalculations();
}

function syncFuncInput(idx, key, value) {
  const el = document.querySelector(`input[data-f="${idx}"][data-c="${key}"]`);
  if (el && document.activeElement !== el) el.value = value;
}

function fillRandomCoeffs() {
  funcs76.forEach(f => {
    f.c0 = +(Math.random() * 4 - 1.5).toFixed(2);
    f.c1 = +(Math.random() * 6 - 3).toFixed(2);
    f.c2 = +(Math.random() * 3 - 1.5).toFixed(2);
    f.c3 = +(Math.random() * 1 - 0.5).toFixed(2);
  });
  E_FACTORS.forEach(e => {
    e.d0 = +(Math.random() * 1.5 + 0.3).toFixed(2);
    e.d1 = +(Math.random() * 0.4 - 0.1).toFixed(2);
    e.d2 = +(Math.random() * 0.04 - 0.02).toFixed(3);
    e.d3 = +(Math.random() * 0.008 - 0.004).toFixed(4);
  });
  renderAllFormulasInline();
  runAllCalculations();
}

function resetDefaultCoeffs() {
  funcs76 = JSON.parse(JSON.stringify(DEFAULT_F76));
  E_FACTORS = JSON.parse(JSON.stringify(DEFAULT_E));
  renderAllFormulasInline();
  runAllCalculations();
}

// ============================================================================
// 6. РАСЧЕТ И KPI
// ============================================================================
function runAllCalculations() {
  const xStar = clamp(elValue('xStar', MODEL.X_STAR_DEFAULT), 0.05, 0.95);
  const norm = clamp(elValue('normCoef', MODEL.NORM_DEFAULT), 1, 500);

  simulations = {};
  ['p1', 'p2', 'p3'].forEach(plan => {
    const params = { plan, xStar, norm };
    const sim = solveSystem(params);
    simulations[plan] = { params, sim, obj: computeObjective(sim, params) };
  });

  lastSimulation = simulations[activePlan] || simulations.p1;

  updateKPIs();
  updatePlansUI();
  renderChipsUI();

  const activeTab = document.querySelector('.tab-content:not(.hidden)')?.id || 'tab_dynamics';
  updateActiveTabChart(activeTab);
}

function updateKPIs() {
  if (!lastSimulation) return;
  const { sim, obj } = lastSimulation;

  const zEl = document.getElementById('kpiZActive');
  if (zEl) zEl.textContent = obj.Z.toFixed(4);

  const refEl = document.getElementById('kpiZRef');
  if (refEl) {
    refEl.textContent = REFERENCE_Z[activePlan]
      ? `Справочно по статье: ${REFERENCE_Z[activePlan]}`
      : 'План p₂ не рассматривается в статье как допустимый';
  }

  const statusEl = document.getElementById('kpiBoundsStatus');
  const detailEl = document.getElementById('kpiBoundsDetail');
  const b = checkBounds(sim);

  if (statusEl) {
    if (b.ok) {
      statusEl.textContent = 'В допустимой области';
      statusEl.className = 'text-sm font-bold text-emerald-600 mt-2';
      if (detailEl) detailEl.textContent = 'Xᵢ ∈ [0.25; 1.00] на всём горизонте';
    } else {
      const code = X_VARS[b.i].code;
      const limit = b.high ? '1.00' : '0.25';
      statusEl.textContent = `Нарушение: ${code} = ${b.v.toFixed(2)} ${b.high ? '>' : '<'} ${limit}`;
      statusEl.className = 'text-sm font-bold text-rose-600 mt-2';
      if (detailEl) detailEl.textContent = `${X_VARS[b.i].name} — выход из области (3)`;
    }
  }
}

function isFeasible(plan) {
  const s = simulations[plan];
  if (!s) return false;
  return checkBounds(s.sim).ok;
}

function updatePlansUI() {
  const z = {};
  ['p1', 'p2', 'p3'].forEach(p => { z[p] = simulations[p] ? simulations[p].obj.Z : NaN; });

  const boundsP2 = simulations.p2 ? checkBounds(simulations.p2.sim) : { ok: true };

  const select = document.getElementById('activePlanSelect');
  if (select) {
    const labels = {
      p1: `p₁ · опт. · ${z.p1.toFixed(4)}`,
      p2: `p₂ · наруш. · ${z.p2.toFixed(4)}`,
      p3: `p₃ · альт. · ${z.p3.toFixed(4)}`
    };
    for (const opt of select.options) {
      if (labels[opt.value]) opt.textContent = labels[opt.value];
    }
  }

  const card1 = document.getElementById('planCard1');
  if (card1) card1.textContent = `План p₁ (Оптимальный P₁⁰): Z = ${z.p1.toFixed(4)}`;

  const card2 = document.getElementById('planCard2');
  if (card2) {
    card2.textContent = boundsP2.ok
      ? `План p₂ (Нарушение X₇): Z = ${z.p2.toFixed(4)}`
      : `План p₂ — исключен: X₇ = ${boundsP2.v.toFixed(2)} > 1.00 (Z = ${z.p2.toFixed(4)})`;
  }

  const card3 = document.getElementById('planCard3');
  if (card3) card3.textContent = `План p₃ (Альтернативный): Z = ${z.p3.toFixed(4)}`;

  // Лучший допустимый план
  const feasible = ['p1', 'p3'].filter(isFeasible);
  const best = feasible.length ? feasible.reduce((a, b) => (z[a] <= z[b] ? a : b)) : null;

  [['planCard1', 'p1'], ['planCard2', 'p2'], ['planCard3', 'p3']].forEach(([id, p]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (p === best) {
      el.classList.add('ring-2', 'ring-emerald-400');
      if (!el.textContent.includes('оптимален')) el.textContent += ' — оптимален';
    } else {
      el.classList.remove('ring-2', 'ring-emerald-400');
    }
  });
}

function selectPlanPreset(planId) {
  activePlan = planId;
  const sel = document.getElementById('activePlanSelect');
  if (sel) sel.value = planId;
  lastSimulation = simulations[planId] || lastSimulation;
  updateKPIs();
  const activeTab = document.querySelector('.tab-content:not(.hidden)')?.id || 'tab_dynamics';
  updateActiveTabChart(activeTab);
}

function resetDefaults() {
  const x = document.getElementById('xStar');
  if (x) x.value = MODEL.X_STAR_DEFAULT;
  const n = document.getElementById('normCoef');
  if (n) n.value = MODEL.NORM_DEFAULT;
  activePlan = 'p1';
  const sel = document.getElementById('activePlanSelect');
  if (sel) sel.value = 'p1';

  yZoomOn = false;
  updateZoomButton();

  funcs76 = JSON.parse(JSON.stringify(DEFAULT_F76));
  E_FACTORS = JSON.parse(JSON.stringify(DEFAULT_E));
  renderAllFormulasInline();
  runAllCalculations();
}

// ============================================================================
// 7. ГРАФИК ДИНАМИКИ: t в [0; 1], подписи X1..X13
// ============================================================================
// Подпись с настоящим нижним индексом: X1 -> X₁, X10 -> X₁₀
function subscriptCode(code) {
  const map = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
  return code.replace(/\d/g, d => map[d]);
}

// Подписи X1..X13 у правого конца кривых (t = 1) с разведением по вертикали
const endLabelsPlugin = {
  id: 'endLabels',
  afterDatasetsDraw(chart) {
    const area = chart.chartArea;
    if (!area) return;

    const items = [];
    chart.data.datasets.forEach((ds, i) => {
      if (ds.hidden) return;
      const meta = chart.getDatasetMeta(i);
      const pts = meta && meta.data;
      if (!pts || !pts.length) return;
      const last = pts[pts.length - 1];
      if (!last || !Number.isFinite(last.y)) return;
      const raw = ds.data[ds.data.length - 1];
      items.push({
        y: last.y,
        ly: last.y,
        color: ds.borderColor,
        code: subscriptCode(X_VARS[i].code),
        value: raw && typeof raw === 'object' ? raw.y : raw
      });
    });

    if (!items.length) return;
    items.sort((a, b) => a.y - b.y);

    const gap = 14;
    const top = area.top + 7;
    const bottom = area.bottom - 7;

    items.forEach(it => { it.ly = clamp(it.y, top, bottom); });
    for (let k = 1; k < items.length; k++) {
      if (items[k].ly - items[k - 1].ly < gap) items[k].ly = items[k - 1].ly + gap;
    }

    const overflow = items[items.length - 1].ly - bottom;
    if (overflow > 0) {
      items.forEach(it => { it.ly -= overflow; });
      const underflow = top - items[0].ly;
      if (underflow > 0) items.forEach(it => { it.ly += underflow; });
    }

    const ctx = chart.ctx;
    const xLine = area.right + 7;
    const xText = area.right + 11;

    ctx.save();
    ctx.font = '700 12px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    items.forEach(it => {
      // Выноска: точка на конце линии -> уголок -> подпись
      ctx.strokeStyle = it.color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(area.right, it.y);
      ctx.lineTo(xLine, it.y);
      ctx.lineTo(xLine, it.ly);
      ctx.lineTo(xText - 3, it.ly);
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(area.right, it.y, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = it.color;
      ctx.fill();

      const label = `${it.code} ${Number(it.value).toFixed(2)}`;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(label, xText, it.ly);
      ctx.fillStyle = it.color;
      ctx.fillText(label, xText, it.ly);
    });

    ctx.restore();
  }
};

function buildDynamicsDatasets(sim) {
  return X_VARS.map((v, i) => ({
    label: `${subscriptCode(v.code)} · ${v.name}`,
    data: sim.series[i].map((y, k) => ({ x: sim.tArr[k], y })),
    parsing: false,
    borderColor: v.color,
    backgroundColor: v.color,
    borderWidth: 2.4,
    // Монотонная интерполяция: линия проходит через узлы RK4 без искусственных
    // «волн» и забросов, которые давал обычный cubic tension.
    cubicInterpolationMode: 'monotone',
    tension: 0,
    pointRadius: (ctx) => (ctx.dataIndex === 0 ? 3 : 0),
    pointHoverRadius: 4,
    pointBackgroundColor: v.color,
    pointBorderColor: '#ffffff',
    pointBorderWidth: 1,
    hidden: hiddenState[i]
  }));
}

function computeYRange(sim) {
  const vals = [];
  for (let i = 0; i < 13; i++) {
    if (!hiddenState[i]) vals.push(...sim.series[i]);
  }
  if (!vals.length) vals.push(MODEL.X_MIN, MODEL.X_MAX);

  let lo = Math.min(...vals);
  let hi = Math.max(...vals);

  if (yZoomOn) {
    lo = Math.max(0, Math.floor((lo - 0.02) * 20) / 20);
    hi = Math.min(1.3, Math.ceil((hi + 0.02) * 20) / 20);
    if (hi - lo < 0.1) hi = Math.min(1.3, lo + 0.1);
  } else {
    lo = 0;
    hi = Math.min(1.3, Math.max(1.10, Math.ceil((hi + 0.02) * 20) / 20));
  }
  return { lo, hi };
}

function updateDynamicsChart() {
  if (!lastSimulation) return;
  const sim = lastSimulation.sim;
  const canvas = document.getElementById('dynamicsChart');
  if (!canvas) return;

  const datasets = buildDynamicsDatasets(sim);
  const { lo, hi } = computeYRange(sim);
  const zoomed = yZoomOn;

  if (!charts.dynamics) {
    charts.dynamics = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        parsing: false,
        normalized: true,
        layout: { padding: { top: 8, right: 90, bottom: 0, left: 2 } },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            titleFont: { size: 12, weight: 'bold' },
            bodyFont: { size: 11 },
            padding: 10,
            itemSort: (a, b) => b.parsed.y - a.parsed.y,
            callbacks: {
              title: (items) => `Машинное время t = ${Number(items[0].parsed.x).toFixed(3)}`,
              label: (item) => `${item.dataset.label}: ${item.parsed.y.toFixed(3)}`
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            min: 0,
            max: MODEL.T_MAX,
            grid: { color: '#eef2f7' },
            border: { color: '#cbd5e1' },
            ticks: {
              stepSize: MODEL.H,
              autoSkip: false,
              maxRotation: 0,
              font: { size: 10, weight: '600' },
              color: '#475569',
              callback: (value) => Number(value).toFixed(3)
            },
            title: {
              display: true,
              text: 'Машинное время t (шаг интегрирования ОДУ h = 0.125)',
              font: { size: 12, weight: 'bold' },
              color: '#334155'
            }
          },
          y: {
            min: lo,
            max: hi,
            grid: {
              color: (context) => (context.tick && context.tick.value === 0 ? '#0f172a' : '#e2e8f0'),
              lineWidth: (context) => (context.tick && context.tick.value === 0 ? 2.2 : 1)
            },
            border: { color: '#cbd5e1' },
            ticks: {
              stepSize: zoomed ? 0.02 : 0.1,
              font: { size: 11, weight: '500' },
              color: '#64748b',
              callback: (value) => (zoomed ? Number(value).toFixed(2) : Number(value).toFixed(1))
            },
            title: {
              display: true,
              text: 'Нормированный уровень Xᵢ(t)',
              font: { size: 12, weight: '600' }
            }
          }
        }
      },
      plugins: [endLabelsPlugin]
    });
  } else {
    charts.dynamics.data.datasets = datasets;
    charts.dynamics.options.scales.y.min = lo;
    charts.dynamics.options.scales.y.max = hi;
    charts.dynamics.options.scales.y.ticks.stepSize = zoomed ? 0.02 : 0.1;
    charts.dynamics.options.scales.y.ticks.callback =
      (value) => (zoomed ? Number(value).toFixed(2) : Number(value).toFixed(1));
    charts.dynamics.update('none');
  }

  renderChipsUI();
}

function renderChipsUI() {
  const container = document.getElementById('indicatorsChipsContainer');
  if (!container) return;

  container.innerHTML = X_VARS.map((v, i) => {
    const isHidden = hiddenState[i];
    const shortName = v.name.replace(/^(Количество|Общее количество)\s*/i, '');
    return `
      <button onclick="toggleSingleIndicator(${i})"
        class="px-2.5 py-1.5 rounded-lg text-xs font-medium border transition flex items-center gap-2 shadow-2xs ${
          !isHidden
            ? 'bg-slate-900 text-white border-slate-900'
            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
        }">
        <span class="w-2.5 h-2.5 rounded-full inline-block shrink-0" style="background:${v.color}"></span>
        <span class="font-bold">${v.sub}</span>
        <span class="text-[11px] opacity-90 truncate max-w-[160px] sm:max-w-[200px]" title="${v.name}">— ${shortName}</span>
      </button>
    `;
  }).join('');
}

function toggleSingleIndicator(idx) {
  hiddenState[idx] = !hiddenState[idx];
  updateDynamicsChart();
}

const CATEGORY_MAP = {
  key: [0, 1, 2, 3],
  human: [6, 7, 8, 9],
  infra: [10, 11, 12],
  rates: [3, 4, 5],
  all: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
};

function setDynamicsCategory(cat) {
  activeDynamicsCategory = cat;
  const allowed = CATEGORY_MAP[cat] || CATEGORY_MAP.all;
  hiddenState = X_VARS.map((_, i) => !allowed.includes(i));

  document.querySelectorAll('.cat-filter-btn').forEach(btn => {
    btn.className = 'cat-filter-btn px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition ' +
      (btn.dataset.cat === cat
        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50');
  });

  updateDynamicsChart();
}

function updateZoomButton() {
  const btn = document.getElementById('btnYZoom');
  if (btn) btn.textContent = `Авто-зум Y: ${yZoomOn ? 'вкл' : 'выкл'}`;
}

function toggleYZoom() {
  yZoomOn = !yZoomOn;
  updateZoomButton();
  updateDynamicsChart();
}

// ============================================================================
// 8. ОСТАЛЬНЫЕ ВКЛАДКИ
// ============================================================================
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  const tab = document.getElementById(tabId);
  const btn = document.getElementById(`btn_${tabId}`);
  if (tab) tab.classList.remove('hidden');
  if (btn) btn.classList.add('active');

  updateActiveTabChart(tabId);
}

function updateActiveTabChart(tabId) {
  if (!lastSimulation) return;
  if (typeof Chart === 'undefined') {
    showChartLoadError();
    return;
  }
  if (tabId === 'tab_dynamics') updateDynamicsChart();
  else if (tabId === 'tab_radar') updateRadarCharts();
  else if (tabId === 'tab_regressions') updateRegressionChart();
  else if (tabId === 'tab_correction') updateCorrectionCharts();
  else if (tabId === 'tab_plans') updatePlansBarChart();
}

function showChartLoadError() {
  const tab = document.getElementById('tab_dynamics');
  if (!tab || tab.querySelector('.chart-load-error')) return;
  const wrap = tab.querySelector('.chart-wrapper-lg');
  if (!wrap) return;
  const msg = document.createElement('div');
  msg.className = 'chart-load-error text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3 m-3';
  msg.textContent = 'Не удалось загрузить библиотеку Chart.js с CDN — график не построен. Проверьте подключение к интернету и обновите страницу (Ctrl+F5).';
  wrap.appendChild(msg);
}

// --- Радар (Рис. 11-12) -----------------------------------------------------
function updateRadarCharts() {
  if (!lastSimulation) return;
  const sim = lastSimulation.sim;
  const t1 = num(document.getElementById('radarT1')?.value, 0);
  const t2 = num(document.getElementById('radarT2')?.value, 1);

  const lab1 = document.getElementById('valRadarT1');
  if (lab1) lab1.textContent = t1.toFixed(3);
  const lab2 = document.getElementById('valRadarT2');
  if (lab2) lab2.textContent = t2.toFixed(3);

  const title1 = document.getElementById('radarTitle1');
  if (title1) title1.textContent = `Рис. 11 — срез t₁ = ${t1.toFixed(3)}`;
  const title2 = document.getElementById('radarTitle2');
  if (title2) title2.textContent = `Рис. 12 — срез t₂ = ${t2.toFixed(3)}`;

  renderSingleRadar('radarChart1', 'radar1', t1, sim);
  renderSingleRadar('radarChart2', 'radar2', t2, sim);
}

function renderSingleRadar(canvasId, chartKey, tVal, sim) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const idx = clamp(Math.round(tVal / MODEL.H), 0, sim.tArr.length - 1);
  const values = X_VARS.map((_, i) => sim.series[i][idx]);
  const xStar = lastSimulation.params.xStar;

  if (!charts[chartKey]) {
    charts[chartKey] = new Chart(canvas.getContext('2d'), {
      type: 'radar',
      data: {
        labels: X_VARS.map(v => v.code),
        datasets: [
          {
            label: 'Xᵢ(t)',
            data: values,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37,99,235,0.16)',
            borderWidth: 2,
            pointRadius: 2.5,
            pointBackgroundColor: '#2563eb'
          },
          {
            label: 'Норматив X*',
            data: X_VARS.map(() => xStar),
            borderColor: '#059669',
            borderDash: [5, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            backgroundColor: 'transparent'
          },
          {
            label: 'Xmax = 1.00',
            data: X_VARS.map(() => MODEL.X_MAX),
            borderColor: 'rgba(225,29,72,0.55)',
            borderDash: [2, 4],
            borderWidth: 1.2,
            pointRadius: 0,
            backgroundColor: 'transparent'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: true, labels: { boxWidth: 10, font: { size: 9 } } }
        },
        scales: {
          r: {
            min: 0,
            max: 1.25,
            ticks: { stepSize: 0.25, font: { size: 8 }, backdropColor: 'transparent' },
            pointLabels: { font: { size: 9, weight: '600' } }
          }
        }
      }
    });
  } else {
    charts[chartKey].data.datasets[0].data = values;
    charts[chartKey].data.datasets[1].data = X_VARS.map(() => xStar);
    charts[chartKey].update('none');
  }
}

// --- Регрессии (Рис. 6-7) ---------------------------------------------------
const REGRESSION_DEFS = {
  f1_7: { idx: 1, tex: 'f_{1,7}', xTex: 'X_7', title: 'f₁,₇(X₇)' },
  f1_8: { idx: 2, tex: 'f_{1,8}', xTex: 'X_8', title: 'f₁,₈(X₈)' },
  f1_9: { idx: 3, tex: 'f_{1,9}', xTex: 'X_9', title: 'f₁,₉(X₉)' },
  f2_4: { idx: 7, tex: 'f_{2,4}', xTex: 'X_4', title: 'f₂,₄(X₄)' }
};

function polyTex(coeffs, varTex) {
  let out = '';
  for (let p = coeffs.length - 1; p >= 0; p--) {
    const v = coeffs[p];
    if (Math.abs(v) < 1e-9) continue;
    const abs = Math.abs(v).toFixed(2);
    const xs = p === 0 ? '' : (p === 1 ? varTex : `${varTex}^{${p}}`);
    const term = xs ? `${abs} \\cdot ${xs}` : abs;
    if (!out) out = (v < 0 ? '-' : '') + term;
    else out += (v < 0 ? ' - ' : ' + ') + term;
  }
  return out || '0';
}

function syncRegressionInputs() {
  const key = document.getElementById('regSelect')?.value || 'f1_7';
  const def = REGRESSION_DEFS[key];
  const f = funcs76[def.idx - 1];
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('reg_c0', f.c0);
  set('reg_c1', f.c1);
  set('reg_c2', f.c2);
}

function updateRegressionChart() {
  syncRegressionInputs();
  renderRegressionPlot();
  renderRegressionEquation();
}

function renderRegressionEquation() {
  const key = document.getElementById('regSelect')?.value || 'f1_7';
  const def = REGRESSION_DEFS[key];
  const f = funcs76[def.idx - 1];
  const box = document.getElementById('regEquationBox');
  if (!box) return;
  box.innerHTML = `$$${def.tex}(${def.xTex}) = ${polyTex([f.c0, f.c1, f.c2, f.c3], def.xTex)}$$`;
  if (window.MathJax && MathJax.typesetPromise) {
    MathJax.typesetPromise([box]).catch(() => {});
  }
}

function updateRegCoeffs() {
  const key = document.getElementById('regSelect')?.value || 'f1_7';
  const def = REGRESSION_DEFS[key];
  const f = funcs76[def.idx - 1];

  f.c0 = num(document.getElementById('reg_c0')?.value, f.c0);
  f.c1 = num(document.getElementById('reg_c1')?.value, f.c1);
  f.c2 = num(document.getElementById('reg_c2')?.value, f.c2);

  ['c0', 'c1', 'c2'].forEach(k => syncFuncInput(def.idx, k, f[k]));

  renderRegressionPlot();
  renderRegressionEquation();
  runAllCalculations();
}

function renderRegressionPlot() {
  const key = document.getElementById('regSelect')?.value || 'f1_7';
  const def = REGRESSION_DEFS[key];
  const f = funcs76[def.idx - 1];

  const data = [];
  for (let x = 0.6; x <= 1.0001; x += 0.02) {
    const y = f.c0 + f.c1 * x + f.c2 * x * x + f.c3 * x * x * x;
    data.push({ x: +x.toFixed(2), y });
  }

  const canvas = document.getElementById('regressionChart');
  if (!canvas) return;

  if (!charts.regression) {
    charts.regression = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        datasets: [{
          label: def.title,
          data,
          borderColor: '#ea580c',
          backgroundColor: 'rgba(234,88,12,0.10)',
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.3,
          fill: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        parsing: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            type: 'linear',
            min: 0.6,
            max: 1.0,
            title: { display: true, text: 'Нормированное значение фактора X', font: { size: 11 } },
            ticks: { font: { size: 10 } }
          },
          y: {
            title: { display: true, text: 'f(X) — вклад связи', font: { size: 11 } },
            ticks: { font: { size: 10 } }
          }
        }
      }
    });
  } else {
    charts.regression.data.datasets[0] = {
      label: def.title,
      data,
      borderColor: '#ea580c',
      backgroundColor: 'rgba(234,88,12,0.10)',
      borderWidth: 2.5,
      pointRadius: 0,
      tension: 0.3,
      fill: false
    };
    charts.regression.update('none');
  }
}

// --- Коррекция (Рис. 9-10) --------------------------------------------------
const CORRECTION_DATA = {
  years: ['2015', '2016', '2017', '2018', '2019', '2020', '2021'],
  stat: [1.00, 0.89, 0.78, 0.71, 0.71, 0.73, 0.59],
  model: [1.00, 0.94, 0.88, 0.81, 0.73, 0.64, 0.54]
};

function updateCorrectionCharts() {
  const thresholdPct = num(document.getElementById('corrThreshold')?.value, 10);
  const threshold = thresholdPct / 100;

  const { years, stat, model } = CORRECTION_DATA;
  const corrected = [];
  const events = [];

  for (let i = 0; i < years.length; i++) {
    const relDiff = Math.abs(model[i] - stat[i]) / Math.max(1e-9, Math.abs(stat[i]));
    if (relDiff > threshold) {
      corrected.push(stat[i]);
      events.push(`${years[i]} (${(relDiff * 100).toFixed(1)}%)`);
    } else {
      corrected.push(model[i]);
    }
  }

  const logBox = document.getElementById('corrLogBox');
  if (logBox) {
    logBox.innerHTML = events.length
      ? `Коррекция сработала в точках: <span class="text-rose-600 font-bold">${events.join(', ')}</span> (превышение порога ${thresholdPct}%).`
      : `При пороге ${thresholdPct}% отклонения в пределах нормы.`;
  }

  const canvas = document.getElementById('correctionChartX4');
  if (!canvas) return;

  if (!charts.corr) {
    charts.corr = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: years,
        datasets: [
          {
            label: 'Статистика МВД',
            data: stat,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37,99,235,0.12)',
            borderWidth: 2.5,
            pointRadius: 3,
            tension: 0.25
          },
          {
            label: 'Модель с коррекцией',
            data: corrected,
            borderColor: '#64748b',
            borderDash: [4, 4],
            borderWidth: 2.5,
            pointRadius: 2,
            tension: 0.25
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { labels: { boxWidth: 12, font: { size: 10 } } } },
        scales: {
          x: { title: { display: true, text: 'Год', font: { size: 10 } }, ticks: { font: { size: 9 } } },
          y: { min: 0.5, max: 1.05, title: { display: true, text: 'X₄', font: { size: 10 } }, ticks: { font: { size: 9 } } }
        }
      }
    });
  } else {
    charts.corr.data.datasets[1].data = corrected;
    charts.corr.update('none');
  }
}

// --- Планы (Рис. 13) --------------------------------------------------------
function updatePlansBarChart() {
  const canvas = document.getElementById('plansBarChart');
  if (!canvas || !simulations.p1) return;

  const values = [
    simulations.p1.obj.Z,
    simulations.p2 ? simulations.p2.obj.Z : 0,
    simulations.p3 ? simulations.p3.obj.Z : 0
  ];

  if (!charts.plans) {
    charts.plans = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['План p₁', 'План p₂', 'План p₃'],
        datasets: [{
          label: 'Z(p)',
          data: values,
          backgroundColor: ['#059669', '#e11d48', '#64748b'],
          borderRadius: 6,
          maxBarThickness: 54
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (item) => `Z = ${item.parsed.y.toFixed(4)}` } }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Значение функционала Z(p)', font: { size: 10 } },
            ticks: { font: { size: 9 } }
          },
          x: { ticks: { font: { size: 10, weight: '600' } } }
        }
      }
    });
  } else {
    charts.plans.data.datasets[0].data = values;
    charts.plans.update('none');
  }
}

// ============================================================================
// 9. ЭКСПОРТ, МОДАЛЬНОЕ ОКНО, ИНИЦИАЛИЗАЦИЯ
// ============================================================================
function exportCSV() {
  if (!lastSimulation) return;
  const { sim, params, obj } = lastSimulation;
  const headers = ['t_machine_time', ...X_VARS.map(v => v.code)];
  const rows = [
    `# plan=${params.plan}; X*=${params.xStar}; X_norm=${params.norm}; Z=${obj.Z.toFixed(4)}`,
    headers.join(';')
  ];

  for (let s = 0; s < sim.tArr.length; s++) {
    rows.push([
      sim.tArr[s].toFixed(3),
      ...X_VARS.map((_, i) => sim.series[i][s].toFixed(5))
    ].join(';'));
  }

  const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `road_safety_system_dynamics_${params.plan}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function openFormulasModal() {
  const modal = document.getElementById('formulasModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  if (window.MathJax && MathJax.typesetPromise) {
    MathJax.typesetPromise([modal]).catch(() => {});
  }
}

function closeFormulasModal() {
  document.getElementById('formulasModal')?.classList.add('hidden');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeFormulasModal();
});

window.addEventListener('DOMContentLoaded', () => {
  renderAllFormulasInline();
  syncRegressionInputs();
  renderRegressionEquation();
  updateZoomButton();
  runAllCalculations();
});
