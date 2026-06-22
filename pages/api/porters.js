import {
  getClassification,
  getActaLinks,
  parseActaForGoalkeeper,
  getFitxaStats
} from '../../lib/fcfScraper';
import { computeGkScore } from '../../lib/scoring';
import { createLimiter, sampleArray } from '../../lib/fetcher';

export const config = {
  api: {
    responseLimit: false,
    bodyParser: false
  }
};

const SAMPLE_SIZE = 4; // nombre d'actes per equip que s'analitzen
const GLOBAL_CONCURRENCY = 5;

// Cache molt senzilla en memòria (24h) mentre la instància estigui calenta
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  const url = (req.query.url || '').toString().trim();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  if (!url || !/fcf\.cat\/classificacio\//i.test(url)) {
    send({
      type: 'error',
      message:
        "URL no vàlida. Enganxa l'enllaç de la classificació de fcf.cat (ha de contenir /classificacio/).",
    });
    return res.end();
  }

  const cached = cache.get(url);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    send({ step: 0, msg: 'Resultats en caché ⚡' });
    send({ type: 'done', results: cached.results, cached: true });
    return res.end();
  }

  const limit = createLimiter(GLOBAL_CONCURRENCY);

  try {
    // ---- 1) Classificació ----------------------------------------------
    send({ step: 1, msg: 'Llegint la classificació de fcf.cat…' });
    const teams = await getClassification(url);
    send({
      step: 1,
      msg: `${teams.length} equips trobats a la classificació`,
      done: true
    });

    // ---- 2) Calendaris ----------------------------------------------------
    send({ step: 2, msg: 'Obtenint el calendari de cada equip…' });
    await Promise.all(
      teams.map(async (team, idx) => {
        try {
          team.actaLinks = await limit(() => getActaLinks(team.calendarUrl));
        } catch {
          team.actaLinks = [];
        }
        send({
          step: 2,
          msg: `Calendari ${idx + 1}/${teams.length}: ${team.name} (${team.actaLinks.length} partits)`
        });
      })
    );
    send({ step: 2, done: true });

    // ---- 3) Actes -> identificar porter de cada equip ----------------------
    send({ step: 3, msg: "Analitzant actes per identificar el porter de cada equip…" });

    const teamGkResults = [];

    await Promise.all(
      teams.map(async (team, idx) => {
        const sample = sampleArray(team.actaLinks, SAMPLE_SIZE);
        const gkStats = new Map(); // name -> {count, url, cleanSheets, sampled}

        await Promise.all(
          sample.map(async (actaUrl) => {
            try {
              const r = await limit(() => parseActaForGoalkeeper(actaUrl, team.name));
              if (!r || !r.gk || !r.gk.name) return;
              const key = r.gk.name;
              if (!gkStats.has(key)) {
                gkStats.set(key, { count: 0, url: r.gk.url, cleanSheets: 0, sampled: 0 });
              }
              const s = gkStats.get(key);
              s.count += 1;
              s.sampled += 1;
              if (r.conceded === 0) s.cleanSheets += 1;
            } catch {
              // ignorem actes que no es poden llegir
            }
          })
        );

        send({
          step: 3,
          msg: `Actes ${idx + 1}/${teams.length}: ${team.name} (${sample.length} analitzades)`
        });

        if (gkStats.size === 0) return;

        // Triem el porter que més vegades apareix com a titular
        const [gkName, gkData] = [...gkStats.entries()].sort(
          (a, b) => b[1].count - a[1].count
        )[0];

        teamGkResults.push({
          team: team.name,
          badge: team.badge,
          teamJ: team.J,
          teamGC: team.GC,
          teamGF: team.GF,
          gkName,
          gkUrl: gkData.url,
          sampleSize: gkData.sampled,
          cleanSheetRate: gkData.sampled ? gkData.cleanSheets / gkData.sampled : 0
        });
      })
    );

    send({ step: 3, done: true });

    // ---- 4) Fitxes dels porters ------------------------------------------
    send({ step: 4, msg: 'Consultant la fitxa de cada porter (partits jugats / titular)…' });

    await Promise.all(
      teamGkResults.map(async (r, idx) => {
        let fitxa = { totalJornades: r.teamJ, convocat: 0, titular: 0, suplent: 0, jugats: 0 };
        if (r.gkUrl) {
          try {
            fitxa = await limit(() => getFitxaStats(r.gkUrl));
          } catch {
            // mantenim valors per defecte
          }
        }
        r.fitxa = fitxa;
        send({
          step: 4,
          msg: `Fitxa ${idx + 1}/${teamGkResults.length}: ${r.gkName}`
        });
      })
    );

    send({ step: 4, done: true });

    // ---- 5) Rànquing -------------------------------------------------------
    send({ step: 5, msg: 'Calculant el rànquing final…' });

    const ranking = teamGkResults
      .map((r) => {
        const score = computeGkScore({
          teamGC: r.teamGC,
          teamJ: r.teamJ,
          cleanSheetRate: r.cleanSheetRate,
          fitxa: r.fitxa
        });
        return {
          porter: r.gkName,
          porterUrl: r.gkUrl,
          equip: r.team,
          escut: r.badge,
          golsContra: r.teamGC,
          partitsEquip: r.teamJ,
          golsContraPartit: score.gcPerGame,
          porteriaZeroMostra: Math.round((r.cleanSheetRate || 0) * 100),
          mostraPartits: r.sampleSize,
          jugats: r.fitxa?.jugats || 0,
          titular: r.fitxa?.titular || 0,
          jornadesTotals: r.fitxa?.totalJornades || r.teamJ,
          puntuacio: score.total,
          desglossament: score.breakdown
        };
      })
      .sort((a, b) => b.puntuacio - a.puntuacio)
      .slice(0, 20)
      .map((r, i) => ({ ...r, posicio: i + 1 }));

    cache.set(url, { ts: Date.now(), results: ranking });

    send({ step: 5, done: true });
    send({ type: 'done', results: ranking });
  } catch (err) {
    send({ type: 'error', message: err.message || 'Error desconegut' });
  }

  res.end();
}
