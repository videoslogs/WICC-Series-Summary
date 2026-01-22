
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

// Explicit list of columns that ACTUALLY exist in the 'wicc_matches' table
const DB_COLUMNS = 'id, date, matchNumber, innings, teamOneName, teamTwoName, teamOneScore, teamTwoScore, teamOneInn1, teamOneInn2, teamTwoInn1, teamTwoInn2, overs, resultType, teamOnePoints, teamTwoPoints, moi1, moi2, mom, mos, winMargin, is_archived';

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

  // Removed 'leadingTeam' and 'seriesScore' from formData entirely
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
    winMargin: ''
  });

  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);

  useEffect(() => {
    const fetchCloudData = async () => {
      setIsCloudLoading(true);
      // Use explicit columns in SELECT
      const { data: matches } = await supabase
        .from('wicc_matches')
        .select(DB_COLUMNS)
        .eq('is_archived', false)
        .order('created_at', { ascending: true });
      
      if (matches) setRecords(matches);

      const { data: history } = await supabase
        .from('wicc_series')
        .select('*')
        .order('created_at', { ascending: false });

      if (history) {
        setArchivedList(history.map((h: any) => ({
            id: h.id,
            created_at: h.created_at,
            leader: h.leader,
            team_a: h.team_a,
            team_b: h.team_b,
            pts_a: h.pts_a,
            pts_b: h.pts_b,
            awards: h.awards
        })));
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
    else champion = totalA > totalB ? formData.teamOneName : totalB > totalA ? formData.teamTwoName : 'DRAW';
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
  
  const getCleanDBPayload = (data: any) => ({
    date: data.date,
    matchNumber: data.matchNumber,
    innings: data.innings,
    teamOneName: data.teamOneName,
    teamTwoName: data.teamTwoName,
    teamOneScore: data.teamOneScore,
    teamTwoScore: data.teamTwoScore,
    teamOneInn1: data.teamOneInn1 || '0',
    teamOneInn2: data.teamOneInn2 || '0',
    teamTwoInn1: data.teamTwoInn1 || '0',
    teamTwoInn2: data.teamTwoInn2 || '0',
    overs: data.overs,
    resultType: data.resultType,
    teamOnePoints: data.teamOnePoints,
    teamTwoPoints: data.teamTwoPoints,
    moi1: data.moi1,
    moi2: data.moi2,
    mom: data.mom,
    mos: data.mos,
    winMargin: data.winMargin
  });

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
      // Use explicit columns in SELECT to avoid fetching ghost columns
      const { data, error } = await supabase
        .from('wicc_matches')
        .insert([{ ...dbPayload, is_archived: false }])
        .select(DB_COLUMNS);

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
    const { error } = await supabase.from('wicc_matches').delete().eq('id', (target as any).id);
    if (!error) setRecords(prev => prev.filter((_, i) => i !== idx));
  };

  const archiveSeries = async () => {
    if (!confirm('Cloud Archive current series?')) return;
    setLoading(true);
    const awards = { mos: formData.mos, mvp: formData.mvp, runs: formData.topRuns, wickets: formData.topWickets, catches: formData.topCatches };
    const { data: newSeries, error: sError } = await supabase
      .from('wicc_series')
      .insert([{ leader: seriesStats.leader, team_a: formData.teamOneName, team_b: formData.teamTwoName, pts_a: seriesStats.totalA, pts_b: seriesStats.totalB, awards }])
      .select();

    if (sError) {
      alert("Archive Failed: " + sError.message);
      setLoading(false);
      return;
    }

    await supabase.from('wicc_matches').update({ is_archived: true }).eq('is_archived', false);
    if (newSeries) setArchivedList([{ ...newSeries[0] }, ...archivedList]);
    setRecords([]);
    setFormData(prev => ({ ...prev, mos: '', mvp: '', topWickets: '', topRuns: '', topCatches: '', matchNumber: '1' }));
    setLoading(false);
  };

  const finalizeWithAI = async () => {
    if (!records.length) return;
    setLoading(true);
    const result = await generateSummary({ ...formData, seriesStats });
    setSummary(result);
    setLoading(false);
  };

  const handleScreenshot = async () => {
    if (reportRef.current) {
      const canvas = await html2canvas(reportRef.current, { backgroundColor: '#020617', scale: 2 });
      const image = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = image; link.download = `WICC_Report_${formData.date}.png`; link.click();
    }
  };

  const handleWhatsAppShare = () => {
    const localSum = `🏆 WICC SERIES RECAP\nChampions: ${seriesStats.leader}\n\nAwards:\n- MOS: ${formData.mos}\n- MVP: ${formData.mvp}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(summary || localSum)}`, '_blank');
  };

  if (isCloudLoading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4">
      <div className="w-12 h-12 border-4 border-[#1581BF] border-t-orange-500 rounded-full animate-spin"></div>
      <p className="font-orbitron text-xs text-[#57c1ff] tracking-[0.3em] uppercase animate-pulse">Establishing Cloud Sync...</p>
    </div>
  );

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center bg-slate-950">
      <datalist id="members-all">{WICC_MEMBERS.map(m => <option key={m} value={m} />)}</datalist>

      <div className="w-full max-w-7xl flex flex-col items-center logo-glow mb-6 md:mb-10 relative">
        <button onClick={() => setShowHistoryModal(true)} className="absolute right-0 top-0 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg text-[9px] font-orbitron font-bold tracking-widest text-white/50 hover:text-white transition-all uppercase">History</button>
        <h1 className="font-orbitron text-5xl md:text-8xl font-bold tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">WICC</h1>
        <div className="flex items-center gap-2 mt-2">
          <span className="h-1.5 w-6 md:w-10 bg-[#1581BF] rounded-full"></span>
          <p className="font-orbitron text-[10px] md:text-[12px] text-[#57c1ff] font-bold tracking-[0.3em] uppercase">Premier Recorder</p>
          <span className="h-1.5 w-6 md:w-10 bg-orange-500 rounded-full"></span>
        </div>
      </div>

      <div className="w-full max-w-7xl grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 mb-6 md:mb-8">
        <div className="bg-slate-900 border-2 border-[#1581BF] rounded-2xl p-4 md:p-6 flex flex-col items-center justify-center shadow-[0_0_20px_rgba(21,129,191,0.2)] team-blue-bg">
          <span className="text-[9px] md:text-[11px] font-orbitron text-white font-bold tracking-[0.1em] uppercase text-center">{formData.teamOneName}</span>
          <span className={`text-4xl md:text-6xl font-black mt-1 md:mt-2 ${seriesStats.totalA >= 10 ? 'text-yellow-400 animate-pulse' : 'text-white'}`}>{seriesStats.totalA}</span>
        </div>
        <div className="hidden md:flex glow-box-target rounded-3xl p-6 flex-col items-center justify-center shadow-[0_0_40px_rgba(249,115,22,0.3)]">
          <span className="text-[11px] font-orbitron text-white font-black tracking-[0.2em] uppercase">TARGET: 10 PTS</span>
          <span className="text-xl font-black mt-2 tracking-widest text-center uppercase text-white">{seriesStats.leader}</span>
        </div>
        <div className="bg-slate-900 border-2 border-orange-500 rounded-2xl p-4 md:p-6 flex flex-col items-center justify-center shadow-[0_0_20px_rgba(249,115,22,0.2)] team-orange-bg">
          <span className="text-[9px] md:text-[11px] font-orbitron text-white font-bold tracking-[0.1em] uppercase text-center">{formData.teamTwoName}</span>
          <span className={`text-4xl md:text-6xl font-black mt-1 md:mt-2 ${seriesStats.totalB >= 10 ? 'text-yellow-400 animate-pulse' : 'text-white'}`}>{seriesStats.totalB}</span>
        </div>
      </div>

      <div className="w-full max-w-7xl spreadsheet-container rounded-2xl md:rounded-3xl overflow-hidden mb-6 md:mb-8">
        <div className="flex flex-col md:flex-row justify-between items-center p-3 md:p-5 bg-slate-900/98 border-b-2 border-[#1581BF]/50 gap-3">
          <div className="flex gap-2 w-full md:w-auto">
            <button onClick={() => { 
                const ws = XLSX.utils.json_to_sheet(records);
                const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "WICC");
                XLSX.writeFile(wb, `WICC_Series_${formData.date}.xlsx`);
            }} className="flex-1 px-3 py-2 bg-[#1581BF]/20 text-[10px] font-black rounded-lg border border-[#1581BF] text-[#57c1ff]">EXCEL</button>
            <button onClick={archiveSeries} className="flex-1 px-3 py-2 bg-red-900/20 text-[10px] font-black rounded-lg border border-red-600 text-red-400">RESET</button>
          </div>
          <div className="flex gap-2 md:gap-4 items-center bg-black/80 px-4 py-2 rounded-xl border border-white/10 w-full md:w-auto">
            <input name="teamOneName" value={formData.teamOneName} onChange={handleInputChange} className="flex-1 bg-[#00a2ff]/40 border-2 border-[#00a2ff] text-white text-center font-black py-1 rounded-lg text-[10px] uppercase outline-none" />
            <span className="text-white font-orbitron font-bold italic text-sm">VS</span>
            <input name="teamTwoName" value={formData.teamTwoName} onChange={handleInputChange} className="flex-1 bg-[#ff7300]/40 border-2 border-[#ff7300] text-white text-center font-black py-1 rounded-lg text-[10px] uppercase outline-none" />
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
            <div className="min-w-[800px]">
                <div className="grid grid-cols-12 text-center border-b border-[#1581BF]/50 font-bold text-[9px] uppercase bg-slate-900 text-[#57c1ff] py-1">
                  <div className="col-span-1 py-3">Date</div>
                  <div className="col-span-1 py-3">Match</div>
                  <div className="col-span-2 py-3 bg-[#00a2ff]/30 text-white">Team A</div>
                  <div className="col-span-2 py-3 bg-[#ff7300]/30 text-white">Team B</div>
                  <div className="col-span-1 py-3">Overs</div>
                  <div className="col-span-2 py-3 text-orange-400">Winner</div>
                  <div className="col-span-1 py-3">Pts</div>
                  <div className="col-span-2 py-3 font-black">Awards</div>
                </div>

                <div className="min-h-[150px] max-h-[300px] overflow-y-auto bg-black/80">
                {records.map((rec, idx) => (
                    <div key={idx} className="grid grid-cols-12 text-center border-b border-white/5 text-[11px] group items-center py-2 relative">
                      <div className="col-span-1 text-white/60 text-[7px]">{formatDateForDisplay(rec.date)}</div>
                      <div className="col-span-1 font-bold text-white">#{rec.matchNumber}</div>
                      <div className="col-span-2 text-[#00e1ff] font-black">{rec.innings === 'ii' ? `${rec.teamOneInn1}&${rec.teamOneInn2}` : rec.teamOneScore}</div>
                      <div className="col-span-2 text-[#ffaa00] font-black">{rec.innings === 'ii' ? `${rec.teamTwoInn1}&${rec.teamTwoInn2}` : rec.teamTwoScore}</div>
                      <div className="col-span-1 text-white/80">{rec.overs}</div>
                      <div className={`col-span-2 font-black text-[10px] truncate px-1 ${rec.resultType.includes(formData.teamOneName) ? 'text-[#00e1ff]' : 'text-[#ffaa00]'}`}>{rec.resultType}</div>
                      <div className="col-span-1 flex justify-center gap-1 font-black"><span className="text-[#00e1ff]">{rec.teamOnePoints}</span><span className="text-[#ffaa00]">{rec.teamTwoPoints}</span></div>
                      <div className="col-span-2 flex flex-col text-[7px] leading-tight text-white/90">
                        <span className="text-yellow-400">MOM:{rec.mom}</span>
                        <span className="text-white">MOI:{rec.moi1}</span>
                        <div className="absolute inset-0 bg-slate-900 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => { setFormData({ ...formData, ...records[idx] }); setEditIndex(idx); }} className="bg-[#1581BF] px-2 py-1 rounded text-[9px] text-white">EDIT</button>
                          <button onClick={() => deleteRecord(idx)} className="bg-red-600 px-2 py-1 rounded text-[9px] text-white">DEL</button>
                        </div>
                      </div>
                    </div>
                ))}
                </div>
            </div>
        </div>

        <div className="bg-slate-900 p-4 md:p-6 border-t-2 border-[#1581BF]/50">
          <div className="grid grid-cols-2 md:grid-cols-12 gap-3 items-end mb-4">
            <div className="col-span-1 md:col-span-2">
              <label className="block text-[8px] text-white/50 mb-1 uppercase text-center">Date</label>
              <input type="date" name="date" value={formData.date} onChange={handleInputChange} className="w-full h-10 text-center font-black glow-input rounded-xl" />
            </div>
            <div className="col-span-1 md:col-span-1">
              <label className="block text-[8px] text-white/50 mb-1 uppercase text-center">Format</label>
              <select name="innings" value={formData.innings} onChange={handleInputChange as any} className="w-full h-10 bg-black/80 text-white text-[9px] font-black border-2 border-[#1581BF] rounded-xl outline-none">
                <option value="i">1 INN</option><option value="ii">2 INN</option>
              </select>
            </div>
            {formData.innings === 'ii' ? (
              <>
                <div className="col-span-2 md:col-span-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input name="teamOneInn1" placeholder="I1" value={formData.teamOneInn1} onChange={handleInputChange} className="h-10 text-center text-[10px] font-black bg-black/80 border-2 border-[#00a2ff] text-[#00e1ff] rounded-xl" />
                    <input name="teamOneInn2" placeholder="I2" value={formData.teamOneInn2} onChange={handleInputChange} className="h-10 text-center text-[10px] font-black bg-black/80 border-2 border-[#00a2ff] text-[#00e1ff] rounded-xl" />
                  </div>
                </div>
                <div className="col-span-2 md:col-span-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input name="teamTwoInn1" placeholder="I1" value={formData.teamTwoInn1} onChange={handleInputChange} className="h-10 text-center text-[10px] font-black bg-black/80 border-2 border-[#ff7300] text-[#ffaa00] rounded-xl" />
                    <input name="teamTwoInn2" placeholder="I2" value={formData.teamTwoInn2} onChange={handleInputChange} className="h-10 text-center text-[10px] font-black bg-black/80 border-2 border-[#ff7300] text-[#ffaa00] rounded-xl" />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="col-span-1 md:col-span-2">
                  <input name="teamOneScore" placeholder="Score" value={formData.teamOneScore} onChange={handleInputChange} className="w-full h-10 text-center text-[10px] font-black bg-black/80 border-2 border-[#00a2ff] text-[#00e1ff] rounded-xl" />
                </div>
                <div className="col-span-1 md:col-span-2">
                  <input name="teamTwoScore" placeholder="Score" value={formData.teamTwoScore} onChange={handleInputChange} className="w-full h-10 text-center text-[10px] font-black bg-black/80 border-2 border-[#ff7300] text-[#ffaa00] rounded-xl" />
                </div>
              </>
            )}
            <div className="col-span-1 md:col-span-1">
              <input name="overs" placeholder="Overs" value={formData.overs} onChange={handleInputChange} className="w-full h-10 text-center text-[10px] font-black bg-black/80 border-2 border-slate-700 rounded-xl text-white" />
            </div>
            <div className="col-span-1 md:col-span-1">
              <input name="winMargin" placeholder="Margin" value={formData.winMargin} onChange={handleInputChange} className="w-full h-10 text-center text-[9px] font-black bg-black/80 border-2 border-yellow-500/30 rounded-xl text-yellow-300" />
            </div>
            <div className="col-span-2 md:col-span-2">
              <button onClick={addRecord} disabled={loading} className="w-full h-10 bg-white text-black font-black rounded-xl hover:scale-95 transition-all text-[10px] uppercase">
                {loading ? 'SYNC...' : (editIndex !== null ? 'UPDATE' : 'COMMIT')}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-12 gap-3">
            <div className="col-span-1 md:col-span-2">
              <input list="members-all" name="mom" placeholder="MOM" value={formData.mom} onChange={handleInputChange} className="w-full h-10 px-3 text-[9px] font-black bg-black/80 border-2 border-yellow-500 text-yellow-300 rounded-xl outline-none" />
            </div>
            <div className="col-span-1 md:col-span-2">
              <input list="members-all" name="moi1" placeholder="MOI 1" value={formData.moi1} onChange={handleInputChange} className="w-full h-10 px-3 text-[9px] font-black bg-black/80 border-2 border-white/20 text-white rounded-xl outline-none" />
            </div>
            <div className="col-span-1 md:col-span-2">
              <input list="members-all" name="moi2" placeholder="MOI 2" value={formData.moi2} onChange={handleInputChange} className="w-full h-10 px-3 text-[9px] font-black bg-black/80 border-2 border-white/20 text-white rounded-xl outline-none" />
            </div>
            <div className="col-span-1 md:col-span-3">
              <input name="teamOnePoints" value={formData.teamOnePoints} onChange={handleInputChange} className="w-full h-8 text-center text-[12px] font-black bg-black/80 border border-[#00a2ff] text-[#00e1ff] rounded-lg" />
            </div>
            <div className="col-span-1 md:col-span-3">
              <input name="teamTwoPoints" value={formData.teamTwoPoints} onChange={handleInputChange} className="w-full h-8 text-center text-[12px] font-black bg-black/80 border border-[#ff7300] text-[#ffaa00] rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      <div className="w-full max-w-7xl bg-slate-900 border-2 border-orange-500/40 rounded-3xl p-4 md:p-8 mb-6">
        <h3 className="font-orbitron text-orange-400 text-sm tracking-[0.2em] font-black mb-4">SERIES AWARDS HUB</h3>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-6">
          {['mos', 'mvp', 'topWickets', 'topRuns', 'topCatches'].map(f => (
            <div key={f} className="bg-black/40 p-3 rounded-xl border border-white/5 flex flex-col">
              <p className="text-[8px] text-white/50 uppercase font-black mb-1">{f.toUpperCase()}</p>
              <input list="members-all" name={f} value={(formData as any)[f]} onChange={handleInputChange} className="bg-transparent text-white font-black text-xs outline-none border-b border-white/10 uppercase" />
            </div>
          ))}
        </div>
      </div>

      <div className="w-full max-w-7xl flex flex-col md:flex-row justify-center gap-4 mb-8">
        <button onClick={finalizeWithAI} disabled={loading || !records.length} className="flex-1 bg-[#1581BF] text-white font-orbitron font-black py-4 rounded-2xl shadow-[0_0_30px_rgba(21,129,191,0.4)] transition-all uppercase text-xs">AI REPORT</button>
        <button onClick={handleWhatsAppShare} className="flex-1 bg-green-600 text-white font-orbitron font-black py-4 rounded-2xl shadow-[0_0_30px_rgba(22,163,74,0.4)] transition-all uppercase text-xs">WHATSAPP</button>
      </div>

      {summary && (
        <div className="w-full max-w-5xl mb-24 animate-in fade-in slide-in-from-bottom-8 duration-500" ref={reportRef}>
          <div className="bg-slate-900 border-2 md:border-4 border-[#1581BF] rounded-[30px] overflow-hidden shadow-2xl">
            <div className="bg-[#1581BF] px-6 py-4 flex justify-between items-center">
              <h3 className="font-orbitron text-white text-sm font-black uppercase">WICC SERIES BRIEFING</h3>
              <div className="flex gap-4">
                 <button onClick={handleScreenshot} className="text-white">📷</button>
                 <button onClick={() => setSummary(null)} className="text-white text-3xl">&times;</button>
              </div>
            </div>
            <div className="p-6 md:p-14 font-mono text-xs md:text-base text-white font-bold whitespace-pre-wrap leading-relaxed bg-black/60">{summary}</div>
          </div>
        </div>
      )}

      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-3xl border-2 border-white/10 overflow-hidden flex flex-col">
            <div className="p-6 bg-[#1581BF] flex justify-between items-center">
              <h2 className="font-orbitron text-white font-black text-lg uppercase">WICC CLOUD REPOSITORY</h2>
              <button onClick={() => setShowHistoryModal(false)} className="text-white text-3xl">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
              {archivedList.map((entry) => (
                <div key={entry.id} className="bg-slate-900/60 border border-white/5 rounded-2xl p-5 mb-4">
                  <p className="text-[#57c1ff] font-black text-lg uppercase leading-tight">{entry.leader}</p>
                  <p className="text-[9px] text-white/40 font-mono">ID: {entry.id}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <footer className="mt-auto text-white/20 font-orbitron text-[8px] tracking-[0.5em] text-center w-full pb-8 uppercase font-black">
        WICC • CLOUD DIVISION DIGITAL SYSTEM
      </footer>
    </div>
  );
};

export default App;
