/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Match } from './types';

// Constants for English Premier League teams and their strengths (representing 23/24 season profiles)
interface TeamProfile {
  name: string;
  att: number; // Attack potential
  def: number; // Defense vulnerability (lower is better defense)
}

const EPL_PROFILES: TeamProfile[] = [
  { name: 'Man City', att: 1.5, def: 0.8 },
  { name: 'Arsenal', att: 1.4, def: 0.7 },
  { name: 'Liverpool', att: 1.4, def: 0.9 },
  { name: 'Aston Villa', att: 1.2, def: 1.0 },
  { name: 'Tottenham', att: 1.3, def: 1.1 },
  { name: 'Chelsea', att: 1.1, def: 1.1 },
  { name: 'Newcastle', att: 1.2, def: 1.1 },
  { name: 'Man United', att: 0.9, def: 1.1 },
  { name: 'West Ham', att: 1.0, def: 1.2 },
  { name: 'Crystal Palace', att: 0.9, def: 1.1 },
  { name: 'Brighton', att: 1.1, def: 1.2 },
  { name: 'Bournemouth', att: 1.0, def: 1.2 },
  { name: 'Fulham', att: 0.9, def: 1.1 },
  { name: 'Wolves', att: 0.8, def: 1.2 },
  { name: 'Everton', att: 0.7, def: 1.0 },
  { name: 'Brentford', att: 1.0, def: 1.2 },
  { name: 'Nottingham Forest', att: 0.8, def: 1.3 },
  { name: 'Luton', att: 0.8, def: 1.5 },
  { name: 'Burnley', att: 0.7, def: 1.5 },
  { name: 'Sheffield United', att: 0.6, def: 1.7 }
];

const SERIE_A_PROFILES: TeamProfile[] = [
  { name: 'Inter Milan', att: 1.4, def: 0.6 },
  { name: 'AC Milan', att: 1.1, def: 0.9 },
  { name: 'Juventus', att: 0.9, def: 0.7 },
  { name: 'Atalanta', att: 1.2, def: 0.9 },
  { name: 'AS Roma', att: 1.0, def: 1.0 },
  { name: 'Lazio', att: 0.9, def: 1.0 },
  { name: 'Fiorentina', att: 1.0, def: 1.1 },
  { name: 'Napoli', att: 1.1, def: 1.1 },
  { name: 'Torino', att: 0.7, def: 0.8 },
  { name: 'Genoa', att: 0.7, def: 0.9 },
  { name: 'Monza', att: 0.7, def: 1.0 },
  { name: 'Bologna', att: 0.9, def: 0.8 },
  { name: 'Lecce', att: 0.6, def: 1.1 },
  { name: 'Udinese', att: 0.7, def: 1.1 },
  { name: 'Verona', att: 0.6, def: 1.1 },
  { name: 'Cagliari', att: 0.7, def: 1.2 },
  { name: 'Empoli', att: 0.5, def: 1.2 },
  { name: 'Frosinone', att: 0.8, def: 1.4 },
  { name: 'Sassuolo', att: 0.9, def: 1.5 },
  { name: 'Salernitana', att: 0.6, def: 1.6 }
];

// Simple deterministic random generator based on a string seed to keep games identical
class SeededRandom {
  private m = 0x80000000; // 2**31
  private a = 1103515245;
  private c = 12345;
  private state: number;

  constructor(seed: number) {
    this.state = seed ? seed : Math.floor(Math.random() * (this.m - 1));
  }

  // returns 0..1
  public next(): number {
    this.state = (this.a * this.state + this.c) % this.m;
    return this.state / (this.m - 1);
  }

  // Poisson sampler
  public nextPoisson(lambda: number): number {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1.0;
    do {
      k++;
      p *= this.next();
    } while (p > L && k < 15);
    return k - 1;
  }
}

// Factorials precalculated up to MAX_G = 15
const FACTORIALS = [
  1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800, 
  39916800, 479001600, 6227020800, 87178291200, 1307674368000
];

function p_poisson(k: number, lambda: number): number {
  if (k > 15) return 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / FACTORIALS[k];
}

