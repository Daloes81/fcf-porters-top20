import * as cheerio from 'cheerio';
import { fetchHtml, abs, normName } from './fetcher';

// ---------------------------------------------------------------------------
// 1) CLASSIFICACIÓ -> llista d'equips amb GF/GC/J i URL al calendari de l'equip
// ---------------------------------------------------------------------------
export async function getClassification(url) {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  let table = null;
  $('table').each((_, t) => {
    const allText = $(t).text();
    if (allText.includes('Coeficient') && $(t).find('tr').length > 3) {
      table = t;
    }
  });

  if (!table) {
    throw new Error(
      "No s'ha trobat la taula de classificació. Comprova que la URL sigui una pàgina de classificació de fcf.cat."
    );
  }

  const teams = [];

  $(table)
    .find('tr')
    .each((i, tr) => {
      if (i === 0) return; // capçalera
      const tds = $(tr).find('td');
      if (tds.length < 22) return;

      const links = $(tr).find('a');
      if (links.length < 2) return;

      // La fila té 3 enllaços: 0) escut -> /equip/..., 1) nom -> calendari-equip
      // curt, 2) nom -> calendari-equip amb el path complet (esport/competicio/grup).
      // Ens quedem amb el path complet si existeix.
      const linkIdx = links.length >= 3 ? 2 : 1;
      let teamHref = $(links[linkIdx]).attr('href');
      let teamName = $(links[linkIdx]).text().trim() || $(links[1]).text().trim();

      if (!teamHref || !teamName) return;

      const badgeImg = $(tr).find('img').first().attr('src');

      const J = parseInt($(tds[7]).text().trim(), 10) || 0;
      const GF = parseInt($(tds[20]).text().trim(), 10) || 0;
      const GC = parseInt($(tds[21]).text().trim(), 10) || 0;

      if (J === 0) return;

      teams.push({
        pos: i,
        name: teamName,
        calendarUrl: abs(teamHref),
        badge: abs(badgeImg),
        J,
        GF,
        GC
      });
    });

  if (teams.length === 0) {
    throw new Error("No s'han pogut llegir els equips de la classificació.");
  }

  return teams;
}

// ---------------------------------------------------------------------------
// 2) CALENDARI D'EQUIP -> llista d'URLs d'actes
// ---------------------------------------------------------------------------
export async function getActaLinks(calendarUrl) {
  const html = await fetchHtml(calendarUrl);
  const $ = cheerio.load(html);
  const links = new Set();

  $('a[href*="/acta/"]').each((_, a) => {
    const href = $(a).attr('href');
    const u = abs(href);
    if (u) links.add(u);
  });

  return Array.from(links);
}

// ---------------------------------------------------------------------------
// 3) ACTA -> identifica el porter titular (dorsal 1) de l'equip i si va
//    encaixar gols (per calcular el % de partits a 0)
// ---------------------------------------------------------------------------
export async function parseActaForGoalkeeper(actaUrl, teamName) {
  const html = await fetchHtml(actaUrl);
  const $ = cheerio.load(html);

  // Equips (local i visitant) segons els enllaços a /equip/
  const equipNames = [];
  $('a[href*="/equip/"]').each((_, a) => {
    const t = $(a).text().trim();
    if (t) equipNames.push(t);
  });
  const uniqueTeams = [...new Set(equipNames)];
  if (uniqueTeams.length < 2) return null;

  const target = normName(teamName);
  let isHome = normName(uniqueTeams[0]) === target;
  let isAway = normName(uniqueTeams[1]) === target;

  if (!isHome && !isAway) {
    // fallback: comparació parcial
    isHome = normName(uniqueTeams[0]).includes(target) || target.includes(normName(uniqueTeams[0]));
    isAway = !isHome;
  }

  // Resultat (X - Y) per saber si l'equip ha encaixat gols.
  // Es busca un element "fulla" (sense fills) amb el text exacte "N - N".
  let conceded = null;
  $('span, div, td, p, strong, b').each((_, el) => {
    if (conceded !== null) return;
    if ($(el).children().length > 0) return;
    const t = $(el).text().trim();
    const m = t.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      const homeGoals = parseInt(m[1], 10);
      const awayGoals = parseInt(m[2], 10);
      conceded = isHome ? awayGoals : homeGoals;
    }
  });

  // Taules "Titulars": la 1a correspon a l'equip local, la 2a al visitant
  const titularTables = [];
  $('table').each((_, t) => {
    const headTxt = $(t).find('tr').first().text();
    if (headTxt.includes('Titular')) titularTables.push(t);
  });

  const tableIndex = isHome ? 0 : 1;
  const table = titularTables[tableIndex];
  if (!table) return { gk: null, conceded };

  // Recollim cada titular amb el seu dorsal, nom, enllaç a la fitxa i el color
  // de samarreta (el porter sol vestir un color diferent de la resta de l'equip).
  const rows = [];
  $(table)
    .find('tr')
    .each((i, tr) => {
      if (i === 0) return;
      const tds = $(tr).find('td');
      if (tds.length < 2) return;
      const dorsal = $(tds[0]).text().trim();
      if (!dorsal) return;
      const span = $(tds[0]).find('span.faf-base').first();
      const style = span.attr('style') || '';
      const colorMatch = style.match(/color:\s*([^;]+)/i);
      const color = colorMatch ? colorMatch[1].trim().toLowerCase() : null;
      const a = $(tds[1]).find('a').first();
      const name = a.text().trim() || $(tds[1]).text().trim();
      rows.push({ dorsal, name, url: abs(a.attr('href')), color });
    });

  // Identificació del porter:
  // 1) Dorsal 1 (el més habitual)
  // 2) Color de samarreta diferent de la resta de l'equip (el porter sol
  //    vestir un color "minoritari" respecte als jugadors de camp).
  let gkRow = rows.find((r) => r.dorsal === '1');

  if (!gkRow) {
    const counts = new Map();
    rows.forEach((r) => {
      if (r.color) counts.set(r.color, (counts.get(r.color) || 0) + 1);
    });
    if (counts.size > 1) {
      const sorted = [...counts.entries()].sort((a, b) => a[1] - b[1]);
      const [minorColor, minorCount] = sorted[0];
      const [, majorCount] = sorted[sorted.length - 1];
      if (minorCount < majorCount) {
        gkRow = rows.find((r) => r.color === minorColor);
      }
    }
  }

  // Últim recurs: dorsal 13 (suplent habitual del porter) si res més ha funcionat.
  if (!gkRow) {
    gkRow = rows.find((r) => r.dorsal === '13');
  }

  const gk = gkRow ? { name: gkRow.name, url: gkRow.url, dorsal: gkRow.dorsal } : null;

  return { gk, conceded };
}

// ---------------------------------------------------------------------------
// 4) FITXA DEL JUGADOR -> partits convocat / titular / suplent / jugats
// ---------------------------------------------------------------------------
export async function getFitxaStats(fitxaUrl) {
  const html = await fetchHtml(fitxaUrl);
  const $ = cheerio.load(html);
  const text = $('body').text().replace(/\s+/g, ' ');

  const jornadaMatch = text.match(/jornada\s*(\d+)/i);
  const totalJornades = jornadaMatch ? parseInt(jornadaMatch[1], 10) : null;

  const get = (label) => {
    const re = new RegExp('(\\d+)\\s*' + label, 'i');
    const m = text.match(re);
    return m ? parseInt(m[1], 10) : 0;
  };

  return {
    totalJornades,
    convocat: get('Convocat'),
    titular: get('Titular'),
    suplent: get('Suplent'),
    jugats: get('Jugats')
  };
}
