/*
 * grading.js — rechnet Randbreiten in Centering-Verhältnisse um und ordnet
 * sie den Centering-Toleranzen von PSA, BGS und CGC zu.
 *
 * Die Werte sind Richtwerte. Offiziell veröffentlicht ist vor allem die
 * PSA-10-Grenze (55/45 vorne, 75/25 hinten, seit Anfang 2025). Alle übrigen
 * Stufen stammen aus den Grading-Skalen bzw. aus verbreiteten Übersichten
 * und können von der tatsächlichen Bewertung abweichen.
 *
 * Jede Stufe: [Note, maximal erlaubter größerer Anteil in %]
 * Beispiel: [10, 55] = „bis 55/45 noch Note 10“.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CenteringGrading = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STANDARDS = {
    psa: {
      name: 'PSA',
      front: [['10', 55], ['9', 60], ['8', 65], ['7', 70], ['6', 80], ['5', 85], ['3', 90]],
      back: [['10', 75], ['9', 90]],
    },
    bgs: {
      name: 'BGS',
      sub: true, // Centering-Subgrade
      front: [['10', 52], ['9.5', 55], ['9', 60], ['8.5', 65], ['8', 70]],
      back: [['10', 55], ['9.5', 60], ['9', 65], ['8.5', 70]],
    },
    cgc: {
      name: 'CGC',
      front: [['Pristine 10', 52], ['10', 55], ['9', 60], ['8', 65]],
      back: [['Pristine 10', 55], ['10', 75], ['9', 90]],
    },
  };

  /** Randbreiten → Prozentanteile. */
  function ratios(b) {
    const lr = (b.left / (b.left + b.right)) * 100;
    const tb = (b.top / (b.top + b.bottom)) * 100;
    return {
      left: lr, right: 100 - lr,
      top: tb, bottom: 100 - tb,
      lrWorst: Math.max(lr, 100 - lr),
      tbWorst: Math.max(tb, 100 - tb),
      worst: Math.max(lr, 100 - lr, tb, 100 - tb),
    };
  }

  /** Index der erreichten Stufe (0 = beste) oder -1, wenn schlechter als alle. */
  function tierIndex(tiers, worst) {
    // kleine Rundungstoleranz, damit 55,04 noch als 55/45 gilt
    const w = Math.round(worst * 10) / 10;
    for (let i = 0; i < tiers.length; i++) if (w <= tiers[i][1]) return i;
    return -1;
  }

  function gradeSide(company, side, worst) {
    const tiers = STANDARDS[company][side];
    const i = tierIndex(tiers, worst);
    if (i === -1) {
      const last = tiers[tiers.length - 1];
      return { label: '< ' + last[0], index: tiers.length, limit: null, next: null };
    }
    return {
      label: tiers[i][0],
      index: i,
      limit: tiers[i][1],
      // Abstand zur nächstbesseren Stufe
      better: i > 0 ? { label: tiers[i - 1][0], limit: tiers[i - 1][1] } : null,
    };
  }

  /**
   * Bewertet Vorder- und/oder Rückseite.
   * sides: { front?: borders, back?: borders }
   */
  function evaluate(sides) {
    const out = { sides: {}, companies: {} };
    for (const side of ['front', 'back']) {
      if (sides[side]) out.sides[side] = ratios(sides[side]);
    }
    for (const key of Object.keys(STANDARDS)) {
      const c = { name: STANDARDS[key].name, sub: !!STANDARDS[key].sub };
      let worstIdx = -1, limiting = null;
      for (const side of ['front', 'back']) {
        if (!out.sides[side]) continue;
        const g = gradeSide(key, side, out.sides[side].worst);
        c[side] = g;
        // „schlechtere“ Seite bestimmt das Ergebnis — Stufen beider Seiten
        // sind gleich benannt, daher über den Notennamen vergleichen
        const rank = rankOf(key, g.label);
        if (rank > worstIdx) { worstIdx = rank; limiting = side; }
      }
      c.limiting = limiting;
      c.overall = limiting ? c[limiting].label : null;
      out.companies[key] = c;
    }
    return out;
  }

  function rankOf(company, label) {
    const order = [];
    for (const side of ['front', 'back']) {
      for (const [l] of STANDARDS[company][side]) if (!order.includes(l)) order.push(l);
    }
    const i = order.indexOf(label);
    return i === -1 ? order.length : i;
  }

  /** „53,2/46,8“ */
  function fmt(a) {
    const big = Math.max(a, 100 - a);
    return big.toFixed(1).replace('.', ',') + '/' + (100 - big).toFixed(1).replace('.', ',');
  }

  return { STANDARDS, ratios, evaluate, gradeSide, fmt };
});
