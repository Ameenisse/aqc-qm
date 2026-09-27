import React, { useState, useEffect } from 'react';
import { useCompetition } from '../context/CompetitionContext';
import { Participant, Question, Judge, Rubric, Competition, User, Grade, Branch, ParticipantStatus } from '../types';
import { SURAHS_LIST } from '../data/quranClient';
import { UserManagementTab } from './UserManagementTab';
import { CsvImportModal, downloadSampleCsv } from './CsvImportModal';
import {
  Shield,
  Users,
  HelpCircle,
  Award,
  Settings,
  History,
  Plus,
  Trash2,
  Edit2,
  Save,
  Check,
  Search,
  BookOpen,
  Bell,
  RefreshCw,
  FileText,
  UserCog,
  Upload,
  FileDown,
  FileSpreadsheet,
  Scale,
  ChevronDown,
  Sparkles,
  Filter,
  RotateCcw
} from 'lucide-react';
import { ScoreAuditTab } from './ScoreAuditTab';

export const AdminPanel: React.FC = () => {
  const { user } = useCompetition();
  const [activeTab, setActiveTab] = useState<'PARTICIPANTS' | 'QUESTIONS' | 'JUDGES' | 'USERS' | 'SETTINGS' | 'AUDIT' | 'SCORE_AUDIT'>('PARTICIPANTS');

  // Data states
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [judges, setJudges] = useState<Judge[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  // CSV Import Modal state
  const [showCsvModal, setShowCsvModal] = useState(false);

  // Participant Form & Edit state
  const [showPartModal, setShowPartModal] = useState(false);
  const [editingPart, setEditingPart] = useState<Participant | null>(null);
  const [partForm, setPartForm] = useState({
    participant_number: '',
    name: '',
    name_dhivehi: '',
    grade_id: 'grade-5',
    branch_id: 'branch-1',
    institution: '',
    island: 'Malé',
    atoll: 'K. Atoll',
    gender: 'male' as 'male' | 'female',
    status: 'Waiting' as ParticipantStatus,
    queue_order: 100,
    notes: ''
  });

  // Question Form & Filter states
  const [filterQuestGrade, setFilterQuestGrade] = useState<string>('ALL');
  const [filterQuestBranch, setFilterQuestBranch] = useState<string>('ALL');
  const [filterQuestSearch, setFilterQuestSearch] = useState<string>('');

  const [showQuestModal, setShowQuestModal] = useState(false);
  const [editingQuest, setEditingQuest] = useState<Question | null>(null);
  const [questSaving, setQuestSaving] = useState(false);
  const [questError, setQuestError] = useState('');
  const [fetchingPassage, setFetchingPassage] = useState(false);

  const [questForm, setQuestForm] = useState({
    grade_id: 'grade-5',
    branch_id: 'branch-1',
    question_number: '01',
    surah_number: 1,
    end_surah_number: 1,
    surah_name: 'Al-Fatihah',
    surah_name_arabic: 'الفاتحة',
    start_ayah: 1,
    end_ayah: 7,
    start_page: 1,
    end_page: 1,
    juz: 1,
    difficulty: 'Medium',
    notes: '',
    quran_text_arabic: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ﴿١﴾ الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ ﴿٢﴾ الرَّحْمَٰنِ الرَّحِيمِ ﴿٣﴾ مَالِكِ يَوْمِ الدِّينِ ﴿٤﴾ إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ ﴿٥﴾ اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ ﴿٦﴾ صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ ﴿٧﴾'
  });

  // Settings state
  const [compForm, setCompForm] = useState<Partial<Competition>>({});
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoTimestamp, setLogoTimestamp] = useState(Date.now());
  const [bgUploading, setBgUploading] = useState(false);
  const [bgTimestamp, setBgTimestamp] = useState(Date.now());
  const [bgFileName, setBgFileName] = useState('');

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const res = await fetch('/api/competition/upload-logo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64 })
        });
        if (res.ok) {
          setLogoTimestamp(Date.now());
          await loadData();
          alert('ލޯގޯ ކާމިޔާބުކަމާއެކު ބަދަލުކުރެވިއްޖެ! / Logo updated successfully!');
        } else {
          alert('ލޯގޯ އަޕްލޯޑް ނުކުރެވުނު. / Failed to upload logo.');
        }
        setLogoUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setLogoUploading(false);
      alert('Error reading image file.');
    }
  };

  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBgFileName(file.name);
    setBgUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const res = await fetch('/api/competition/upload-background', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: base64,
            overlay: compForm.audience_background_overlay ?? 65
          })
        });
        if (res.ok) {
          const data = await res.json();
          setBgTimestamp(Date.now());
          setCompForm((prev) => ({
            ...prev,
            audience_background_url: data.audience_background_url,
            audience_background_overlay: data.audience_background_overlay
          }));
          await loadData();
          setSaveStatus('ފަސްމަންޒަރު ކާމިޔާބުކަމާއެކު އަޕްލޯޑްކުރެވިއްޖެ! / Background updated successfully!');
          setTimeout(() => setSaveStatus(''), 4000);
        } else {
          alert('ފަސްމަންޒަރު އަޕްލޯޑް ނުކުރެވުނު. / Failed to upload background.');
        }
        setBgUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setBgUploading(false);
      alert('Error reading background image file.');
    }
  };

  const handleClearBackground = async () => {
    setBgUploading(true);
    try {
      const res = await fetch('/api/competition/upload-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clear: true,
          overlay: compForm.audience_background_overlay ?? 65
        })
      });
      if (res.ok) {
        setBgFileName('');
        setCompForm((prev) => ({ ...prev, audience_background_url: '' }));
        await loadData();
        setSaveStatus('ފަސްމަންޒަރު އުނިކުރެވިއްޖެ! / Background cleared successfully.');
        setTimeout(() => setSaveStatus(''), 4000);
      }
    } catch (err) {
      console.error(err);
    }
    setBgUploading(false);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [pRes, qRes, jRes, uRes, aRes, cRes, gRes, bRes] = await Promise.all([
        fetch('/api/participants'),
        fetch('/api/questions'),
        fetch('/api/judges'),
        fetch('/api/users'),
        fetch('/api/audit-logs'),
        fetch('/api/competition'),
        fetch('/api/grades'),
        fetch('/api/branches')
      ]);

      if (pRes.ok) setParticipants(await pRes.json());
      if (qRes.ok) setQuestions(await qRes.json());
      if (jRes.ok) setJudges(await jRes.json());
      if (uRes.ok) setUsersList(await uRes.json());
      if (aRes.ok) setAuditLogs(await aRes.json());
      if (gRes.ok) setGrades(await gRes.json());
      if (bRes.ok) setBranches(await bRes.json());
      if (cRes.ok) {
        const c = await cRes.json();
        setCompetition(c);
        setCompForm(c);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Open Add Participant Modal
  const handleOpenAddParticipant = () => {
    setEditingPart(null);
    const nextNum = participants.length > 0
      ? String(Math.max(...participants.map(p => Number(p.participant_number) || 0)) + 1).padStart(3, '0')
      : '001';

    setPartForm({
      participant_number: nextNum,
      name: '',
      name_dhivehi: '',
      grade_id: grades[0]?.id || 'grade-5',
      branch_id: branches[0]?.id || 'branch-1',
      institution: '',
      island: 'Malé',
      atoll: 'K. Atoll',
      gender: 'male',
      status: 'Waiting',
      queue_order: participants.length + 1,
      notes: ''
    });
    setShowPartModal(true);
  };

  // Open Edit Participant Modal
  const handleOpenEditParticipant = (p: Participant) => {
    setEditingPart(p);
    setPartForm({
      participant_number: p.participant_number,
      name: p.name,
      name_dhivehi: p.name_dhivehi || '',
      grade_id: p.grade_id || (grades[0]?.id || 'grade-5'),
      branch_id: p.branch_id || (branches[0]?.id || 'branch-1'),
      institution: p.institution || '',
      island: p.island || '',
      atoll: p.atoll || '',
      gender: (p.gender as any) || 'male',
      status: p.status || 'Waiting',
      queue_order: p.queue_order || 100,
      notes: p.notes || ''
    });
    setShowPartModal(true);
  };

  // CRUD Handlers
  const handleSaveParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingPart ? `/api/participants/${editingPart.id}` : '/api/participants';
      const method = editingPart ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...partForm,
          competition_id: competition?.id || 'comp-1'
        })
      });
      if (res.ok) {
        setShowPartModal(false);
        setEditingPart(null);
        await loadData();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to save participant.');
      }
    } catch (e) {
      console.error(e);
      alert('An unexpected error occurred while saving.');
    }
  };

  const handleDeleteParticipant = async (id: string) => {
    if (!confirm('Are you sure you want to delete this participant?')) return;
    try {
      const res = await fetch(`/api/participants/${id}`, { method: 'DELETE' });
      if (res.ok) await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  // Helper to compute next question number for a specific grade & branch
  const computeNextQuestionNumber = (gradeId: string, branchId: string): string => {
    const matching = questions.filter(
      (q) => q.grade_id === gradeId && q.branch_id === branchId
    );
    let maxNum = 0;
    for (const q of matching) {
      const n = parseInt(q.question_number, 10);
      if (!isNaN(n) && n > maxNum) {
        maxNum = n;
      }
    }
    return String(maxNum + 1).padStart(2, '0');
  };

  const handleOpenAddQuestion = () => {
    setEditingQuest(null);
    setQuestError('');
    const defaultGrade = (filterQuestGrade !== 'ALL' ? filterQuestGrade : grades[0]?.id) || 'grade-5';
    const defaultBranch = (filterQuestBranch !== 'ALL' ? filterQuestBranch : branches[0]?.id) || 'branch-1';
    const nextNum = computeNextQuestionNumber(defaultGrade, defaultBranch);

    const s = SURAHS_LIST.find((x) => x.number === 1) || SURAHS_LIST[0];

    setQuestForm({
      grade_id: defaultGrade,
      branch_id: defaultBranch,
      question_number: nextNum,
      surah_number: s.number,
      end_surah_number: s.number,
      surah_name: s.name_english,
      surah_name_arabic: s.name_arabic,
      start_ayah: 1,
      end_ayah: 7,
      start_page: s.page_start,
      end_page: s.page_start,
      juz: s.juz_start,
      difficulty: 'Medium',
      notes: '',
      quran_text_arabic: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ﴿١﴾ الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ ﴿٢﴾ الرَّحْمَٰنِ الرَّحِيمِ ﴿٣﴾ مَالِكِ يَوْمِ الدِّينِ ﴿٤﴾ إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ ﴿٥﴾ اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ ﴿٦﴾ صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ ﴿٧﴾'
    });
    setShowQuestModal(true);
  };

  const handleOpenEditQuestion = (q: Question) => {
    setEditingQuest(q);
    setQuestError('');
    const sStart = SURAHS_LIST.find((x) => x.number === q.surah_number) || SURAHS_LIST[0];
    const endSurahNum = (q as any).end_surah_number || q.surah_number || 1;
    const sEnd = SURAHS_LIST.find((x) => x.number === endSurahNum) || sStart;

    setQuestForm({
      grade_id: q.grade_id || (grades[0]?.id || 'grade-5'),
      branch_id: q.branch_id || (branches[0]?.id || 'branch-1'),
      question_number: q.question_number,
      surah_number: q.surah_number || 1,
      end_surah_number: endSurahNum,
      surah_name: q.surah_name || sStart.name_english,
      surah_name_arabic: q.surah_name_arabic || sStart.name_arabic,
      start_ayah: q.start_ayah || 1,
      end_ayah: q.end_ayah || 7,
      start_page: q.start_page || sStart.page_start,
      end_page: q.end_page || sEnd.page_start,
      juz: q.juz || sStart.juz_start,
      difficulty: q.difficulty || 'Medium',
      notes: q.notes || '',
      quran_text_arabic: q.quran_text_arabic || ''
    });
    setShowQuestModal(true);
  };

  const handleGradeChangeInQuestForm = (newGradeId: string) => {
    const nextNum = !editingQuest
      ? computeNextQuestionNumber(newGradeId, questForm.branch_id)
      : questForm.question_number;
    setQuestForm((prev) => ({
      ...prev,
      grade_id: newGradeId,
      question_number: nextNum
    }));
  };

  const handleBranchChangeInQuestForm = (newBranchId: string) => {
    const nextNum = !editingQuest
      ? computeNextQuestionNumber(questForm.grade_id, newBranchId)
      : questForm.question_number;
    setQuestForm((prev) => ({
      ...prev,
      branch_id: newBranchId,
      question_number: nextNum
    }));
  };

  const handleRecalculateQuestionNumber = () => {
    const nextNum = computeNextQuestionNumber(questForm.grade_id, questForm.branch_id);
    setQuestForm((prev) => ({
      ...prev,
      question_number: nextNum
    }));
  };

  const handleStartSurahChange = (sNum: number) => {
    const s = SURAHS_LIST.find((x) => x.number === sNum);
    if (!s) return;

    setQuestForm((prev) => {
      const isEndSyncedWithStart = !prev.end_surah_number || prev.end_surah_number === prev.surah_number;
      const newEndSurahNum = isEndSyncedWithStart ? s.number : prev.end_surah_number;
      const endS = SURAHS_LIST.find((x) => x.number === newEndSurahNum) || s;
      const newEndAyah = isEndSyncedWithStart ? Math.min(s.ayah_count, 7) : Math.min(prev.end_ayah, endS.ayah_count);

      return {
        ...prev,
        surah_number: s.number,
        end_surah_number: newEndSurahNum,
        surah_name: s.name_english,
        surah_name_arabic: s.name_arabic,
        start_ayah: 1,
        end_ayah: Math.max(1, newEndAyah),
        start_page: s.page_start,
        end_page: endS.page_start,
        juz: s.juz_start
      };
    });
  };

  const handleEndSurahChange = (sNum: number) => {
    const s = SURAHS_LIST.find((x) => x.number === sNum);
    if (!s) return;

    setQuestForm((prev) => ({
      ...prev,
      end_surah_number: s.number,
      end_ayah: Math.min(prev.end_ayah || s.ayah_count, s.ayah_count),
      end_page: s.page_start
    }));
  };

  const handleFetchPassage = async () => {
    setFetchingPassage(true);
    setQuestError('');
    try {
      const sStart = questForm.surah_number || 1;
      const sEnd = questForm.end_surah_number || sStart;
      const res = await fetch(`/api/quran/passage?surah=${sStart}&end_surah=${sEnd}&start=${questForm.start_ayah}&end=${questForm.end_ayah}`);
      if (res.ok) {
        const data = await res.json();
        if (data.text_arabic || data.text) {
          setQuestForm((prev) => ({ ...prev, quran_text_arabic: data.text_arabic || data.text }));
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setQuestError(err.error || 'Failed to fetch Quran passage text.');
      }
    } catch (err: any) {
      console.error(err);
      setQuestError(err?.message || 'Error fetching Quran passage text.');
    }
    setFetchingPassage(false);
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuestSaving(true);
    setQuestError('');
    try {
      const sStartMeta = SURAHS_LIST.find((s) => s.number === questForm.surah_number);
      const sEndMeta = SURAHS_LIST.find((s) => s.number === (questForm.end_surah_number || questForm.surah_number));

      const payload = {
        ...questForm,
        surah_number: questForm.surah_number,
        end_surah_number: questForm.end_surah_number || questForm.surah_number,
        surah_name: sStartMeta?.name_english || questForm.surah_name,
        surah_name_arabic: sStartMeta?.name_arabic || questForm.surah_name_arabic,
        end_surah_name: sEndMeta?.name_english,
        end_surah_name_arabic: sEndMeta?.name_arabic,
        start_page: questForm.start_page || sStartMeta?.page_start || 1,
        end_page: questForm.end_page || sEndMeta?.page_start || 1,
        juz: questForm.juz || sStartMeta?.juz_start || 1,
        competition_id: competition?.id || 'comp-1'
      };

      const url = editingQuest ? `/api/questions/${editingQuest.id}` : '/api/questions';
      const method = editingQuest ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setShowQuestModal(false);
        setEditingQuest(null);
        await loadData();
      } else {
        const data = await res.json().catch(() => ({}));
        setQuestError(data.error || 'Failed to save question.');
      }
    } catch (e: any) {
      console.error(e);
      setQuestError(e?.message || 'An unexpected error occurred while saving.');
    }
    setQuestSaving(false);
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!confirm('Are you sure you want to delete this question?')) return;
    try {
      const res = await fetch(`/api/questions/${id}`, { method: 'DELETE' });
      if (res.ok) await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetQuestionUsed = async (q: Question) => {
    if (!confirm(`Are you sure you want to reset Question #${q.question_number} and make it available in the pool again?`)) return;
    try {
      const res = await fetch('/api/stage/question-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: q.id, question_number: q.question_number, user_id: user?.id || 'admin' })
      });
      if (res.ok) {
        await loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleJudgeBell = async (j: Judge) => {
    try {
      const res = await fetch(`/api/judges/${j.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          can_trigger_stage_bells: j.can_trigger_stage_bells ? 0 : 1
        })
      });
      if (res.ok) await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveCompetitionSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus('ސެޓިންގްސް ރައްކާކުރެވެނީ... / Saving settings...');
    try {
      const res = await fetch('/api/competition', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(compForm)
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.competition) {
          setCompetition(data.competition);
          setCompForm(data.competition);
        }
        setSaveStatus('މުބާރާތުގެ ސެޓިންގްސް ކާމިޔާބުކަމާއެކު ރައްކާކުރެވިއްޖެ! / Competition settings updated successfully.');
        setTimeout(() => setSaveStatus(''), 4000);
        await loadData();
      } else {
        const data = await res.json().catch(() => ({}));
        setSaveStatus(`❌ ${data.error || 'Failed to save competition settings.'}`);
        setTimeout(() => setSaveStatus(''), 4000);
      }
    } catch (e: any) {
      console.error(e);
      setSaveStatus(`❌ ${e?.message || 'Error updating competition settings.'}`);
      setTimeout(() => setSaveStatus(''), 4000);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-800 text-amber-300 flex items-center justify-center font-bold text-xl shadow-xs">
            <Shield size={24} />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 font-sans">
              System Administration
            </span>
            <h1 className="text-2xl font-bold font-dhivehi text-slate-900">
              މެނޭޖްމަންޓް ޕެނަލް / Management & Configuration
            </h1>
          </div>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Sync Data</span>
        </button>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('PARTICIPANTS')}
          className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all ${
            activeTab === 'PARTICIPANTS'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Users size={15} />
          <span>ބައިވެރިން / Participants ({participants.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('QUESTIONS')}
          className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all ${
            activeTab === 'QUESTIONS'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <HelpCircle size={15} />
          <span>ސުވާލު ބޭންކު / Questions ({questions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('JUDGES')}
          className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all ${
            activeTab === 'JUDGES'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Award size={15} />
          <span>ފަނޑިޔާރުން / Judges & Permissions ({judges.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('USERS')}
          className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all ${
            activeTab === 'USERS'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <UserCog size={15} />
          <span>ޔޫޒަރުން / Users & PINs ({usersList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('SETTINGS')}
          className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all ${
            activeTab === 'SETTINGS'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Settings size={15} />
          <span>ސެޓިންގްސް / Competition Settings</span>
        </button>

        <button
          onClick={() => setActiveTab('AUDIT')}
          className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all ${
            activeTab === 'AUDIT'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <History size={15} />
          <span>އޮޑިޓް ލޮގް / Audit Logs ({auditLogs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('SCORE_AUDIT')}
          className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all ${
            activeTab === 'SCORE_AUDIT'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Scale size={15} />
          <span>މާކްސް އޮޑިޓް / Score Audit</span>
        </button>
      </div>

      {/* 1. PARTICIPANTS CRUD TAB */}
      {activeTab === 'PARTICIPANTS' && (
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 font-dhivehi">
                ބައިވެރިންގެ ދަފްތަރު / Registered Participants ({participants.length})
              </h2>
              <p className="text-xs text-slate-500 font-sans">
                Manage names, Thaana script, categories, and school assignments.
              </p>
            </div>

            <div className="flex items-center flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadSampleCsv}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
                title="Download Sample CSV Template"
              >
                <FileDown size={14} className="text-emerald-700" />
                <span className="font-dhivehi">ސާމްޕަލް CSV</span>
                <span className="hidden md:inline">/ Sample CSV</span>
              </button>

              <button
                type="button"
                onClick={() => setShowCsvModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs shadow-2xs transition-colors cursor-pointer"
                title="Import Bulk Participants from CSV file"
              >
                <Upload size={14} />
                <span className="font-dhivehi">ސީ.އެސް.ވީ އިމްޕޯޓް</span>
                <span className="hidden md:inline">/ Import CSV</span>
              </button>

              <button
                type="button"
                onClick={handleOpenAddParticipant}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs cursor-pointer"
              >
                <Plus size={15} />
                <span className="font-dhivehi">އައު ބައިވެރިއަކު</span>
                <span>/ Add Participant</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-medium">
                  <th className="py-2.5 px-3">ނަންބަރު</th>
                  <th className="py-2.5 px-3">ބައިވެރިޔާ</th>
                  <th className="py-2.5 px-3">ގުރޭޑް / ގޮފި</th>
                  <th className="py-2.5 px-3">ސްކޫލް / ރަށް</th>
                  <th className="py-2.5 px-3">ޙާލަތު</th>
                  <th className="py-2.5 px-3 text-left">ޢަމަލު</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {participants.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                      #{p.participant_number}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900 font-dhivehi">{p.name_dhivehi}</div>
                      <div className="text-[11px] text-slate-500 font-sans">{p.name}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div>{p.grade_name_dhivehi || p.grade_name}</div>
                      <div className="text-[10px] text-slate-400">{p.branch_name_dhivehi || p.branch_type}</div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <div>{p.institution || '-'}</div>
                      <div className="text-[10px] text-slate-400">{p.island || ''}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        p.status === 'Completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : p.status === 'Performing'
                          ? 'bg-amber-100 text-amber-800 font-bold animate-pulse'
                          : p.status === 'Absent'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-left">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditParticipant(p)}
                          className="p-1.5 rounded-lg text-emerald-800 hover:bg-emerald-50 transition-colors cursor-pointer"
                          title="Edit Participant / މަޢުލޫމާތު ބަދަލުކުރައްވާ"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteParticipant(p.id)}
                          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete Participant"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. QUESTIONS CRUD TAB */}
      {activeTab === 'QUESTIONS' && (
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                ސުވާލު ބޭންކު / Competition Questions Pool
              </h2>
              <p className="text-xs text-slate-500 font-sans">
                Manage questions by Grade (އުމުރުފުރާ) and Branch (ގޮފި) with auto-managed question numbers.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg font-dhivehi">
                ޖުމްލަ: {questions.length} ސުވާލު
              </span>
              <button
                type="button"
                onClick={handleOpenAddQuestion}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs cursor-pointer transition-colors"
              >
                <Plus size={15} />
                <span>އައު ސުވާލެއް / Add Question</span>
              </button>
            </div>
          </div>

          {/* Filter Bar according to Grade and Branch */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-xs font-bold text-slate-700 font-dhivehi">
                <Filter size={14} className="text-emerald-700" />
                <span>ފިލްޓަރު / Filter by Grade & Branch:</span>
              </div>
              {(filterQuestGrade !== 'ALL' || filterQuestBranch !== 'ALL' || filterQuestSearch) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterQuestGrade('ALL');
                    setFilterQuestBranch('ALL');
                    setFilterQuestSearch('');
                  }}
                  className="text-[11px] text-emerald-800 hover:underline font-semibold cursor-pointer"
                >
                  Reset Filters / ހުރިހާ ސުވާލެއް ދައްކާ
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Grade Filter */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1 font-dhivehi text-right">
                  އުމުރުފުރާ (Grade):
                </label>
                <select
                  value={filterQuestGrade}
                  onChange={(e) => setFilterQuestGrade(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-dhivehi text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                >
                  <option value="ALL">ހުރިހާ އުމުރުފުރާތަކެއް (All Grades)</option>
                  {grades.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name_dhivehi} ({g.name})
                    </option>
                  ))}
                </select>
              </div>

              {/* Branch Filter */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1 font-dhivehi text-right">
                  ގޮފި (Branch):
                </label>
                <select
                  value={filterQuestBranch}
                  onChange={(e) => setFilterQuestBranch(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-dhivehi text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                >
                  <option value="ALL">ހުރިހާ ގޮފިތަކެއް (All Branches)</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name_dhivehi} ({b.branch_type})
                    </option>
                  ))}
                </select>
              </div>

              {/* Search */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1 font-dhivehi text-right">
                  ހޯއްދަވާ (Search):
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={filterQuestSearch}
                    onChange={(e) => setFilterQuestSearch(e.target.value)}
                    placeholder="Search surah, number..."
                    className="w-full pl-7 pr-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                  />
                  <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Questions Grid */}
          {(() => {
            const filteredQuestions = questions.filter((q) => {
              if (filterQuestGrade !== 'ALL' && q.grade_id !== filterQuestGrade) return false;
              if (filterQuestBranch !== 'ALL' && q.branch_id !== filterQuestBranch) return false;
              if (filterQuestSearch.trim()) {
                const term = filterQuestSearch.trim().toLowerCase();
                const haystack = [
                  q.question_number,
                  q.surah_name,
                  q.surah_name_arabic,
                  q.grade_name_dhivehi || '',
                  q.branch_name_dhivehi || '',
                  q.quran_text_arabic || ''
                ].join(' ').toLowerCase();
                if (!haystack.includes(term)) return false;
              }
              return true;
            });

            if (filteredQuestions.length === 0) {
              return (
                <div className="py-12 text-center text-slate-500 border border-dashed border-slate-200 rounded-xl space-y-2">
                  <BookOpen size={32} className="mx-auto text-slate-400 stroke-1" />
                  <p className="font-dhivehi font-bold text-sm text-slate-700">
                    މި ގިންތިއަށް އެއްވެސް ސުވާލެއް ނުފެނުނު
                  </p>
                  <p className="text-xs text-slate-500 font-sans">
                    No questions match the selected Grade & Branch filter.
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenAddQuestion}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Create Question for this Category</span>
                  </button>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
                {filteredQuestions.map((q) => {
                  const gObj = grades.find((g) => g.id === q.grade_id);
                  const bObj = branches.find((b) => b.id === q.branch_id);
                  const gradeLabel = gObj?.name_dhivehi || q.grade_name_dhivehi || q.grade_id;
                  const branchLabel = bObj?.name_dhivehi || q.branch_name_dhivehi || q.branch_id;

                  return (
                    <div
                      key={q.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-emerald-300 transition-all shadow-xs space-y-2.5 relative flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        {/* Header: Number, Badges, and Surah */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="w-8 h-8 rounded-lg bg-emerald-900 text-amber-300 font-black flex items-center justify-center text-sm font-mono shadow-xs">
                              {q.question_number}
                            </span>
                            <div className="flex flex-col">
                              <span className="text-[10px] font-bold text-slate-500 font-dhivehi">
                                {gradeLabel}
                              </span>
                              <span className="text-[10px] text-emerald-800 font-semibold font-dhivehi">
                                {branchLabel}
                              </span>
                            </div>
                          </div>
                          <span className="font-arabic font-bold text-emerald-950 text-base">
                            سُورَةُ {q.surah_name_arabic}
                            {q.end_surah_name_arabic && q.end_surah_name_arabic !== q.surah_name_arabic ? ` - ${q.end_surah_name_arabic}` : ''}
                          </span>
                        </div>

                        {/* Surah details */}
                        <div className="text-xs text-slate-600 space-y-0.5 font-sans bg-slate-50 p-2 rounded-lg border border-slate-100">
                          <div className="flex items-center justify-between">
                            <span>
                              Surah: <strong>{q.surah_name}{q.end_surah_name && q.end_surah_name !== q.surah_name ? ` → ${q.end_surah_name}` : ''}</strong>
                            </span>
                            <span>
                              Ayahs: <strong>{q.start_ayah} - {q.end_ayah}</strong>
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>Madinah Page: <strong>{q.start_page}</strong></span>
                            <span>Juz: <strong>{q.juz}</strong></span>
                          </div>
                        </div>

                        {/* Arabic text snippet */}
                        <div className="p-2.5 rounded-lg bg-emerald-50/40 border border-emerald-100/80 font-quran text-sm text-slate-900 text-right leading-relaxed max-h-20 overflow-hidden text-ellipsis" dir="rtl">
                          {q.quran_text_arabic || '---'}
                        </div>
                      </div>

                      {/* Footer Actions */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              q.used
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {q.used ? 'Used on Stage' : 'Available'}
                          </span>
                          {q.used ? (
                            <button
                              type="button"
                              onClick={() => handleResetQuestionUsed(q)}
                              className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 transition-colors flex items-center gap-1 cursor-pointer"
                              title="Reset question number to make it available again in the pool"
                            >
                              <RotateCcw size={10} />
                              <span>ރީސެޓް</span>
                            </button>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditQuestion(q)}
                            className="p-1.5 rounded-lg text-emerald-800 hover:bg-emerald-50 transition-colors cursor-pointer"
                            title="Edit Question / ސުވާލަށް ބަދަލުގެންނަވާ"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteQuestion(q.id)}
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Delete Question"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* 3. JUDGES TAB */}
      {activeTab === 'JUDGES' && (
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              ފަނޑިޔާރުންނާއި ހުއްދަތައް / Judges & Bell Permissions
            </h2>
            <p className="text-xs text-slate-500 font-sans">
              Assign judges and toggle who holds the authority to ring the stage warning bells.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {judges.map((j) => (
              <div
                key={j.id}
                className="p-5 rounded-xl border border-slate-200 bg-slate-50 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-emerald-800 text-amber-300 font-bold text-base flex items-center justify-center">
                    {j.judge_code}
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      j.can_trigger_stage_bells
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {j.can_trigger_stage_bells ? 'Bell Controller' : 'Marking Judge'}
                  </span>
                </div>

                <div>
                  <h3 className="font-bold text-slate-900 text-base font-dhivehi">
                    {j.name_dhivehi}
                  </h3>
                  <p className="text-xs text-slate-500 font-sans">{j.name}</p>
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <button
                    onClick={() => handleToggleJudgeBell(j)}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
                      j.can_trigger_stage_bells
                        ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                        : 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs'
                    }`}
                  >
                    <Bell size={13} />
                    <span>
                      {j.can_trigger_stage_bells ? 'Revoke Bell Authority' : 'Assign Bell Authority'}
                    </span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. USER MANAGEMENT TAB */}
      {activeTab === 'USERS' && (
        <UserManagementTab
          users={usersList}
          onRefresh={loadData}
        />
      )}

      {/* 5. SETTINGS TAB */}
      {activeTab === 'SETTINGS' && (
        <form
          onSubmit={handleSaveCompetitionSettings}
          className="bg-white rounded-xl shadow-xs border border-slate-200 p-4 sm:p-6 space-y-6"
        >
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-bold text-slate-900 font-dhivehi">
              މުބާރާތުގެ ސެޓިންގްސް / Competition & Display Settings
            </h2>
            <p className="text-xs text-slate-500 font-sans">
              Configure titles, venues, podium behavior, and bell parameters.
            </p>
          </div>

          {/* Logo & App Icon Section */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4" dir="rtl">
              <div className="flex items-center gap-3">
                <img
                  src={`/app-logo.png?v=${logoTimestamp}`}
                  alt="Official App Logo"
                  className="w-16 h-16 rounded-xl object-contain bg-slate-900 p-1 border border-slate-300 shadow-xs shrink-0"
                />
                <div className="text-right">
                  <h3 className="text-sm font-bold text-slate-800">
                    <span dir="ltr" className="font-sans font-bold">Official App Icon & Logo</span>
                    <span className="mx-2 text-slate-400 font-sans">/</span>
                    <span dir="rtl" className="font-dhivehi font-bold">އެޕް އައިކަން އަދި ލޯގޯ</span>
                  </h3>
                  <p className="text-xs text-slate-600 font-sans mt-1" dir="ltr" style={{ textAlign: 'left' }}>
                    This logo is used across the PWA home screen icon, Top Navigation, Podium, and Audience displays.
                  </p>
                  <div className="mt-1" dir="ltr" style={{ textAlign: 'left' }}>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 font-sans">
                      PWA & Web App Icon Active <Check size={13} className="text-emerald-600" />
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-medium text-xs cursor-pointer shadow-xs transition select-none">
                  <Upload size={14} />
                  <span dir="ltr" className="font-sans font-bold">Upload / </span>
                  <span dir="rtl" className="font-dhivehi font-bold">އަޕްލޯޑް</span>
                  <span dir="ltr" className="font-sans font-bold"> Image</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={logoUploading}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Audience Screen Background Card (as requested) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-xs space-y-6">
            {/* Title Row */}
            <div className="text-center md:text-right" dir="rtl">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 font-dhivehi inline-flex items-center gap-2 flex-wrap">
                <span>ބެލުންތެރިން ފެންނަ ސްކްރީންގެ ފަސްމަންޒަރު</span>
                <span className="font-sans font-medium text-slate-600 text-sm sm:text-base">
                  (Audience Screen Background)
                </span>
              </h3>
            </div>

            {/* Content Row: Controls Left, Box Right */}
            <div className="flex flex-col-reverse md:flex-row items-center justify-end gap-6 md:gap-10">
              {/* Controls Column (File Chooser & Slider) */}
              <div className="flex flex-col items-end gap-5 w-full md:w-auto">
                {/* 1. File selector row */}
                <div className="flex items-center justify-end gap-3.5 w-full">
                  <span className="text-xs sm:text-sm text-slate-700 font-sans truncate max-w-[200px]">
                    {bgUploading
                      ? 'އަޕްލޯޑް ވަނީ...'
                      : bgFileName
                      ? bgFileName
                      : compForm.audience_background_url
                      ? 'Background image active'
                      : 'No file chosen'}
                  </span>

                  <label className="inline-flex items-center justify-center px-5 py-2 bg-[#93e9be] hover:bg-[#7ce0ad] text-slate-900 font-medium text-xs sm:text-sm rounded-xl cursor-pointer shadow-xs transition select-none flex-shrink-0">
                    <span>Choose file</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleBackgroundUpload}
                      disabled={bgUploading}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* 2. Overlay Slider row */}
                <div className="flex items-center justify-end gap-3 w-full">
                  {/* Percentage number on the left */}
                  <span className="text-xs sm:text-sm font-bold text-[#047857] font-mono min-w-[36px] text-right">
                    {compForm.audience_background_overlay ?? 65}%
                  </span>

                  {/* Slider with green/dark track */}
                  <div className="flex items-center">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      dir="rtl"
                      value={compForm.audience_background_overlay ?? 65}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 0;
                        setCompForm({ ...compForm, audience_background_overlay: val });
                      }}
                      onPointerUp={() => {
                        fetch('/api/competition/upload-background', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            overlay: compForm.audience_background_overlay ?? 65
                          })
                        }).catch(() => {});
                      }}
                      className="overlay-range-slider w-32 sm:w-44 cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, #373737 0%, #373737 ${
                          100 - (compForm.audience_background_overlay ?? 65)
                        }%, #20be8b ${
                          100 - (compForm.audience_background_overlay ?? 65)
                        }%, #20be8b 100%)`
                      }}
                      title="Adjust dark overlay opacity"
                    />
                  </div>

                  {/* Label on the right */}
                  <span className="text-xs sm:text-sm font-bold text-slate-800 font-dhivehi flex items-center gap-1 select-none" dir="rtl">
                    <span>އަނދިރިކަން މިންވަރު</span>
                    <span className="font-sans font-normal text-slate-700">:(Overlay)</span>
                  </span>
                </div>
              </div>

              {/* Preview Box on the Right */}
              <div className="relative w-40 h-28 sm:w-44 sm:h-28 rounded-2xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center shadow-xs flex-shrink-0">
                {compForm.audience_background_url ? (
                  <>
                    <img
                      src={`${compForm.audience_background_url}?t=${bgTimestamp}`}
                      alt="Audience Screen Background"
                      className="w-full h-full object-cover"
                    />
                    {/* Dark Overlay preview */}
                    <div
                      className="absolute inset-0 pointer-events-none transition-colors"
                      style={{
                        backgroundColor: `rgba(0, 0, 0, ${
                          (compForm.audience_background_overlay ?? 65) / 100
                        })`
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="font-dhivehi font-bold text-white text-xs sm:text-sm drop-shadow-md select-none">
                        ފަސްމަންޒަރު ފޮޓޯ
                      </span>
                    </div>
                    {/* Clear Button */}
                    <button
                      type="button"
                      onClick={handleClearBackground}
                      title="Clear Background / އުނިކުރައްވާ"
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-600/80 hover:bg-red-700 text-white flex items-center justify-center text-xs shadow-xs cursor-pointer z-10 transition-transform active:scale-95"
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <span className="font-dhivehi font-bold text-slate-700 text-sm select-none">
                    ފަސްމަންޒަރު ފޮޓޯ
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                މުބާރާތުގެ ނަން (Dhivehi):
              </label>
              <input
                type="text"
                value={compForm.name_dhivehi || ''}
                onChange={(e) => setCompForm({ ...compForm, name_dhivehi: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Competition Name (English):
              </label>
              <input
                type="text"
                value={compForm.name || ''}
                onChange={(e) => setCompForm({ ...compForm, name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                ތަން / Venue:
              </label>
              <input
                type="text"
                value={compForm.venue || ''}
                onChange={(e) => setCompForm({ ...compForm, venue: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                ހިންގާ އިދާރާ / Organization:
              </label>
              <input
                type="text"
                value={compForm.organization_name || ''}
                onChange={(e) => setCompForm({ ...compForm, organization_name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Finished Screen Text (Dhivehi/English):
              </label>
              <input
                type="text"
                value={compForm.finished_performance_text || ''}
                onChange={(e) => setCompForm({ ...compForm, finished_performance_text: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Auto-holding Delay (Seconds):
              </label>
              <input
                type="number"
                value={compForm.finished_screen_duration_seconds || 3}
                onChange={(e) => setCompForm({ ...compForm, finished_screen_duration_seconds: parseInt(e.target.value, 10) })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none"
              />
            </div>
          </div>

          {/* Performance Timer & Visibility switches */}
          <div className="space-y-4 pt-3 border-t border-slate-200 text-xs">
            {/* Start Performance Timer Toggle */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800 text-xs sm:text-sm font-dhivehi" dir="rtl">
                    ސްޓޭޖް ޕާފޯމަންސް ޓައިމަރ / Start Performance Timer
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    compForm.performance_timer_enabled !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {compForm.performance_timer_enabled !== false ? 'ENABLED' : 'DISABLED'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-sans mt-0.5">
                  Enable or disable the performance timer stopwatch on Operator stage control, Podium, and Audience displays when performance starts.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3">
                <input
                  type="checkbox"
                  checked={compForm.performance_timer_enabled !== false}
                  onChange={(e) => setCompForm({ ...compForm, performance_timer_enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-700"></div>
              </label>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(compForm.tilawa_podium_quran_visibility)}
                onChange={(e) => setCompForm({ ...compForm, tilawa_podium_quran_visibility: e.target.checked })}
                className="rounded text-emerald-800"
              />
              <span className="font-semibold text-slate-800">
                Show Quran text on Podium tablet for Tilawa (Reading) participants
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(compForm.audience_quran_visibility)}
                onChange={(e) => setCompForm({ ...compForm, audience_quran_visibility: e.target.checked })}
                className="rounded text-emerald-800"
              />
              <span className="font-semibold text-slate-800">
                Show Arabic Quran text on TV / Audience projector screen
              </span>
            </label>
          </div>

          {saveStatus && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-medium">
              {saveStatus}
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2"
            >
              <Save size={15} />
              <span>Save Settings</span>
            </button>
          </div>
        </form>
      )}

      {/* 5. AUDIT LOGS TAB */}
      {activeTab === 'AUDIT' && (
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              އޮޑިޓް ލޮގް / Real-time System Audit History
            </h2>
            <p className="text-xs text-slate-500 font-sans">
              Immutable historical event log of calls, marks, bells, and stage actions.
            </p>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-medium sticky top-0">
                  <th className="py-2.5 px-3">ވަގުތު</th>
                  <th className="py-2.5 px-3">ޢަމަލު</th>
                  <th className="py-2.5 px-3">އޮޕަރޭޓަރު / ޔޫޒަރ</th>
                  <th className="py-2.5 px-3">ބައިވެރިޔާ</th>
                  <th className="py-2.5 px-3 text-left">ތަފްޞީލު</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">
                      {log.action}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {log.user_name || 'System'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-800">
                      {log.participant_id ? `#${log.participant_id}` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-left font-mono text-[10px] text-slate-500">
                      {log.details ? JSON.stringify(log.details) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. SCORE AUDIT TAB */}
      {activeTab === 'SCORE_AUDIT' && (
        <ScoreAuditTab judges={judges} participants={participants} />
      )}

      {/* Add / Edit Participant Modal */}
      {showPartModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto">
          <form
            onSubmit={handleSaveParticipant}
            className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-4 sm:p-6 space-y-4 border border-slate-200 my-auto max-h-[min(90vh,calc(100dvh-2rem))] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base font-dhivehi">
                  {editingPart
                    ? `ބައިވެރިޔާގެ މަޢުލޫމާތު ބަދަލުކުރުން (#${editingPart.participant_number})`
                    : 'އައު ބައިވެރިއަކު އިތުރުކުރުން'}
                </h3>
                <p className="text-xs text-slate-500 font-sans">
                  {editingPart ? `Edit Participant Details #${editingPart.participant_number}` : 'Register New Participant'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPartModal(false)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer shrink-0 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5 text-xs">
              <div className="col-span-1">
                <label className="block font-semibold text-slate-700 mb-1">
                  ނަންބަރު (Participant Number):
                </label>
                <input
                  required
                  type="text"
                  placeholder="001, 002..."
                  value={partForm.participant_number}
                  onChange={(e) => setPartForm({ ...partForm, participant_number: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700 font-mono"
                />
              </div>

              <div className="col-span-1">
                <label className="block font-semibold text-slate-700 mb-1">
                  ޙާލަތު (Status):
                </label>
                <select
                  value={partForm.status}
                  onChange={(e) => setPartForm({ ...partForm, status: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700"
                >
                  <option value="Waiting">Waiting (އިންތިޒާރުގައި)</option>
                  <option value="Performing">Performing (މިހާރު ކިޔަވަނީ)</option>
                  <option value="Completed">Completed (ނިމިއްޖެ)</option>
                  <option value="Absent">Absent (ހާޒިރެއްނުވޭ)</option>
                  <option value="Withdrawn">Withdrawn (ވަކިވެއްޖެ)</option>
                  <option value="Disqualified">Disqualified (ޑިސްކޮލިފައި)</option>
                </select>
              </div>

              <div className="col-span-1">
                <label className="block font-semibold text-slate-700 mb-1">
                  ގުރޭޑް (Grade):
                </label>
                <select
                  value={partForm.grade_id}
                  onChange={(e) => setPartForm({ ...partForm, grade_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700"
                >
                  {grades.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name_dhivehi} ({g.name})
                    </option>
                  ))}
                  {grades.length === 0 && (
                    <option value="grade-5">Grade 5 (ގުރޭޑް 5)</option>
                  )}
                </select>
              </div>

              <div className="col-span-1">
                <label className="block font-semibold text-slate-700 mb-1">
                  ގޮފި (Branch):
                </label>
                <select
                  value={partForm.branch_id}
                  onChange={(e) => setPartForm({ ...partForm, branch_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name_dhivehi} ({b.branch_type})
                    </option>
                  ))}
                  {branches.length === 0 && (
                    <>
                      <option value="branch-1">ބަލައިގެން - ފެށޭކޮޅު (Tilawa)</option>
                      <option value="branch-3">ނުބަލާ - ފެށޭކޮޅު (Hifz)</option>
                    </>
                  )}
                </select>
              </div>

              <div className="col-span-1 sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1 text-right">
                  ނަން (ދިވެހިބަހުން / Thaana):
                </label>
                <input
                  required
                  type="text"
                  dir="rtl"
                  placeholder="ޢާއިޝަތު ޒޯޔާ އަޙްމަދު"
                  value={partForm.name_dhivehi}
                  onChange={(e) => setPartForm({ ...partForm, name_dhivehi: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700 font-dhivehi text-right text-sm"
                />
              </div>

              <div className="col-span-1 sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">
                  Name (Latin / English):
                </label>
                <input
                  required
                  type="text"
                  placeholder="Aishath Zoya Ahmed"
                  value={partForm.name}
                  onChange={(e) => setPartForm({ ...partForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700 font-sans"
                />
              </div>

              <div className="col-span-1 sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">
                  ސްކޫލް / މުއައްސަސާ (Institution):
                </label>
                <input
                  type="text"
                  placeholder="Ahmadhiyya, Majeediyya..."
                  value={partForm.institution}
                  onChange={(e) => setPartForm({ ...partForm, institution: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700"
                />
              </div>

              <div className="col-span-1">
                <label className="block font-semibold text-slate-700 mb-1">
                  ރަށް (Island):
                </label>
                <input
                  type="text"
                  placeholder="Malé, Hithadhoo..."
                  value={partForm.island}
                  onChange={(e) => setPartForm({ ...partForm, island: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700"
                />
              </div>

              <div className="col-span-1">
                <label className="block font-semibold text-slate-700 mb-1">
                  އަތޮޅު (Atoll):
                </label>
                <input
                  type="text"
                  placeholder="K. Atoll, S. Atoll..."
                  value={partForm.atoll}
                  onChange={(e) => setPartForm({ ...partForm, atoll: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700"
                />
              </div>

              <div className="col-span-1">
                <label className="block font-semibold text-slate-700 mb-1">
                  ތަރުތީބު (Queue Order):
                </label>
                <input
                  type="number"
                  value={partForm.queue_order}
                  onChange={(e) => setPartForm({ ...partForm, queue_order: Number(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700 font-mono"
                />
              </div>

              <div className="col-span-1 sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">
                  ނޯޓް (Notes / Remarks):
                </label>
                <input
                  type="text"
                  placeholder="Optional remarks..."
                  value={partForm.notes}
                  onChange={(e) => setPartForm({ ...partForm, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700"
                />
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowPartModal(false)}
                className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer text-center"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="w-full sm:w-auto px-5 py-2.5 sm:py-2 rounded-lg text-xs font-bold bg-emerald-800 hover:bg-emerald-700 text-white shadow-xs cursor-pointer text-center"
              >
                {editingPart ? 'Save Changes / ބަދަލުތައް ރައްކާކުރައްވާ' : 'Save Participant / އިތުރުކުރައްވާ'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk CSV Import Modal */}
      <CsvImportModal
        isOpen={showCsvModal}
        onClose={() => setShowCsvModal(false)}
        onSuccess={loadData}
      />

      {/* Add / Edit Question Modal */}
      {showQuestModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto">
          <form
            onSubmit={handleSaveQuestion}
            className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-4 sm:p-6 space-y-4 border border-slate-200 my-auto max-h-[min(90vh,calc(100dvh-2rem))] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-emerald-800 text-amber-300 font-bold flex items-center justify-center text-sm">
                  {questForm.question_number || '01'}
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-base font-dhivehi">
                    {editingQuest ? 'ސުވާލަށް ބަދަލުގެނައުން' : 'އައު ސުވާލެއް އިތުރުކުރުން'}
                  </h3>
                  <p className="text-xs text-slate-500 font-sans">
                    {editingQuest ? 'Edit Question details' : 'Create question with Grade & Branch auto-numbering'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQuestModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Error Notification Banner */}
            {questError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center justify-between">
                <span>{questError}</span>
                <button
                  type="button"
                  onClick={() => setQuestError('')}
                  className="text-rose-500 hover:text-rose-700 font-bold"
                >
                  &times;
                </button>
              </div>
            )}

            {/* GRADE & BRANCH SELECTORS (Matching Reference Image layout in RTL) */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" dir="rtl">
                {/* 1. Grade Selector (Right in RTL) */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5 font-dhivehi text-right">
                    :(Grade) އުމުރުފުރާ
                  </label>
                  <div className="relative">
                    <select
                      value={questForm.grade_id}
                      onChange={(e) => handleGradeChangeInQuestForm(e.target.value)}
                      className="w-full pl-8 pr-3 py-2.5 bg-white hover:bg-slate-50/80 border border-slate-300 rounded-xl text-xs font-dhivehi text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 transition-all appearance-none cursor-pointer text-right shadow-2xs font-semibold"
                    >
                      {grades.map((g) => (
                        <option key={g.id} value={g.id}>
                          ({g.name}) {g.name_dhivehi}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  </div>
                </div>

                {/* 2. Branch Selector (Left in RTL) */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5 font-dhivehi text-right">
                    :(Branch) ގޮފި
                  </label>
                  <div className="relative">
                    <select
                      value={questForm.branch_id}
                      onChange={(e) => handleBranchChangeInQuestForm(e.target.value)}
                      className="w-full pl-8 pr-3 py-2.5 bg-white hover:bg-slate-50/80 border border-slate-300 rounded-xl text-xs font-dhivehi text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 transition-all appearance-none cursor-pointer text-right shadow-2xs font-semibold"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          ({b.branch_type}) {b.name_dhivehi}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Auto Manage Question Number Bar */}
              <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700 font-dhivehi">
                    ސުވާލު ނަންބަރު (Question Number):
                  </span>
                  <input
                    required
                    type="text"
                    value={questForm.question_number}
                    onChange={(e) => setQuestForm({ ...questForm, question_number: e.target.value })}
                    className="w-20 px-3 py-1.5 bg-white border border-emerald-400 font-mono font-bold text-emerald-950 text-center rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    placeholder="01"
                  />
                  {!editingQuest && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full font-dhivehi">
                      <Sparkles size={12} />
                      އޮޓޯއިން ހަމަޖެހިފައި
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleRecalculateQuestionNumber}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-emerald-800 cursor-pointer self-start sm:self-auto"
                  title="Recalculate next number for selected Grade & Branch"
                >
                  <RefreshCw size={12} />
                  <span>އަލުން ނަންބަރު ހަމަޖައްސާ</span>
                </button>
              </div>
            </div>

            {/* SURAH AND AYAH SELECTION CARDS (Matching Reference Design) */}
            <div className="space-y-4">
              {/* CARD 1: Start (ފެށުން) */}
              {(() => {
                const startSurahMeta = SURAHS_LIST.find((s) => s.number === questForm.surah_number) || SURAHS_LIST[0];
                return (
                  <div className="rounded-2xl border-2 border-[#1e4d3f] p-4 bg-[#f8faf9] space-y-3.5 shadow-2xs">
                    {/* Header Row */}
                    <div className="flex items-center justify-between">
                      <span className="font-arabic font-bold text-slate-800 text-sm">
                        {startSurahMeta.name_arabic}{' '}
                        <span className="font-dhivehi font-normal text-xs text-slate-600">
                          ({startSurahMeta.ayah_count} އާޔަތް)
                        </span>
                      </span>
                      <div className="flex items-center gap-1 font-bold text-sm text-slate-900">
                        <span className="font-dhivehi text-slate-700">(ފެށުން)</span>
                        <span className="font-sans font-bold">Start</span>
                      </div>
                    </div>

                    <div className="border-b border-[#1e4d3f]/20" />

                    {/* Field 1: * Start Surah */}
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700 text-right font-sans">
                        * Start Surah
                      </label>
                      <div className="relative">
                        <select
                          value={questForm.surah_number}
                          onChange={(e) => handleStartSurahChange(parseInt(e.target.value, 10))}
                          className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 transition-all appearance-none cursor-pointer text-right shadow-2xs font-sans"
                        >
                          {SURAHS_LIST.map((s) => (
                            <option key={s.number} value={s.number}>
                              {s.number}. {s.name_arabic} ({s.name_english}) - {s.ayah_count} އާޔަތް
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                      </div>
                    </div>

                    {/* Field 2: * Start Ayah (1 - X) */}
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700 text-right font-sans">
                        * Start Ayah <span className="font-bold italic">({1} - {startSurahMeta.ayah_count})</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={startSurahMeta.ayah_count}
                        value={questForm.start_ayah}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 1;
                          setQuestForm((prev) => ({ ...prev, start_ayah: val }));
                        }}
                        className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 text-right focus:outline-none focus:ring-2 focus:ring-emerald-700 shadow-2xs"
                      />
                    </div>
                  </div>
                );
              })()}

              {/* CARD 2: End (ނިމުން) */}
              {(() => {
                const endSurahMeta = SURAHS_LIST.find((s) => s.number === (questForm.end_surah_number || questForm.surah_number)) || SURAHS_LIST[0];
                return (
                  <div className="rounded-2xl border-2 border-[#82c4e0] p-4 bg-[#f4f9fc] space-y-3.5 shadow-2xs">
                    {/* Header Row */}
                    <div className="flex items-center justify-between">
                      <span className="font-arabic font-bold text-[#0a6c8e] text-sm">
                        {endSurahMeta.name_arabic}{' '}
                        <span className="font-dhivehi font-normal text-xs text-[#0a6c8e]/80">
                          ({endSurahMeta.ayah_count} އާޔަތް)
                        </span>
                      </span>
                      <div className="flex items-center gap-1 font-bold text-sm text-[#0a6c8e]">
                        <span className="font-dhivehi">(ނިމުން)</span>
                        <span className="font-sans font-bold">End</span>
                      </div>
                    </div>

                    <div className="border-b border-[#82c4e0]/40" />

                    {/* Field 1: * End Surah */}
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-[#0a6c8e] text-right font-sans">
                        * End Surah
                      </label>
                      <div className="relative">
                        <select
                          value={questForm.end_surah_number || questForm.surah_number}
                          onChange={(e) => handleEndSurahChange(parseInt(e.target.value, 10))}
                          className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-600 transition-all appearance-none cursor-pointer text-right shadow-2xs font-sans"
                        >
                          {SURAHS_LIST.map((s) => (
                            <option key={s.number} value={s.number}>
                              {s.number}. {s.name_arabic} ({s.name_english}) - {s.ayah_count} އާޔަތް
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                      </div>
                    </div>

                    {/* Field 2: * End Ayah (1 - X) */}
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-[#0a6c8e] text-right font-sans">
                        * End Ayah <span className="font-bold italic">({1} - {endSurahMeta.ayah_count})</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={endSurahMeta.ayah_count}
                        value={questForm.end_ayah}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 1;
                          setQuestForm((prev) => ({ ...prev, end_ayah: val }));
                        }}
                        className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 text-right focus:outline-none focus:ring-2 focus:ring-sky-600 shadow-2xs"
                      />
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* PAGE, JUZ & DETAILS (Auto-managed with manual adjustments) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50/70 p-3 rounded-xl border border-slate-200">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  މުޞްޙަފްގެ ޞަފްޙާ (Start Page):
                </label>
                <input
                  type="number"
                  min={1}
                  max={604}
                  value={questForm.start_page}
                  onChange={(e) => setQuestForm({ ...questForm, start_page: parseInt(e.target.value, 10) || 1 })}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none font-mono text-center font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  ނިމޭ ޞަފްޙާ (End Page):
                </label>
                <input
                  type="number"
                  min={1}
                  max={604}
                  value={questForm.end_page}
                  onChange={(e) => setQuestForm({ ...questForm, end_page: parseInt(e.target.value, 10) || 1 })}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none font-mono text-center font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  ފޮތް / ޖުޒް (Juz):
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={questForm.juz}
                  onChange={(e) => setQuestForm({ ...questForm, juz: parseInt(e.target.value, 10) || 1 })}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none font-mono text-center font-bold"
                />
              </div>
            </div>

              {/* Arabic Quran text */}
              <div className="col-span-1 sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold text-slate-700">
                    ޤުރުއާނުގެ ޢަރަބި ލަފްޒުތައް (Arabic Quran Text):
                  </label>
                  <button
                    type="button"
                    onClick={handleFetchPassage}
                    disabled={fetchingPassage}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded cursor-pointer transition-colors"
                  >
                    <BookOpen size={12} />
                    <span>{fetchingPassage ? 'ގެންނަނީ...' : 'ޢަރަބި ލަފްޒުތައް ގެންނަވާ / Fetch Passage'}</span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={questForm.quran_text_arabic}
                  onChange={(e) => setQuestForm({ ...questForm, quran_text_arabic: e.target.value })}
                  placeholder="ޤުރުއާނުގެ އާޔަތްތައް..."
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-700 font-quran text-base leading-relaxed text-right"
                  dir="rtl"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  ނޯޓް (Notes / Hints):
                </label>
                <input
                  type="text"
                  placeholder="Optional judge hint or recitation rules..."
                  value={questForm.notes}
                  onChange={(e) => setQuestForm({ ...questForm, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none text-xs"
                />
              </div>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowQuestModal(false)}
                className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer text-center"
              >
                Cancel / ކެންސަލް
              </button>
              <button
                type="submit"
                disabled={questSaving}
                className="w-full sm:w-auto px-5 py-2.5 sm:py-2 rounded-lg text-xs font-bold bg-emerald-800 hover:bg-emerald-700 text-white shadow-xs cursor-pointer transition-colors disabled:opacity-50 text-center"
              >
                {questSaving
                  ? 'Saving...'
                  : editingQuest
                  ? 'Save Changes / ބަދަލުތައް ރައްކާކުރައްވާ'
                  : 'Save Question / ސުވާލު ރައްކާކުރައްވާ'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
