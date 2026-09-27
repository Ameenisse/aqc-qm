import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { VERIFIED_PASSAGES, SURAHS_LIST } from './quranData.js';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'ababeel.db');
export const db = new DatabaseSync(DB_PATH);

// Configure SQLite for high concurrency and performance
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');

// Atomic transaction helper
export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Initialize tables
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS competitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_dhivehi TEXT NOT NULL,
      organization_name TEXT NOT NULL,
      organization_logo_url TEXT DEFAULT '',
      competition_logo_url TEXT DEFAULT '',
      venue TEXT DEFAULT '',
      competition_year TEXT DEFAULT '1446 / 2025',
      start_date TEXT DEFAULT '',
      end_date TEXT DEFAULT '',
      description TEXT DEFAULT '',
      contact_details TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      results_published INTEGER DEFAULT 0,
      audience_quran_visibility INTEGER DEFAULT 1,
      tilawa_podium_quran_visibility INTEGER DEFAULT 1,
      hifz_podium_answer_visibility INTEGER DEFAULT 0,
      finished_screen_duration INTEGER DEFAULT 3,
      finished_performance_text TEXT DEFAULT 'ނިމުނީ / Performance Finished',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS grades (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      name_dhivehi TEXT NOT NULL,
      display_order INTEGER NOT NULL,
      is_official INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name_dhivehi TEXT NOT NULL,
      branch_type TEXT NOT NULL, -- 'TILAWA' | 'HIFZ'
      direction TEXT NOT NULL,   -- 'BEGINNING' | 'ENDING'
      surah_start INTEGER NOT NULL,
      surah_end INTEGER NOT NULL,
      display_order INTEGER NOT NULL,
      is_official INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      competition_id TEXT NOT NULL,
      grade_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      name TEXT NOT NULL,
      name_dhivehi TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
      FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE CASCADE,
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      competition_id TEXT NOT NULL,
      participant_number TEXT NOT NULL,
      name TEXT NOT NULL,
      name_dhivehi TEXT NOT NULL,
      photo_url TEXT DEFAULT '',
      gender TEXT DEFAULT 'male',
      dob TEXT DEFAULT '',
      age INTEGER DEFAULT 0,
      institution TEXT DEFAULT '',
      island TEXT DEFAULT '',
      atoll TEXT DEFAULT '',
      contact TEXT DEFAULT '',
      grade_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      category_id TEXT DEFAULT '',
      queue_order INTEGER DEFAULT 0,
      status TEXT DEFAULT 'Waiting',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(competition_id, participant_number),
      FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
      FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE CASCADE,
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      competition_id TEXT NOT NULL,
      grade_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      category_id TEXT DEFAULT '',
      question_number TEXT NOT NULL,
      surah_number INTEGER NOT NULL,
      surah_name TEXT NOT NULL,
      surah_name_arabic TEXT NOT NULL,
      start_ayah INTEGER NOT NULL,
      end_ayah INTEGER NOT NULL,
      start_page INTEGER NOT NULL,
      end_page INTEGER NOT NULL,
      juz INTEGER NOT NULL,
      quran_text_preview TEXT DEFAULT '',
      quran_text_arabic TEXT DEFAULT '',
      difficulty TEXT DEFAULT 'Medium',
      notes TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(competition_id, grade_id, branch_id, category_id, question_number),
      FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
      FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE CASCADE,
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS performance_sessions (
      id TEXT PRIMARY KEY,
      competition_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      session_number INTEGER DEFAULT 1,
      is_recall INTEGER DEFAULT 0,
      supersedes_session_id TEXT DEFAULT NULL,
      status TEXT DEFAULT 'active', -- 'active' | 'completed' | 'cancelled'
      called_at TEXT DEFAULT CURRENT_TIMESTAMP,
      question_selected_at TEXT DEFAULT NULL,
      started_at TEXT DEFAULT NULL,
      finished_at TEXT DEFAULT NULL,
      active_question_id TEXT DEFAULT NULL,
      operator_id TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
      FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS question_usage (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL,
      performance_session_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      selected_by TEXT DEFAULT 'PODIUM',
      selection_method TEXT DEFAULT 'PODIUM',
      selected_at TEXT DEFAULT CURRENT_TIMESTAMP,
      reset_at TEXT DEFAULT NULL,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
      FOREIGN KEY (performance_session_id) REFERENCES performance_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS stage_state (
      id TEXT PRIMARY KEY,
      competition_id TEXT NOT NULL,
      performance_session_id TEXT DEFAULT NULL,
      participant_id TEXT DEFAULT NULL,
      stage_status TEXT DEFAULT 'HOLDING',
      active_question_id TEXT DEFAULT NULL,
      question_selection_enabled INTEGER DEFAULT 0,
      timer_mode TEXT DEFAULT 'stopwatch',
      timer_duration INTEGER DEFAULT 180,
      timer_started_at TEXT DEFAULT NULL,
      timer_paused_at TEXT DEFAULT NULL,
      timer_offset INTEGER DEFAULT 0,
      display_state TEXT DEFAULT 'HOLDING',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      name_dhivehi TEXT DEFAULT '',
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS judges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      judge_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      name_dhivehi TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      can_trigger_stage_bells INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rubrics (
      id TEXT PRIMARY KEY,
      competition_id TEXT NOT NULL,
      branch_type TEXT NOT NULL, -- 'TILAWA' | 'HIFZ'
      name TEXT NOT NULL,
      name_dhivehi TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rubric_criteria (
      id TEXT PRIMARY KEY,
      rubric_id TEXT NOT NULL,
      name TEXT NOT NULL,
      name_dhivehi TEXT NOT NULL,
      max_points REAL NOT NULL,
      weight REAL NOT NULL,
      starting_points REAL NOT NULL,
      allowed_deductions TEXT NOT NULL DEFAULT '[-0.5, -1.0, -2.0]',
      display_order INTEGER NOT NULL,
      status TEXT DEFAULT 'active',
      FOREIGN KEY (rubric_id) REFERENCES rubrics(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS judge_scores (
      id TEXT PRIMARY KEY,
      performance_session_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      judge_id TEXT NOT NULL,
      rubric_id TEXT NOT NULL,
      subtotal REAL DEFAULT 0,
      deductions_total REAL DEFAULT 0,
      final_total REAL DEFAULT 0,
      submission_status TEXT DEFAULT 'DRAFT', -- 'NOT STARTED' | 'DRAFT' | 'SUBMITTED' | 'REOPENED'
      submitted_at TEXT DEFAULT NULL,
      version INTEGER DEFAULT 1,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(performance_session_id, judge_id),
      FOREIGN KEY (performance_session_id) REFERENCES performance_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
      FOREIGN KEY (judge_id) REFERENCES judges(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS score_deductions (
      id TEXT PRIMARY KEY,
      judge_score_id TEXT NOT NULL,
      criterion_id TEXT NOT NULL,
      value REAL NOT NULL,
      reason TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (judge_score_id) REFERENCES judge_scores(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bell_events (
      id TEXT PRIMARY KEY,
      performance_session_id TEXT DEFAULT NULL,
      judge_id TEXT DEFAULT NULL,
      bell_type TEXT NOT NULL, -- 'FIRST_WARNING' | 'FINAL_WARNING' | 'STOP'
      triggered_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS results (
      id TEXT PRIMARY KEY,
      performance_session_id TEXT NOT NULL UNIQUE,
      participant_id TEXT NOT NULL,
      category_id TEXT DEFAULT '',
      final_score REAL DEFAULT 0,
      rank INTEGER DEFAULT 0,
      verification_status TEXT DEFAULT 'PENDING JUDGES',
      published INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (performance_session_id) REFERENCES performance_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT DEFAULT NULL,
      role TEXT DEFAULT NULL,
      action TEXT NOT NULL,
      module TEXT NOT NULL,
      entity_type TEXT DEFAULT NULL,
      entity_id TEXT DEFAULT NULL,
      previous_data TEXT DEFAULT NULL,
      new_data TEXT DEFAULT NULL,
      reason TEXT DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Safe migrations for end_surah columns
  try {
    db.prepare('ALTER TABLE questions ADD COLUMN end_surah_number INTEGER DEFAULT NULL').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE questions ADD COLUMN end_surah_name TEXT DEFAULT NULL').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE questions ADD COLUMN end_surah_name_arabic TEXT DEFAULT NULL').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE competitions ADD COLUMN audience_background_url TEXT DEFAULT ""').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE competitions ADD COLUMN audience_background_overlay INTEGER DEFAULT 65').run();
  } catch (e) {}

  seedInitialData();
}

export function seedInitialData() {
  const compCount = db.prepare('SELECT COUNT(*) as c FROM competitions').get() as any;
  if (compCount && compCount.c > 0) {
    return; // Already initialized
  }

  transaction(() => {
    // 1. Competition
    const compId = 'comp-1';
    db.prepare(`
      INSERT INTO competitions (
        id, name, name_dhivehi, organization_name, venue, competition_year,
        start_date, end_date, description, results_published, audience_quran_visibility,
        tilawa_podium_quran_visibility, hifz_podium_answer_visibility, finished_screen_duration
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 1, 0, 3)
    `).run(
      compId,
      'Ababil Quran Competition 1446',
      'އަބާބީލް ޤުރުއާން މުބާރާތް 1446',
      'ޤުރުއާނާބެހޭ ޤައުމީ މަރުކަޒު / Center for Holy Quran',
      'Islamic Center Hall, Malé',
      '1446 / 2025',
      '2025-09-01',
      '2025-09-10',
      'National Quran Recitation & Memorization Championship'
    );

    // 2. 15 Official Grades (Section 6)
    const officialGrades = [
      { id: 'grade-bn', code: 'BN', name: 'Baby Nursery', name_dhivehi: 'ބޭބީ ނަރސަރީ', order: 1 },
      { id: 'grade-n', code: 'N', name: 'Nursery', name_dhivehi: 'ނަރސަރީ', order: 2 },
      { id: 'grade-lkg', code: 'LKG', name: 'LKG', name_dhivehi: 'އެލް.ކޭ.ޖީ', order: 3 },
      { id: 'grade-ukg', code: 'UKG', name: 'UKG', name_dhivehi: 'ޔޫ.ކޭ.ޖީ', order: 4 },
      { id: 'grade-1', code: 'G1', name: 'Grade 1', name_dhivehi: 'ގުރޭޑް 1', order: 5 },
      { id: 'grade-2', code: 'G2', name: 'Grade 2', name_dhivehi: 'ގުރޭޑް 2', order: 6 },
      { id: 'grade-3', code: 'G3', name: 'Grade 3', name_dhivehi: 'ގުރޭޑް 3', order: 7 },
      { id: 'grade-4', code: 'G4', name: 'Grade 4', name_dhivehi: 'ގުރޭޑް 4', order: 8 },
      { id: 'grade-5', code: 'G5', name: 'Grade 5', name_dhivehi: 'ގުރޭޑް 5', order: 9 },
      { id: 'grade-6', code: 'G6', name: 'Grade 6', name_dhivehi: 'ގުރޭޑް 6', order: 10 },
      { id: 'grade-7', code: 'G7', name: 'Grade 7', name_dhivehi: 'ގުރޭޑް 7', order: 11 },
      { id: 'grade-8', code: 'G8', name: 'Grade 8', name_dhivehi: 'ގުރޭޑް 8', order: 12 },
      { id: 'grade-9', code: 'G9', name: 'Grade 9', name_dhivehi: 'ގުރޭޑް 9', order: 13 },
      { id: 'grade-10', code: 'G10', name: 'Grade 10', name_dhivehi: 'ގުރޭޑް 10', order: 14 },
      { id: 'grade-parents', code: 'PAR', name: 'Parents', name_dhivehi: 'ބެލެނިވެރިން', order: 15 },
    ];

    const insertGrade = db.prepare(`
      INSERT INTO grades (id, code, name, name_dhivehi, display_order, is_official, status)
      VALUES (?, ?, ?, ?, ?, 1, 'active')
    `);
    for (const g of officialGrades) {
      insertGrade.run(g.id, g.code, g.name, g.name_dhivehi, g.order);
    }

    // 3. 4 Official Branches (Section 7)
    const officialBranches = [
      {
        id: 'branch-1',
        code: 'B1',
        name_dhivehi: 'ބަލައިގެން - ފެށޭކޮޅު',
        branch_type: 'TILAWA',
        direction: 'BEGINNING',
        surah_start: 1,
        surah_end: 114,
        display_order: 1
      },
      {
        id: 'branch-2',
        code: 'B2',
        name_dhivehi: 'ބަލައިގެން - ނިމޭކޮޅު',
        branch_type: 'TILAWA',
        direction: 'ENDING',
        surah_start: 114,
        surah_end: 1,
        display_order: 2
      },
      {
        id: 'branch-3',
        code: 'B3',
        name_dhivehi: 'ނުބަލާ - ފެށޭކޮޅު',
        branch_type: 'HIFZ',
        direction: 'BEGINNING',
        surah_start: 1,
        surah_end: 114,
        display_order: 3
      },
      {
        id: 'branch-4',
        code: 'B4',
        name_dhivehi: 'ނުބަލާ - ނިމޭކޮޅު',
        branch_type: 'HIFZ',
        direction: 'ENDING',
        surah_start: 114,
        surah_end: 1,
        display_order: 4
      }
    ];

    const insertBranch = db.prepare(`
      INSERT INTO branches (id, code, name_dhivehi, branch_type, direction, surah_start, surah_end, display_order, is_official, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'active')
    `);
    for (const b of officialBranches) {
      insertBranch.run(b.id, b.code, b.name_dhivehi, b.branch_type, b.direction, b.surah_start, b.surah_end, b.display_order);
    }

    // 4. Default Categories
    const insertCat = db.prepare(`
      INSERT INTO categories (id, competition_id, grade_id, branch_id, name, name_dhivehi, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `);
    insertCat.run('cat-g5-b1', compId, 'grade-5', 'branch-1', 'Grade 5 - Tilawa Beg', 'ގުރޭޑް 5 - ބަލައިގެން ފެށޭކޮޅު');
    insertCat.run('cat-g5-b4', compId, 'grade-5', 'branch-4', 'Grade 5 - Hifz End', 'ގުރޭޑް 5 - ނުބަލާ ނިމޭކޮޅު');
    insertCat.run('cat-g10-b1', compId, 'grade-10', 'branch-1', 'Grade 10 - Tilawa Beg', 'ގުރޭޑް 10 - ބަލައިގެން ފެށޭކޮޅު');
    insertCat.run('cat-g10-b3', compId, 'grade-10', 'branch-3', 'Grade 10 - Hifz Beg', 'ގުރޭޑް 10 - ނުބަލާ ފެށޭކޮޅު');

    // 5. Users and Roles (Section 5)
    const insertUser = db.prepare(`
      INSERT INTO users (id, username, name, name_dhivehi, password, role, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `);
    insertUser.run('u-admin', 'admin', 'Competition Director', 'މުބާރާތުގެ ވެރިޔާ', '602613', 'ADMIN');
    insertUser.run('u-op', 'operator', 'Stage Controller', 'ސްޓޭޖް އޮޕަރޭޓަރު', 'operator123', 'PRESENTATION_OPERATOR');
    insertUser.run('u-podium', 'podium', 'Podium Screen', 'ޕޯޑިއަމް ސްކްރީން', 'podium123', 'PODIUM');
    insertUser.run('u-audience', 'audience', 'Audience Screen', 'ޓީވީ / ޕްރޮޖެކްޓަރ', 'audience123', 'AUDIENCE');
    insertUser.run('u-j1', 'judge1', 'Sheikh Mohamed Latheef', 'ޝައިޚް މުޙައްމަދު ލަޠީފް', '1234', 'JUDGE');
    insertUser.run('u-j2', 'judge2', 'Usthaza Mariyam Nasheeda', 'އުސްތާޛާ މަރްޔަމް ނަޝީދާ', '1234', 'JUDGE');
    insertUser.run('u-j3', 'judge3', 'Qari Ahmed Zaki', 'ޤާރީ އަޙްމަދު ޒަކީ', '1234', 'JUDGE');
    insertUser.run('u-j4', 'judge4', 'Usthaz Hussain Rasheed', 'އުސްތާޛް ޙުސައިން ރަޝީދު', '1234', 'JUDGE');
    insertUser.run('u-ro', 'officer', 'Result Officer', 'ނަތީޖާ އޮފިސަރު', 'officer123', 'RESULT_OFFICER');

    // 6. Judges & Bell Permissions (Section 36 & 64)
    const insertJudge = db.prepare(`
      INSERT INTO judges (id, user_id, judge_code, name, name_dhivehi, status, can_trigger_stage_bells)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `);
    insertJudge.run('j-1', 'u-j1', 'J-01', 'Sheikh Mohamed Latheef', 'ޝައިޚް މުޙައްމަދު ލަޠީފް', 1); // Designated Bell Judge
    insertJudge.run('j-2', 'u-j2', 'J-02', 'Usthaza Mariyam Nasheeda', 'އުސްތާޛާ މަރްޔަމް ނަޝީދާ', 0);
    insertJudge.run('j-3', 'u-j3', 'J-03', 'Qari Ahmed Zaki', 'ޤާރީ އަޙްމަދު ޒަކީ', 0);
    insertJudge.run('j-4', 'u-j4', 'J-04', 'Usthaz Hussain Rasheed', 'އުސްތާޛް ޙުސައިން ރަޝީދު', 0);

    // 7. Rubrics (Section 44 & 45)
    // Tilawa Rubric: Tajweed (40), Voice & Tune (30), Fluency / Waqf (30) = 100 Total
    const rTilawaId = 'rubric-tilawa';
    db.prepare(`
      INSERT INTO rubrics (id, competition_id, branch_type, name, name_dhivehi, status)
      VALUES (?, ?, 'TILAWA', 'Official Tilawa Rubric', 'ބަލައިގެން ކިޔެވުމުގެ ރުބްރިކް', 'active')
    `).run(rTilawaId, compId);

    const insertCriterion = db.prepare(`
      INSERT INTO rubric_criteria (id, rubric_id, name, name_dhivehi, max_points, weight, starting_points, allowed_deductions, display_order, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `);
    insertCriterion.run('crit-t-1', rTilawaId, 'Tajweed (Rules, Makharij & Sifat)', 'ތަޖުވީދުގެ ޙުކުމްތަކާއި މަޚާރިޖު', 40, 1.0, 40, '[-0.5, -1.0, -2.0]', 1);
    insertCriterion.run('crit-t-2', rTilawaId, 'Voice & Appropriate Tune', 'އަޑާއި ރާގު އަދި ރީތިކަން', 30, 1.0, 30, '[-0.5, -1.0, -2.0]', 2);
    insertCriterion.run('crit-t-3', rTilawaId, 'Fluency, Waqf & Ibtida', 'ހުއްޓުމާއި ފެށުން އަދި ފަސޭހަކަން', 30, 1.0, 30, '[-0.5, -1.0, -2.0]', 3);

    // Hifz Rubric: Memorization Accuracy (50), Tajweed (30), Fluency & Waqf (20) = 100 Total
    const rHifzId = 'rubric-hifz';
    db.prepare(`
      INSERT INTO rubrics (id, competition_id, branch_type, name, name_dhivehi, status)
      VALUES (?, ?, 'HIFZ', 'Official Hifz Rubric', 'ހިތުދަސްކޮށް ކިޔެވުމުގެ ރުބްރިކް', 'active')
    `).run(rHifzId, compId);

    insertCriterion.run('crit-h-1', rHifzId, 'Memorization Accuracy (Mistakes & Hesitation)', 'ހިތުދަސްކަމާއި ފަރިތަކަން (ކުށް/ހަނދާންކޮށްދިނުން)', 50, 1.0, 50, '[-0.5, -1.0, -2.0]', 1);
    insertCriterion.run('crit-h-2', rHifzId, 'Tajweed & Pronunciation', 'ތަޖުވީދާއި މަޚާރިޖުތައް', 30, 1.0, 30, '[-0.5, -1.0, -2.0]', 2);
    insertCriterion.run('crit-h-3', rHifzId, 'Fluency, Waqf & Voice', 'ހުއްޓުމާއި ފެށުން އަދި އަޑުގެ ރީތިކަން', 20, 1.0, 20, '[-0.5, -1.0, -2.0]', 3);

    // 8. Participants (Realistic Maldivian Quran Competition Participants)
    const participantsList = [
      {
        id: 'part-001',
        num: '001',
        name: 'Aishath Zoya Ahmed',
        name_dh: 'ޢާއިޝަތު ޒޯޔާ އަޙްމަދު',
        inst: 'Ahmadhiyya International School',
        island: 'Malé',
        atoll: 'K. Atoll',
        grade: 'grade-5',
        branch: 'branch-1',
        cat: 'cat-g5-b1',
        status: 'Waiting',
        order: 1
      },
      {
        id: 'part-002',
        num: '002',
        name: 'Ibrahim Nuhaad Mohamed',
        name_dh: 'އިބްރާހީމް ނުހާދު މުޙައްމަދު',
        inst: 'Majeediyya School',
        island: 'Malé',
        atoll: 'K. Atoll',
        grade: 'grade-5',
        branch: 'branch-1',
        cat: 'cat-g5-b1',
        status: 'Waiting',
        order: 2
      },
      {
        id: 'part-003',
        num: '003',
        name: 'Mariyam Rauha Ali',
        name_dh: 'މަރްޔަމް ރައުޙާ ޢަލީ',
        inst: 'Aminiya School',
        island: 'Malé',
        atoll: 'K. Atoll',
        grade: 'grade-5',
        branch: 'branch-4',
        cat: 'cat-g5-b4',
        status: 'Waiting',
        order: 3
      },
      {
        id: 'part-004',
        num: '004',
        name: 'Hassan Rayan Abdulla',
        name_dh: 'ޙަސަން ރަޔާން ޢަބްދުﷲ',
        inst: 'Al Madhrasathul Arabiyyathul Islamiyya',
        island: 'Malé',
        atoll: 'K. Atoll',
        grade: 'grade-5',
        branch: 'branch-4',
        cat: 'cat-g5-b4',
        status: 'Waiting',
        order: 4
      },
      {
        id: 'part-005',
        num: '005',
        name: 'Ahmed Ali Rasheed',
        name_dh: 'އަޙްމަދު ޢަލީ ރަޝީދު',
        inst: 'Dharumavantha School',
        island: 'Malé',
        atoll: 'K. Atoll',
        grade: 'grade-5',
        branch: 'branch-4',
        cat: 'cat-g5-b4',
        status: 'Waiting',
        order: 5
      },
      {
        id: 'part-006',
        num: '006',
        name: 'Aminath Shafa Shareef',
        name_dh: 'އާމިނަތު ޝަފާ ޝަރީފް',
        inst: 'Center for Higher Secondary Education (CHSE)',
        island: 'Hulhumalé',
        atoll: 'K. Atoll',
        grade: 'grade-10',
        branch: 'branch-1',
        cat: 'cat-g10-b1',
        status: 'Waiting',
        order: 6
      },
      {
        id: 'part-007',
        num: '007',
        name: 'Mohamed Yamin Zahir',
        name_dh: 'މުޙައްމަދު ޔާމީން ޒާހިރު',
        inst: 'Hithadhoo School',
        island: 'Hithadhoo',
        atoll: 'S. Atoll (Addu)',
        grade: 'grade-10',
        branch: 'branch-3',
        cat: 'cat-g10-b3',
        status: 'Waiting',
        order: 7
      },
      {
        id: 'part-008',
        num: '008',
        name: 'Fathimath Shayan Shahid',
        name_dh: 'ފާޠިމަތު ޝަޔާން ޝާހިދު',
        inst: 'Kulhudhuffushi Jalaluddin School',
        island: 'Kulhudhuffushi',
        atoll: 'HDh. Atoll',
        grade: 'grade-10',
        branch: 'branch-3',
        cat: 'cat-g10-b3',
        status: 'Waiting',
        order: 8
      }
    ];

    const insertPart = db.prepare(`
      INSERT INTO participants (
        id, competition_id, participant_number, name, name_dhivehi, institution,
        island, atoll, grade_id, branch_id, category_id, queue_order, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const p of participantsList) {
      insertPart.run(p.id, compId, p.num, p.name, p.name_dh, p.inst, p.island, p.atoll, p.grade, p.branch, p.cat, p.order, p.status);
    }

    // 9. Pre-seeded Question Pool (10 Questions for Tilawa Beg & 10 for Hifz End)
    const insertQ = db.prepare(`
      INSERT INTO questions (
        id, competition_id, grade_id, branch_id, category_id, question_number,
        surah_number, surah_name, surah_name_arabic, start_ayah, end_ayah,
        start_page, end_page, juz, quran_text_preview, quran_text_arabic, difficulty, status, used
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0)
    `);

    // Questions for Grade 5 Tilawa Beginning (branch-1)
    const tilawaQuestions = [
      { qNum: '01', surah: 1, sAyah: 1, eAyah: 7, p: 1, juz: 1, key: '1:1-7' },
      { qNum: '02', surah: 2, sAyah: 1, eAyah: 5, p: 2, juz: 1, key: '2:1-5' },
      { qNum: '03', surah: 2, sAyah: 255, eAyah: 257, p: 42, juz: 3, key: '2:255-257' },
      { qNum: '04', surah: 36, sAyah: 1, eAyah: 12, p: 440, juz: 22, key: '36:1-12' },
      { qNum: '05', surah: 55, sAyah: 1, eAyah: 16, p: 531, juz: 27, key: '55:1-16' },
      { qNum: '06', surah: 67, sAyah: 1, eAyah: 10, p: 562, juz: 29, key: '67:1-10' },
      { qNum: '07', surah: 78, sAyah: 1, eAyah: 16, p: 582, juz: 30, key: '78:1-16' },
      { qNum: '08', surah: 87, sAyah: 1, eAyah: 19, p: 591, juz: 30, key: '87:1-19' },
      { qNum: '09', surah: 93, sAyah: 1, eAyah: 11, p: 596, juz: 30, key: '93:1-11' },
      { qNum: '10', surah: 97, sAyah: 1, eAyah: 5, p: 598, juz: 30, key: '97:1-5' },
    ];

    for (const q of tilawaQuestions) {
      const sMeta = SURAHS_LIST.find(s => s.number === q.surah)!;
      const arabicText = VERIFIED_PASSAGES[q.key] || `${sMeta.name_arabic} (${q.sAyah}-${q.eAyah})`;
      insertQ.run(
        `q-t5-${q.qNum}`, compId, 'grade-5', 'branch-1', 'cat-g5-b1', q.qNum,
        q.surah, sMeta.name_english, sMeta.name_arabic, q.sAyah, q.eAyah,
        q.p, q.p, q.juz, arabicText.slice(0, 100) + '...', arabicText, 'Medium'
      );
    }

    // Questions for Grade 5 Hifz Ending (branch-4, Juz 30)
    const hifzQuestions = [
      { qNum: '01', surah: 114, sAyah: 1, eAyah: 6, p: 604, juz: 30, key: '114:1-6' },
      { qNum: '02', surah: 113, sAyah: 1, eAyah: 5, p: 604, juz: 30, key: '113:1-5' },
      { qNum: '03', surah: 112, sAyah: 1, eAyah: 4, p: 604, juz: 30, key: '112:1-4' },
      { qNum: '04', surah: 97, sAyah: 1, eAyah: 5, p: 598, juz: 30, key: '97:1-5' },
      { qNum: '05', surah: 93, sAyah: 1, eAyah: 11, p: 596, juz: 30, key: '93:1-11' },
      { qNum: '06', surah: 87, sAyah: 1, eAyah: 19, p: 591, juz: 30, key: '87:1-19' },
      { qNum: '07', surah: 78, sAyah: 1, eAyah: 16, p: 582, juz: 30, key: '78:1-16' },
      { qNum: '08', surah: 67, sAyah: 1, eAyah: 10, p: 562, juz: 29, key: '67:1-10' },
      { qNum: '09', surah: 55, sAyah: 1, eAyah: 16, p: 531, juz: 27, key: '55:1-16' },
      { qNum: '10', surah: 36, sAyah: 1, eAyah: 12, p: 440, juz: 22, key: '36:1-12' },
    ];

    for (const q of hifzQuestions) {
      const sMeta = SURAHS_LIST.find(s => s.number === q.surah)!;
      const arabicText = VERIFIED_PASSAGES[q.key] || `${sMeta.name_arabic} (${q.sAyah}-${q.eAyah})`;
      insertQ.run(
        `q-h5-${q.qNum}`, compId, 'grade-5', 'branch-4', 'cat-g5-b4', q.qNum,
        q.surah, sMeta.name_english, sMeta.name_arabic, q.sAyah, q.eAyah,
        q.p, q.p, q.juz, arabicText.slice(0, 100) + '...', arabicText, 'Medium'
      );
    }

    // 10. Initial Stage State
    db.prepare(`
      INSERT INTO stage_state (
        id, competition_id, stage_status, question_selection_enabled,
        timer_mode, timer_duration, display_state
      ) VALUES ('stage-1', ?, 'HOLDING', 0, 'stopwatch', 180, 'HOLDING')
    `).run(compId);

    // 11. Initial Audit Log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, role, action, module, reason)
      VALUES ('audit-init', 'u-admin', 'ADMIN', 'SYSTEM_INITIALIZED', 'SETUP', 'System bootstrap completed with official Maldivian grades and branches.')
    `).run();
  });
}

// Call initialization immediately on module load
initDatabase();

// Ensure podium and audience users exist in existing databases, and ensure admin PIN is 602613
try {
  db.prepare(`
    INSERT OR IGNORE INTO users (id, username, name, name_dhivehi, password, role, status)
    VALUES ('u-podium', 'podium', 'Podium Screen', 'ޕޯޑިއަމް ސްކްރީން', 'podium123', 'PODIUM', 'active')
  `).run();
  db.prepare(`
    INSERT OR IGNORE INTO users (id, username, name, name_dhivehi, password, role, status)
    VALUES ('u-audience', 'audience', 'Audience Screen', 'ޓީވީ / ޕްރޮޖެކްޓަރ', 'audience123', 'AUDIENCE', 'active')
  `).run();
  // Built-in admin PIN is 602613
  db.prepare(`
    UPDATE users SET password = '602613' WHERE username = 'admin' AND password = 'admin123'
  `).run();
} catch (e) {
  // Ignore if table doesn't exist yet
}
