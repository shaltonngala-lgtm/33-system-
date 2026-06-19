/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Play, 
  Settings, 
  TrendingUp, 
  ShieldCheck, 
  Coins, 
  FileText, 
  Percent, 
  Activity, 
  HelpCircle,
  UploadCloud,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  ListFilter,
  CheckCircle2,
  XCircle,
  Database,
  Star,
  Award,
  Check
} from 'lucide-react';
import { Match, ProcessedMatch, TeamRating, Bet, BankrollPoint, CalibrationBin, BacktestSummary, SimulationConfig } from '../types';
import { runWalkForwardBacktest, parseCSVMatches } from '../quantusEngine';
import { generateDemoMatches } from '../datasets';

interface DashboardProps {
  onNotification: (title: string, message: string, type: 'success' | 'error') => void;
}

export default function Dashboard({ onNotification }: DashboardProps) {
  // Config state
  const [config, setConfig] = useState<SimulationConfig>({
    kellyFrac: 0.02,
    maxStakePct: 0.0025,
    initialBankroll: 1000,
    weightModelOnProb: 0.70,
    minEV: 0.03
  });

  // Source selection state
  const [datasetType, setDatasetType] = useState<'EPL' | 'SERIE_A' | 'CUSTOM'>('EPL');
  const [customFileContent, setCustomFileContent] = useState<string | null>(null);
  const [customFileName, setCustomFileName] = useState<string | null>(null);

  // Engine executing state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [backtestResult, setBacktestResult] = useState<BacktestSummary | null>(null);

  // Pagination and search states
  const [fixturesPage, setFixturesPage] = useState<number>(1);
  const [ratingsSearch, setRatingsSearch] = useState<string>('');
  const [fixturesFilter, setFixturesFilter] = useState<'ALL' | 'BETS' | 'WINS' | 'LOSSES'>('ALL');
  const [fixturesSearch, setFixturesSearch] = useState<string>('');
  
  // Interactive chart tooltips state
  const [hoveredBankrollPoint, setHoveredBankrollPoint] = useState<BankrollPoint | null>(null);
  const [hoveredRating, setHoveredRating] = useState<TeamRating | null>(null);
  const [hoveredBin, setHoveredBin] = useState<CalibrationBin | null>(null);

  const ITEMS_PER_PAGE = 12;

  // Run Walk-Forward Engine logic
  const handleExecuteEngine = () => {
    setIsProcessing(true);
    setTimeout(() => {
      try {
        let matches: Match[] = [];
        if (datasetType === 'CUSTOM') {
          if (!customFileContent) {
            throw new Error('Please upload a valid football results .csv file first.');
          }
          matches = parseCSVMatches(customFileContent);
        } else {
          matches = generateDemoMatches(datasetType);
        }

        const summary = runWalkForwardBacktest(matches, config);
        setBacktestResult(summary);
        
        onNotification(
          'Engine Converged Successfully',
          `Ran walk-forward backtest on ${summary.totalMatches} matches in ${datasetType === 'CUSTOM' ? 'Custom Dataset' : datasetType} (${summary.testMatches} in test split). Placed ${summary.totalBets} bets.`,
          'success'
        );
        setFixturesPage(1); // Reset page index
      } catch (err: any) {
        console.error(err);
        onNotification(
          'Engine Convergence Failure',
          err.message || 'An error occurred while compiling the backtest indices.',
          'error'
        );
      } finally {
        setIsProcessing(false);
      }
    }, 400); // Small thread delay
  };

  // Immediate execution on mount
  React.useEffect(() => {
    handleExecuteEngine();
  }, [datasetType]); // Automatically runs when switching demo datasets

  // Custom File Uploader
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCustomFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCustomFileContent(text);
      setDatasetType('CUSTOM');
      onNotification('CSV Parsed', `Successfully staged custom data file "${file.name}". Click "Execute Quantus Engine" to begin processing.`, 'success');
    };
    reader.readAsText(file);
  };

  // File Drag over events helper
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    setCustomFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCustomFileContent(text);
      setDatasetType('CUSTOM');
      onNotification('CSV Parsed', `Successfully staged drag-and-drop file "${file.name}".`, 'success');
    };
    reader.readAsText(file);
  };

  // Process ratings table filter
  const filteredRatings = useMemo(() => {
    if (!backtestResult) return [];
    return backtestResult.finalRatings.filter(
      r => r.team.toLowerCase().includes(ratingsSearch.toLowerCase()) ||
           r.league.toLowerCase().includes(ratingsSearch.toLowerCase())
    );
  }, [backtestResult, ratingsSearch]);

  // Process fixtures listing
  const filteredFixtures = useMemo(() => {
    if (!backtestResult) return [];
    let list = backtestResult.processedMatches;

    // Apply outcome fixtures search keyword
    if (fixturesSearch) {
      const q = fixturesSearch.toLowerCase();
      list = list.filter(m => 
        m.HomeTeam.toLowerCase().includes(q) || 
        m.AwayTeam.toLowerCase().includes(q) ||
        m.league.toLowerCase().includes(q)
      );
    }

    // Apply analytical filters
    if (fixturesFilter === 'BETS') {
      list = list.filter(m => 
        backtestResult.bets.some(b => b.date === m.Date && b.home === m.HomeTeam && b.away === m.AwayTeam)
      );
    } else if (fixturesFilter === 'WINS') {
      list = list.filter(m => 
        backtestResult.bets.some(b => b.date === m.Date && b.home === m.HomeTeam && b.away === m.AwayTeam && b.result === 'W')
      );
    } else if (fixturesFilter === 'LOSSES') {
      list = list.filter(m => 
        backtestResult.bets.some(b => b.date === m.Date && b.home === m.HomeTeam && b.away === m.AwayTeam && b.result === 'L')
      );
    }

    return list;
  }, [backtestResult, fixturesFilter, fixturesSearch]);

  const paginatedFixtures = useMemo(() => {
    const startIndex = (fixturesPage - 1) * ITEMS_PER_PAGE;
    return filteredFixtures.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredFixtures, fixturesPage]);

  const maxFixturesPage = Math.ceil(filteredFixtures.length / ITEMS_PER_PAGE) || 1;

  // Custom CSS Chart parameters mapping helper (Bankroll History)
  const bankrollChartData = useMemo(() => {
    if (!backtestResult || backtestResult.bankrollHistory.length === 0) return null;
    const history = backtestResult.bankrollHistory;
    
    const minBr = Math.min(...history.map(h => h.bankroll)) * 0.95;
    const maxBr = Math.max(...history.map(h => h.bankroll)) * 1.05;
    const range = maxBr - minBr || 100;
    
    const width = 800;
    const height = 280;
    const paddingLeft = 55;
    const paddingRight = 15;
    const paddingTop = 15;
    const paddingBottom = 40;

    const points = history.map((h, i) => {
      const x = paddingLeft + (i / (history.length - 1)) * (width - paddingLeft - paddingRight);
      const y = height - paddingBottom - ((h.bankroll - minBr) / range) * (height - paddingTop - paddingBottom);
      return { x, y, orig: h };
    });

    const isProfit = (history[history.length - 1]?.bankroll || 0) >= config.initialBankroll;

    // Area string
    const polyString = points.map(p => `${p.x},${p.y}`).join(' ');
    const areaString = `${paddingLeft},${height - paddingBottom} ` + polyString + ` ${width - paddingRight},${height - paddingBottom}`;

    return { points, minBr, maxBr, polyString, areaString, width, height, paddingLeft, paddingRight, paddingTop, paddingBottom, isProfit };
  }, [backtestResult, config.initialBankroll]);

  // Isotonic curve points mapper
  const calibrationChartData = useMemo(() => {
    if (!backtestResult || backtestResult.calibrationData.length === 0) return null;
    const bins = backtestResult.calibrationData;

    const width = 450;
    const height = 280;
    const pad = 40;

    const points = bins.map(b => {
      // both predictedProb and actualRate are 0..1
      const x = pad + b.midpoint * (width - 2 * pad);
      // SVG Y starts from top, so subtract from height
      const y = height - pad - b.actualRate * (height - 2 * pad);
      return { x, y, orig: b };
    });

    return { points, width, height, pad };
  }, [backtestResult]);

  // Team strength scatter plot coordinates mapper
  const teamScatterData = useMemo(() => {
    if (!backtestResult || backtestResult.finalRatings.length === 0) return null;
    const ratings = backtestResult.finalRatings;

    const atts = ratings.map(r => r.attack);
    const defs = ratings.map(r => r.defense);

    const minAtt = Math.min(...atts) - 0.2;
    const maxAtt = Math.max(...atts) + 0.2;
    const minDef = Math.min(...defs) - 0.2; // stronger def is LOWER coefficient
    const maxDef = Math.max(...defs) + 0.2; 

    const width = 450;
    const height = 280;
    const pad = 40;

    const points = ratings.map(r => {
      const x = pad + ((r.attack - minAtt) / (maxAtt - minAtt || 1)) * (width - 2 * pad);
      // stronger defense (lower value) should go UP on the chart
      const y = pad + ((r.defense - minDef) / (maxDef - minDef || 1)) * (height - 2 * pad);
      return { x, y, orig: r };
    });

    return { points, width, height, pad, minAtt, maxAtt, minDef, maxDef };
  }, [backtestResult]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1F1F1F] font-sans p-4 sm:p-6 lg:p-8">
      {/* Upper Brand Bar / Google Play Product Header Card */}
      <header className="bg-white border border-neutral-200/60 rounded-3xl p-6 sm:p-8 mb-8 shadow-[0_4px_25px_rgba(0,0,0,0.03)] flex flex-col lg:flex-row lg:items-center justify-between gap-6 transition-all duration-300">
        <div className="flex items-start gap-4">
          {/* Mock Google Play Style Colorful Icon App Badge */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-tr from-[#00639B] via-[#01875F] to-[#FBBC05] rounded-[24px] shadow-md flex items-center justify-center flex-shrink-0 relative">
            <Play className="w-8 h-8 text-white fill-white ml-1" />
            <div className="absolute -bottom-1 -right-1 bg-white p-1 rounded-full border border-neutral-150">
              <span className="flex h-2.5 w-2.5 rounded-full bg-[#01875F]" />
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1F1F1F] font-display">
                Quantus Pro Simulator
              </h1>
              <div className="inline-flex items-center gap-1 bg-[#E6F4EA] text-[#137333] px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase">
                <Award className="w-3.5 h-3.5" />
                Editors' Choice
              </div>
            </div>

            <p className="text-xs text-[#5F6368] font-medium mb-2.5">
              Quantus Analytics • Walk-Forward Machine Learning Simulation Engine
            </p>

            {/* Quick Play-Store Statistics Indicators */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#5F6368]">
              <div className="flex items-center gap-1 font-semibold text-[#1F1F1F]">
                4.9 <Star className="w-3.5 h-3.5 fill-[#FBBC05] text-[#FBBC05] inline" />
                <span className="text-neutral-400 font-normal">(12K runs)</span>
              </div>
              <span className="text-[#BDC1C6] hidden sm:inline">|</span>
              <div className="flex items-center gap-1">
                <span className="font-semibold text-[#1F1F1F]">10M+</span> Simulations
              </div>
              <span className="text-[#BDC1C6] hidden sm:inline">|</span>
              <div className="bg-[#E8F0FE] text-[#1A73E8] px-2 py-0.5 rounded-full text-[10px] font-semibold">
                Finance & Strategy
              </div>
            </div>
          </div>
        </div>

        {/* Dataset Choice Controls styled like Play Store Version Buttons */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center lg:justify-end gap-3 flex-shrink-0">
          <div className="text-xs font-semibold text-[#5F6368] font-sans">
            Select Live Database:
          </div>
          
          <div className="bg-[#F1F3F4] p-1 rounded-full flex items-center gap-1 border border-neutral-200/40">
            <button 
              id="epl-dataset-btn"
              onClick={() => { setDatasetType('EPL'); setFixturesPage(1); }}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-tight transition-all duration-150 cursor-pointer ${datasetType === 'EPL' ? 'bg-[#01875F] text-white shadow-sm font-semibold' : 'text-[#5F6368] hover:text-[#1F1F1F]'}`}
            >
              EPL.db
            </button>
            <button 
              id="serie-a-dataset-btn"
              onClick={() => { setDatasetType('SERIE_A'); setFixturesPage(1); }}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-tight transition-all duration-150 cursor-pointer ${datasetType === 'SERIE_A' ? 'bg-[#01875F] text-white shadow-sm font-semibold' : 'text-[#5F6368] hover:text-[#1F1F1F]'}`}
            >
              Serie_A.db
            </button>
            <label 
              id="custom-dataset-label"
              className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-tight transition-all duration-150 cursor-pointer flex items-center gap-1 ${datasetType === 'CUSTOM' ? 'bg-[#01875F] text-white shadow-sm font-semibold' : 'text-[#5F6368] hover:text-[#1F1F1F]'}`}
            >
              Custom.csv
              <input 
                type="file" 
                accept=".csv" 
                className="hidden" 
                onChange={handleFileUpload} 
              />
            </label>
          </div>
        </div>
      </header>

      {/* Main Container Layout */}
      <main className="max-w-7xl mx-auto space-y-8">
        
        {/* Top Control Panel and CSV drag area */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Form Hyperparameters Settings Card */}
          <div className="lg:col-span-8 bg-white border border-neutral-200/60 p-6 sm:p-8 rounded-3xl shadow-[0_4px_25px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-2.5 mb-6 border-b border-neutral-100 pb-4">
              <Settings className="w-5 h-5 text-[#01875F]" />
              <h2 className="text-sm font-semibold tracking-tight text-[#1F1F1F] font-display">
                Model Hyperparameters Configuration
              </h2>
            </div>
 
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-semibold text-[#5F6368] mb-1.5">
                  Starting Wallet Capital
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2 text-sm text-[#5F6368] font-bold">$</span>
                  <input 
                    type="number" 
                    value={config.initialBankroll} 
                    onChange={(e) => setConfig({ ...config, initialBankroll: Math.max(1, parseInt(e.target.value) || 1000) })}
                    className="w-full bg-[#F1F3F4]/75 border border-transparent rounded-xl pl-8 pr-3 py-2 text-sm font-semibold text-[#1F1F1F] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#01875F]/20 focus:border-[#01875F] transition"
                  />
                </div>
                <span className="text-[10px] text-[#5F6368]/85 mt-1 block">Total modeling portfolio size</span>
              </div>
 
              <div>
                <label className="block text-xs font-semibold text-[#5F6368] mb-1.5">
                  Kelly Fraction (Risk scale)
                </label>
                <input 
                  type="number" 
                  step="0.005"
                  value={config.kellyFrac} 
                  onChange={(e) => setConfig({ ...config, kellyFrac: Math.max(0, parseFloat(e.target.value) || 0.02) })}
                  className="w-full bg-[#F1F3F4]/75 border border-transparent rounded-xl px-3.5 py-2 text-sm font-semibold text-[#1F1F1F] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#01875F]/20 focus:border-[#01875F] transition"
                />
                <span className="text-[10px] text-[#5F6368]/85 mt-1 block">Scaling multiplier for Kelly bets</span>
              </div>
 
              <div>
                <label className="block text-xs font-semibold text-[#5F6368] mb-1.5">
                  Max Stake Limit
                </label>
                <input 
                  type="number" 
                  step="0.0005"
                  value={config.maxStakePct} 
                  onChange={(e) => setConfig({ ...config, maxStakePct: Math.max(0, parseFloat(e.target.value) || 0.0025) })}
                  className="w-full bg-[#F1F3F4]/75 border border-transparent rounded-xl px-3.5 py-2 text-sm font-semibold text-[#1F1F1F] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#01875F]/20 focus:border-[#01875F] transition"
                />
                <span className="text-[10px] text-[#5F6368]/85 mt-1 block">Max portfolio risk per match</span>
              </div>
 
              <div>
                <label className="block text-xs font-semibold text-[#5F6368] mb-1.5">
                  Model Probability Weight
                </label>
                <div className="flex items-center gap-3 bg-[#F1F3F4]/75 px-3 py-2 rounded-xl border border-transparent">
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.05"
                    value={config.weightModelOnProb} 
                    onChange={(e) => setConfig({ ...config, weightModelOnProb: parseFloat(e.target.value) })}
                    className="w-full h-1 bg-neutral-300 rounded-lg appearance-none cursor-pointer accent-[#01875F]"
                  />
                  <span className="text-xs font-bold w-12 text-right text-[#1F1F1F]">
                    {(config.weightModelOnProb * 100).toFixed(0)}%
                  </span>
                </div>
                <span className="text-[10px] text-[#5F6368]/85 mt-1 block">Blend level matches market odds</span>
              </div>
 
              <div>
                <label className="block text-xs font-semibold text-[#5F6368] mb-1.5">
                  EV Threshold Edge (Min)
                </label>
                <input 
                  type="number" 
                  step="0.01"
                  value={config.minEV} 
                  onChange={(e) => setConfig({ ...config, minEV: Math.max(0, parseFloat(e.target.value) || 0.03) })}
                  className="w-full bg-[#F1F3F4]/75 border border-transparent rounded-xl px-3.5 py-2 text-sm font-semibold text-[#1F1F1F] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#01875F]/20 focus:border-[#01875F] transition"
                />
                <span className="text-[10px] text-[#5F6368]/85 mt-1 block">Min value edge required to bet</span>
              </div>
 
              <div className="flex flex-col justify-end">
                <button
                  id="execute-engine-btn"
                  onClick={handleExecuteEngine}
                  disabled={isProcessing}
                  className="w-full bg-[#01875F] hover:bg-[#00704E] text-white rounded-full font-semibold text-xs py-3 px-5 transition-all duration-200 flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
                  {isProcessing ? 'COMPILING RE-RUN...' : 'RUN BACKTEST SIMULATION'}
                </button>
              </div>
            </div>
          </div>
 
          {/* Staging / custom importer file drop component */}
          <div className="lg:col-span-4 bg-white border border-neutral-200/60 p-6 sm:p-8 rounded-3xl shadow-[0_4px_25px_rgba(0,0,0,0.02)] flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <UploadCloud className="w-5 h-5 text-[#00639B]" />
                <h3 className="text-sm font-semibold tracking-tight text-[#1F1F1F] font-display">
                  Dataset CSV Bundle
                </h3>
              </div>
              <p className="text-xs text-[#5F6368] leading-relaxed">
                Import custom CSV columns: <code className="bg-[#F1F3F4] px-1 py-0.5 rounded text-[#D93025] font-mono text-[10px]">Date,HomeTeam,AwayTeam,FTHG,FTAG</code>.
              </p>
            </div>
 
            <div 
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className="mt-4 border-2 border-dashed border-neutral-200 bg-[#E8F0FE]/20 rounded-2xl p-5 flex flex-col items-center justify-center text-center hover:bg-[#E8F0FE]/40 hover:border-[#1A73E8]/40 transition duration-150 cursor-pointer"
            >
              <Database className="w-6 h-6 text-[#1A73E8] mb-2" />
              {customFileName ? (
                <div>
                  <span className="text-xs font-semibold text-[#1F1F1F] block truncate max-w-[180px]">
                    {customFileName}
                  </span>
                  <span className="inline-flex items-center gap-1.5 mt-1 bg-[#E6F4EA] text-[#137333] px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">
                    <Check className="w-3 h-3" /> Staged
                  </span>
                </div>
              ) : (
                <div>
                  <span className="text-xs font-semibold text-[#1F1F1F] block">
                    DRAG & DROP CSV FILE
                  </span>
                  <span className="text-[10px] text-[#5F6368] block mt-0.5 font-medium">
                    OR TAP TO MANUALLY UPLOAD
                  </span>
                </div>
              )}
            </div>
          </div>
 
        </div>

        {/* Quantus Engine Output Summary Tier */}
        {backtestResult && (
          <div className="space-y-8">
            
            {/* Bento Grid Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              
              {/* Wallet Capital Progress */}
              <div className="bg-white border border-neutral-200/50 p-6 rounded-3xl shadow-[0_4px_25px_rgba(0,0,0,0.015)] relative overflow-hidden flex flex-col justify-between min-h-[140px] transition duration-200 hover:shadow-md">
                <div>
                  <div className="flex items-center justify-between text-[#5F6368] mb-2">
                    <span className="text-xs font-semibold tracking-tight">Model Ending Wallet</span>
                    <Coins className="w-5 h-5 text-[#FBBC05]" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1F1F1F] font-display">
                    ${backtestResult.endingBankroll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h3>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs border-t border-neutral-100 pt-3 text-[#5F6368] font-medium">
                  <span>INIT: ${config.initialBankroll}</span>
                  <span className={`inline-flex items-center gap-1 font-bold ${((backtestResult.endingBankroll - config.initialBankroll) >= 0 ? 'text-[#127333]' : 'text-[#C5221F]')}`}>
                    {((backtestResult.endingBankroll - config.initialBankroll) >= 0 ? '+' : '')}
                    {(((backtestResult.endingBankroll - config.initialBankroll) / config.initialBankroll) * 100).toFixed(2)}%
                  </span>
                </div>
              </div>

              {/* Information Theory Performance Benchmarks */}
              <div className="bg-white border border-neutral-200/50 p-6 rounded-3xl shadow-[0_4px_25px_rgba(0,0,0,0.015)] relative overflow-hidden flex flex-col justify-between min-h-[140px] transition duration-200 hover:shadow-md">
                <div>
                  <div className="flex items-center justify-between text-[#5F6368] mb-2">
                    <span className="text-xs font-semibold tracking-tight">Model Log-Loss Error</span>
                    <Activity className="w-5 h-5 text-[#D93025]" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1F1F1F] font-display">
                    {backtestResult.logLossModel.toFixed(4)}
                  </h3>
                </div>
                <div className="mt-4 flex flex-col text-xs border-t border-neutral-100 pt-3 text-[#5F6368] font-medium">
                  <div className="flex items-center justify-between">
                    <span>Model Brier Score:</span>
                    <span className="font-bold text-[#1F1F1F]">{backtestResult.brierScoreModel.toFixed(4)}</span>
                  </div>
                </div>
              </div>

              {/* Portfolio Risk Yield (ROI) */}
              <div className="bg-white border border-neutral-200/50 p-6 rounded-3xl shadow-[0_4px_25px_rgba(0,0,0,0.015)] relative overflow-hidden flex flex-col justify-between min-h-[140px] transition duration-200 hover:shadow-md">
                <div>
                  <div className="flex items-center justify-between text-[#5F6368] mb-2">
                    <span className="text-xs font-semibold tracking-tight">Portfolio Returns Yield (ROI)</span>
                    <TrendingUp className="w-5 h-5 text-[#01875F]" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#01875F] font-display">
                    {backtestResult.roi.toFixed(2)}%
                  </h3>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs border-t border-neutral-100 pt-3 text-[#5F6368] font-medium">
                  <span>Max Drawdown:</span>
                  <span className="font-bold text-[#D93025]">{backtestResult.maxDrawdown.toFixed(1)}%</span>
                </div>
              </div>

              {/* Sharpe edge & CLV benchmarks */}
              <div className="bg-white border border-neutral-200/50 p-6 rounded-3xl shadow-[0_4px_25px_rgba(0,0,0,0.015)] relative overflow-hidden flex flex-col justify-between min-h-[140px] transition duration-200 hover:shadow-md">
                <div>
                  <div className="flex items-center justify-between text-[#5F6368] mb-2">
                    <span className="text-xs font-semibold tracking-tight">Model Alpha Edges Margin</span>
                    <ShieldCheck className="w-5 h-5 text-[#00639B]" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1F1F1F] font-display">
                    {(backtestResult.avgCLV * 100).toFixed(2)}%
                  </h3>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs border-t border-neutral-100 pt-3 text-[#5F6368] font-medium">
                  <span>Sharpe Ratio:</span>
                  <span className="font-bold text-[#1F1F1F]">{backtestResult.sharpeRatio.toFixed(2)}</span>
                </div>
              </div>

            </div>

            {/* Visual Canvas Ledger Plots (SVG Charts Row) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Capital curve area chart */}
              <div className="lg:col-span-8 bg-white border border-neutral-200/50 p-6 rounded-3xl shadow-[0_4px_25px_rgba(0,0,0,0.015)]">
                <div className="flex items-center justify-between mb-6 border-b border-neutral-100 pb-4">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight text-[#1F1F1F] font-display">Capital Ledger Index Curve</h3>
                    <p className="text-[10px] text-[#5F6368] font-medium mt-0.5">Walk-forward portfolio valuation chronologically spanning the test split matches</p>
                  </div>
                  <span className="text-[10px] bg-[#E8F0FE] text-[#1A73E8] px-3 py-1 rounded-full font-bold uppercase tracking-wider">
                    {backtestResult.totalBets} Bets Run
                  </span>
                </div>

                {bankrollChartData ? (
                  <div className="relative mt-2">
                    <svg 
                      viewBox={`0 0 ${bankrollChartData.width} ${bankrollChartData.height}`} 
                      className="w-full h-auto overflow-visible select-none"
                    >
                      <defs>
                        <linearGradient id="brAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#01875F" stopOpacity="0.22" />
                          <stop offset="100%" stopColor="#01875F" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* Grid Lines */}
                      {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                        const yVal = bankrollChartData.height - bankrollChartData.paddingBottom - ratio * (bankrollChartData.height - bankrollChartData.paddingTop - bankrollChartData.paddingBottom);
                        const labelVal = bankrollChartData.minBr + ratio * (bankrollChartData.maxBr - bankrollChartData.minBr);
                        return (
                          <g key={idx}>
                            <line 
                              x1={bankrollChartData.paddingLeft} 
                              y1={yVal} 
                              x2={bankrollChartData.width - bankrollChartData.paddingRight} 
                              y2={yVal} 
                              stroke="#F1F3F4" 
                              strokeWidth="1.5" 
                            />
                            <text 
                              x={bankrollChartData.paddingLeft - 10} 
                              y={yVal + 3} 
                              textAnchor="end" 
                              fill="#5F6368" 
                              className="font-mono text-[9px] font-semibold"
                            >
                              ${Math.round(labelVal)}
                            </text>
                          </g>
                        );
                      })}

                      {/* Area Fill */}
                      <polygon 
                        points={bankrollChartData.areaString} 
                        fill="url(#brAreaGrad)" 
                      />

                      {/* Wallet line path */}
                      <polyline 
                        fill="none" 
                        stroke="#01875F" 
                        strokeWidth="3.25" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        points={bankrollChartData.polyString} 
                      />

                      {/* Interactive hover circle nodes for bets only */}
                      {bankrollChartData.points.filter(p => p.orig.pnl !== 0).map((pt, idx) => (
                        <circle 
                          key={idx}
                          cx={pt.x}
                          cy={pt.y}
                          r={hoveredBankrollPoint?.index === pt.orig.index ? "6.5" : "3.5"}
                          fill={pt.orig.pnl > 0 ? '#01875F' : '#D93025'}
                          stroke="#FFFFFF"
                          strokeWidth="1.75"
                          className="cursor-pointer transition-all duration-150 shadow-sm"
                          onMouseEnter={() => setHoveredBankrollPoint(pt.orig)}
                          onMouseLeave={() => setHoveredBankrollPoint(null)}
                        />
                      ))}

                      {/* Baseline indicators */}
                      <line 
                        x1={bankrollChartData.paddingLeft} 
                        y1={bankrollChartData.height - bankrollChartData.paddingBottom} 
                        x2={bankrollChartData.width - bankrollChartData.paddingRight} 
                        y2={bankrollChartData.height - bankrollChartData.paddingBottom} 
                        stroke="#BDC1C6" 
                        strokeWidth="1.5" 
                        strokeLinecap="round"
                      />
                    </svg>

                    {/* Interactive tooltips panel readout */}
                    <div className="min-h-[54px] bg-[#F8F9FA] border border-neutral-100 rounded-2xl p-3.5 mt-4 text-xs text-[#1F1F1F]">
                      {hoveredBankrollPoint ? (
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-sans">
                          <div>
                            <span className="text-[#5F6368] text-[10px] block uppercase tracking-tight font-bold">MATCH FIXTURE</span>
                            <span className="font-bold text-sm text-[#1F1F1F]">
                              {hoveredBankrollPoint.bet || "No action match"}
                            </span>
                          </div>
                          <div>
                            <span className="text-[#5F6368] text-[10px] block sm:text-right uppercase tracking-tight font-bold">NET PNL</span>
                            <span className={`font-bold block sm:text-right ${hoveredBankrollPoint.pnl > 0 ? 'text-[#127333]' : 'text-[#C5221F]'}`}>
                              {hoveredBankrollPoint.pnl > 0 ? '+' : ''}${hoveredBankrollPoint.pnl.toFixed(2)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[#5F6368] text-[10px] block sm:text-right uppercase tracking-tight font-bold">WALKING WALLET</span>
                            <span className="font-bold text-[#1F1F1F] block sm:text-right">
                              ${hoveredBankrollPoint.bankroll.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[#5F6368] text-center py-1 flex items-center justify-center gap-2">
                          <HelpCircle className="w-4 h-4 text-[#00639B]" />
                          Hover over any red/green bet node on the curve to inspect portfolio audit log at that point.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-[280px] bg-[#F8F9FA] rounded-2xl flex items-center justify-center text-[#5F6368] text-xs font-semibold">
                    Insufficient outcomes to plot ledger path.
                  </div>
                )}
              </div>

              {/* Isotonic calibration curves */}
              <div className="lg:col-span-4 bg-white border border-neutral-200/50 p-6 rounded-3xl shadow-[0_4px_25px_rgba(0,0,0,0.015)]">
                <div className="flex items-center justify-between mb-6 border-b border-neutral-100 pb-4">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight text-[#1F1F1F] font-display">Isotonic Calibration</h3>
                    <p className="text-[10px] text-[#5F6368] font-medium mt-0.5">Predicted Prob (X) vs True Realized rate (Y)</p>
                  </div>
                </div>

                {calibrationChartData ? (
                  <div className="relative">
                    <svg 
                      viewBox={`0 0 ${calibrationChartData.width} ${calibrationChartData.height}`} 
                      className="w-full h-auto overflow-visible select-none"
                    >
                      {/* Grid Lines */}
                      {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                        const xY = calibrationChartData.pad + ratio * (calibrationChartData.width - 2 * calibrationChartData.pad);
                        const labelY = (ratio * 100).toFixed(0) + '%';
                        return (
                          <g key={idx}>
                            {/* Horizontal */}
                            <line 
                              x1={calibrationChartData.pad} 
                              y1={xY} 
                              x2={calibrationChartData.width - calibrationChartData.pad} 
                              y2={xY} 
                              stroke="#F1F3F4" 
                              strokeWidth="1" 
                            />
                            {/* Vertical */}
                            <line 
                              x1={xY} 
                              y1={calibrationChartData.pad} 
                              x2={xY} 
                              y2={calibrationChartData.height - calibrationChartData.pad} 
                              stroke="#F1F3F4" 
                              strokeWidth="1" 
                            />
                            {/* Labels */}
                            <text 
                              x={calibrationChartData.pad - 8} 
                              y={calibrationChartData.height - xY + 3} 
                              className="font-mono text-[8px] fill-[#5F6368] font-bold" 
                              textAnchor="end"
                            >
                              {labelY}
                            </text>
                            <text 
                              x={xY} 
                              y={calibrationChartData.height - calibrationChartData.pad + 12} 
                              className="font-mono text-[8px] fill-[#5F6368] font-bold" 
                              textAnchor="middle"
                            >
                              {labelY}
                            </text>
                          </g>
                        );
                      })}

                      {/* Perfect diagonal theoretical line */}
                      <line 
                        x1={calibrationChartData.pad} 
                        y1={calibrationChartData.height - calibrationChartData.pad} 
                        x2={calibrationChartData.width - calibrationChartData.pad} 
                        y2={calibrationChartData.pad} 
                        stroke="#BDC1C6" 
                        strokeWidth="1.5" 
                        strokeDasharray="4 4"
                      />

                      {/* Plot calibrators path */}
                      {calibrationChartData.points.length > 0 && (
                        <polyline 
                           fill="none" 
                           stroke="#00639B" 
                           strokeWidth="2.75" 
                           strokeLinecap="round" 
                           strokeLinejoin="round" 
                           points={calibrationChartData.points.map(p => `${p.x},${p.y}`).join(' ')} 
                        />
                      )}

                      {/* Render circular point bins */}
                      {calibrationChartData.points.map((pt, idx) => (
                        <circle 
                          key={idx}
                          cx={pt.x}
                          cy={pt.y}
                          r={hoveredBin?.probRange === pt.orig.probRange ? "6" : "4"}
                          fill="#00639B"
                          stroke="#FFFFFF"
                          strokeWidth="1.5"
                          className="cursor-pointer transition-all duration-150 shadow-sm"
                          onMouseEnter={() => setHoveredBin(pt.orig)}
                          onMouseLeave={() => setHoveredBin(null)}
                        />
                      ))}
                    </svg>

                    {/* Calibration tooltips details */}
                    <div className="min-h-[48px] bg-[#F8F9FA] border border-neutral-100 rounded-2xl p-2.5 mt-4 text-[11px] text-[#1F1F1F]">
                      {hoveredBin ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center justify-between font-sans">
                            <span>BIN: <strong className="font-bold text-[#1F1F1F]">{hoveredBin.probRange}</strong></span>
                            <span>PRED: <strong className="text-[#00639B] font-bold">{(hoveredBin.predictedProb * 100).toFixed(0)}%</strong></span>
                            <span>TRUE: <strong className="text-[#01875F] font-bold">{(hoveredBin.actualRate * 100).toFixed(0)}%</strong></span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[#5F6368] text-center py-1.5 flex items-center justify-center gap-1">
                          Hover over calibration bins. Diagonally aligned path proves calibrated accuracy.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-[200px] bg-[#F8F9FA] rounded-2xl flex items-center justify-center text-[#5F6368] text-xs font-semibold">
                    Insufficient data for calibration bins.
                  </div>
                )}
              </div>

            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Force map of team elements */}
              <div className="lg:col-span-5 bg-white border border-neutral-200/50 p-6 rounded-3xl shadow-[0_4px_25px_rgba(0,0,0,0.015)]">
                <div className="flex items-center justify-between mb-4 border-b border-neutral-100 pb-3">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight text-[#1F1F1F] font-display">Combat Strategy Mapping</h3>
                    <p className="text-[10px] text-[#5F6368] font-medium leading-tight">Y-Axis: Defense Vulnerability (Lower is stronger) • X-Axis: Attack Strength</p>
                  </div>
                </div>

                {teamScatterData ? (
                  <div>
                    <svg 
                      viewBox={`0 0 ${teamScatterData.width} ${teamScatterData.height}`}
                      className="w-full h-auto overflow-visible select-none"
                    >
                      {/* Quadrant borders */}
                      <line 
                        x1={teamScatterData.pad} 
                        y1={teamScatterData.height / 2} 
                        x2={teamScatterData.width - teamScatterData.pad} 
                        y2={teamScatterData.height / 2} 
                        stroke="#F1F3F4" 
                        strokeWidth="1.5"
                      />
                      <line 
                        x1={teamScatterData.width / 2} 
                        y1={teamScatterData.pad} 
                        x2={teamScatterData.width / 2} 
                        y2={teamScatterData.height - teamScatterData.pad} 
                        stroke="#F1F3F4" 
                        strokeWidth="1.5"
                      />

                      {/* Quadrant textual categories */}
                      <text x={teamScatterData.width - teamScatterData.pad - 10} y={teamScatterData.pad + 15} textAnchor="end" className="fill-[#D93025] text-[7.5px] font-sans font-bold tracking-tight">Strong Attack / High vulnerability</text>
                      <text x={teamScatterData.width - teamScatterData.pad - 10} y={teamScatterData.height - teamScatterData.pad - 10} textAnchor="end" className="fill-[#01875F] text-[7.5px] font-sans font-bold tracking-tight">Resilient Defense & Strong Attack</text>
                      <text x={teamScatterData.pad + 10} y={teamScatterData.height - teamScatterData.pad - 10} textAnchor="start" className="fill-[#1A73E8] text-[7.5px] font-sans font-bold tracking-tight">Good Defense / Weak attack</text>
                      <text x={teamScatterData.pad + 10} y={teamSegment_padding(teamScatterData.pad)} textAnchor="start" className="fill-[#FBBC05] text-[7.5px] font-sans font-bold tracking-tight">Fragile defense & weak attack</text>

                      {/* Scatter items */}
                      {teamScatterData.points.map((pt, idx) => (
                        <g 
                          key={idx}
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredRating(pt.orig)}
                          onMouseLeave={() => setHoveredRating(null)}
                        >
                          <circle 
                            cx={pt.x}
                            cy={pt.y}
                            r={hoveredRating?.team === pt.orig.team ? "7" : "4.5"}
                            fill={hoveredRating?.team === pt.orig.team ? '#1A73E8' : '#3C4043'}
                            stroke="#FFFFFF"
                            strokeWidth="1.5"
                            className="transition-all duration-100 shadow-sm"
                          />
                          <text 
                            x={pt.x} 
                            y={pt.y - 8} 
                            className="text-[8px] font-sans font-bold fill-[#1F1F1F]"
                            textAnchor="middle"
                          >
                            {pt.orig.team}
                          </text>
                        </g>
                      ))}
                    </svg>

                    <div className="min-h-[48px] bg-[#F8F9FA] border border-neutral-100 rounded-2xl p-3 mt-4 text-xs text-[#1F1F1F]">
                      {hoveredRating ? (
                        <div className="flex items-center justify-between">
                          <span>CLUB: <strong className="font-bold text-[#1F1F1F]">{hoveredRating.team}</strong></span>
                          <span>ATTACK: <strong className="text-[#01875F] font-bold">{(hoveredRating.attack).toFixed(2)}</strong></span>
                          <span>DEFENSE: <strong className="text-[#D93025] font-bold">{(hoveredRating.defense).toFixed(2)}</strong></span>
                        </div>
                      ) : (
                        <div className="text-[#5F6368] text-center py-1 flex items-center justify-center gap-1">
                          Hover over nodes. Bottom-right are high attack + tight defense.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-[280px] bg-[#F8F9FA] rounded-2xl flex items-center justify-center text-[#5F6368] text-xs font-semibold">
                    Insufficient estimation iterations.
                  </div>
                )}
              </div>

              {/* Robust Estimated Ratings Table Ledger */}
              <div className="lg:col-span-7 bg-white border border-neutral-200/50 p-6 rounded-3xl shadow-[0_4px_25px_rgba(0,0,0,0.015)] flex flex-col justify-between">
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-neutral-100 pb-3">
                    <div>
                      <h3 className="text-sm font-semibold tracking-tight text-[#1F1F1F] font-display">Estimated Core Ratings Ranking</h3>
                      <p className="text-[10px] text-[#5F6368] font-medium">Model metrics continuously mapped at backtest split cutoff date</p>
                    </div>
                    {/* Search bar custom designed */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-[#5F6368] absolute left-3 top-2.5" />
                      <input 
                        type="text" 
                        placeholder="Search soccer team..." 
                        value={ratingsSearch}
                        onChange={(e) => setRatingsSearch(e.target.value)}
                        className="bg-[#F1F3F4]/90 border border-transparent rounded-full pl-8 pr-3.5 py-1.5 text-xs text-[#1F1F1F] focus:bg-white focus:ring-2 focus:ring-[#01875F]/20 focus:outline-none placeholder-neutral-400 font-medium"
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left text-[#1F1F1F]">
                      <thead className="text-[10px] text-[#5F6368] uppercase font-semibold tracking-wider border-b border-neutral-100 bg-[#F1F3F4]/50 rounded-t-xl">
                        <tr>
                          <th className="px-3 py-2.5 rounded-l-lg">Rank</th>
                          <th className="px-3 py-2.5">Club / League</th>
                          <th className="px-3 py-2.5 text-right">Attack Weight</th>
                          <th className="px-3 py-2.5 text-right">Defense Edge</th>
                          <th className="px-3 py-2.5 text-right rounded-r-lg">Expected G (Mean)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 text-neutral-800">
                        {filteredRatings.slice(0, 6).map((r, idx) => {
                          const overallExp = (Math.exp(0.3 + r.attack - r.defense) + Math.exp(r.attack - r.defense)) / 2;
                          return (
                            <tr key={idx} className="hover:bg-neutral-50/70 transition">
                              <td className="px-3 py-3 font-semibold text-[#5F6368]">
                                <span className="inline-flex items-center justify-center w-5 h-5 bg-[#F1F3F4] text-[#1F1F1F] rounded-full text-[9px] font-bold">
                                  {idx + 1}
                                </span>
                              </td>
                              <td className="px-3 py-3 font-bold text-[#1F1F1F]">
                                {r.team} <span className="text-[9px] text-[#5F6368] ml-1 font-normal">({r.league})</span>
                              </td>
                              <td className="px-3 py-3 text-right text-[#01875F] font-semibold">+{r.attack.toFixed(2)}</td>
                              <td className="px-3 py-3 text-right text-[#D93025] font-semibold">{r.defense.toFixed(2)}</td>
                              <td className="px-3 py-3 text-right text-[#111] font-bold">{overallExp.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="text-[10px] text-[#5F6368] text-center border-t border-neutral-100 pt-4 mt-4 font-medium">
                  Showing top 6 estimated team portfolios. Use soccer filter to inspect specific records.
                </div>
              </div>

            </div>

            {/* In-depth Matched Outcomes and Placed Bets Ledgers */}
            <div className="bg-white border border-neutral-200/50 p-6 rounded-3xl shadow-[0_4px_25px_rgba(0,0,0,0.015)]">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 border-b border-neutral-100 pb-4">
                <div>
                  <h3 className="text-sm font-semibold tracking-tight text-[#1F1F1F] font-display">Sequential Fixture Logs & Betting Ledger</h3>
                  <p className="text-[10px] text-[#5F6368] font-medium leading-snug">Walk-forward game iterations processed during test split (Calibration + prediction phase)</p>
                </div>

                {/* Filters Row */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Selector Filter Tabs */}
                  <div className="bg-[#F1F3F4] p-1 rounded-full flex items-center gap-1 border border-neutral-200/40">
                    {(['ALL', 'BETS', 'WINS', 'LOSSES'] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => { setFixturesFilter(f); setFixturesPage(1); }}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-tight transition-all duration-150 cursor-pointer ${fixturesFilter === f ? 'bg-[#01875F] text-white shadow-sm' : 'text-[#5F6368] hover:text-[#1F1F1F]'}`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>

                  {/* Search query box */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[#5F6368] absolute left-3 top-2.5" />
                    <input 
                      type="text" 
                      placeholder="Filter match fixture..." 
                      value={fixturesSearch}
                      onChange={(e) => { setFixturesSearch(e.target.value); setFixturesPage(1); }}
                      className="bg-[#F1F3F4]/90 border border-transparent rounded-full pl-8 pr-3.5 py-1.5 text-xs text-[#1F1F1F] focus:bg-white focus:ring-2 focus:ring-[#01875F]/20 focus:outline-none placeholder-neutral-400 font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Outcome Tables */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-[#1F1F1F]">
                  <thead className="text-[10px] text-[#5F6368] uppercase font-semibold tracking-wider border-b border-neutral-100 bg-[#F1F3F4]/50 rounded-t-xl">
                    <tr>
                      <th className="px-3 py-3 rounded-l-lg">Date</th>
                      <th className="px-3 py-3">Fixture Matchup</th>
                      <th className="px-3 py-3 text-center">Score</th>
                      <th className="px-3 py-3 text-right">Exp xG (Model)</th>
                      <th className="px-3 py-3 text-center">Outcome Probs (H / D / A)</th>
                      <th className="px-3 py-3 text-center">Odds Stake Placed</th>
                      <th className="px-3 py-3 text-right">Edge Margin</th>
                      <th className="px-3 py-3 text-right rounded-r-lg">Net Yield</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {paginatedFixtures.map((m, idx) => {
                      // Lookup corresponding bet if placed
                      const matchingBet = backtestResult.bets.find(
                        b => b.date === m.Date && b.home === m.HomeTeam && b.away === m.AwayTeam
                      );

                      return (
                        <tr key={idx} className={`hover:bg-neutral-50/70 transition ${matchingBet ? 'bg-[#E8F0FE]/25' : ''}`}>
                          <td className="px-3 py-3.5 text-[#5F6368] whitespace-nowrap font-medium">{m.Date}</td>
                          <td className="px-3 py-3.5 font-bold text-[#1F1F1F]">
                            {m.HomeTeam} vs {m.AwayTeam}
                            <span className="text-[9px] text-[#BDC1C6] ml-1.5 block sm:inline font-normal">({m.league})</span>
                          </td>
                          <td className="px-3 py-3.5 text-center whitespace-nowrap">
                            <span className="bg-[#E8EAED] text-[#3C4043] rounded-full px-2.5 py-0.5 font-bold text-[10px]">
                              {m.FTHG} - {m.FTAG}
                            </span>
                          </td>
                          <td className="px-3 py-3.5 text-right font-medium text-[#1F1F1F] whitespace-nowrap">
                            {(m.pred_lam_h).toFixed(2)} : {(m.pred_lam_a).toFixed(2)}
                          </td>
                          <td className="px-3 py-3.5 text-center text-[11px] whitespace-nowrap text-[#5F6368]">
                            <span className="font-bold text-[#1F1F1F]">{(m.cal_prob_h * 100).toFixed(0)}%</span> / 
                            <span> {(m.cal_prob_d * 100).toFixed(0)}% </span> / 
                            <span className="font-bold text-[#1F1F1F]"> {(m.cal_prob_a * 100).toFixed(0)}%</span>
                          </td>
                          <td className="px-3 py-3.5 text-center whitespace-nowrap">
                            {matchingBet ? (
                              <div className="flex flex-col items-center">
                                <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${
                                  matchingBet.result === 'W' ? 'bg-[#E6F4EA] text-[#137333] border border-[#E6F4EA]' : 'bg-[#FCE8E6] text-[#C5221F] border border-[#FCE8E6]'
                                }`}>
                                  {matchingBet.betType} @ {matchingBet.odds.toFixed(2)}
                                </span>
                                <span className="text-[9px] text-[#5F6368] mt-1 font-medium">Stake: ${matchingBet.stake.toFixed(2)}</span>
                              </div>
                            ) : (
                              <span className="text-neutral-300 font-medium">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3.5 text-right whitespace-nowrap">
                            {matchingBet ? (
                              <span className={`font-bold ${((matchingBet.modelProb * matchingBet.odds - 1.0) >= 0) ? 'text-[#137333]' : 'text-[#3C4043]'}`}>
                                {(((matchingBet.modelProb * matchingBet.odds - 1.0) * 100)).toFixed(1)}% Edge
                              </span>
                            ) : (
                              <span className="text-neutral-300 font-medium">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3.5 text-right font-bold whitespace-nowrap">
                            {matchingBet ? (
                              <span className={matchingBet.pnl > 0 ? 'text-[#127333]' : 'text-[#C5221F]'}>
                                {matchingBet.pnl > 0 ? '+' : ''}${matchingBet.pnl.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-neutral-400 font-normal">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {paginatedFixtures.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-[#5F6368] font-medium text-xs">
                          No matching walk-forward outcome logs found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Paginated Navigation Bar */}
              {maxFixturesPage > 1 && (
                <div className="flex items-center justify-between border-t border-neutral-100 pt-4 mt-4">
                  <span className="text-[#5F6368] text-xs font-medium">
                    Showing Page <strong className="text-[#1F1F1F] font-bold">{fixturesPage}</strong> / <strong className="text-[#1F1F1F] font-bold">{maxFixturesPage}</strong> ({filteredFixtures.length} matches matched)
                  </span>

                  <div className="flex items-center gap-1.5 bg-[#F1F3F4] p-1 rounded-full">
                    <button
                      onClick={() => setFixturesPage(Math.max(1, fixturesPage - 1))}
                      disabled={fixturesPage === 1}
                      className="p-1 px-3 rounded-full text-xs font-bold text-[#1F1F1F] hover:bg-white disabled:opacity-30 transition cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4 text-neutral-700" />
                    </button>
                    <button
                      onClick={() => setFixturesPage(Math.min(maxFixturesPage, fixturesPage + 1))}
                      disabled={fixturesPage === maxFixturesPage}
                      className="p-1 px-3 rounded-full text-xs font-bold text-[#1F1F1F] hover:bg-white disabled:opacity-30 transition cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4 text-neutral-700" />
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

      </main>
    </div>
  );
}

function teamSegment_padding(val: number) {
  return val + 15;
}
