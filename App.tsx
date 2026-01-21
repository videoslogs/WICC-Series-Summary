import { supabase } from './supabaseClient'
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MatchData } from './types';
import { generateSummary } from './geminiService';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';

const WICC_MEMBERS = [
  "ADITHYA", "AKSHAY", "ANKIT", "ANSHUL", "ARUN", "ATUL", "CHIRAG", "FEROZ", 
  "GAURUV RAVAL", "KABI", "KARTHIK", "KURU", "MANTHAN", "NITIN", "PRINCE", 
  "RAAM", "RUSHI", "SAMIR", "SHREE", "SHUBHA", "VIJAY", "VIVEK", "YASH", 
  "PRASATH", "DIL"
].sort();

const formatDateForDisplay = (dateStr: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  return `${year.slice(-2)}-${month}-${day}`;
};

const App: React.FC = () => {
  const [records, setRecords] = useState<MatchData[]>([]);
  const [history, setHistory] = useState<MatchData[][]>([]);
  const reportRef = useRef<HTMLDivElement>(null);
  
  const [quickPlayerA, setQuickPlayerA] = useState('');
  const [quickPlayerB, setQuickPlayerB] = useState('');
  const [teamAPlayers, setTeamAPlayers] = useState<string[]>([]);
  const [teamBPlayers, setTeamBPlayers] = useState<string[]>([]);

  const [formData, setFormData] = useState<MatchData & { 
    mvp: string, 
    topWickets: string, 
    topRuns: string, 
    topCatches: string 
  }>({
    date: new Date().toISOString().split('T')[0],
    matchNumber: '1',
    innings: 'i',
    teamOneName: 'TEAM BLUE',
    teamTwoName: 'TEAM ORANGE',
    teamOneScore: '',
    teamTwoScore: '',
    teamOneInn1: '',
    teamOneInn2: '',
    teamTwoInn1: '',
    teamTwoInn2: '',
    overs: '',
    resultType: 'Win' as any,
    teamOnePoints: '0',
    teamTwoPoints: '0',
    moi1: '',
    moi2: '',
    mom: '',
    mos: '',
    mvp: '',
    topWickets: '',
    topRuns: '',
    topCatches: '',
    seriesScore: '',
    leadingTeam: '',
    winMargin: ''
  });

  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);

  const seriesStats = useMemo(() => {
    const totalA = records.reduce((sum, r) => sum + parseFloat(r.teamOnePoints || '0'), 0);
    const totalB = records.reduce((sum, r) => sum + parseFloat(r.teamTwoPoints || '0'), 0);
    
    let champion = "IN PROGRESS";
    if (totalA >= 10) champion = `${formData.teamOneName} (SERIES CHAMPIONS)`;
    else if (totalB >= 10) champion = `${formData.teamTwoName} (SERIES CHAMPIONS)`;
    else {
      champion = totalA > totalB ? formData.teamOneName : totalB > totalA ? formData.teamTwoName : 'DRAW';
    }

    return { totalA, totalB, leader: champion, isCompleted: totalA >= 10 || totalB >= 10 };
  }, [records, formData.teamOneName, formData.teamTwoName]);

  useEffect(() => {
    let s1 = 0, s2 = 0, margin = "";
    let detectedResult: string = formData.resultType;

    if (formData.innings === 'ii') {
      const t1i1 = parseFloat(formData.teamOneInn1 || '0'), t1i2 = parseFloat(formData.teamOneInn2 || '0');
      const t2i1 = parseFloat(formData.teamTwoInn1 || '0'), t2i2 = parseFloat(formData.teamTwoInn2 || '0');
      s1 = t1i1 + t1i2; s2 = t2i1 + t2i2;
      if (s1 > 0 || s2 > 0) {
        if (s1 > s2) {
          detectedResult = `${formData.teamOneName} Wins`;
          margin = t1i1 > s2 ? `Innings & ${t1i1 - s2} Runs` : `${s1 - s2} Runs`;
        } else if (s2 > s1) {
          detectedResult = `${formData.teamTwoName} Wins`;
          margin = t2i1 > s1 ? `Innings & ${t2i1 - s1} Runs` : `${s2 - s1} Runs`;
        } else { detectedResult = 'Match Drawn'; margin = "Tied"; }
      }
    } else {
      s1 = parseFloat(formData.teamOneScore || '0'); s2 = parseFloat(formData.teamTwoScore || '0');
      if (s1 > 0 || s2 > 0) {
        if (s1 > s2) { detectedResult = `${formData.teamOneName} Wins`; margin = `${s1 - s2} Runs`; }
        else if (s2 > s1) { detectedResult = `${formData.teamTwoName} Wins`; margin = `${s2 - s1} Runs`; }
        else { detectedResult = 'Match Drawn'; margin = "Tied"; }
      }
    }

    const pts = formData.innings === 'ii' ? '3' : '2';
    let t1p = '0', t2p = '0';
    if (detectedResult.includes(formData.teamOneName)) t1p = pts;
    else if (detectedResult.includes(formData.teamTwoName)) t2p = pts;
    else if (detectedResult === 'Match Drawn') { t1p = '1'; t2p = '1'; }

    setFormData(prev => ({
      ...prev, teamOneScore: s1.toString(), teamTwoScore: s2.toString(),
      teamOnePoints: t1p, teamTwoPoints: t2p, resultType: detectedResult as any,
      winMargin: margin
    }));
  }, [formData.innings, formData.teamOneInn1, formData.teamOneInn2, formData.teamTwoInn1, formData.teamTwoInn2, formData.teamOneScore, formData.teamTwoScore, formData.teamOneName, formData.teamTwoName]);

  const handleUndo = () => { if (history.length) { setRecords(history[history.length - 1]); setHistory(prev => prev.slice(0, -1)); } };
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setFormData(prev => ({ ...prev, [e.target.name]: e.target.value })); };
  
  // FIX: Added 'async' keyword and Supabase sync logic
  const addRecord = async () => {
    // 1. Capture current data before reset
    const currentMatch = { ...formData };

    // 2. Save to local state for instant feedback
    setHistory(prev => [...prev.slice(-9), [...records]]);
    if (editIndex !== null) {
      const updated = [...records]; updated[editIndex] = currentMatch; setRecords(updated); setEditIndex(null);
    } else { setRecords([...records, currentMatch]); }

    // 3. CLOUD SYNC: Send to Supabase
    try {
      console.log("Vibe Check: Sending to Supabase...");
      const { error } = await supabase
        .from('wicc_matches')
        .insert([
          {
            date: currentMatch.date,
            matchnumber: currentMatch.matchNumber,
            innings: currentMatch.innings,
            teamonename: currentMatch.teamOneName,
            teamtwoname: currentMatch.teamTwoName
          }
        ]);

      if (error) throw error;
      console.log("Vibe Check: Supabase Sync Success!");
      alert("Match recorded and synced to Cloud!");
    } catch (err: any) {
      console.error("Cloud Sync Error:", err);
      alert("Local save success, but Cloud sync failed: " + (err.message || "Network Error"));
    }

    // 4. Reset the form
    setFormData(prev => ({ 
      ...prev, teamOneScore: '', teamTwoScore: '', teamOneInn1: '', teamOneInn2: '',
      teamTwoInn1: '', teamTwoInn2: '', moi1: '', moi2: '', mom: '', overs: '', winMargin: '',
      matchNumber: (parseInt(prev.matchNumber) + 1 || records.length + 2).toString()
    }));
  };

  // FIX: Added Supabase sync for the series table when archiving
  const archiveSeries = async () => {
    if (!confirm('Archive and Reset current series? This will also sync awards to the Cloud.')) return;
    
    try {
      const { error } = await supabase
        .from('wicc_series')
        .insert([{
          mos: formData.mos,
          mvp: formData.mvp,
          topwickets: formData.topWickets,
          topruns: formData.topRuns,
          topcatches: formData.topCatches,
          winner: seriesStats.leader
        }]);
      
      if (error) throw error;
      alert("Series awards archived to Cloud!");
    } catch (err: any) {
      console.error("Archive Error:", err);
      alert("Could not sync series awards to Cloud, but resetting local screen now.");
    }

    setRecords([]); setHistory([]);
    setFormData(prev => ({ ...prev, mos: '', mvp: '', topWickets: '', topRuns: '', topCatches: '', matchNumber: '1' }));
  };

  const finalizeWithAI = async () => {
    if (!records.length) return;
    setLoading(true);
    const result = await generateSummary({
      ...formData,
      seriesStats,
    });
    setSummary(result);
    setLoading(false);
  };

  const handleScreenshot = async () => {
    if (reportRef.current) {
      const canvas = await html2canvas(reportRef.current, { backgroundColor: '#020617', scale: 2 });
      const image = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = image;
      link.download = `WICC_Report_${formData.date}.png`;
      link.click();
    }
  };

  const handleWhatsAppShare = () => {
    const localSum = `🏆 WICC SERIES RECAP 🏏\nChampions: ${seriesStats.leader}\n\nElite Awards:\n- MOS: ${formData.mos}\n- MVP: ${formData.mvp}\n- Runs: ${formData.topRuns}\n- Wickets: ${formData.topWickets}\n- Catches: ${formData.topCatches}`;
    const text = encodeURIComponent(summary || localSum);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center bg-slate-950">
      <datalist id="members-all">
        {WICC_MEMBERS.map(m => <option key={m} value={m} />)}
      </datalist>

      {/* Header */}
      <div className="w-full max-w-7xl flex flex-col items-center logo-glow mb-6 md:mb-10">
        <h1 className="font-orbitron text-5xl md:text-8xl font-bold tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">WICC</h1>
        <div className="flex items-center gap-2 mt-2">
          <span className="h-1.5 w-6 md:w-10 bg-[#1581BF] rounded-full shadow-[0_0_10px_#1581BF]"></span>
          <p className="font-orbitron text-[10px] md:text-[12px] text-[#57c1ff] font-bold tracking-[0.3em] md:tracking-[0.5em] uppercase">Premier Recorder</p>
          <span className="h-1.5 w-6 md:w-10 bg-orange-500 rounded-full shadow-[0_0_10px_#f97316]"></span>
        </div>
      </div>

      {/* Series Leaderboard Widget */}
      <div className="w-full max-w-7xl grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 mb-6 md:mb-8">
        <div className="bg-slate-900 border-2 border-[#1581BF] rounded-2xl md:rounded-3xl p-4 md:p-6 flex flex-col items-center justify-center shadow-[0_0_20px_rgba(21,129,191,0.2)] team-blue-bg">
          <span className="text-[9px] md:text-[11px] font-orbitron text-white font-bold tracking-[0.1em] md:tracking-[0.2em] uppercase text-center line-clamp-1">{formData.teamOneName}</span>
          <span className={`text-4xl md:text-6xl font-black mt-1 md:mt-2 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] ${seriesStats.totalA >= 10 ? 'text-yellow-400 animate-pulse' : 'text-white'}`}>{seriesStats.totalA}</span>
        </div>
        <div className="hidden md:flex glow-box-target rounded-3xl p-6 flex-col items-center justify-center shadow-[0_0_40px_rgba(249,115,22,0.3)]">
          <span className="text-[11px] font-orbitron text-white font-black tracking-[0.2em] uppercase drop-shadow-[0_0_5px_rgba(0,0,0,0.5)]">TARGET: 10 PTS</span>
          <span className={`text-xl font-black mt-2 tracking-widest text-center uppercase drop-shadow-[0_0_15px_rgba(0,0,0,0.8)] ${seriesStats.isCompleted ? 'text-yellow-400' : 'text-white'}`}>
            {seriesStats.leader}
          </span>
        </div>
        <div className="bg-slate-900 border-2 border-orange-500 rounded-2xl md:rounded-3xl p-4 md:p-6 flex flex-col items-center justify-center shadow-[0_0_20px_rgba(249,115,22,0.2)] team-orange-bg">
          <span className="text-[9px] md:text-[11px] font-orbitron text-white font-bold tracking-[0.1em] md:tracking-[0.2em] uppercase text-center line-clamp-1">{formData.teamTwoName}</span>
          <span className={`text-4xl md:text-6xl font-black mt-1 md:mt-2 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] ${seriesStats.totalB >= 10 ? 'text-yellow-400 animate-pulse' : 'text-white'}`}>{seriesStats.totalB}</span>
        </div>
        <div className="md:hidden col-span-2 glow-box-target rounded-xl p-3 flex flex-col items-center justify-center">
            <span className="text-[9px] font-orbitron text-white font-black tracking-[0.1em] uppercase">SERIES TARGET: 10 PTS</span>
            <span className="text-sm font-black mt-1 tracking-wider text-center uppercase text-white line-clamp-1">{seriesStats.leader}</span>
        </div>
      </div>

      {/* Main Spreadsheet */}
      <div className="w-full max-w-7xl spreadsheet-container rounded-2xl md:rounded-3xl overflow-hidden mb-6 md:mb-8">
        <div className="flex flex-col md:flex-row justify-between items-center p-3 md:p-5 bg-slate-900/98 border-b-2 border-[#1581BF]/50 gap-3 md:gap-4">
          <div className="flex gap-2 w-full md:w-auto overflow-x-auto no-scrollbar pb-1 md:pb-0">
            <button onClick={handleUndo} className="flex-1 md:flex-none px-3 md:px-5 py-2 bg-slate-800 text-[10px] font-black rounded-lg border border-[#1581BF]/30 text-white whitespace-nowrap">UNDO</button>
            <button onClick={() => { 
                const ws = XLSX.utils.json_to_sheet(records);
                const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "WICC");
                XLSX.writeFile(wb, `WICC_Series_${formData.date}.xlsx`);
            }} className="flex-1 md:flex-none px-3 md:px-5 py-2 bg-[#1581BF]/20 text-[10px] font-black rounded-lg border border-[#1581BF] text-[#57c1ff] whitespace-nowrap">EXCEL</button>
            <button onClick={archiveSeries} className="flex-1 md:flex-none px-3 md:px-5 py-2 bg-red-900/20 text-[10px] font-black rounded-lg border border-red-600 text-red-400 whitespace-nowrap">RESET</button>
          </div>
          
          <div className="flex gap-2 md:gap-4 items-center bg-black/80 px-4 md:px-8 py-2 md:py-3 rounded-xl md:rounded-2xl border border-white/10 w-full md:w-auto">
            <input name="teamOneName" value={formData.teamOneName} onChange={handleInputChange} className="flex-1 bg-[#00a2ff]/40 border-2 border-[#00a2ff] text-white text-center font-black py-1.5 md:py-2 rounded-lg text-[10px] md:text-sm outline-none uppercase shadow-[0_0_10px_rgba(0,162,255,0.4)]" />
            <span className="text-white font-orbitron font-bold italic text-sm md:text-xl">VS</span>
            <input name="teamTwoName" value={formData.teamTwoName} onChange={handleInputChange} className="flex-1 bg-[#ff7300]/40 border-2 border-[#ff7300] text-white text-center font-black py-1.5 md:py-2 rounded-lg text-[10px] md:text-sm outline-none uppercase shadow-[0_0_10px_rgba(255,115,0,0.4)]" />
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
            <div className="min-w-[800px]">
                <div className="grid grid-cols-12 text-center border-b border-[#1581BF]/50 font-bold text-[9px] md:text-[10px] uppercase bg-slate-900 text-[#57c1ff] tracking-widest py-1">
                <div className="col-span-1 py-3 md:py-4 border-r border-white/5">Date</div>
                <div className="col-span-1 py-3 md:py-4 border-r border-white/5">Match</div>
                <div className="col-span-2 py-3 md:py-4 border-r border-white/5 bg-[#00a2ff]/30 text-white line-clamp-1 px-1">{formData.teamOneName}</div>
                <div className="col-span-2 py-3 md:py-4 border-r border-white/5 bg-[#ff7300]/30 text-white line-clamp-1 px-1">{formData.teamTwoName}</div>
                <div className="col-span-1 py-3 md:py-4 border-r border-white/5">Overs</div>
                <div className="col-span-2 py-3 md:py-4 border-r border-white/5 text-orange-400">Winner</div>
                <div className="col-span-1 py-3 md:py-4 border-r border-white/5">Pts</div>
                <div className="col-span-2 py-3 md:py-4 font-black">Awards</div>
                </div>

                <div className="min-h-[150px] max-h-[300px] md:max-h-[400px] overflow-y-auto bg-black/80">
                {records.map((rec, idx) => (
                    <div key={idx} className="grid grid-cols-12 text-center border-b border-white/5 text-[11px] md:text-[12px] font-mono group items-center py-2 md:py-3 relative">
                    <div className="col-span-1 border-r border-white/5 text-white/60 text-[7px] md:text-[9px]">{formatDateForDisplay(rec.date)}</div>
                    <div className="col-span-1 border-r border-white/5 font-bold text-white">#{rec.matchNumber}</div>
                    <div className="col-span-2 border-r border-white/5 text-[#00e1ff] font-black">
                        {rec.innings === 'ii' ? `${rec.teamOneInn1} & ${rec.teamOneInn2}` : rec.teamOneScore}
                    </div>
                    <div className="col-span-2 border-r border-white/5 text-[#ffaa00] font-black">
                        {rec.innings === 'ii' ? `${rec.teamTwoInn1} & ${rec.teamTwoInn2}` : rec.teamTwoScore}
                    </div>
                    <div className="col-span-1 border-r border-white/5 text-white/80">{rec.overs}</div>
                    <div className={`col-span-2 border-r border-white/5 font-black text-[10px] md:text-[11px] px-1 line-clamp-1 ${rec.resultType.includes(formData.teamOneName) ? 'text-[#00e1ff]' : rec.resultType.includes(formData.teamTwoName) ? 'text-[#ffaa00]' : 'text-white'}`}>
                        {rec.resultType}
                    </div>
                    <div className="col-span-1 border-r border-white/5 flex justify-center gap-1 md:gap-2 text-[10px] md:text-[11px] font-black">
                        <span className="text-[#00e1ff]">{rec.teamOnePoints}</span>
                        <span className="text-[#ffaa00]">{rec.teamTwoPoints}</span>
                    </div>
                    <div className="col-span-2 flex flex-col items-center justify-center relative px-1">
                        <div className="flex flex-col text-[7px] md:text-[8px] leading-tight text-white/90">
                          <span className="text-yellow-400 font-black"><span className="text-[6px] opacity-60 uppercase mr-1">MOM:</span>{rec.mom}</span>
                          <span className="text-white font-bold"><span className="text-[6px] opacity-60 uppercase mr-1">MOI:</span>{rec.moi1}{rec.moi2 ? ` & ${rec.moi2}` : ''}</span>
                        </div>
                        <div className="absolute inset-0 bg-slate-900 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200">
                        <button onClick={() => { setFormData(records[idx] as any); setEditIndex(idx); }} className="bg-[#1581BF] px-2 md:px-3 py-1 rounded text-[9px] font-black text-white">EDIT</button>
                        <button onClick={() => setRecords(prev => prev.filter((_, i) => i !== idx))} className="bg-red-600 px-2 md:px-3 py-1 rounded text-[9px] font-black text-white">DEL</button>
                        </div>
                    </div>
                    </div>
                ))}
                </div>
            </div>
        </div>

        {/* Input Interface */}
        <div className="bg-slate-900 p-4 md:p-6 border-t-2 border-[#1581BF]/50">
          <div className="grid grid-cols-2 md:grid-cols-12 gap-3 md:gap-4 items-end mb-4 md:mb-6">
            <div className="col-span-1 md:col-span-2">
              <label className="block text-[8px] md:text-[10px] text-white/50 mb-1 uppercase font-black text-center">Match Date</label>
              <div className="date-input-wrapper w-full mx-auto">
                <input type="date" name="date" value={formData.date} onChange={handleInputChange} className="w-full h-10 md:h-12 text-center font-black glow-input rounded-xl px-1" />
              </div>
            </div>
            <div className="col-span-1 md:col-span-1">
              <label className="block text-[8px] md:text-[10px] text-white/50 mb-1 uppercase font-black text-center">Format</label>
              <select name="innings" value={formData.innings} onChange={handleInputChange as any} className="w-full h-10 md:h-12 bg-black/80 text-white text-[9px] md:text-[11px] font-black border-2 border-[#1581BF] rounded-xl outline-none px-1">
                <option value="i">1 INN</option>
                <option value="ii">2 INN</option>
              </select>
            </div>
            {formData.innings === 'ii' ? (
              <>
                <div className="col-span-2 md:col-span-2">
                  <label className="block text-[8px] md:text-[10px] text-[#00e1ff] mb-1 uppercase font-black text-center">{formData.teamOneName}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input name="teamOneInn1" placeholder="I1" value={formData.teamOneInn1} onChange={handleInputChange} className="h-10 md:h-12 text-center text-[10px] md:text-[11px] font-black bg-black/80 border-2 border-[#00a2ff] text-[#00e1ff] rounded-xl" />
                    <input name="teamOneInn2" placeholder="I2" value={formData.teamOneInn2} onChange={handleInputChange} className="h-10 md:h-12 text-center text-[10px] md:text-[11px] font-black bg-black/80 border-2 border-[#00a2ff] text-[#00e1ff] rounded-xl" />
                  </div>
                </div>
                <div className="col-span-2 md:col-span-2">
                  <label className="block text-[8px] md:text-[10px] text-[#ffaa00] mb-1 uppercase font-black text-center">{formData.teamTwoName}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input name="teamTwoInn1" placeholder="I1" value={formData.teamTwoInn1} onChange={handleInputChange} className="h-10 md:h-12 text-center text-[10px] md:text-[11px] font-black bg-black/80 border-2 border-[#ff7300] text-[#ffaa00] rounded-xl" />
                    <input name="teamTwoInn2" placeholder="I2" value={formData.teamTwoInn2} onChange={handleInputChange} className="h-10 md:h-12 text-center text-[10px] md:text-[11px] font-black bg-black/80 border-2 border-[#ff7300] text-[#ffaa00] rounded-xl" />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-[8px] md:text-[10px] text-[#00e1ff] mb-1 uppercase font-black text-center">{formData.teamOneName}</label>
                  <input name="teamOneScore" placeholder="Score" value={formData.teamOneScore} onChange={handleInputChange} className="w-full h-10 md:h-12 text-center text-[10px] md:text-[11px] font-black bg-black/80 border-2 border-[#00a2ff] text-[#00e1ff] rounded-xl" />
                </div>
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-[8px] md:text-[10px] text-[#ffaa00] mb-1 uppercase font-black text-center">{formData.teamTwoName}</label>
                  <input name="teamTwoScore" placeholder="Score" value={formData.teamTwoScore} onChange={handleInputChange} className="w-full h-10 md:h-12 text-center text-[10px] md:text-[11px] font-black bg-black/80 border-2 border-[#ff7300] text-[#ffaa00] rounded-xl" />
                </div>
              </>
            )}
            <div className="col-span-1 md:col-span-1">
              <label className="block text-[8px] md:text-[10px] text-white/50 mb-1 uppercase font-black text-center">Overs</label>
              <input name="overs" value={formData.overs} onChange={handleInputChange} className="w-full h-10 md:h-12 text-center text-[10px] md:text-[11px] font-black bg-black/80 border-2 border-slate-700 rounded-xl text-white" />
            </div>
            <div className="col-span-1 md:col-span-1">
              <label className="block text-[8px] md:text-[10px] text-yellow-400 mb-1 uppercase font-black text-center">Margin</label>
              <input name="winMargin" value={formData.winMargin} onChange={handleInputChange} className="w-full h-10 md:h-12 text-center text-[9px] md:text-[10px] font-black bg-black/80 border-2 border-yellow-500/30 rounded-xl text-yellow-300" />
            </div>
            <div className="col-span-2 md:col-span-2">
              <button onClick={addRecord} className="w-full h-10 md:h-12 bg-white text-black font-black rounded-xl shadow-lg hover:scale-95 tr
