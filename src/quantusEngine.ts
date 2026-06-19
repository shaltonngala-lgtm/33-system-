/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Match, ProcessedMatch, TeamRating, Bet, BankrollPoint, CalibrationBin, BacktestSummary, SimulationConfig } from './types';

// Factorials precalculated up to MAX_G = 15
const FACTORIALS = [
  1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800, 
  39916800, 479001600, 6227020800, 87178291200, 1307674368000
];

function p_poisson(k: number, lambda: number): number {
  if (k > 15) return 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / FACTORIALS[k];
}

// Dixon-Coles adjustments for soccer match probabilities
export function dcProbabilities(lam_h: number, lam_a: number, rho: number): [number, number, number] {
  const MAX_G = 15;
  const ph: number[] = [];
  const pa: number[] = [];
  
  for (let g = 0; g <= MAX_G; g++) {
    ph.push(p_poisson(g, lam_h));
    pa.push(p_poisson(g, lam_a));
  }

  // Create probability grid
  const M: number[][] = Array(MAX_G + 1).fill(0).map(() => Array(MAX_G + 1).fill(0));
  for (let h = 0; h <= MAX_G; h++) {
    for (let a = 0; a <= MAX_G; a++) {
      let cell = ph[h] * pa[a];
      
      // Dixon-Coles adjustment
      if (h === 0 && a === 0) cell *= (1 - lam_h * lam_a * rho);
      else if (h === 1 && a === 0) cell *= (1 + lam_h * rho);
      else if (h === 0 && a === 1) cell *= (1 + lam_a * rho);
      else if (h === 1 && a === 1) cell *= (1 - rho);
      
      M[h][a] = Math.max(cell, 0);
    }
  }

  // Normalize grid
  let sum = 0;
  for (let h = 0; h <= MAX_G; h++) {
    for (let a = 0; a <= MAX_G; a++) {
      sum += M[h][a];
    }
  }
  if (sum > 0) {
    for (let h = 0; h <= MAX_G; h++) {
      for (let a = 0; a <= MAX_G; a++) {
        M[h][a] /= sum;
      }
    }
  }

  // Sum categories
  let p_h = 0;
  let p_d = 0;
  let p_a = 0;

  for (let h = 0; h <= MAX_G; h++) {
    for (let a = 0; a <= MAX_G; a++) {
      if (h > a) p_h += M[h][a];
      else if (h === a) p_d += M[h][a];
      else p_a += M[h][a];
    }
  }

  // Distribute rest (if any)
  const tail = 1.0 - (p_h + p_d + p_a);
  p_h += tail / 3;
  p_d += tail / 3;
  p_a += tail / 3;

  return [p_h, p_d, p_a];
}

// Hierarchical Bayesian Poisson Ratings
export class BayesianPoissonRatings {
  public att: { [team: string]: number } = {};
  public def: { [team: string]: number } = {};
  public attVar: { [team: string]: number } = {};
  public defVar: { [team: string]: number } = {};
  public matches: { [team: string]: number } = {};
  public homeAdv: { [league: string]: number } = {};
  
  public leagueAtt: { [league: string]: number } = {};
  public leagueDef: { [league: string]: number } = {};
  public teamLeague: { [team: string]: string } = {};

  constructor() {}

  public addTeam(team: string, league: string) {
    if (this.att[team] === undefined) {
      const priorAtt = this.leagueAtt[league] || 0.0;
      const priorDef = this.leagueDef[league] || 0.0;
      
      this.att[team] = priorAtt;
      this.def[team] = priorDef;
      this.attVar[team] = 1.0;
      this.defVar[team] = 1.0;
      this.matches[team] = 0;
    }
    if (this.homeAdv[league] === undefined) {
      this.homeAdv[league] = 0.3;
    }
    this.teamLeague[team] = league;
  }

  public predict(home: string, away: string, league: string): [number, number] {
    const ha = this.homeAdv[league] !== undefined ? this.homeAdv[league] : 0.3;
    const homeAtt = this.att[home] !== undefined ? this.att[home] : 0.0;
    const awayDef = this.def[away] !== undefined ? this.def[away] : 0.0;
    const awayAtt = this.att[away] !== undefined ? this.att[away] : 0.0;
    const homeDef = this.def[home] !== undefined ? this.def[home] : 0.0;

    const lam_h = Math.exp(ha + homeAtt - awayDef);
    const lam_a = Math.exp(awayAtt - homeDef);
    return [Math.max(lam_h, 0.1), Math.max(lam_a, 0.1)];
  }

