# 🧤 FCF Porters · Top 20

Web app que genera el rànquing dels **20 millors porters** d'una lliga de la
Federació Catalana de Futbol (fcf.cat), seguint el mateix estil i stack que
[fcf-top50](https://fcf-top50.vercel.app/) i [fcf-stats](https://fcf-stats.vercel.app/).

## Com funciona

1. **Classificació**: es llegeix la taula de classificació de la lliga (equips,
   gols a favor i en contra, partits jugats).
2. **Calendaris**: per a cada equip s'obté el calendari complet amb els enllaços
   a totes les actes de la temporada.
3. **Actes**: s'analitza una mostra d'actes repartides al llarg de la temporada
   per identificar el jugador amb dorsal **1** (porter titular) i comprovar en
   quants d'aquests partits l'equip ha acabat amb la porteria a zero.
4. **Fitxes**: es consulta la fitxa individual de cada porter per saber quants
   partits ha jugat i com a titular durant tota la temporada.
5. **Rànquing**: es combinen totes les dades en una puntuació sobre 100 i es
   mostren els 20 porters amb millor puntuació.

## Puntuació (sobre 100)

| Component | Pes | Descripció |
|---|---|---|
| Defensa de l'equip | 40 pts | Com menys gols encaixats per partit, més punts |
| % Porteria a 0 | 30 pts | % de la mostra d'actes amb l'equip imbatut |
| Participació | 20 pts | Partits jugats pel porter / jornades totals |
| Titularitat | 10 pts | Partits com a titular / partits jugats |

## Desenvolupament local

```bash
npm install
npm run dev
```

Obre [http://localhost:3000](http://localhost:3000) i enganxa una URL de
classificació de fcf.cat, per exemple:

```
https://www.fcf.cat/classificacio/2526/futbol-11/segona-catalana/grup-1
```

## Desplegament

Aquest projecte està pensat per desplegar-se a [Vercel](https://vercel.com)
sense configuració addicional (`vercel.json` ja allarga el timeout de la
funció de scraping a 60 segons).

```bash
npm i -g vercel
vercel
```

## Notes

- La identificació del porter es basa en el dorsal **1** de l'alineació
  titular de cada acta (el criteri habitual a fcf.cat).
- Per mantenir l'anàlisi ràpida (límit de temps de les funcions serverless),
  només s'analitzen fins a 4 actes per equip, repartides al llarg de la
  temporada.
- Els resultats es guarden en una caché en memòria de 24h mentre la funció
  serverless estigui "calenta".