export function generateDemoMatches(league: 'EPL' | 'SERIE_A' = 'EPL'): Match[] {
  const profiles = league === 'EPL' ? EPL_PROFILES : SERIE_A_PROFILES;
  const leagueName = league === 'EPL' ? 'EPL' : 'SerieA';
  const nTeams = profiles.length;

  // Schedule round-robin (38 matchdays)
  // standard circle method to schedule round robin
  const rounds: { home: string; away: string }[][] = [];
  const list = [...profiles];

  for (let r = 0; r < (nTeams - 1) * 2; r++) {
    const roundMatches: { home: string; away: string }[] = [];
    const isSecondHalf = r >= (nTeams - 1);
    const activeRound = r % (nTeams - 1);

    for (let i = 0; i < nTeams / 2; i++) {
      const homeIdx = (activeRound + i) % (nTeams - 1);
      let awayIdx = (nTeams - 1 - i + activeRound) % (nTeams - 1);
      
      if (i === 0) awayIdx = nTeams - 1;

      const home = list[homeIdx].name;
      const away = list[awayIdx].name;

      // Swap home and away and schedule
      if (isSecondHalf) {
        roundMatches.push({ home: away, away: home });
      } else {
        roundMatches.push({ home, away });
      }
    }
    rounds.push(roundMatches);
  }

  // Schedule dates from August 11, 2023 to May 19, 2024
  const startDate = new Date('2023-08-11');
  const matches: Match[] = [];
  const rand = new SeededRandom(league === 'EPL' ? 33 : 333);

  // Set league constants
  const homeAdv = league === 'EPL' ? 0.35 : 0.25; // Home advantage bias

  for (let r = 0; r < rounds.length; r++) {
    const weekOffset = r * 7;
    const matchdayMatches = rounds[r];

    for (let i = 0; i < matchdayMatches.length; i++) {
      const pair = matchdayMatches[i];
      const hProfile = profiles.find(p => p.name === pair.home)!;
      const aProfile = profiles.find(p => p.name === pair.away)!;

      // Poisson parameters lambda_home and lambda_away
      const lam_h = Math.exp(homeAdv + hProfile.att - aProfile.def);
      const lam_a = Math.exp(aProfile.att - hProfile.def);

      // Add a little random variance to lambda to represent hot/cold streaks or injuries
      const hStreak = 0.9 + rand.next() * 0.2;
      const aStreak = 0.9 + rand.next() * 0.2;
      
      const true_lam_h = lam_h * hStreak;
      const true_lam_a = lam_a * aStreak;

      // Generate actual score
      const fthg = rand.nextPoisson(true_lam_h);
      const ftag = rand.nextPoisson(true_lam_a);

      // Generate xG with a small random deviation from the rating expectation
      const hxg = Math.min(Math.max((true_lam_h * 0.8) + (rand.next() * 0.6), 0.1), 5.0);
      const axg = Math.min(Math.max((true_lam_a * 0.8) + (rand.next() * 0.6), 0.1), 5.0);

      // Date allocation: spread across Saturday(+1), Sunday(+2), Monday(+3)
      const dayDelay = i % 4; // Spread matches
      const gameDate = new Date(startDate.getTime() + (weekOffset + dayDelay) * 24 * 60 * 60 * 1000);
      const dateStr = gameDate.toISOString().slice(0, 10);

      // Generate Odds based on the underlying LAMBDAS + 5% bookmaker overround
      // Solve exact Dixon-Coles-Poisson grid to get fair odds probabilities
      const [t_h, t_d, t_a] = getTrueProbabilities(true_lam_h, true_lam_a);
      
      const overround = 1.05; // 5% overround
      const b365H = Math.min(Math.max(1.01 / (t_h * overround), 1.02), 50.0);
      const b365D = Math.min(Math.max(1.01 / (t_d * overround), 1.02), 50.0);
      const b365A = Math.min(Math.max(1.01 / (t_a * overround), 1.02), 50.0);

      // Let closing odds random walk a tiny bit away from opening odds (resembling market news)
      const driftH = 0.97 + rand.next() * 0.06;
      const driftA = 0.97 + rand.next() * 0.06;
      
      const b365H_close = Math.min(Math.max(b365H * driftH, 1.01), 50.0);
      const b365A_close = Math.min(Math.max(b365A * driftA, 1.01), 50.0);
      const b365D_close = b365D; // simplify draw closing odds

      matches.push({
        Date: dateStr,
        HomeTeam: pair.home,
        AwayTeam: pair.away,
        FTHG: fthg,
        FTAG: ftag,
        HxG: hxg,
        AxG: axg,
        B365H: parseFloat(b365H.toFixed(2)),
        B365D: parseFloat(b365D.toFixed(2)),
        B365A: parseFloat(b365A.toFixed(2)),
        B365H_close: parseFloat(b365H_close.toFixed(2)),
        B365D_close: parseFloat(b365D_close.toFixed(2)),
        B365A_close: parseFloat(b365A_close.toFixed(2)),
        league: leagueName
      });
    }
  }

  // Sort chronologically
  matches.sort((a, b) => new Date(a.Date).getTime() - new Date(b.Date).getTime());
  return matches;
}

// Basic Dixon-Coles layout calculator to determine odds
function getTrueProbabilities(lam_h: number, lam_a: number): [number, number, number] {
  const MAX_G = 12;
  const ph: number[] = [];
  const pa: number[] = [];
  const rho = -0.06; // low-scoring association parameter

  for (let g = 0; g <= MAX_G; g++) {
    ph.push(p_poisson(g, lam_h));
    pa.push(p_poisson(g, lam_a));
  }

  const M: number[][] = Array(MAX_G + 1).fill(0).map(() => Array(MAX_G + 1).fill(0));
  let sum = 0;

  for (let h = 0; h <= MAX_G; h++) {
    for (let a = 0; a <= MAX_G; a++) {
      let cell = ph[h] * pa[a];
      if (h === 0 && a === 0) cell *= (1 - lam_h * lam_a * rho);
      else if (h === 1 && a === 0) cell *= (1 + lam_h * rho);
      else if (h === 0 && a === 1) cell *= (1 + lam_a * rho);
      else if (h === 1 && a === 1) cell *= (1 - rho);
      M[h][a] = Math.max(cell, 0);
      sum += M[h][a];
    }
  }

  let p_h = 0;
  let p_d = 0;
  let p_a = 0;

  for (let h = 0; h <= MAX_G; h++) {
    for (let a = 0; a <= MAX_G; a++) {
      const val = M[h][a] / sum;
      if (h > a) p_h += val;
      else if (h === a) p_d += val;
      else p_a += val;
    }
  }

  return [p_h, p_d, p_a];
}