  public update(home: string, away: string, league: string, goals_h: number, goals_a: number, xg_h: number, xg_a: number) {
    const [lam_h, lam_a] = this.predict(home, away, league);
    
    // Outcome blends actual goals and expected goals
    const obs_h = 0.6 * goals_h + 0.4 * xg_h;
    const obs_a = 0.6 * goals_a + 0.4 * xg_a;

    // Update Home Attack and Away Defense
    this._updateParam(home, 'att', lam_h, obs_h, 1);
    this._updateParam(away, 'def', lam_h, obs_h, -1);
    
    // Update Away Attack and Home Defense
    this._updateParam(away, 'att', lam_a, obs_a, 1);
    this._updateParam(home, 'def', lam_a, obs_a, -1);

    this.matches[home] = (this.matches[home] || 0) + 1;
    this.matches[away] = (this.matches[away] || 0) + 1;

    if ((this.matches[home] + this.matches[away]) % 50 === 0) {
      this._updateLeaguePrior(league);
    }

    this._shrink(home, league);
    this._shrink(away, league);

    // Drifting home advantage
    const goalDiff = goals_h - goals_a;
    const expectedDiff = lam_h - lam_a;
    this.homeAdv[league] = (this.homeAdv[league] || 0.3) + 0.001 * (goalDiff - expectedDiff);
    this.homeAdv[league] = Math.min(Math.max(this.homeAdv[league], 0.0), 0.8);
  }

  private _updateParam(team: string, param: 'att' | 'def', lam: number, obs: number, sign: number) {
    const d = param === 'att' ? this.att : this.def;
    const v = param === 'att' ? this.attVar : this.defVar;
    
    const varVal = v[team] !== undefined ? v[team] : 1.0;
    const obs_var = Math.max(lam, 0.1);
    const gain = varVal / (varVal + obs_var);
    const error = (obs - lam) * sign;
    
    d[team] = (d[team] || 0.0) + gain * error;
    v[team] = Math.max(varVal * (1.0 - gain), 0.01);
  }

  private _shrink(team: string, league: string, strength = 5.0) {
    const n = this.matches[team] || 0;
    if (n === 0) return;
    
    const priorAtt = this.leagueAtt[league] || 0.0;
    const priorDef = this.leagueDef[league] || 0.0;
    
    const w = strength / (n + strength);
    
    this.att[team] = (1.0 - w) * (this.att[team] || 0.0) + w * priorAtt;
    this.def[team] = (1.0 - w) * (this.def[team] || 0.0) + w * priorDef;
  }

  private _updateLeaguePrior(league: string) {
    const teams = Object.keys(this.att).filter(
      t => this.teamLeague[t] === league && (this.matches[t] || 0) > 5
    );
    
    if (teams.length > 0) {
      let sumAtt = 0;
      let sumDef = 0;
      for (const t of teams) {
        sumAtt += this.att[t] || 0;
        sumDef += this.def[t] || 0;
      }
      this.leagueAtt[league] = sumAtt / teams.length;
      this.leagueDef[league] = sumDef / teams.length;
    }
  }

  public getRatings(): TeamRating[] {
    return Object.keys(this.att).map(team => ({
      team,
      league: this.teamLeague[team] || 'default',
      attack: this.att[team] || 0,
      defense: this.def[team] || 0,
      attackVar: this.attVar[team] || 1,
      defenseVar: this.defVar[team] || 1,
      matches: this.matches[team] || 0
    }));
  }
}

// Clean TypeScript Isotonic Calibrator using PAVA (Pool Adjacent Violators Algorithm)
export class IsotonicCalibrator {
  private blocks: { val: number; count: number; xMin: number; xMax: number }[] = [];

  constructor() {}

  public fit(X: number[], y: number[]): IsotonicCalibrator {
    if (X.length === 0) return this;
    
    // Pair features and targets and sort by feature ascending
    const pairs = X.map((x, i) => ({ x, y: y[i] }));
    pairs.sort((a, b) => a.x - b.x);

    // Initialize blocks with size 1
    const initialBlocks = pairs.map(p => ({
      val: p.y,
      count: 1,
      xMin: p.x,
      xMax: p.x
    }));

    // Pool adjacent violations
    const blocks = [...initialBlocks];
    let i = 0;
    while (i < blocks.length - 1) {
      if (blocks[i].val > blocks[i + 1].val) {
        // Merge blocks i and i+1
        const b1 = blocks[i];
        const b2 = blocks[i + 1];
        
        const totalCount = b1.count + b2.count;
        const averageValue = (b1.val * b1.count + b2.val * b2.count) / totalCount;
        
        blocks[i] = {
          val: averageValue,
          count: totalCount,
          xMin: b1.xMin,
          xMax: b2.xMax
        };
        
        blocks.splice(i + 1, 1);
        
        // Walk back to resolve previous monotonicity violations
        if (i > 0) {
          i--;
        }
      } else {
        i++;
      }
    }

    this.blocks = blocks;
    return this;
  }

  public transform(x: number): number {
    if (this.blocks.length === 0) return x;
    
    // Bounds cases
    if (x <= this.blocks[0].xMin) return this.blocks[0].val;
    if (x >= this.blocks[this.blocks.length - 1].xMax) return this.blocks[this.blocks.length - 1].val;

    // Binary search for matching block
    let low = 0;
    let high = this.blocks.length - 1;
    
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const b = this.blocks[mid];
      
      if (x >= b.xMin && x <= b.xMax) {
        return b.val;
      } else if (x < b.xMin) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    // Linear interpolation if between blocks
    const leftBlock = this.blocks[high];
    const rightBlock = this.blocks[low];
    
    if (leftBlock && rightBlock) {
      const denom = rightBlock.xMin - leftBlock.xMax;
      if (denom === 0) return (leftBlock.val + rightBlock.val) / 2;
      
      const t = (x - leftBlock.xMax) / denom;
      return leftBlock.val + t * (rightBlock.val - leftBlock.val);
    }

    return x;
  }
}

