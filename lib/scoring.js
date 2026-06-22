// Pesos del rànquing (sumen 100 punts com a màxim)
//  A) Solidesa defensiva de l'equip (gols encaixats / partit)   -> fins a 40 pts
//  B) Partits a porteria a 0 (mostra d'actes analitzades)        -> fins a 30 pts
//  C) Participació a la lliga (jugats / jornades totals)         -> fins a 20 pts
//  D) Pes com a titular indiscutible (titular / jugats)          -> fins a 10 pts

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export function computeGkScore({ teamGC, teamJ, cleanSheetRate, fitxa }) {
  const gcPerGame = teamJ ? teamGC / teamJ : 99;

  // 0 gols/partit -> 1.0 ; 2.2+ gols/partit -> 0.0
  const scoreA = clamp01((2.2 - gcPerGame) / 2.2) * 40;

  const scoreB = clamp01(cleanSheetRate ?? 0) * 30;

  const totalJornades = fitxa?.totalJornades || teamJ || 1;
  const participation = totalJornades ? (fitxa?.jugats || 0) / totalJornades : 0;
  const scoreC = clamp01(participation) * 20;

  const titularRatio = fitxa?.jugats ? (fitxa.titular || 0) / fitxa.jugats : 0;
  const scoreD = clamp01(titularRatio) * 10;

  const total = scoreA + scoreB + scoreC + scoreD;

  return {
    total: Math.round(total * 10) / 10,
    gcPerGame: Math.round(gcPerGame * 100) / 100,
    breakdown: {
      defensa: Math.round(scoreA * 10) / 10,
      porteriaZero: Math.round(scoreB * 10) / 10,
      participacio: Math.round(scoreC * 10) / 10,
      titularitat: Math.round(scoreD * 10) / 10
    }
  };
}
