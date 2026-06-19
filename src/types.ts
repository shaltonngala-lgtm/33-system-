/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Match {
  Date: string; // YYYY-MM-DD
  HomeTeam: string;
  AwayTeam: string;
  FTHG: number;
  FTAG: number;
  HxG?: number;
  AxG?: number;
  B365H?: number;
  B365D?: number;
  B365A?: number;
  B365H_close?: number;
  B365D_close?: number;
  B365A_close?: number;
  league: string;
}

export interface ProcessedMatch extends Match {
  // Features (EWMA past-only statistics)
  home_gs_ewma: number;
  home_gc_ewma: number;
  away_gs_ewma: number;
  away_gc_ewma: number;
  home_xg_ewma: number;
  away_xg_ewma: number;
  home_xga_ewma: number;
  away_xga_ewma: number;
  home_pts_ewma: number;
  away_pts_ewma: number;
  rest_diff: number;

  // Expected goals (model lam_h, lam_a)
  pred_lam_h: number;
  pred_lam_a: number;

  // Raw model probabilities
  prob_h: number; // Home Win
  prob_d: number; // Draw
  prob_a: number; // Away Win

  // Calibrated model probabilities
  cal_prob_h: number;
  cal_prob_d: number;
  cal_prob_a: number;

  // Fair market probabilities if odds are available
  fair_h?: number;
  fair_d?: number;
  fair_a?: number;
}

export interface TeamRating {
  team: string;
  league: string;
  attack: number;
  defense: number;
  attackVar: number;
  defenseVar: number;
  matches: number;
}

export interface Bet {
  date: string;
  home: string;
  away: string;
  league: string;
  betType: 'H' | 'D' | 'A';
  odds: number;
  closeOdds?: number;
  modelProb: number;
  stake: number;
  result: 'W' | 'L';
  pnl: number;
  clv: number; // Closing Line Value: (1/odds - 1/closeOdds) or (odds / closeOdds - 1) depending on definition
}

export interface BankrollPoint {
  index: number;
  date: string;
  bankroll: number;
  pnl: number;
  bet?: string;
}

export interface CalibrationBin {
  probRange: string;
  midpoint: number;
  predictedProb: number;
  actualRate: number;
  count: number;
}

export interface BacktestSummary {
  totalMatches: number;
  testMatches: number;
  logLossModel: number;
  brierScoreModel: number;
  logLossMarket?: number;
  brierScoreMarket?: number;
  
  // Betting metrics (active only if odds are available)
  hasOdds: boolean;
  totalBets: number;
  wonBets: number;
  avgOdds: number;
  startingBankroll: number;
  endingBankroll: number;
  roi: number; // Return on Investment
  sharpeRatio: number;
  maxDrawdown: number;
  totalCLV: number;
  avgCLV: number;

  // Time-series results
  bankrollHistory: BankrollPoint[];
  bets: Bet[];
  processedMatches: ProcessedMatch[];
  calibrationData: CalibrationBin[];
  finalRatings: TeamRating[];
}

export interface SimulationConfig {
  kellyFrac: number;      // e.g. 0.02 (Fractional Kelly)
  maxStakePct: number;    // e.g. 0.0025 (Max single bet stake limit as ratio of bankroll)
  initialBankroll: number; // e.g. 1000
  weightModelOnProb: number; // e.g. 0.70 model vs 0.30 market
  minEV: number;          // e.g. 0.03 (Minimum expected value threshold)
}