// Simple and stable Multivariate Ridge Regressor trained via Iterative Gradient Descent.
// Replaces Python's LightGBM Regressor in a lightweight, high-performance client-side format!
export class RidgeRegressor {
  private weights: number[] = [];
  private bias = 0;
  private mean: number[] = [];
  private std: number[] = [];

  constructor() {}

  public fit(X: number[][], y: number[], l2 = 0.1, lr = 0.01, epochs = 150): RidgeRegressor {
    if (X.length === 0 || X[0].length === 0) return this;
    const nSamples = X.length;
    const nFeatures = X[0].length;

    // Standardize features
    this.mean = Array(nFeatures).fill(0);
    this.std = Array(nFeatures).fill(0);

    for (let f = 0; f < nFeatures; f++) {
      let sum = 0;
      for (let s = 0; s < nSamples; s++) sum += X[s][f];
      this.mean[f] = sum / nSamples;
      
      let sumSq = 0;
      for (let s = 0; s < nSamples; s++) sumSq += Math.pow(X[s][f] - this.mean[f], 2);
      this.std[f] = Math.sqrt(sumSq / nSamples) || 1.0; // avoid div by zero
    }

    const normX = X.map(row => row.map((val, f) => (val - this.mean[f]) / this.std[f]));

    // Gradient descent loop
    this.weights = Array(nFeatures).fill(0).map(() => Math.random() * 0.1);
    this.bias = Math.random() * 0.1;

    for (let epoch = 0; epoch < epochs; epoch++) {
      let dW = Array(nFeatures).fill(0);
      let dB = 0;

      for (let s = 0; s < nSamples; s++) {
        let pred = this.bias;
        for (let f = 0; f < nFeatures; f++) pred += this.weights[f] * normX[s][f];
        
        const error = pred - y[s];
        for (let f = 0; f < nFeatures; f++) {
          dW[f] += error * normX[s][f];
        }
        dB += error;
      }

      // Update parameters with regularisation
      for (let f = 0; f < nFeatures; f++) {
        this.weights[f] -= (lr / nSamples) * (dW[f] + l2 * this.weights[f]);
      }
      this.bias -= (lr / nSamples) * dB;
    }

    return this;
  }

  public predict(features: number[]): number {
    if (this.weights.length === 0) return 0;
    
    let score = this.bias;
    for (let f = 0; f < features.length; f++) {
      const normVal = (features[f] - this.mean[f]) / (this.std[f] || 1.0);
      score += this.weights[f] * normVal;
    }
    return score;
  }
}

