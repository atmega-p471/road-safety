/**
 * ============================================================================
 *  ГОТОВЫЙ КУСОК RK4 С ЖЁСТКО ЗАДАННЫМИ ЗНАЧЕНИЯМИ
 * ============================================================================
 *
 * КАК ИСПОЛЬЗОВАТЬ:
 *   1. Откройте script.js.
 *   2. Найдите функцию:
 *
 *          function solveSystem(params) { ... }
 *
 *   3. Замените её ЦЕЛИКОМ (от строки `function solveSystem(params) {`
 *      до её закрывающей `}`) на эту функцию.
 *   4. Сохраните и обновите страницу.
 *
 * ЧТО ЗАФИКСИРОВАНО ЗДЕСЬ:
 *   - начальные условия X(0) — массив INITIAL;
 *   - шаг RK4 — H = 0.125;
 *   - нормировка — NORM = 19.05;
 *   - число точек сгущения — DENSE_PER_STEP = 16.
 *
 * ЧТО ОСТАЛОСЬ ИЗ ОСНОВНОГО КОДА:
 *   - 76 функций f_i и их коэффициенты (funcs76);
 *   - 6 факторов E_j (E_FACTORS);
 *   - связи EQ_LINKS;
 *   - план p1/p2/p3 берётся из params.plan.
 *
 * ВАЖНО:
 *   Кнопки «Демо X(0)» и «Демо-синус» на этот вариант НЕ ВЛИЯЮТ:
 *   X(0), шаг и нормировка здесь уже вписаны числами.
 *   Чтобы поменять X(0), редактируйте массив INITIAL ниже.
 * ============================================================================
 */
function solveSystem(params) {
  // --- Жёстко заданные значения -------------------------------------------
  const H = 0.125;
  const NORM = 19.05;
  const DENSE_PER_STEP = 16;

  // X1(0) ... X13(0)
  const INITIAL = [
    0.50, 0.84, 0.87, 0.52, 0.69, 0.91, 0.45,
    0.54, 0.85, 0.75, 0.56, 0.80, 0.62
  ];
  // ------------------------------------------------------------------------

  const steps = Math.round(MODEL.T_MAX / H);
  const tArr = [];
  const series = Array.from({ length: 13 }, () => []);
  const derivs = Array.from({ length: 13 }, () => []);
  let diverged = false;

  // Локальные параметры: нормировка и X(0) берутся из этого файла,
  // план p1/p2/p3 — из params.plan.
  const localParams = Object.assign({}, params, {
    norm: NORM,
    initial: INITIAL,
    h: H,
    densePerStep: DENSE_PER_STEP,
    sineAmp: 0,
    sineFreq: 0
  });

  let X = INITIAL.map(v => clamp(v, 0, 1));

  for (let s = 0; s <= steps; s++) {
    const t = +(s * H).toFixed(6);
    tArr.push(t);
    for (let i = 0; i < 13; i++) series[i].push(X[i]);

    // k1 — производные в начале шага.
    const k1 = computeDerivatives(t, X, localParams);
    for (let i = 0; i < 13; i++) derivs[i].push(k1[i]);
    if (s === steps) break;

    // k2 — производные в середине шага (по k1).
    const X2 = X.map((v, i) => v + 0.5 * H * k1[i]);
    const k2 = computeDerivatives(t + 0.5 * H, X2, localParams);

    // k3 — производные в середине шага (по k2).
    const X3 = X.map((v, i) => v + 0.5 * H * k2[i]);
    const k3 = computeDerivatives(t + 0.5 * H, X3, localParams);

    // k4 — производные в конце шага (по k3).
    const X4 = X.map((v, i) => v + H * k3[i]);
    const k4 = computeDerivatives(t + H, X4, localParams);

    // X_{n+1} = X_n + h/6 * (k1 + 2k2 + 2k3 + k4)
    X = X.map((v, i) => v + (H / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));

    if (X.some(v => !Number.isFinite(v) || Math.abs(v) > 20)) diverged = true;

    X = X.map((v, i) => {
      if (!Number.isFinite(v)) return INITIAL[i];
      return v < 0 ? 0 : v;
    });
  }

  const dense = buildDenseSeries(tArr, series, derivs, DENSE_PER_STEP);

  return {
    tArr,
    series,
    derivs,
    dense,
    diverged,
    fittedPolys: series.map((_, i) => fitQuadratic(dense.tArr, dense.series[i]))
  };
}
