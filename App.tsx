
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MatchData } from './types';
import { generateSummary } from './geminiService';
import { supabase } from './supabaseClient';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';

const WICC_MEMBERS = [
  "ADITHYA", "AKSHAY", "ANKIT", "ANSHUL", "ARUN", "ATUL", "CHIRAG", "FEROZ", 
  "GAURUV RAVAL", "KABI", "KARTHIK", "KURU", "MANTHAN", "NITIN", "PRINCE", 
  "RAAM", "RUSHI", "SAMIR", "SHREE", "SHUBHA", "VIJAY", "VIVEK", "YASH", 
  "PRASATH", "DIL"
].sort();

interface ArchivedSeries {
  id: string;
  created_at: string;
  leader: string;
  team_a: string;
  team_b: string;
  pts_a: number;
  pts_b: number;
  awards: {
    mos: string;
    mvp: string;
    runs: string;
    wickets: string;
    catches: string;
  };
}

const formatDateForDisplay = (dateStr: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  return `${year.slice(-2)}-${month}-${day}`;
};

const App: React.FC = () => {
  const [records, setRecords] = useState<MatchData[]>([]);
  const [archivedList, setArchivedList] = useState<ArchivedSeries[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [isCloudLoading, setIsCloudLoading] = useState(true);
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

  // Load from Supabase on mount
  useEffect(() => {
    const fetchCloudData = async () => {
      setIsCloudLoading(true);
      
      const { data: matches } = await supabase
        .from('wicc_matches')
        .select('*')
        .eq('is_archived', false)
        .order('created_at', { ascending: true });
      
      if (matches) setRecords(matches);

      const { data: history } = await supabase
        .from('wicc_series')
        .select('*')
        .order('created_at', { ascending: false });

      if (history) {
        const mappedHistory = history.map((h: any) => ({
            id: h.id,
            created_at: h.created_at,
            leader: h.leader,
            team_a: h.team_a,
            team_b: h.team_b,
            pts_a: h.pts_a,
            pts_b: h.pts_b,
            awards: h.awards
        }));
        setArchivedList(mappedHistory);
      }
      
      setIsCloudLoading(false);
    };

    fetchCloudData();
  }, []);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setFormData(prev => ({ ...prev, [e.target.name]: e.target.value })); };
  
  // STRICT PAYLOAD MAPPING: This ensures NO invalid columns are sent to Supabase
  const getCleanDBPayload = (data: any) => {
    return {
      date: data.date,
      matchNumber: data.matchNumber,
      innings: data.innings,
      teamOneName: data.teamOneName,
      teamTwoName: data.teamTwoName,
      teamOneScore: data.teamOneScore,
      teamTwoScore: data.teamTwoScore,
      teamOneInn1: data.teamOneInn1,
      teamOneInn2: data.teamOneInn2,
      teamTwoInn1: data.teamTwoInn1,
      teamTwoInn2: data.teamTwoInn2,
      overs: data.overs,
      resultType: data.resultType,
      teamOnePoints: data.teamOnePoints,
      teamTwoPoints: data.teamTwoPoints,
      moi1: data.moi1,
      moi2: data.moi2,
      mom: data.mom,
      mos: data.mos,
      winMargin: data.winMargin
    };
  };

  const addRecord = async () => {
    setLoading(true);

    const dbPayload = getCleanDBPayload(formData);

    if (editIndex !== null) {
      const target = records[editIndex];
      const { error } = await supabase
        .from('wicc_matches')
        .update(dbPayload)
        .eq('id', (target as any).id);
      
      if (!error) {
        const updated = [...records];
        updated[editIndex] = formData;
        setRecords(updated);
        setEditIndex(null);
      } else {
        alert("Sync Error: " + error.message);
      }
    } else {
      const { data, error } = await supabase
        .from('wicc_matches')
        .insert([{ ...dbPayload, is_archived: false }])
        .select();

      if (data) setRecords([...records, data[0]]);
      if (error) alert("Sync Error: " + error.message);
    }

    setFormData(prev => ({ 
      ...prev, teamOneScore: '', teamTwoScore: '', teamOneInn1: '', teamOneInn2: '',
      teamTwoInn1: '', teamTwoInn2: '', moi1: '', moi2: '', mom: '', overs: '', winMargin: '',
      matchNumber: (parseInt(prev.matchNumber) + 1 || records.length + 2).toString()
    }));
    setLoading(false);
  };

  const deleteRecord = async (idx: number) => {
    const target = records[idx];
    const { error } = await supabase
      .from('wicc_matches')
      .delete()
      .eq('id', (target as any).id);
    
    if (!error) setRecords(prev => prev.filter((_, i) => i !== idx));
  };

  const archiveSeries = async () => {
    if (!confirm('Cloud Archive current series and reset matches?')) return;
    setLoading(true);

    const awards = {
      mos: formData.mos,
      mvp: formData.mvp,
      runs: formData.topRuns,
      wickets: formData.topWickets,
      catches: formData.topCatches
    };

    const { data: newSeries, error: sError } = await supabase
      .from('wicc_series')
      .insert([{
        leader: seriesStats.leader,
        team_a: formData.teamOneName,
        team_b: formData.teamTwoName,
        pts_a: seriesStats.totalA,
        pts_b: seriesStats.totalB,
        awards: awards
      }])
      .select();

    if (sError) {
      alert("Archive Failed: " + sError.message);
      setLoading(false);
      return;
    }

    await supabase
      .from('wicc_matches')
      .update({ is_archived: true })
      .eq('is_archived', false);

    if (newSeries) {
        const mapped = {
            id: newSeries[0].id,
            created_at: newSeries[0].created_at,
            leader: newSeries[0].leader,
            team_a: newSeries[0].team_a,
            team_b: newSeries[0].team_b,
            pts_a: newSeries[0].pts_a,
            pts_b: newSeries[0].pts_b,
            awards: newSeries[0].awards
        } as ArchivedSeries;
        setArchivedList([mapped, ...archivedList]);
    }

    setRecords([]);
    setFormData(prev => ({ ...prev, mos: '', mvp: '', topWickets: '', topRuns: '', topCatches: '', matchNumber: '1' }));
    setLoading(false);
    alert("Series Successfully Archived to WICC Cloud!");
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

  if (isCloudLoading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4">
      <div className="w-12 h-12 border-4 border-[#1581BF] border-t-orange-500 rounded-full animate-spin"></div>
      <p className="font-orbitron text-xs text-[#57c1ff] tracking-[0.3em] uppercase animate-pulse">Establishing Cloud Sync...</p>
    </div>
  );

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center bg-slate-950">
      <datalist id="members-all">
        {WICC_MEMBERS.map(m => <option key={m} value={m} />)}
      </datalist>

      {/* Header */}
      <div className="w-full max-w-7xl flex flex-col items-center logo-glow mb-6 md:mb-10 relative">
        <button 
          onClick={() => setShowHistoryModal(true)}
          className="absolute right-0 top-0 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg text-[9px] font-orbitron font-bold tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all uppercase"
        >
          View History
        </button>
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
                        <button onClick={() => deleteRecord(idx)} className="bg-red-600 px-2 md:px-3 py-1 rounded text-[9px] font-black text-white">DEL</button>
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
              <button onClick={addRecord} disabled={loading} className="w-full h-10 md:h-12 bg-white text-black font-black rounded-xl shadow-lg hover:scale-95 transition-all uppercase text-[10px] md:text-[12px] tracking-wider disabled:opacity-50">
                {loading ? 'SYNCING...' : (editIndex !== null ? 'UPDATE' : 'COMMIT')}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-12 gap-3 md:gap-4">
            <div className="col-span-1 md:col-span-2">
              <p className="text-[7px] text-yellow-400 font-black uppercase mb-1 ml-1">MOM Caption</p>
              <input 
                list="members-all"
                name="mom" 
                placeholder="MOM" 
                value={formData.mom} 
                onChange={handleInputChange} 
                className="w-full h-10 md:h-12 px-3 text-[9px] md:text-[11px] font-black bg-black/80 border-2 border-yellow-500 text-yellow-300 rounded-xl placeholder:text-yellow-700 outline-none" 
              />
            </div>
            <div className="col-span-1 md:col-span-2">
              <p className="text-[7px] text-white/60 font-black uppercase mb-1 ml-1">MOI Entry 1</p>
              <input 
                list="members-all"
                name="moi1" 
                placeholder="MOI 1" 
                value={formData.moi1} 
                onChange={handleInputChange} 
                className="w-full h-10 md:h-12 px-3 text-[9px] md:text-[11px] font-black bg-black/80 border-2 border-white/20 text-white rounded-xl placeholder:text-white/30 outline-none" 
              />
            </div>
            <div className="col-span-1 md:col-span-2">
              <p className="text-[7px] text-white/60 font-black uppercase mb-1 ml-1">MOI Entry 2</p>
              <input 
                list="members-all"
                name="moi2" 
                placeholder="MOI 2" 
                value={formData.moi2} 
                onChange={handleInputChange} 
                className="w-full h-10 md:h-12 px-3 text-[9px] md:text-[11px] font-black bg-black/80 border-2 border-white/20 text-white rounded-xl placeholder:text-white/30 outline-none" 
              />
            </div>
            <div className="col-span-1 md:col-span-3">
              <label className="block text-[8px] text-[#00e1ff] mb-1 uppercase font-black text-center">{formData.teamOneName} PTS</label>
              <input name="teamOnePoints" value={formData.teamOnePoints} onChange={handleInputChange} className="w-full h-8 md:h-10 text-center text-[12px] md:text-[14px] font-black bg-black/80 border border-[#00a2ff] text-[#00e1ff] rounded-lg" />
            </div>
            <div className="col-span-1 md:col-span-3">
              <label className="block text-[8px] text-[#ffaa00] mb-1 uppercase font-black text-center">{formData.teamTwoName} PTS</label>
              <input name="teamTwoPoints" value={formData.teamTwoPoints} onChange={handleInputChange} className="w-full h-8 md:h-10 text-center text-[12px] md:text-[14px] font-black bg-black/80 border border-[#ff7300] text-[#ffaa00] rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      {/* Member Assignment Widgets */}
      <div className="w-full max-w-7xl grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 md:mb-8">
        <div className="bg-slate-900/60 border-2 border-[#00a2ff] rounded-xl p-3 md:p-4 shadow-[0_0_15px_rgba(0,162,255,0.2)]">
          <label className="text-[9px] md:text-[10px] font-orbitron font-bold text-[#00e1ff] tracking-widest uppercase mb-2 block">Assign Member: {formData.teamOneName}</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input 
                list="members-all"
                placeholder="Type name..."
                value={quickPlayerA}
                onChange={(e) => setQuickPlayerA(e.target.value.toUpperCase())}
                className="w-full h-8 md:h-9 bg-black/80 border border-[#00a2ff] rounded-lg px-2 text-white font-mono text-[10px] outline-none"
              />
            </div>
            <button 
              onClick={() => { if(quickPlayerA) { setTeamAPlayers(p => [...new Set([...p, quickPlayerA])]); setQuickPlayerA(''); } }}
              className="px-3 h-8 md:h-9 bg-[#00a2ff] text-white font-black text-[9px] rounded-lg"
            >ADD</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1 max-h-[50px] overflow-y-auto p-1 bg-black/20 rounded-lg">
            {teamAPlayers.map((p, i) => (
              <span key={i} className="px-2 py-0.5 bg-[#00a2ff]/20 border border-[#00a2ff] text-[#00e1ff] rounded-full text-[8px] font-bold flex items-center gap-1">
                {p} <button onClick={() => setTeamAPlayers(prev => prev.filter((_, idx) => idx !== i))}>&times;</button>
              </span>
            ))}
          </div>
        </div>

        <div className="bg-slate-900/60 border-2 border-[#ff7300] rounded-xl p-3 md:p-4 shadow-[0_0_15px_rgba(255,115,0,0.2)]">
          <label className="text-[9px] md:text-[10px] font-orbitron font-bold text-[#ffaa00] tracking-widest uppercase mb-2 block">Assign Member: {formData.teamTwoName}</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input 
                list="members-all"
                placeholder="Type name..."
                value={quickPlayerB}
                onChange={(e) => setQuickPlayerB(e.target.value.toUpperCase())}
                className="w-full h-8 md:h-9 bg-black/80 border border-[#ff7300] rounded-lg px-2 text-white font-mono text-[10px] outline-none"
              />
            </div>
            <button 
              onClick={() => { if(quickPlayerB) { setTeamBPlayers(p => [...new Set([...p, quickPlayerB])]); setQuickPlayerB(''); } }}
              className="px-3 h-8 md:h-9 bg-orange-600 text-white font-black text-[9px] rounded-lg"
            >ADD</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1 max-h-[50px] overflow-y-auto p-1 bg-black/20 rounded-lg">
            {teamBPlayers.map((p, i) => (
              <span key={i} className="px-2 py-0.5 bg-orange-600/20 border border-[#ff7300] text-[#ffaa00] rounded-full text-[8px] font-bold flex items-center gap-1">
                {p} <button onClick={() => setTeamBPlayers(prev => prev.filter((_, idx) => idx !== i))}>&times;</button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Series End Awards Hub */}
      <div className="w-full max-w-7xl bg-slate-900 border-2 border-orange-500/40 rounded-3xl md:rounded-[40px] p-4 md:p-8 mb-6">
        <h3 className="font-orbitron text-orange-400 text-sm md:text-lg tracking-[0.2em] md:tracking-[0.4em] font-black mb-4 md:mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-1">
          <span>SERIES AWARDS HUB</span>
          <span className="text-[8px] md:text-[11px] text-[#1581BF] uppercase italic font-bold tracking-widest animate-pulse">SUPABASE CLOUD LIVE</span>
        </h3>
        
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-6">
          <div className="bg-black/40 p-3 md:p-5 rounded-xl border border-white/5 flex flex-col">
            <p className="text-[8px] md:text-[10px] text-orange-500 uppercase font-black mb-2">MOS 🧢</p>
            <input list="members-all" name="mos" value={formData.mos} onChange={handleInputChange} placeholder="Name" className="bg-transparent text-white font-black text-xs md:text-sm outline-none border-b border-white/10 focus:border-orange-500 uppercase py-1" />
          </div>
          <div className="bg-black/40 p-3 md:p-5 rounded-xl border border-white/5 flex flex-col">
            <p className="text-[8px] md:text-[10px] text-[#00e1ff] uppercase font-black mb-2">MVP ⭐</p>
            <input list="members-all" name="mvp" value={formData.mvp} onChange={handleInputChange} placeholder="Name" className="bg-transparent text-white font-black text-xs md:text-sm outline-none border-b border-white/10 focus:border-[#00a2ff] uppercase py-1" />
          </div>
          <div className="bg-black/40 p-3 md:p-5 rounded-xl border border-white/5 flex flex-col">
            <p className="text-[8px] md:text-[10px] text-red-500 uppercase font-black mb-2">MOST WICKETS</p>
            <input list="members-all" name="topWickets" value={formData.topWickets} onChange={handleInputChange} placeholder="Name" className="bg-transparent text-white font-black text-xs md:text-sm outline-none border-b border-white/10 focus:border-red-500 uppercase py-1" />
          </div>
          <div className="bg-black/40 p-3 md:p-5 rounded-xl border border-white/5 flex flex-col">
            <p className="text-[8px] md:text-[10px] text-green-500 uppercase font-black mb-2">MOST RUNS</p>
            <input list="members-all" name="topRuns" value={formData.topRuns} onChange={handleInputChange} placeholder="Name" className="bg-transparent text-white font-black text-xs md:text-sm outline-none border-b border-white/10 focus:border-green-500 uppercase py-1" />
          </div>
          <div className="bg-black/40 p-3 md:p-5 rounded-xl border border-white/5 flex flex-col">
            <p className="text-[8px] md:text-[10px] text-yellow-400 uppercase font-black mb-2">MOST CATCHES</p>
            <input list="members-all" name="topCatches" value={formData.topCatches} onChange={handleInputChange} placeholder="Name" className="bg-transparent text-white font-black text-xs md:text-sm outline-none border-b border-white/10 focus:border-yellow-500 uppercase py-1" />
          </div>
        </div>
      </div>

      {/* Instant Recap Gadget (Local, no API) */}
      {(formData.mos || formData.mvp || seriesStats.totalA > 0 || seriesStats.totalB > 0) && (
        <div className="w-full max-w-7xl mb-8 animate-in slide-in-from-top-4 duration-300">
           <div className="bg-slate-900 border-t-4 border-[#1581BF] rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-100 transition-opacity">
                 <button onClick={archiveSeries} disabled={loading} className="text-red-500 font-orbitron text-[10px] font-black border border-red-500 px-3 py-1 rounded-full hover:bg-red-500 hover:text-white transition-all">ARCHIVE SERIES</button>
              </div>
              <div className="flex flex-col md:flex-row gap-6 items-center">
                 <div className="flex-1 text-center md:text-left">
                    <h4 className="font-orbitron text-white text-xs tracking-widest uppercase mb-1 font-bold">🏆 SERIES RECAP</h4>
                    <p className="text-[#57c1ff] font-black text-xl md:text-2xl uppercase">{seriesStats.leader}</p>
                    <div className="flex gap-4 mt-2 justify-center md:justify-start font-mono text-xs">
                       <span className="text-[#00e1ff]">{formData.teamOneName}: {seriesStats.totalA} Pts</span>
                       <span className="text-white/20">|</span>
                       <span className="text-[#ffaa00]">{formData.teamTwoName}: {seriesStats.totalB} Pts</span>
                    </div>
                 </div>
                 <div className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-8 flex-[2] w-full border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-8">
                    {formData.mos && <div className="text-center md:text-left"><p className="text-[8px] text-orange-400 uppercase font-black">MOS</p><p className="text-white font-bold text-sm truncate uppercase">{formData.mos}</p></div>}
                    {formData.mvp && <div className="text-center md:text-left"><p className="text-[8px] text-[#00e1ff] uppercase font-black">MVP</p><p className="text-white font-bold text-sm truncate uppercase">{formData.mvp}</p></div>}
                    {formData.topRuns && <div className="text-center md:text-left"><p className="text-[8px] text-green-400 uppercase font-black">RUNS</p><p className="text-white font-bold text-sm truncate uppercase">{formData.topRuns}</p></div>}
                    {formData.topWickets && <div className="text-center md:text-left"><p className="text-[8px] text-red-400 uppercase font-black">WKTS</p><p className="text-white font-bold text-sm truncate uppercase">{formData.topWickets}</p></div>}
                    {formData.topCatches && <div className="text-center md:text-left"><p className="text-[8px] text-yellow-400 uppercase font-black">CTHS</p><p className="text-white font-bold text-sm truncate uppercase">{formData.topCatches}</p></div>}
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* History Modal / Viewer */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-3xl border-2 border-white/10 overflow-hidden flex flex-col shadow-2xl">
            <div className="p-6 bg-[#1581BF] flex justify-between items-center">
              <h2 className="font-orbitron text-white font-black text-lg tracking-[0.3em] uppercase">WICC CLOUD REPOSITORY</h2>
              <button onClick={() => setShowHistoryModal(false)} className="text-white text-3xl font-light hover:rotate-90 transition-transform">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-8 no-scrollbar bg-black/20">
              {archivedList.length === 0 ? (
                <div className="flex flex-col items-center py-20">
                  <p className="text-white/20 font-orbitron uppercase tracking-[0.5em] text-center">Cloud Database Empty</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {archivedList.map((entry) => (
                    <div key={entry.id} className="bg-slate-900/60 border border-white/5 rounded-2xl p-5 hover:border-[#1581BF]/50 transition-all group">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-[#57c1ff] font-black text-lg uppercase leading-tight">{entry.leader}</p>
                          <p className="text-[9px] text-white/40 font-mono mt-1">ID: {entry.id} | CREATED: {new Date(entry.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="flex gap-4 font-black text-xs">
                          <span className="text-[#00e1ff]">{entry.pts_a}</span>
                          <span className="text-[#ffaa00]">{entry.pts_b}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 md:grid-cols-5 gap-3 pt-3 border-t border-white/5">
                        <div className="text-[8px] font-bold">
                          <span className="text-orange-500 uppercase block text-[6px] mb-1">MOS</span>
                          <span className="text-white uppercase truncate block">{entry.awards.mos || '-'}</span>
                        </div>
                        <div className="text-[8px] font-bold">
                          <span className="text-[#00e1ff] uppercase block text-[6px] mb-1">MVP</span>
                          <span className="text-white uppercase truncate block">{entry.awards.mvp || '-'}</span>
                        </div>
                        <div className="text-[8px] font-bold">
                          <span className="text-green-500 uppercase block text-[6px] mb-1">RUNS</span>
                          <span className="text-white uppercase truncate block">{entry.awards.runs || '-'}</span>
                        </div>
                        <div className="text-[8px] font-bold">
                          <span className="text-red-500 uppercase block text-[6px] mb-1">WKTS</span>
                          <span className="text-white uppercase truncate block">{entry.awards.wickets || '-'}</span>
                        </div>
                        <div className="text-[8px] font-bold">
                          <span className="text-yellow-400 uppercase block text-[6px] mb-1">CTHS</span>
                          <span className="text-white uppercase truncate block">{entry.awards.catches || '-'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-7xl flex flex-col md:flex-row justify-center gap-4 mb-8 md:mb-12">
        <button onClick={finalizeWithAI} disabled={loading || !records.length} className="flex-1 md:max-w-md bg-[#1581BF] text-white font-orbitron font-black py-4 rounded-2xl shadow-[0_0_30px_rgba(21,129,191,0.4)] transition-all tracking-[0.2em] uppercase text-xs md:text-sm">
          {loading ? 'COMPILING AI REPORT...' : 'GENERATE AI SERIES BRIEFING'}
        </button>
        <button onClick={handleWhatsAppShare} className="flex-1 md:max-w-xs bg-green-600 text-white font-orbitron font-black py-4 rounded-2xl shadow-[0_0_30px_rgba(22,163,74,0.4)] transition-all tracking-[0.2em] uppercase text-xs md:text-sm flex items-center justify-center gap-2">
           WHATSAPP SUMMARY
        </button>
      </div>

      {summary && (
        <div className="w-full max-w-5xl mb-24 animate-in fade-in slide-in-from-bottom-8 duration-500" ref={reportRef}>
          <div className="bg-slate-900 border-2 md:border-4 border-[#1581BF] rounded-[30px] md:rounded-[45px] overflow-hidden shadow-2xl">
            <div className="bg-[#1581BF] px-6 md:px-12 py-4 md:py-8 border-b-2 border-white/10 flex justify-between items-center">
              <h3 className="font-orbitron text-white text-sm md:text-xl tracking-[0.3em] md:tracking-[0.6em] font-black uppercase">WICC SERIES BRIEFING</h3>
              <div className="flex gap-4 md:gap-6">
                 <button onClick={handleScreenshot} className="text-white hover:scale-125 transition-all">
                   <svg className="w-6 h-6 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 16v1a3 3 0 003 3h10a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                 </button>
                 <button onClick={() => setSummary(null)} className="text-white/80 text-3xl md:text-5xl font-light">&times;</button>
              </div>
            </div>
            <div className="p-6 md:p-14 font-mono text-xs md:text-base text-white font-bold whitespace-pre-wrap leading-relaxed md:leading-loose bg-black/60">
              {summary}
            </div>
            <div className="p-4 md:p-8 bg-slate-950 flex flex-wrap justify-center gap-3 md:gap-6 border-t border-white/5">
              <button onClick={() => { navigator.clipboard.writeText(summary); alert('COPIED'); }} className="flex-1 md:flex-none px-4 md:px-10 py-3 md:py-4 bg-white text-black font-orbitron font-black text-[10px] md:text-[12px] rounded-xl">CLIPBOARD</button>
              <button onClick={handleWhatsAppShare} className="flex-1 md:max-w-xs px-4 md:px-10 py-3 md:py-4 bg-green-600 text-white font-orbitron font-black text-[10px] md:text-[12px] rounded-xl flex items-center justify-center gap-2">
                WHATSAPP
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-auto text-white/20 font-orbitron text-[8px] md:text-[10px] tracking-[0.5em] md:tracking-[1.5em] text-center w-full pb-8 md:pb-12 uppercase font-black">
        WICC EST=2016 • CLOUD DIVISION DIGITAL SYSTEM
      </footer>
    </div>
  );
};

export default App;