// Normalise headers dynamically
export function parseCSVMatches(text: string): Match[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.replace(/["']/g, '').trim().toLowerCase());
  const headerMap: { [standardKey: string]: number } = {};

  // Find index mapping
  const synonyms: { [key: string]: string[] } = {
    Date: ['date'],
    HomeTeam: ['hometeam', 'home_team', 'home', 'h'],
    AwayTeam: ['awayteam', 'away_team', 'away', 'a'],
    FTHG: ['fthg', 'home_goals', 'home_score', 'fthg_home', 'hg'],
    FTAG: ['ftag', 'away_goals', 'away_score', 'ftag_away', 'ag'],
    HxG: ['hx', 'home_xg', 'hxg', 'homexg', 'home_expected_goals'],
    AxG: ['ax', 'away_xg', 'axg', 'awayxg', 'away_expected_goals'],
    B365H: ['b365h', 'bet365h', 'odds_home', 'odds_h', 'b365_h'],
    B365D: ['b365d', 'bet365d', 'odds_draw', 'odds_d', 'b365_d'],
    B365A: ['b365a', 'bet365a', 'odds_away', 'odds_a', 'b365_a'],
    B365H_close: ['b365h_close', 'b365h_c', 'cl_h', 'closing_odds_h', 'closing_b365_h'],
    B365D_close: ['b365d_close', 'b365d_c', 'cl_d', 'closing_odds_d', 'closing_b365_d'],
    B365A_close: ['b365a_close', 'b365a_c', 'cl_a', 'closing_odds_a', 'closing_b365_a'],
    league: ['league', 'division', 'competition', 'div']
  };

  for (const standardKey of Object.keys(synonyms)) {
    const list = synonyms[standardKey];
    for (let i = 0; i < headers.length; i++) {
      if (list.includes(headers[i])) {
        headerMap[standardKey] = i;
        break;
      }
    }
  }

  // Fallback map checks
  const requiredKeys = ['Date', 'HomeTeam', 'AwayTeam', 'FTHG', 'FTAG'];
  for (const r of requiredKeys) {
    if (headerMap[r] === undefined) {
      // Find case-insensitive literal matches as helper, or standard defaults
      const foundIdx = headers.findIndex(h => h.includes(r.toLowerCase()));
      if (foundIdx !== -1) {
        headerMap[r] = foundIdx;
      } else {
        throw new Error(`Critical missing column error: ${r}. Unable to parse results file correctly.`);
      }
    }
  }

  const results: Match[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.length < requiredKeys.length) continue;

    const val = (key: string): string => {
      const idx = headerMap[key];
      return idx !== undefined && cells[idx] !== undefined ? cells[idx].replace(/["']/g, '').trim() : '';
    };

    const dateVal = val('Date');
    if (!dateVal) continue;

    // Normalizing Date formats: DD/MM/YYYY vs YYYY-MM-DD
    let normalizedDate = dateVal;
    if (dateVal.includes('/') || dateVal.includes('-')) {
      const parts = dateVal.split(/[-\/]/);
      if (parts.length === 3) {
        // DD/MM/YYYY or YYYY-MM-DD
        if (parts[0].length === 4) {
          normalizedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        } else if (parts[2].length === 4) {
          // DD and MM are swapped sometimes, default DD/MM/YYYY
          normalizedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }
    }

    const homeTeam = val('HomeTeam');
    const awayTeam = val('AwayTeam');
    if (!homeTeam || !awayTeam) continue;

    const fthg = parseInt(val('FTHG')) || 0;
    const ftag = parseInt(val('FTAG')) || 0;

    const hxgVal = val('HxG');
    const axgVal = val('AxG');
    const hxg = hxgVal ? parseFloat(hxgVal) : undefined;
    const axg = axgVal ? parseFloat(axgVal) : undefined;

    const b365H = val('B365H') ? parseFloat(val('B365H')) : undefined;
    const b365D = val('B365D') ? parseFloat(val('B365D')) : undefined;
    const b365A = val('B365A') ? parseFloat(val('B365A')) : undefined;

    const b365H_c = val('B365H_close') ? parseFloat(val('B365H_close')) : b365H;
    const b365D_c = val('B365D_close') ? parseFloat(val('B365D_close')) : b365D;
    const b365A_c = val('B365A_close') ? parseFloat(val('B365A_close')) : b365A;

    const leagueName = val('league') || 'default';

    results.push({
      Date: normalizedDate,
      HomeTeam: homeTeam,
      AwayTeam: awayTeam,
      FTHG: fthg,
      FTAG: ftag,
      HxG: hxg,
      AxG: axg,
      B365H: b365H,
      B365D: b365D,
      B365A: b365A,
      B365H_close: b365H_c,
      B365D_close: b365D_c,
      B365A_close: b365A_c,
      league: leagueName
    });
  }

  // Sort chrono
  results.sort((a, b) => new Date(a.Date).getTime() - new Date(b.Date).getTime());
  return results;
}

// Handle commas inside quotes
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cell = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  result.push(cell);
  return result;
}

// Calculates standard evaluation scores
export function computeLogLoss(probs: [number, number, number][], actuals: number[]): number {
  if (probs.length === 0) return 0;
  let totalClassLoss = 0;
  for (let i = 0; i < probs.length; i++) {
    const actual = actuals[i];
    const selfProb = Math.min(Math.max(probs[i][actual], 1e-15), 1 - 1e-15);
    totalClassLoss += -Math.log(selfProb);
  }
  return totalClassLoss / probs.length;
}

export function computeBrierScore(probs: [number, number, number][], actuals: number[]): number {
  if (probs.length === 0) return 0;
  let sumSqErr = 0;
  for (let i = 0; i < probs.length; i++) {
    const actual = actuals[i];
    for (let c = 0; c < 3; c++) {
      const target = actual === c ? 1.0 : 0.0;
      sumSqErr += Math.pow(probs[i][c] - target, 2);
    }
  }
  // Brier Score is sum of squared differences divided by count of matches
  return sumSqErr / probs.length;
}

// Main walk forward backtest routine
export function runWalkForwardBacktest(
  rawData: Match[],
  config: SimulationConfig,
  onProgress?: (percent: number) => void
): BacktestSummary {
  const nMatches = rawData.length;
  if (nMatches < 20) {
    throw new Error('Not enough matches in CSV dataset to run walk-forward backtest (minimum 20 recommended).');
  }

  // Form proxy HxG/AxG if missing
  const matches = [...rawData];
  const homeRolling: { [team: string]: number[] } = {};
  const awayRolling: { [team: string]: number[] } = {};

  for (let i = 0; i < nMatches; i++) {
    const m = matches[i];
    
    if (m.HxG === undefined || isNaN(m.HxG)) {
      const teamHits = homeRolling[m.HomeTeam] || [];
      const avg = teamHits.length > 0 ? teamHits.reduce((a, b) => a + b, 0) / teamHits.length : m.FTHG;
      m.HxG = Math.min(Math.max(avg, 0.1), 5.0);
      
      if (!homeRolling[m.HomeTeam]) homeRolling[m.HomeTeam] = [];
      homeRolling[m.HomeTeam].push(m.FTHG);
      if (homeRolling[m.HomeTeam].length > 5) homeRolling[m.HomeTeam].shift();
    }
    
    if (m.AxG === undefined || isNaN(m.AxG)) {
      const teamHits = awayRolling[m.AwayTeam] || [];
      const avg = teamHits.length > 0 ? teamHits.reduce((a, b) => a + b, 0) / teamHits.length : m.FTAG;
      m.AxG = Math.min(Math.max(avg, 0.1), 5.0);
      
      if (!awayRolling[m.AwayTeam]) awayRolling[m.AwayTeam] = [];
      awayRolling[m.AwayTeam].push(m.FTAG);
      if (awayRolling[m.AwayTeam].length > 5) awayRolling[m.AwayTeam].shift();
    }
  }

  // Compute EWMA Features sequentially (pure past-only, no leaks)
  const featuresList: ProcessedMatch[] = [];
  const state: { [team: string]: { gs: number; gc: number; xgs: number; xgc: number; pts: number; lastDate?: string } } = {};
  const alpha = 0.3;

  for (let i = 0; i < nMatches; i++) {
    const m = matches[i];
    const h = m.HomeTeam;
    const a = m.AwayTeam;

    if (!state[h]) state[h] = { gs: 0, gc: 0, xgs: 0, xgc: 0, pts: 0 };
    if (!state[a]) state[a] = { gs: 0, gc: 0, xgs: 0, xgc: 0, pts: 0 };

    const hs = state[h];
    const as = state[a];

    const restHome = hs.lastDate ? Math.floor((new Date(m.Date).getTime() - new Date(hs.lastDate).getTime()) / (1000 * 60 * 60 * 24)) : 7;
    const restAway = as.lastDate ? Math.floor((new Date(m.Date).getTime() - new Date(as.lastDate).getTime()) / (1000 * 60 * 60 * 24)) : 7;
    
    const processed: ProcessedMatch = {
      ...m,
      home_gs_ewma: hs.gs,
      home_gc_ewma: hs.gc,
      away_gs_ewma: as.gs,
      away_gc_ewma: as.gc,
      home_xg_ewma: hs.xgs,
      away_xg_ewma: as.xgs,
      home_xga_ewma: hs.xgc,
      away_xga_ewma: as.xgc,
      home_pts_ewma: hs.pts,
      away_pts_ewma: as.pts,
      rest_diff: restHome - restAway,
      
      pred_lam_h: 1.0,
      pred_lam_a: 1.0,
      prob_h: 0.33,
      prob_d: 0.33,
      prob_a: 0.33,
      cal_prob_h: 0.33,
      cal_prob_d: 0.33,
      cal_prob_a: 0.33
    };

    // Fair probabilities from bookies
    if (processed.B365H && processed.B365D && processed.B365A) {
      const overround = 1.0 / processed.B365H + 1.0 / processed.B365D + 1.0 / processed.B365A;
      processed.fair_h = (1.0 / processed.B365H) / overround;
      processed.fair_d = (1.0 / processed.B365D) / overround;
      processed.fair_a = (1.0 / processed.B365A) / overround;
    }

    featuresList.push(processed);

    // Update states back propagation
    hs.gs = alpha * m.FTHG + (1 - alpha) * hs.gs;
    hs.gc = alpha * m.FTAG + (1 - alpha) * hs.gc;
    as.gs = alpha * m.FTAG + (1 - alpha) * as.gs;
    as.gc = alpha * m.FTHG + (1 - alpha) * as.gc;
    
    hs.xgs = alpha * (m.HxG || 0) + (1 - alpha) * hs.xgs;
    hs.xgc = alpha * (m.AxG || 0) + (1 - alpha) * hs.xgc;
    as.xgs = alpha * (m.AxG || 0) + (1 - alpha) * as.xgs;
    as.xgc = alpha * (m.HxG || 0) + (1 - alpha) * as.xgc;

    const ptsH = m.FTHG > m.FTAG ? 3 : m.FTHG === m.FTAG ? 1 : 0;
    const ptsA = m.FTAG > m.FTHG ? 3 : m.FTHG === m.FTAG ? 1 : 0;
    
    hs.pts = alpha * ptsH + (1 - alpha) * hs.pts;
    as.pts = alpha * ptsA + (1 - alpha) * as.pts;

    hs.lastDate = m.Date;
    as.lastDate = m.Date;
  }

  // Check if first 33% can be training, remaining walk-forward test periods
  const trainSplitIdx = Math.max(Math.floor(nMatches * 0.33), 10);
  const trainMatches = featuresList.slice(0, trainSplitIdx);
  const testMatches = featuresList.slice(trainSplitIdx);

  // Initialize main model and load initial training
  const master = new BayesianPoissonRatings();
  for (const m of trainMatches) {
    master.addTeam(m.HomeTeam, m.league);
    master.addTeam(m.AwayTeam, m.league);
    master.update(m.HomeTeam, m.AwayTeam, m.league, m.FTHG, m.FTAG, m.HxG || 0, m.AxG || 0);
  }

  // Pre-calibrate on training set if there is enough data
  let calibratorH: IsotonicCalibrator | null = null;
  let calibratorD: IsotonicCalibrator | null = null;
  let calibratorA: IsotonicCalibrator | null = null;

  const trainingProbList: [number, number, number][] = [];
  const trainingActuals: number[] = [];

  const tempEngine = new BayesianPoissonRatings();
  for (const m of trainMatches) {
    tempEngine.addTeam(m.HomeTeam, m.league);
    tempEngine.addTeam(m.AwayTeam, m.league);
    
    const [lh, la] = tempEngine.predict(m.HomeTeam, m.AwayTeam, m.league);
    const [ph, pd, pa] = dcProbabilities(lh, la, -0.06);
    trainingProbList.push([ph, pd, pa]);
    
    const act = m.FTHG > m.FTAG ? 0 : m.FTHG === m.FTAG ? 1 : 2;
    trainingActuals.push(act);
    
    tempEngine.update(m.HomeTeam, m.AwayTeam, m.league, m.FTHG, m.FTAG, m.HxG || 0, m.AxG || 0);
  }

  if (trainMatches.length >= 10) {
    calibratorH = new IsotonicCalibrator().fit(trainingProbList.map(p => p[0]), trainingActuals.map(a => a === 0 ? 1 : 0));
    calibratorD = new IsotonicCalibrator().fit(trainingProbList.map(p => p[1]), trainingActuals.map(a => a === 1 ? 1 : 0));
    calibratorA = new IsotonicCalibrator().fit(trainingProbList.map(p => p[2]), trainingActuals.map(a => a === 2 ? 1 : 0));
  }

  // Pre-train xG Forecast Ridge Models
  const feat_cols = [
    "home_gs_ewma", "home_gc_ewma", "away_gs_ewma", "away_gc_ewma",
    "home_xg_ewma", "away_xg_ewma", "home_xga_ewma", "away_xga_ewma",
    "home_pts_ewma", "away_pts_ewma", "rest_diff"
  ];

  const getFeatVector = (p: ProcessedMatch): number[] => [
    p.home_gs_ewma, p.home_gc_ewma, p.away_gs_ewma, p.away_gc_ewma,
    p.home_xg_ewma, p.away_xg_ewma, p.home_xga_ewma, p.away_xga_ewma,
    p.home_pts_ewma, p.away_pts_ewma, p.rest_diff
  ];

  const trainX = trainMatches.map(getFeatVector);
  const trainYH = trainMatches.map(m => m.HxG || 0);
  const trainYA = trainMatches.map(m => m.AxG || 0);

  const xGModelH = new RidgeRegressor().fit(trainX, trainYH);
  const xGModelA = new RidgeRegressor().fit(trainX, trainYA);

  // Storage for testing metrics
  let bankroll = config.initialBankroll;
  const bankrollHistory: BankrollPoint[] = [
    { index: 0, date: trainSplitIdx > 0 ? featuresList[trainSplitIdx - 1].Date : 'Start', bankroll, pnl: 0 }
  ];
  
  const bets: Bet[] = [];
  const testModelProbs: [number, number, number][] = [];
  const testMarketProbs: [number, number, number][] = [];
  const testActuals: number[] = [];

  const hasOdds = matches.some(m => m.B365H !== undefined && m.B365D !== undefined && m.B365A !== undefined);

  // Calibration statistics bins
  const nBins = 5;
  const binSumPredicted = Array(nBins).fill(0);
  const binActualCount = Array(nBins).fill(0);
  const binTotalCount = Array(nBins).fill(0);

  // Run backtest matches sequentially
  for (let i = 0; i < testMatches.length; i++) {
    const t = testMatches[i];
    master.addTeam(t.HomeTeam, t.league);
    master.addTeam(t.AwayTeam, t.league);

    // Progressive training refinement for machine learning models
    if (i > 0 && i % 30 === 0) {
      // Periodic recalculation of isotonic calibrators and regressors with growing window
      const historySet = [...trainMatches, ...testMatches.slice(0, i)];
      const histX = historySet.map(getFeatVector);
      const histYH = historySet.map(m => m.HxG || 0);
      const histYA = historySet.map(m => m.AxG || 0);
      
      xGModelH.fit(histX, histYH);
      xGModelA.fit(histX, histYA);

      const histProbList: [number, number, number][] = [];
      const histActuals: number[] = [];
      const tempRef = new BayesianPoissonRatings();
      
      for (const m of historySet) {
        tempRef.addTeam(m.HomeTeam, m.league);
        tempRef.addTeam(m.AwayTeam, m.league);
        const [lh, la] = tempRef.predict(m.HomeTeam, m.AwayTeam, m.league);
        const [ph, pd, pa] = dcProbabilities(lh, la, -0.06);
        histProbList.push([ph, pd, pa]);
        histActuals.push(m.FTHG > m.FTAG ? 0 : m.FTHG === m.FTAG ? 1 : 2);
        tempRef.update(m.HomeTeam, m.AwayTeam, m.league, m.FTHG, m.FTAG, m.HxG || 0, m.AxG || 0);
      }

      calibratorH = new IsotonicCalibrator().fit(histProbList.map(p => p[0]), histActuals.map(a => a === 0 ? 1 : 0));
      calibratorD = new IsotonicCalibrator().fit(histProbList.map(p => p[1]), histActuals.map(a => a === 1 ? 1 : 0));
      calibratorA = new IsotonicCalibrator().fit(histProbList.map(p => p[2]), histActuals.map(a => a === 2 ? 1 : 0));
    }

    // Bayesian expectations
    let [lam_h, lam_a] = master.predict(t.HomeTeam, t.AwayTeam, t.league);

    // Ridge regression xG prediction blending (representing form drift)
    const featVec = getFeatVector(t);
    const predHxG = Math.min(Math.max(xGModelH.predict(featVec), 0.1), 5.0);
    const predAxG = Math.min(Math.max(xGModelA.predict(featVec), 0.1), 5.0);

    // Blended rate (70% long-term Bayesian, 30% short-term machine learning)
    lam_h = 0.7 * lam_h + 0.3 * predHxG;
    lam_a = 0.7 * lam_a + 0.3 * predAxG;

    t.pred_lam_h = lam_h;
    t.pred_lam_a = lam_a;

    // Dixon Coles Probabilities
    let [p_h, p_d, p_a] = dcProbabilities(lam_h, lam_a, -0.06);
    t.prob_h = p_h;
    t.prob_d = p_d;
    t.prob_a = p_a;

    // Calibrate raw probabilities
    if (calibratorH && calibratorD && calibratorA) {
      let ch = calibratorH.transform(p_h);
      let cd = calibratorD.transform(p_d);
      let ca = calibratorA.transform(p_a);
      const tot = ch + cd + ca;
      if (tot > 0) {
        ch /= tot;
        cd /= tot;
        ca /= tot;
      }
      t.cal_prob_h = ch;
      t.cal_prob_d = cd;
      t.cal_prob_a = ca;
    } else {
      t.cal_prob_h = p_h;
      t.cal_prob_d = p_d;
      t.cal_prob_a = p_a;
    }

    const actual = t.FTHG > t.FTAG ? 0 : t.FTHG === t.FTAG ? 1 : 2;
    testActuals.push(actual);
    testModelProbs.push([t.cal_prob_h, t.cal_prob_d, t.cal_prob_a]);

    // Track calibration bins
    const outcomePairs: { pred: number; act: number }[] = [
      { pred: t.cal_prob_h, act: actual === 0 ? 1 : 0 },
      { pred: t.cal_prob_d, act: actual === 1 ? 1 : 0 },
      { pred: t.cal_prob_a, act: actual === 2 ? 1 : 0 }
    ];

    for (const op of outcomePairs) {
      const idx = Math.min(Math.floor(op.pred * nBins), nBins - 1);
      binSumPredicted[idx] += op.pred;
      binActualCount[idx] += op.act;
      binTotalCount[idx] += 1;
    }

    if (t.fair_h && t.fair_d && t.fair_a) {
      testMarketProbs.push([t.fair_h, t.fair_d, t.fair_a]);
    }

    // Interactive Bet Selection Desk
    if (t.B365H && t.B365D && t.B365A && t.fair_h && t.fair_d && t.fair_a) {
      // Convex market override model blending
      const finalH = config.weightModelOnProb * t.cal_prob_h + (1 - config.weightModelOnProb) * t.fair_h;
      const finalD = config.weightModelOnProb * t.cal_prob_d + (1 - config.weightModelOnProb) * t.fair_d;
      const finalA = config.weightModelOnProb * t.cal_prob_a + (1 - config.weightModelOnProb) * t.fair_a;

      const candidates: { bet: 'H' | 'D' | 'A'; prob: number; odds: number; closeOdds: number }[] = [
        { bet: 'H', prob: finalH, odds: t.B365H, closeOdds: t.B365H_close || t.B365H },
        { bet: 'D', prob: finalD, odds: t.B365D, closeOdds: t.B365D_close || t.B365D },
        { bet: 'A', prob: finalA, odds: t.B365A, closeOdds: t.B365A_close || t.B365A }
      ];

      let betPlacedThisMatch = false;

      for (const cand of candidates) {
        const ev = cand.prob * cand.odds - 1.0;
        
        if (ev > config.minEV && cand.odds > 1.01) {
          const b = cand.odds - 1.0;
          const rawKelly = (b * cand.prob - (1.0 - cand.prob)) / b;
          let stake = config.kellyFrac * rawKelly * bankroll;
          
          // Cap single bets to prevent bankruptcy
          stake = Math.min(stake, config.maxStakePct * bankroll);

          if (stake > 0.05) {
            const isWin = (cand.bet === 'H' && actual === 0) ||
                          (cand.bet === 'D' && actual === 1) ||
                          (cand.bet === 'A' && actual === 2);
            
            const pnl = isWin ? stake * (cand.odds - 1.0) : -stake;
            bankroll += pnl;

            // CLV: closing line value (1 / odds - 1 / closeOdds)
            const clv = (1.0 / cand.odds) - (1.0 / cand.closeOdds);

            bets.push({
              date: t.Date,
              home: t.HomeTeam,
              away: t.AwayTeam,
              league: t.league,
              betType: cand.bet,
              odds: cand.odds,
              closeOdds: cand.closeOdds,
              modelProb: cand.prob,
              stake,
              result: isWin ? 'W' : 'L',
              pnl,
              clv
            });

            bankrollHistory.push({
              index: bankrollHistory.length,
              date: t.Date,
              bankroll,
              pnl,
              bet: `${t.HomeTeam} vs ${t.AwayTeam} [${cand.bet} @ ${cand.odds.toFixed(2)}]`
            });

            betPlacedThisMatch = true;
            break; // Bet on max-EV outcome only of a match as per guidelines
          }
        }
      }

      if (!betPlacedThisMatch) {
        // Log points for tracking
        bankrollHistory.push({
          index: bankrollHistory.length,
          date: t.Date,
          bankroll,
          pnl: 0
        });
      }
    } else {
      // Just record history points without betting actions
      bankrollHistory.push({
        index: bankrollHistory.length,
        date: t.Date,
        bankroll,
        pnl: 0
      });
    }

    // Progressive update of the Poisson engine
    master.update(t.HomeTeam, t.AwayTeam, t.league, t.FTHG, t.FTAG, t.HxG || 0, m_calc_avg(t.FTAG, t.AxG));
    
    // Callback progress trigger
    if (onProgress && i % 10 === 0) {
      onProgress(Math.floor((i / testMatches.length) * 100));
    }
  }

  if (onProgress) onProgress(100);

  // Compute final stats
  const logLossModel = computeLogLoss(testModelProbs, testActuals);
  const brierScoreModel = computeBrierScore(testModelProbs, testActuals);
  
  let logLossMarket: number | undefined;
  let brierScoreMarket: number | undefined;

  if (testMarketProbs.length === testModelProbs.length) {
    logLossMarket = computeLogLoss(testMarketProbs, testActuals);
    brierScoreMarket = computeBrierScore(testMarketProbs, testActuals);
  }

  // Drawdown & Sharpe calculation
  let maxDrawdown = 0;
  let peak = config.initialBankroll;
  for (const bp of bankrollHistory) {
    if (bp.bankroll > peak) peak = bp.bankroll;
    const dd = (peak - bp.bankroll) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Calculate annual Sharpe ratio of returns
  const dailyPnLs: number[] = [];
  for (let j = 1; j < bankrollHistory.length; j++) {
    const r = (bankrollHistory[j].bankroll - bankrollHistory[j - 1].bankroll) / bankrollHistory[j - 1].bankroll;
    dailyPnLs.push(r);
  }
  let sharpeRatio = 0;
  if (dailyPnLs.length > 3) {
    const avgR = dailyPnLs.reduce((sum, v) => sum + v, 0) / dailyPnLs.length;
    const varR = dailyPnLs.reduce((sum, v) => sum + Math.pow(v - avgR, 2), 0) / (dailyPnLs.length - 1);
    const stdR = Math.sqrt(varR);
    if (stdR > 0) {
      // Annualized Sharpe assuming ~100 bets / periods
      sharpeRatio = (avgR / stdR) * Math.sqrt(252);
    }
  }

  // Bets results
  const totalBets = bets.length;
  const wonBets = bets.filter(b => b.result === 'W').length;
  const totalPnl = bankroll - config.initialBankroll;
  const totalStake = bets.reduce((sum, b) => sum + b.stake, 0);
  const roi = totalStake > 0 ? (totalPnl / totalStake) * 100 : 0;
  const sumCLV = bets.reduce((sum, b) => sum + b.clv, 0);
  const avgCLV = totalBets > 0 ? sumCLV / totalBets : 0;

  // Build calibration curve
  const binsList: CalibrationBin[] = [];
  for (let b = 0; b < nBins; b++) {
    const rangeMin = (b / nBins).toFixed(2);
    const rangeMax = ((b + 1) / nBins).toFixed(2);
    const count = binTotalCount[b];
    const avgPred = count > 0 ? binSumPredicted[b] / count : 0;
    const actualR = count > 0 ? binActualCount[b] / count : 0;

    binsList.push({
      probRange: `${rangeMin} - ${rangeMax}`,
      midpoint: (b / nBins) + (0.5 / nBins),
      predictedProb: avgPred,
      actualRate: actualR,
      count
    });
  }

  return {
    totalMatches: nMatches,
    testMatches: testMatches.length,
    logLossModel,
    brierScoreModel,
    logLossMarket,
    brierScoreMarket,
    hasOdds,
    totalBets,
    wonBets,
    avgOdds: totalBets > 0 ? bets.reduce((sum, b) => sum + b.odds, 0) / totalBets : 1.0,
    startingBankroll: config.initialBankroll,
    endingBankroll: bankroll,
    roi,
    sharpeRatio,
    maxDrawdown: maxDrawdown * 100,
    totalCLV: sumCLV,
    avgCLV,
    bankrollHistory,
    bets,
    processedMatches: testMatches,
    calibrationData: binsList,
    finalRatings: master.getRatings().sort((a,b) => b.attack - a.attack) // sorted by strength
  };
}

function m_calc_avg(act: number, prev?: number) {
  if (prev === undefined) return act;
  return 0.6 * act + 0.4 * prev;
}
