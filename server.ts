import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { db, transaction } from './server/db.js';
import { SURAHS_LIST, fetchQuranPassage, VERIFIED_PASSAGES } from './server/quranData.js';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;
const server = http.createServer(app);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Connected clients tracking
const wsClients = new Set<WebSocket>();
const sseClients = new Set<express.Response>();

// Realtime event broadcaster (both WebSockets and SSE)
export function broadcastEvent(type: string, payload: any) {
  const msg = JSON.stringify({
    type,
    payload,
    timestamp: new Date().toISOString()
  });

  // Broadcast to WebSocket clients
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(msg);
      } catch (e) {
        // ignore client error
      }
    }
  }

  // Broadcast to SSE clients
  for (const res of sseClients) {
    try {
      res.write(`data: ${msg}\n\n`);
    } catch (e) {
      // ignore
    }
  }
}

// WebSocket Server initialization
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  wsClients.add(ws);
  // Send current stage state immediately on connect
  try {
    const stageState = getHydratedStageState();
    ws.send(JSON.stringify({
      type: 'INIT_STATE',
      payload: stageState,
      timestamp: new Date().toISOString()
    }));
  } catch (e) {
    console.error('Error sending init state:', e);
  }

  ws.on('close', () => {
    wsClients.delete(ws);
  });
  ws.on('error', () => {
    wsClients.delete(ws);
  });
});

// SSE endpoint (/api/stage/stream)
app.get('/api/stage/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });
  res.flushHeaders();

  sseClients.add(res);

  // Send initial state
  const stageState = getHydratedStageState();
  res.write(`data: ${JSON.stringify({
    type: 'INIT_STATE',
    payload: stageState,
    timestamp: new Date().toISOString()
  })}\n\n`);

  // Keep-alive heartbeat every 20 seconds
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// Helper to log audit events
export function logAudit(userId: string, role: string, action: string, module: string, entityType = '', entityId = '', prevData = '', newData = '', reason = '') {
  try {
    const id = 'audit-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, role, action, module, entity_type, entity_id, previous_data, new_data, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, role, action, module, entityType, entityId, prevData, newData, reason);

    broadcastEvent('AUDIT_LOG_ADDED', {
      id, user_id: userId, role, action, module, entity_type: entityType, entity_id: entityId, reason, created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

// Stage state hydration helper
export function getHydratedStageState() {
  const row = db.prepare('SELECT * FROM stage_state LIMIT 1').get() as any;
  if (!row) return null;

  let participant = null;
  if (row.participant_id) {
    participant = db.prepare(`
      SELECT p.*, g.name_dhivehi as grade_name_dhivehi, g.name as grade_name,
             b.name_dhivehi as branch_name_dhivehi, b.branch_type
      FROM participants p
      LEFT JOIN grades g ON p.grade_id = g.id
      LEFT JOIN branches b ON p.branch_id = b.id
      WHERE p.id = ?
    `).get(row.participant_id) as any;
  }

  let selectedQuestion = null;
  if (row.active_question_id) {
    selectedQuestion = db.prepare(`
      SELECT q.*, g.name_dhivehi as grade_name_dhivehi, b.name_dhivehi as branch_name_dhivehi, b.branch_type
      FROM questions q
      LEFT JOIN grades g ON q.grade_id = g.id
      LEFT JOIN branches b ON q.branch_id = b.id
      WHERE q.id = ?
    `).get(row.active_question_id) as any;
  }

  // Calculate question pool numbers
  let availableQuestionNumbers: string[] = [];
  let usedQuestionNumbers: string[] = [];
  if (participant) {
    const questions = db.prepare(`
      SELECT question_number, used
      FROM questions
      WHERE competition_id = ? AND grade_id = ? AND branch_id = ? AND status = 'active'
      ORDER BY question_number ASC
    `).all(row.competition_id, participant.grade_id, participant.branch_id) as any[];

    availableQuestionNumbers = questions.filter(q => !q.used).map(q => q.question_number);
    usedQuestionNumbers = questions.filter(q => q.used).map(q => q.question_number);
  }

  // Recent bell event
  const recentBell = db.prepare(`
    SELECT b.*, j.name as judge_name
    FROM bell_events b
    LEFT JOIN judges j ON b.judge_id = j.id
    ORDER BY b.triggered_at DESC LIMIT 1
  `).get() as any;

  // Recent competition details
  let comp = db.prepare('SELECT * FROM competitions WHERE id = ?').get(row.competition_id) as any;
  if (!comp) {
    comp = db.prepare('SELECT * FROM competitions LIMIT 1').get() as any;
  }
  const formattedComp = comp ? {
    ...comp,
    audience_quran_visibility: Boolean(comp.audience_quran_visibility),
    tilawa_podium_quran_visibility: Boolean(comp.tilawa_podium_quran_visibility),
    hifz_podium_answer_visibility: Boolean(comp.hifz_podium_answer_visibility),
    audience_background_url: comp.audience_background_url || '',
    audience_background_overlay: comp.audience_background_overlay !== null && comp.audience_background_overlay !== undefined ? Number(comp.audience_background_overlay) : 65,
    finished_screen_duration_seconds: comp.finished_screen_duration ?? 3
  } : null;

  return {
    ...row,
    question_selection_enabled: Boolean(row.question_selection_enabled),
    current_participant: participant,
    selected_question: selectedQuestion,
    available_question_numbers: availableQuestionNumbers,
    used_question_numbers: usedQuestionNumbers,
    recent_bell: recentBell,
    competition: formattedComp
  };
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// 1. Auth & Current User
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = db.prepare("SELECT * FROM users WHERE username = ? AND password = ? AND status = 'active'").get(username, password) as any;
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials or inactive account' });
  }

  let judge = null;
  if (user.role === 'JUDGE') {
    judge = db.prepare('SELECT * FROM judges WHERE user_id = ?').get(user.id) as any;
  }

  logAudit(user.id, user.role, 'LOGIN', 'AUTH', 'user', user.id, '', '', 'User logged into application');

  res.json({
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      name_dhivehi: user.name_dhivehi,
      role: user.role,
      judge_id: judge ? judge.id : undefined,
      judge_code: judge ? judge.judge_code : undefined,
      can_trigger_stage_bells: judge ? Boolean(judge.can_trigger_stage_bells) : (user.role === 'ADMIN')
    }
  });
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true });
});

// 2. Competition Settings
app.get('/api/competition', (req, res) => {
  const comp = db.prepare('SELECT * FROM competitions LIMIT 1').get() as any;
  if (!comp) {
    return res.status(404).json({ error: 'Competition not found' });
  }
  res.json({
    ...comp,
    audience_quran_visibility: Boolean(comp.audience_quran_visibility),
    tilawa_podium_quran_visibility: Boolean(comp.tilawa_podium_quran_visibility),
    hifz_podium_answer_visibility: Boolean(comp.hifz_podium_answer_visibility),
    audience_background_url: comp.audience_background_url || '',
    audience_background_overlay: comp.audience_background_overlay !== null && comp.audience_background_overlay !== undefined ? Number(comp.audience_background_overlay) : 65,
    finished_screen_duration_seconds: comp.finished_screen_duration ?? 3
  });
});

app.put('/api/competition', (req, res) => {
  const b = req.body;
  const current = db.prepare('SELECT * FROM competitions LIMIT 1').get() as any;
  const id = b.id || (current ? current.id : 'comp-1');

  const finishedDuration = Number(
    b.finished_screen_duration_seconds !== undefined
      ? b.finished_screen_duration_seconds
      : (b.finished_screen_duration !== undefined ? b.finished_screen_duration : 3)
  );

  const audienceBgUrl = b.audience_background_url !== undefined ? b.audience_background_url : (current?.audience_background_url || '');
  const audienceBgOverlay = b.audience_background_overlay !== undefined ? Number(b.audience_background_overlay) : (current?.audience_background_overlay ?? 65);

  transaction(() => {
    db.prepare(`
      UPDATE competitions
      SET name = ?, name_dhivehi = ?, organization_name = ?, organization_logo_url = ?,
          competition_logo_url = ?, venue = ?, competition_year = ?, start_date = ?,
          end_date = ?, description = ?, contact_details = ?,
          audience_quran_visibility = ?, tilawa_podium_quran_visibility = ?,
          hifz_podium_answer_visibility = ?, finished_screen_duration = ?,
          finished_performance_text = ?, audience_background_url = ?,
          audience_background_overlay = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      b.name !== undefined ? b.name : (current?.name || ''),
      b.name_dhivehi !== undefined ? b.name_dhivehi : (current?.name_dhivehi || ''),
      b.organization_name !== undefined ? b.organization_name : (current?.organization_name || ''),
      b.organization_logo_url !== undefined ? b.organization_logo_url : (current?.organization_logo_url || ''),
      b.competition_logo_url !== undefined ? b.competition_logo_url : (current?.competition_logo_url || ''),
      b.venue !== undefined ? b.venue : (current?.venue || ''),
      b.competition_year !== undefined ? b.competition_year : (current?.competition_year || ''),
      b.start_date !== undefined ? b.start_date : (current?.start_date || ''),
      b.end_date !== undefined ? b.end_date : (current?.end_date || ''),
      b.description !== undefined ? b.description : (current?.description || ''),
      b.contact_details !== undefined ? b.contact_details : (current?.contact_details || ''),
      b.audience_quran_visibility ? 1 : 0,
      b.tilawa_podium_quran_visibility ? 1 : 0,
      b.hifz_podium_answer_visibility ? 1 : 0,
      finishedDuration,
      b.finished_performance_text || current?.finished_performance_text || 'ނިމުނީ / Performance Finished',
      audienceBgUrl,
      audienceBgOverlay,
      id
    );
  });

  logAudit(b.user_id || 'admin', 'ADMIN', 'UPDATE_SETTINGS', 'COMPETITION', 'competitions', id, '', JSON.stringify(b));
  broadcastEvent('STAGE_STATE_UPDATED', getHydratedStageState());
  const updatedComp = db.prepare('SELECT * FROM competitions WHERE id = ?').get(id) as any;
  res.json({
    success: true,
    competition: updatedComp ? {
      ...updatedComp,
      audience_quran_visibility: Boolean(updatedComp.audience_quran_visibility),
      tilawa_podium_quran_visibility: Boolean(updatedComp.tilawa_podium_quran_visibility),
      hifz_podium_answer_visibility: Boolean(updatedComp.hifz_podium_answer_visibility),
      audience_background_url: updatedComp.audience_background_url || '',
      audience_background_overlay: updatedComp.audience_background_overlay !== null && updatedComp.audience_background_overlay !== undefined ? Number(updatedComp.audience_background_overlay) : 65,
      finished_screen_duration_seconds: updatedComp.finished_screen_duration ?? 3
    } : null
  });
});

app.post('/api/competition/upload-background', (req, res) => {
  try {
    const { imageBase64, overlay, clear } = req.body;
    const compRow = db.prepare('SELECT id, audience_background_url, audience_background_overlay FROM competitions LIMIT 1').get() as any;
    const targetCompId = compRow ? compRow.id : 'comp-1';

    let bgUrl = compRow?.audience_background_url || '';
    if (clear) {
      bgUrl = '';
    } else if (imageBase64) {
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const publicPath = path.join(process.cwd(), 'public');
      const filename = `audience-bg-${Date.now()}.png`;
      fs.writeFileSync(path.join(publicPath, filename), buffer);
      bgUrl = `/${filename}`;
    }

    const overlayVal = overlay !== undefined ? Math.min(100, Math.max(0, Number(overlay))) : (compRow?.audience_background_overlay ?? 65);

    db.prepare(`
      UPDATE competitions
      SET audience_background_url = ?, audience_background_overlay = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(bgUrl, overlayVal, targetCompId);

    logAudit('admin', 'ADMIN', 'UPDATE_AUDIENCE_BACKGROUND', 'COMPETITION', 'competitions', targetCompId, '', `Updated audience background. Overlay: ${overlayVal}%`);
    broadcastEvent('STAGE_STATE_UPDATED', getHydratedStageState());
    res.json({
      success: true,
      audience_background_url: bgUrl,
      audience_background_overlay: overlayVal
    });
  } catch (err: any) {
    console.error('Error uploading audience background:', err);
    res.status(500).json({ error: err.message || 'Failed to update audience background' });
  }
});

app.get('/api/competitions', (req, res) => {
  const comps = db.prepare('SELECT * FROM competitions').all();
  res.json(comps);
});

app.put('/api/competitions/:id', (req, res) => {
  const { id } = req.params;
  const b = req.body;
  const finishedDuration = Number(
    b.finished_screen_duration_seconds !== undefined
      ? b.finished_screen_duration_seconds
      : (b.finished_screen_duration !== undefined ? b.finished_screen_duration : 3)
  );

  transaction(() => {
    db.prepare(`
      UPDATE competitions
      SET name = ?, name_dhivehi = ?, organization_name = ?, organization_logo_url = ?,
          competition_logo_url = ?, venue = ?, competition_year = ?, start_date = ?,
          end_date = ?, description = ?, contact_details = ?,
          audience_quran_visibility = ?, tilawa_podium_quran_visibility = ?,
          hifz_podium_answer_visibility = ?, finished_screen_duration = ?,
          finished_performance_text = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      b.name, b.name_dhivehi, b.organization_name, b.organization_logo_url || '',
      b.competition_logo_url || '', b.venue || '', b.competition_year || '', b.start_date || '',
      b.end_date || '', b.description || '', b.contact_details || '',
      b.audience_quran_visibility ? 1 : 0, b.tilawa_podium_quran_visibility ? 1 : 0,
      b.hifz_podium_answer_visibility ? 1 : 0, finishedDuration,
      b.finished_performance_text || 'ނިމުނީ / Performance Finished', id
    );
  });
  logAudit(b.user_id || 'admin', 'ADMIN', 'UPDATE_SETTINGS', 'COMPETITION', 'competitions', id, '', JSON.stringify(b));
  broadcastEvent('STAGE_STATE_UPDATED', getHydratedStageState());
  res.json({ success: true });
});

app.post('/api/competition/upload-logo', (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'Missing imageBase64 data' });
    }
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const publicPath = path.join(process.cwd(), 'public');
    fs.writeFileSync(path.join(publicPath, 'app-logo.png'), buffer);
    fs.writeFileSync(path.join(publicPath, 'pwa-512x512.png'), buffer);
    fs.writeFileSync(path.join(publicPath, 'apple-touch-icon.png'), buffer);

    const compRow = db.prepare('SELECT id FROM competitions LIMIT 1').get() as any;
    const targetCompId = compRow ? compRow.id : 'comp-1';

    db.prepare(`
      UPDATE competitions
      SET competition_logo_url = '/app-logo.png', organization_logo_url = '/app-logo.png', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(targetCompId);

    logAudit('admin', 'ADMIN', 'UPLOAD_LOGO', 'COMPETITION', 'competitions', targetCompId, '', 'Updated app and competition logo');
    broadcastEvent('STAGE_STATE_UPDATED', getHydratedStageState());
    res.json({ success: true, logo_url: '/app-logo.png' });
  } catch (err: any) {
    console.error('Error uploading logo:', err);
    res.status(500).json({ error: err.message || 'Failed to process logo image' });
  }
});

// 3. Grades, Branches, Categories
app.get('/api/grades', (req, res) => {
  const grades = db.prepare('SELECT * FROM grades ORDER BY display_order ASC').all();
  res.json(grades);
});

app.get('/api/branches', (req, res) => {
  const branches = db.prepare('SELECT * FROM branches ORDER BY display_order ASC').all();
  res.json(branches);
});

app.get('/api/categories', (req, res) => {
  const categories = db.prepare(`
    SELECT c.*, g.name_dhivehi as grade_name_dhivehi, b.name_dhivehi as branch_name_dhivehi
    FROM categories c
    JOIN grades g ON c.grade_id = g.id
    JOIN branches b ON c.branch_id = b.id
    WHERE c.status = 'active'
  `).all();
  res.json(categories);
});

// 4. Participants CRUD
app.get('/api/participants', (req, res) => {
  const { grade_id, branch_id, status, search } = req.query as any;
  let sql = `
    SELECT p.*, g.name_dhivehi as grade_name_dhivehi, g.name as grade_name,
           b.name_dhivehi as branch_name_dhivehi, b.branch_type
    FROM participants p
    LEFT JOIN grades g ON p.grade_id = g.id
    LEFT JOIN branches b ON p.branch_id = b.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (grade_id) {
    sql += ' AND p.grade_id = ?';
    params.push(grade_id);
  }
  if (branch_id) {
    sql += ' AND p.branch_id = ?';
    params.push(branch_id);
  }
  if (status) {
    sql += ' AND p.status = ?';
    params.push(status);
  }
  if (search) {
    sql += ' AND (p.name LIKE ? OR p.name_dhivehi LIKE ? OR p.participant_number LIKE ? OR p.institution LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }
  sql += ' ORDER BY p.queue_order ASC, p.participant_number ASC';

  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// Helper to resolve grade and branch flexibly from IDs, codes, or names
function resolveGradeAndBranch(gradeInput?: string, branchInput?: string) {
  let gradeId = 'grade-5';
  let branchId = 'branch-1';

  if (gradeInput) {
    const trimmed = String(gradeInput).trim().toLowerCase();
    const byId = db.prepare('SELECT id FROM grades WHERE LOWER(id) = ?').get(trimmed) as any;
    if (byId) {
      gradeId = byId.id;
    } else {
      const byCodeOrName = db.prepare(`
        SELECT id FROM grades 
        WHERE LOWER(code) = ? OR LOWER(name) = ? OR name_dhivehi = ?
        LIMIT 1
      `).get(trimmed, trimmed, String(gradeInput).trim()) as any;
      if (byCodeOrName) {
        gradeId = byCodeOrName.id;
      } else {
        const byLike = db.prepare(`
          SELECT id FROM grades 
          WHERE LOWER(name) LIKE ? OR LOWER(code) LIKE ?
          LIMIT 1
        `).get(`%${trimmed}%`, `%${trimmed}%`) as any;
        if (byLike) gradeId = byLike.id;
      }
    }
  }

  if (branchInput) {
    const trimmed = String(branchInput).trim().toLowerCase();
    const byId = db.prepare('SELECT id FROM branches WHERE LOWER(id) = ?').get(trimmed) as any;
    if (byId) {
      branchId = byId.id;
    } else {
      const byCodeOrName = db.prepare(`
        SELECT id FROM branches
        WHERE LOWER(code) = ? OR LOWER(name_dhivehi) = ? OR LOWER(branch_type) = ?
        LIMIT 1
      `).get(trimmed, trimmed, trimmed) as any;
      if (byCodeOrName) {
        branchId = byCodeOrName.id;
      } else if (trimmed.includes('tilawa') || trimmed.includes('ބަލައިގެން') || trimmed === 'reading') {
        branchId = 'branch-1';
      } else if (trimmed.includes('hifz') || trimmed.includes('ނުބަލާ') || trimmed === 'memorization') {
        branchId = 'branch-3';
      }
    }
  }

  return { gradeId, branchId };
}

app.post('/api/participants', (req, res) => {
  let {
    participant_number, name, name_dhivehi, photo_url, gender, dob, age,
    institution, island, atoll, contact, grade_id, branch_id, category_id, notes, queue_order, status
  } = req.body;

  if (!participant_number || !name) {
    return res.status(400).json({ error: 'Participant Number and Name are required.' });
  }

  const resolved = resolveGradeAndBranch(grade_id || req.body.grade_name, branch_id || req.body.branch_name || req.body.branch_type);
  grade_id = grade_id || resolved.gradeId;
  branch_id = branch_id || resolved.branchId;

  const comp = db.prepare('SELECT id FROM competitions LIMIT 1').get() as any;
  const compId = comp ? comp.id : 'comp-1';

  // Prevent duplicate participant number inside same competition
  const existing = db.prepare('SELECT id FROM participants WHERE competition_id = ? AND participant_number = ?').get(compId, participant_number);
  if (existing) {
    return res.status(409).json({ error: `Participant Number #${participant_number} already exists in this competition.` });
  }

  const id = 'part-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);

  transaction(() => {
    db.prepare(`
      INSERT INTO participants (
        id, competition_id, participant_number, name, name_dhivehi, photo_url, gender,
        dob, age, institution, island, atoll, contact, grade_id, branch_id, category_id,
        queue_order, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, compId, participant_number, name, name_dhivehi || name, photo_url || '',
      gender || 'male', dob || '', Number(age) || 0, institution || '', island || '',
      atoll || '', contact || '', grade_id, branch_id, category_id || '',
      Number(queue_order) || 100, status || 'Waiting', notes || ''
    );
  });

  logAudit(req.body.user_id || 'admin', 'ADMIN', 'CREATE_PARTICIPANT', 'PARTICIPANTS', 'participant', id, '', JSON.stringify({ participant_number, name }));
  res.status(201).json({ id, success: true });
});

app.put('/api/participants/:id', (req, res) => {
  const { id } = req.params;
  let {
    participant_number, name, name_dhivehi, photo_url, gender, dob, age,
    institution, island, atoll, contact, grade_id, branch_id, category_id, notes, queue_order, status
  } = req.body;

  const current = db.prepare('SELECT * FROM participants WHERE id = ?').get(id) as any;
  if (!current) {
    return res.status(404).json({ error: 'Participant not found.' });
  }

  // Check duplicate participant number if modified
  if (participant_number && participant_number !== current.participant_number) {
    const dup = db.prepare('SELECT id FROM participants WHERE competition_id = ? AND participant_number = ? AND id != ?').get(current.competition_id, participant_number, id);
    if (dup) {
      return res.status(409).json({ error: `Participant Number #${participant_number} is already in use.` });
    }
  }

  const resolved = resolveGradeAndBranch(grade_id || req.body.grade_name || current.grade_id, branch_id || req.body.branch_name || req.body.branch_type || current.branch_id);
  grade_id = grade_id || resolved.gradeId;
  branch_id = branch_id || resolved.branchId;

  transaction(() => {
    db.prepare(`
      UPDATE participants
      SET participant_number = ?, name = ?, name_dhivehi = ?, photo_url = ?,
          gender = ?, dob = ?, age = ?, institution = ?, island = ?, atoll = ?,
          contact = ?, grade_id = ?, branch_id = ?, category_id = ?, queue_order = ?,
          status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      participant_number || current.participant_number,
      name || current.name,
      name_dhivehi || current.name_dhivehi,
      photo_url !== undefined ? photo_url : current.photo_url,
      gender || current.gender,
      dob !== undefined ? dob : current.dob,
      age !== undefined ? Number(age) : current.age,
      institution !== undefined ? institution : current.institution,
      island !== undefined ? island : current.island,
      atoll !== undefined ? atoll : current.atoll,
      contact !== undefined ? contact : current.contact,
      grade_id,
      branch_id,
      category_id !== undefined ? category_id : current.category_id,
      queue_order !== undefined ? Number(queue_order) : current.queue_order,
      status || current.status,
      notes !== undefined ? notes : current.notes,
      id
    );
  });

  logAudit(req.body.user_id || 'admin', 'ADMIN', 'UPDATE_PARTICIPANT', 'PARTICIPANTS', 'participant', id, JSON.stringify(current), JSON.stringify(req.body));
  broadcastEvent('STAGE_STATE_UPDATED', getHydratedStageState());
  res.json({ success: true });
});

// Bulk Import Participants (CSV / JSON)
app.post('/api/participants/bulk', (req, res) => {
  const { participants: rows, user_id } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'Participants array is required and must not be empty.' });
  }

  const comp = db.prepare('SELECT id FROM competitions LIMIT 1').get() as any;
  const compId = comp ? comp.id : 'comp-1';

  let insertedCount = 0;
  let updatedCount = 0;
  const errors: string[] = [];

  transaction(() => {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const participant_number = String(r.participant_number || r.number || r.no || '').trim();
      const name = String(r.name || r.full_name || '').trim();
      const name_dhivehi = String(r.name_dhivehi || r.dhivehi_name || name).trim();

      if (!participant_number || !name) {
        errors.push(`Row ${i + 1}: Missing participant number or name.`);
        continue;
      }

      const { gradeId, branchId } = resolveGradeAndBranch(
        r.grade_id || r.grade || r.grade_name,
        r.branch_id || r.branch || r.branch_name || r.branch_type
      );

      const existing = db.prepare('SELECT id FROM participants WHERE competition_id = ? AND participant_number = ?').get(compId, participant_number) as any;

      if (existing) {
        db.prepare(`
          UPDATE participants
          SET name = ?, name_dhivehi = ?, photo_url = ?, gender = ?, dob = ?,
              age = ?, institution = ?, island = ?, atoll = ?, contact = ?,
              grade_id = ?, branch_id = ?, status = COALESCE(?, status), notes = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          name, name_dhivehi, r.photo_url || '', r.gender || 'male', r.dob || '',
          Number(r.age) || 0, r.institution || '', r.island || '', r.atoll || '',
          r.contact || '', gradeId, branchId, r.status || null, r.notes || '', existing.id
        );
        updatedCount++;
      } else {
        const id = 'part-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
        db.prepare(`
          INSERT INTO participants (
            id, competition_id, participant_number, name, name_dhivehi, photo_url, gender,
            dob, age, institution, island, atoll, contact, grade_id, branch_id, category_id,
            queue_order, status, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, compId, participant_number, name, name_dhivehi, r.photo_url || '',
          r.gender || 'male', r.dob || '', Number(r.age) || 0, r.institution || '',
          r.island || '', r.atoll || '', r.contact || '', gradeId, branchId,
          r.category_id || '', Number(r.queue_order) || (100 + i), r.status || 'Waiting', r.notes || ''
        );
        insertedCount++;
      }
    }
  });

  logAudit(user_id || 'admin', 'ADMIN', 'BULK_IMPORT_PARTICIPANTS', 'PARTICIPANTS', 'participant', '', '', JSON.stringify({ inserted: insertedCount, updated: updatedCount, errorsCount: errors.length }));
  broadcastEvent('STAGE_STATE_UPDATED', getHydratedStageState());

  res.json({
    success: true,
    inserted: insertedCount,
    updated: updatedCount,
    total: insertedCount + updatedCount,
    errors
  });
});

// Section 11: Participant Delete with safe stage stop
app.delete('/api/participants/:id', (req, res) => {
  const { id } = req.params;
  const participant = db.prepare('SELECT * FROM participants WHERE id = ?').get(id) as any;
  if (!participant) {
    return res.status(404).json({ error: 'Participant not found.' });
  }

  const stage = db.prepare('SELECT * FROM stage_state LIMIT 1').get() as any;
  const isOnStage = stage && stage.participant_id === id;

  transaction(() => {
    if (isOnStage) {
      // Safely stop stage state and return display to HOLDING without corrupting history
      db.prepare(`
        UPDATE stage_state
        SET participant_id = NULL, performance_session_id = NULL, active_question_id = NULL,
            stage_status = 'HOLDING', display_state = 'HOLDING', question_selection_enabled = 0,
            timer_started_at = NULL, timer_paused_at = NULL, timer_offset = 0, updated_at = CURRENT_TIMESTAMP
      `).run();
    }
    db.prepare('DELETE FROM participants WHERE id = ?').run(id);
  });

  logAudit(
    req.body.user_id || 'admin', 'ADMIN', 'DELETE_PARTICIPANT', 'PARTICIPANTS',
    'participant', id, JSON.stringify(participant), '',
    isOnStage ? 'Deleted while on stage; stage state safely reset to HOLDING' : 'Standard delete'
  );

  broadcastEvent('STAGE_STATE_UPDATED', getHydratedStageState());
  res.json({ success: true, wasOnStage: isOnStage });
});

// 5. Questions CRUD
app.get('/api/questions', (req, res) => {
  const { grade_id, branch_id, used, search } = req.query as any;
  let sql = `
    SELECT q.*, g.name_dhivehi as grade_name_dhivehi, b.name_dhivehi as branch_name_dhivehi, b.branch_type
    FROM questions q
    LEFT JOIN grades g ON q.grade_id = g.id
    LEFT JOIN branches b ON q.branch_id = b.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (grade_id) {
    sql += ' AND q.grade_id = ?';
    params.push(grade_id);
  }
  if (branch_id) {
    sql += ' AND q.branch_id = ?';
    params.push(branch_id);
  }
  if (used !== undefined) {
    sql += ' AND q.used = ?';
    params.push(used === 'true' || used === '1' ? 1 : 0);
  }
  if (search) {
    sql += ' AND (q.question_number LIKE ? OR q.surah_name LIKE ? OR q.surah_name_arabic LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term);
  }
  sql += ' ORDER BY q.question_number ASC';

  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// Auto-manage question number calculation according to grade & branch
app.get('/api/questions/next-number', (req, res) => {
  const { grade_id, branch_id } = req.query as any;
  if (!grade_id || !branch_id) {
    return res.status(400).json({ error: 'grade_id and branch_id are required' });
  }

  const comp = db.prepare('SELECT id FROM competitions LIMIT 1').get() as any;
  const compId = comp ? comp.id : 'comp-1';

  const rows = db.prepare(`
    SELECT question_number FROM questions
    WHERE competition_id = ? AND grade_id = ? AND branch_id = ?
  `).all(compId, grade_id, branch_id) as any[];

  let maxNum = 0;
  for (const r of rows) {
    const n = parseInt(r.question_number, 10);
    if (!isNaN(n) && n > maxNum) {
      maxNum = n;
    }
  }

  const nextNumber = String(maxNum + 1).padStart(2, '0');
  res.json({
    next_number: nextNumber,
    count: rows.length,
    existing_numbers: rows.map(r => r.question_number)
  });
});

app.post('/api/questions', async (req, res) => {
  let {
    question_number, grade_id, branch_id, category_id, surah_number,
    start_ayah, end_ayah, start_page, end_page, juz, difficulty, notes, quran_text_arabic
  } = req.body;

  if (!grade_id || !branch_id || !surah_number) {
    return res.status(400).json({ error: 'Grade, Branch, and Surah Number are required.' });
  }

  const comp = db.prepare('SELECT id FROM competitions LIMIT 1').get() as any;
  const compId = comp ? comp.id : 'comp-1';

  // Auto manage question number according to grade and branch if empty or requested
  if (!question_number || question_number === 'auto') {
    const existingForCategory = db.prepare(`
      SELECT question_number FROM questions
      WHERE competition_id = ? AND grade_id = ? AND branch_id = ?
    `).all(compId, grade_id, branch_id) as any[];

    let maxNum = 0;
    for (const q of existingForCategory) {
      const n = parseInt(q.question_number, 10);
      if (!isNaN(n) && n > maxNum) {
        maxNum = n;
      }
    }
    question_number = String(maxNum + 1).padStart(2, '0');
  } else {
    // Pad integer string to 2 digits (e.g. "1" -> "01")
    const parsed = parseInt(String(question_number).trim(), 10);
    if (!isNaN(parsed) && String(parsed) === String(question_number).trim()) {
      question_number = String(parsed).padStart(2, '0');
    }
  }

  // Section 31: Duplicate protection
  const existing = db.prepare(`
    SELECT id FROM questions
    WHERE competition_id = ? AND grade_id = ? AND branch_id = ? AND question_number = ?
  `).get(compId, grade_id, branch_id, question_number);
  if (existing) {
    return res.status(409).json({ error: `Question Number #${question_number} already exists for this Grade and Branch.` });
  }

  const surahMeta = SURAHS_LIST.find(s => s.number === Number(surah_number));
  const sName = surahMeta ? surahMeta.name_english : `Surah ${surah_number}`;
  const sNameAr = surahMeta ? surahMeta.name_arabic : `سورة ${surah_number}`;

  const endSurahNum = Number(req.body.end_surah_number) || Number(surah_number);
  const endSurahMeta = SURAHS_LIST.find(s => s.number === endSurahNum) || surahMeta;
  const endSName = endSurahMeta ? endSurahMeta.name_english : sName;
  const endSNameAr = endSurahMeta ? endSurahMeta.name_arabic : sNameAr;

  let arabicText = quran_text_arabic;
  if (!arabicText) {
    if (endSurahNum > Number(surah_number)) {
      arabicText = await fetchQuranPassage(Number(surah_number), Number(start_ayah) || 1, surahMeta?.ayah_count || 10);
    } else {
      arabicText = await fetchQuranPassage(Number(surah_number), Number(start_ayah) || 1, Number(end_ayah) || 7);
    }
  }

  const id = 'q-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);

  transaction(() => {
    db.prepare(`
      INSERT INTO questions (
        id, competition_id, grade_id, branch_id, category_id, question_number,
        surah_number, surah_name, surah_name_arabic, start_ayah, end_ayah,
        end_surah_number, end_surah_name, end_surah_name_arabic,
        start_page, end_page, juz, quran_text_preview, quran_text_arabic,
        difficulty, notes, status, used
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0)
    `).run(
      id, compId, grade_id, branch_id, category_id || '', question_number,
      Number(surah_number), sName, sNameAr, Number(start_ayah) || 1, Number(end_ayah) || 7,
      endSurahNum, endSName, endSNameAr,
      Number(start_page) || (surahMeta?.page_start || 1), Number(end_page) || (endSurahMeta?.page_start || 1),
      Number(juz) || (surahMeta?.juz_start || 1), (arabicText || '').slice(0, 100) + '...',
      arabicText || '', difficulty || 'Medium', notes || ''
    );
  });

  logAudit(req.body.user_id || 'admin', 'ADMIN', 'CREATE_QUESTION', 'QUESTIONS', 'question', id, '', JSON.stringify({ question_number, surah: sName }));
  res.status(201).json({ id, success: true });
});

app.put('/api/questions/:id', (req, res) => {
  const { id } = req.params;
  const q = req.body;

  const current = db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as any;
  if (!current) {
    return res.status(404).json({ error: 'Question not found.' });
  }

  const targetGradeId = q.grade_id || current.grade_id;
  const targetBranchId = q.branch_id || current.branch_id;
  let targetNumber = q.question_number || current.question_number;
  const parsed = parseInt(String(targetNumber).trim(), 10);
  if (!isNaN(parsed) && String(parsed) === String(targetNumber).trim()) {
    targetNumber = String(parsed).padStart(2, '0');
  }

  // Check duplicate if number, grade, or branch changed
  const dup = db.prepare(`
    SELECT id FROM questions
    WHERE competition_id = ? AND grade_id = ? AND branch_id = ? AND question_number = ? AND id != ?
  `).get(current.competition_id, targetGradeId, targetBranchId, targetNumber, id);
  if (dup) {
    return res.status(409).json({ error: `Question Number #${targetNumber} is already used in this Grade & Branch.` });
  }

  const surahMeta = SURAHS_LIST.find(s => s.number === Number(q.surah_number));
  const sName = surahMeta ? surahMeta.name_english : current.surah_name;
  const sNameAr = surahMeta ? surahMeta.name_arabic : current.surah_name_arabic;

  const endSurahNum = q.end_surah_number !== undefined ? Number(q.end_surah_number) : (current.end_surah_number || current.surah_number);
  const endSurahMeta = SURAHS_LIST.find(s => s.number === endSurahNum) || surahMeta;
  const endSName = endSurahMeta ? endSurahMeta.name_english : sName;
  const endSNameAr = endSurahMeta ? endSurahMeta.name_arabic : sNameAr;

  transaction(() => {
    db.prepare(`
      UPDATE questions
      SET question_number = ?, grade_id = ?, branch_id = ?, category_id = ?,
          surah_number = ?, surah_name = ?, surah_name_arabic = ?, start_ayah = ?,
          end_ayah = ?, end_surah_number = ?, end_surah_name = ?, end_surah_name_arabic = ?,
          start_page = ?, end_page = ?, juz = ?, quran_text_arabic = ?,
          difficulty = ?, notes = ?, status = ?, used = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      targetNumber, targetGradeId, targetBranchId, q.category_id !== undefined ? q.category_id : current.category_id,
      Number(q.surah_number) || current.surah_number, sName, sNameAr,
      Number(q.start_ayah) || current.start_ayah, Number(q.end_ayah) || current.end_ayah,
      endSurahNum, endSName, endSNameAr,
      Number(q.start_page) || current.start_page, Number(q.end_page) || current.end_page,
      Number(q.juz) || current.juz, q.quran_text_arabic !== undefined ? q.quran_text_arabic : current.quran_text_arabic,
      q.difficulty || current.difficulty, q.notes !== undefined ? q.notes : current.notes,
      q.status || current.status, q.used !== undefined ? (q.used ? 1 : 0) : current.used, id
    );
  });

  logAudit(req.body.user_id || 'admin', 'ADMIN', 'UPDATE_QUESTION', 'QUESTIONS', 'question', id, JSON.stringify(current), JSON.stringify(q));
  broadcastEvent('STAGE_STATE_UPDATED', getHydratedStageState());
  res.json({ success: true });
});

app.delete('/api/questions/:id', (req, res) => {
  const { id } = req.params;
  const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as any;
  if (!question) {
    return res.status(404).json({ error: 'Question not found.' });
  }

  transaction(() => {
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  });

  logAudit(req.body.user_id || 'admin', 'ADMIN', 'DELETE_QUESTION', 'QUESTIONS', 'question', id, JSON.stringify(question), '');
  broadcastEvent('STAGE_STATE_UPDATED', getHydratedStageState());
  res.json({ success: true });
});

// Reset question pool used status (Section 30, 74)
app.post('/api/questions/reset', (req, res) => {
  const { grade_id, branch_id } = req.body;
  transaction(() => {
    if (grade_id && branch_id) {
      db.prepare('UPDATE questions SET used = 0 WHERE grade_id = ? AND branch_id = ?').run(grade_id, branch_id);
    } else {
      db.prepare('UPDATE questions SET used = 0').run();
    }
  });

  logAudit(req.body.user_id || 'admin', 'ADMIN', 'RESET_QUESTION_POOL', 'QUESTIONS', 'questions', '', '', '', 'Reset question pool used status');
  broadcastEvent('STAGE_STATE_UPDATED', getHydratedStageState());
  res.json({ success: true });
});

// Auto Generate Questions (Section 32)
app.post('/api/questions/generate', async (req, res) => {
  const { grade_id, branch_id, count, start_surah, end_surah, ayah_range_size, difficulty } = req.body;
  if (!grade_id || !branch_id) {
    return res.status(400).json({ error: 'Grade and Branch are required.' });
  }

  const comp = db.prepare('SELECT id FROM competitions LIMIT 1').get() as any;
  const compId = comp ? comp.id : 'comp-1';

  const sStart = Math.max(1, Number(start_surah) || 78);
  const sEnd = Math.min(114, Number(end_surah) || 114);
  const qCount = Math.max(1, Math.min(30, Number(count) || 5));
  const rangeSize = Math.max(3, Math.min(25, Number(ayah_range_size) || 10));

  // Find max question number currently
  const existing = db.prepare('SELECT question_number FROM questions WHERE grade_id = ? AND branch_id = ? ORDER BY question_number DESC').all(grade_id, branch_id) as any[];
  let maxNum = 0;
  for (const row of existing) {
    const n = parseInt(row.question_number, 10);
    if (!isNaN(n) && n > maxNum) maxNum = n;
  }

  const generatedIds: string[] = [];
  transaction(() => {
    for (let i = 0; i < qCount; i++) {
      maxNum++;
      const qNumStr = maxNum < 10 ? `0${maxNum}` : `${maxNum}`;
      // Random surah within range
      const surahNum = Math.floor(Math.random() * (sEnd - sStart + 1)) + sStart;
      const surahMeta = SURAHS_LIST.find(s => s.number === surahNum)!;
      const maxStartAyah = Math.max(1, surahMeta.ayah_count - rangeSize + 1);
      const startAyah = Math.floor(Math.random() * maxStartAyah) + 1;
      const endAyah = Math.min(surahMeta.ayah_count, startAyah + rangeSize - 1);

      const id = 'q-gen-' + Date.now() + '-' + i;
      const passageKey = `${surahNum}:${startAyah}-${endAyah}`;
      const arabicText = VERIFIED_PASSAGES[passageKey] || `سورة ${surahMeta.name_arabic} (الآيات ${startAyah} - ${endAyah})`;

      db.prepare(`
        INSERT INTO questions (
          id, competition_id, grade_id, branch_id, question_number,
          surah_number, surah_name, surah_name_arabic, start_ayah, end_ayah,
          start_page, end_page, juz, quran_text_preview, quran_text_arabic,
          difficulty, status, used
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0)
      `).run(
        id, compId, grade_id, branch_id, qNumStr,
        surahNum, surahMeta.name_english, surahMeta.name_arabic, startAyah, endAyah,
        surahMeta.page_start, surahMeta.page_start, surahMeta.juz_start,
        arabicText.slice(0, 80) + '...', arabicText, difficulty || 'Medium'
      );
      generatedIds.push(id);
    }
  });

  logAudit(req.body.user_id || 'admin', 'ADMIN', 'GENERATE_QUESTIONS', 'QUESTIONS', 'questions', '', '', `Generated ${qCount} questions`);
  broadcastEvent('STAGE_STATE_UPDATED', getHydratedStageState());
  res.json({ success: true, count: generatedIds.length });
});

// 6. MASTER STAGE CONTROL & STATE MACHINE (Sections 13-27, 34, 48-56)
// Enforced transition sequence:
// HOLDING -> CALLED -> QUESTION_SELECTION_ALLOWED -> QUESTION_SELECTED -> READY -> PERFORMING -> PERFORMANCE_FINISHED -> HOLDING
export const STAGE_TRANSITION_SEQUENCE = [
  'HOLDING',
  'CALLED',
  'QUESTION_SELECTION_ALLOWED',
  'QUESTION_SELECTED',
  'READY',
  'PERFORMING',
  'PERFORMANCE_FINISHED',
  'HOLDING'
] as const;

export const VALID_STAGE_TRANSITIONS: Record<string, string[]> = {
  'HOLDING': ['CALLED', 'RESET'],
  'CALLED': ['QUESTION_SELECTION_ALLOWED', 'QUESTION_SELECTED', 'HOLDING', 'RESET'],
  'QUESTION_SELECTION_ALLOWED': ['QUESTION_SELECTED', 'READY', 'CALLED', 'HOLDING', 'RESET'],
  'QUESTION_SELECTED': ['READY', 'PERFORMING', 'QUESTION_SELECTION_ALLOWED', 'HOLDING', 'RESET'],
  'READY': ['PERFORMING', 'QUESTION_SELECTED', 'HOLDING', 'RESET'],
  'PERFORMING': ['PERFORMANCE_FINISHED', 'HOLDING', 'RESET'],
  'PERFORMANCE_FINISHED': ['HOLDING', 'CALLED', 'RESET'],
  'RECALLED': ['CALLED', 'QUESTION_SELECTION_ALLOWED', 'HOLDING', 'RESET'],
  'RESET': ['HOLDING', 'CALLED']
};

export function canTransitionStage(currentStatus: string, targetStatus: string): boolean {
  if (!currentStatus) return true;
  if (currentStatus === targetStatus) return true;
  const allowed = VALID_STAGE_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(targetStatus) : false;
}

app.get('/api/stage/state', (req, res) => {
  const state = getHydratedStageState();
  res.json(state);
});

// Section 17 & 18: CALL ON STAGE (HOLDING -> CALLED)
app.post('/api/stage/call', (req, res) => {
  const { participant_id, operator_id } = req.body;
  if (!participant_id) {
    return res.status(400).json({ error: 'participant_id is required' });
  }

  const currentStage = db.prepare('SELECT * FROM stage_state LIMIT 1').get() as any;
  const currentStatus = currentStage?.stage_status || 'HOLDING';

  // Server-side State Machine transition validation:
  // Cannot call a new participant if currently PERFORMING
  if (currentStatus === 'PERFORMING') {
    return res.status(400).json({
      error: 'Cannot call participant while another performance is currently PERFORMING. Please finish or reset first.',
      current_status: currentStatus,
      target_status: 'CALLED'
    });
  }

  if (!canTransitionStage(currentStatus, 'CALLED')) {
    return res.status(400).json({
      error: `Invalid stage transition from ${currentStatus} to CALLED. Expected HOLDING or PERFORMANCE_FINISHED.`,
      current_status: currentStatus,
      target_status: 'CALLED'
    });
  }

  const participant = db.prepare('SELECT * FROM participants WHERE id = ?').get(participant_id) as any;
  if (!participant) {
    return res.status(404).json({ error: 'Participant not found' });
  }

  const comp = db.prepare('SELECT id FROM competitions LIMIT 1').get() as any;
  const compId = comp ? comp.id : 'comp-1';

  let sessionId = '';
  transaction(() => {
    // 1. Create a performance session for this stage call
    sessionId = 'sess-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    db.prepare(`
      INSERT INTO performance_sessions (
        id, competition_id, participant_id, session_number, is_recall, status, called_at, operator_id
      ) VALUES (?, ?, ?, 1, 0, 'active', CURRENT_TIMESTAMP, ?)
    `).run(sessionId, compId, participant_id, operator_id || 'operator');

    // 2. Set participant status to 'Called' / 'On Stage'
    db.prepare(`UPDATE participants SET status = 'Called', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(participant_id);

    // 3. Reset ONLY stage-specific temporary values (Do NOT delete previous participant's Judge drafts!)
    db.prepare(`
      UPDATE stage_state
      SET performance_session_id = ?, participant_id = ?, stage_status = 'CALLED',
          active_question_id = NULL, question_selection_enabled = 0,
          timer_started_at = NULL, timer_paused_at = NULL, timer_offset = 0,
          display_state = 'PARTICIPANT', updated_at = CURRENT_TIMESTAMP
    `).run(sessionId, participant_id);
  });

  logAudit(operator_id || 'operator', 'PRESENTATION_OPERATOR', 'CALL_ON_STAGE', 'STAGE', 'participant', participant_id, '', JSON.stringify({ participant_id, sessionId }));

  const state = getHydratedStageState();
  broadcastEvent('PARTICIPANT_CALLED', state);
  broadcastEvent('STAGE_STATE_UPDATED', state);
  res.json({ success: true, session_id: sessionId, state });
});

// Section 22: ALLOW QUESTION NUMBER SELECTION (CALLED -> QUESTION_SELECTION_ALLOWED)
app.post('/api/stage/allow-question-selection', (req, res) => {
  const stage = db.prepare('SELECT * FROM stage_state LIMIT 1').get() as any;
  if (!stage || !stage.participant_id) {
    return res.status(400).json({ error: 'No active participant on stage.' });
  }

  if (!canTransitionStage(stage.stage_status, 'QUESTION_SELECTION_ALLOWED')) {
    return res.status(400).json({
      error: `Invalid stage transition from ${stage.stage_status} to QUESTION_SELECTION_ALLOWED. Expected CALLED.`,
      current_status: stage.stage_status,
      target_status: 'QUESTION_SELECTION_ALLOWED'
    });
  }

  transaction(() => {
    db.prepare(`
      UPDATE stage_state
      SET stage_status = 'QUESTION_SELECTION_ALLOWED', question_selection_enabled = 1,
          display_state = 'GRID', updated_at = CURRENT_TIMESTAMP
    `).run();
  });

  logAudit(req.body.operator_id || 'operator', 'PRESENTATION_OPERATOR', 'ALLOW_QUESTION_SELECTION', 'STAGE', 'stage_state', stage.id);

  const state = getHydratedStageState();
  broadcastEvent('QUESTION_SELECTION_ENABLED', state);
  broadcastEvent('STAGE_STATE_UPDATED', state);
  res.json({ success: true, state });
});

// Section 24, 25, 26: PODIUM / OPERATOR QUESTION SELECTION (QUESTION_SELECTION_ALLOWED -> QUESTION_SELECTED)
app.post('/api/stage/question-select', (req, res) => {
  const { question_number, selection_method } = req.body;
  if (!question_number) {
    return res.status(400).json({ error: 'question_number is required' });
  }

  const stage = db.prepare('SELECT * FROM stage_state LIMIT 1').get() as any;
  if (!stage || !stage.participant_id || !stage.performance_session_id) {
    return res.status(400).json({ error: 'No active participant or performance session on stage.' });
  }

  if (!canTransitionStage(stage.stage_status, 'QUESTION_SELECTED')) {
    return res.status(400).json({
      error: `Invalid stage transition from ${stage.stage_status} to QUESTION_SELECTED. Expected QUESTION_SELECTION_ALLOWED.`,
      current_status: stage.stage_status,
      target_status: 'QUESTION_SELECTED'
    });
  }

  const participant = db.prepare('SELECT * FROM participants WHERE id = ?').get(stage.participant_id) as any;
  if (!participant) {
    return res.status(404).json({ error: 'Participant not found.' });
  }

  let selectedQ: any = null;

  try {
    transaction(() => {
      // Find question with exact grade & branch
      const q = db.prepare(`
        SELECT * FROM questions
        WHERE competition_id = ? AND grade_id = ? AND branch_id = ? AND question_number = ?
      `).get(stage.competition_id, participant.grade_id, participant.branch_id, question_number) as any;

      if (!q) {
        throw new Error(`Question #${question_number} not found in this category.`);
      }

      // Section 26: Stale device race protection
      if (q.used) {
        throw new Error('Question already used. Please choose another number.');
      }

      // Check if another session claimed this question
      const alreadyClaimed = db.prepare('SELECT id FROM question_usage WHERE question_id = ? AND reset_at IS NULL').get(q.id);
      if (alreadyClaimed) {
        throw new Error('Question already used. Please choose another number.');
      }

      // Store in question_usage
      const usageId = 'qu-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
      db.prepare(`
        INSERT INTO question_usage (
          id, question_id, performance_session_id, participant_id,
          selected_by, selection_method, selected_at
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        usageId, q.id, stage.performance_session_id, stage.participant_id,
        selection_method || 'PODIUM', selection_method || 'PODIUM'
      );

      // Mark question used
      db.prepare('UPDATE questions SET used = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(q.id);

      // Lock stage and update stage_state
      db.prepare(`
        UPDATE stage_state
        SET stage_status = 'QUESTION_SELECTED', active_question_id = ?,
            question_selection_enabled = 0, display_state = 'QUESTION', updated_at = CURRENT_TIMESTAMP
      `).run(q.id);

      // Update performance_session
      db.prepare(`
        UPDATE performance_sessions
        SET active_question_id = ?, question_selected_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(q.id, stage.performance_session_id);

      selectedQ = q;
    });
  } catch (err: any) {
    return res.status(409).json({ error: err.message || 'Error selecting question.' });
  }

  logAudit(
    req.body.operator_id || 'podium', 'PODIUM', 'QUESTION_SELECTED', 'STAGE',
    'question', selectedQ.id, '', JSON.stringify({ question_number, method: selection_method })
  );

  const state = getHydratedStageState();
  broadcastEvent('QUESTION_SELECTED', state);
  broadcastEvent('STAGE_STATE_UPDATED', state);
  res.json({ success: true, question: selectedQ, state });
});

// Section 33: MARK STAGE READY (QUESTION_SELECTED -> READY)
app.post('/api/stage/ready', (req, res) => {
  const stage = db.prepare('SELECT * FROM stage_state LIMIT 1').get() as any;
  if (!stage || !stage.participant_id) {
    return res.status(400).json({ error: 'No active participant on stage.' });
  }

  if (!canTransitionStage(stage.stage_status, 'READY')) {
    return res.status(400).json({
      error: `Invalid stage transition from ${stage.stage_status} to READY. Expected QUESTION_SELECTED.`,
      current_status: stage.stage_status,
      target_status: 'READY'
    });
  }

  transaction(() => {
    db.prepare(`
      UPDATE stage_state
      SET stage_status = 'READY', display_state = 'QUESTION', updated_at = CURRENT_TIMESTAMP
    `).run();
  });

  logAudit(req.body.operator_id || 'operator', 'PRESENTATION_OPERATOR', 'STAGE_READY', 'STAGE', 'stage_state', stage.id);

  const state = getHydratedStageState();
  broadcastEvent('STAGE_READY', state);
  broadcastEvent('STAGE_STATE_UPDATED', state);
  res.json({ success: true, state });
});

// Section 34: START PERFORMANCE (READY | QUESTION_SELECTED -> PERFORMING)
app.post('/api/stage/start', (req, res) => {
  const stage = db.prepare('SELECT * FROM stage_state LIMIT 1').get() as any;
  if (!stage || !stage.participant_id) {
    return res.status(400).json({ error: 'No active participant.' });
  }

  if (!canTransitionStage(stage.stage_status, 'PERFORMING')) {
    return res.status(400).json({
      error: `Invalid stage transition from ${stage.stage_status} to PERFORMING. Expected READY or QUESTION_SELECTED.`,
      current_status: stage.stage_status,
      target_status: 'PERFORMING'
    });
  }

  const now = new Date().toISOString();
  transaction(() => {
    db.prepare(`
      UPDATE stage_state
      SET stage_status = 'PERFORMING', timer_started_at = ?, timer_paused_at = NULL,
          display_state = 'PERFORMING', updated_at = CURRENT_TIMESTAMP
    `).run(now);

    if (stage.performance_session_id) {
      db.prepare(`
        UPDATE performance_sessions
        SET started_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(now, stage.performance_session_id);
    }

    db.prepare(`UPDATE participants SET status = 'Performing', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(stage.participant_id);
  });

  logAudit(req.body.operator_id || 'operator', 'PRESENTATION_OPERATOR', 'START_PERFORMANCE', 'STAGE', 'participant', stage.participant_id);

  const state = getHydratedStageState();
  broadcastEvent('PERFORMANCE_STARTED', state);
  broadcastEvent('STAGE_STATE_UPDATED', state);
  res.json({ success: true, state });
});

// Timer control
app.post('/api/stage/timer', (req, res) => {
  const { action, offset } = req.body; // 'pause' | 'resume' | 'reset'
  const stage = db.prepare('SELECT * FROM stage_state LIMIT 1').get() as any;
  if (!stage) return res.status(404).json({ error: 'Stage not found' });

  const now = new Date().toISOString();
  transaction(() => {
    if (action === 'pause') {
      db.prepare(`
        UPDATE stage_state
        SET timer_paused_at = ?, updated_at = CURRENT_TIMESTAMP
      `).run(now);
    } else if (action === 'resume') {
      db.prepare(`
        UPDATE stage_state
        SET timer_started_at = ?, timer_paused_at = NULL, timer_offset = ?, updated_at = CURRENT_TIMESTAMP
      `).run(now, Number(offset) || stage.timer_offset);
    } else if (action === 'reset') {
      db.prepare(`
        UPDATE stage_state
        SET timer_started_at = NULL, timer_paused_at = NULL, timer_offset = 0, updated_at = CURRENT_TIMESTAMP
      `).run();
    }
  });

  const state = getHydratedStageState();
  broadcastEvent('TIMER_UPDATED', state);
  res.json({ success: true, state });
});

// Section 48, 49, 50: FINISH PERFORMANCE (PERFORMING -> PERFORMANCE_FINISHED)
// CRITICAL: Stage and Scoring must be independent! Never block finish performance on pending judge marks!
app.post('/api/stage/finish', (req, res) => {
  const stage = db.prepare('SELECT * FROM stage_state LIMIT 1').get() as any;
  if (!stage || !stage.participant_id) {
    return res.status(400).json({ error: 'No active participant on stage.' });
  }

  if (!canTransitionStage(stage.stage_status, 'PERFORMANCE_FINISHED')) {
    return res.status(400).json({
      error: `Invalid stage transition from ${stage.stage_status} to PERFORMANCE_FINISHED. Expected PERFORMING.`,
      current_status: stage.stage_status,
      target_status: 'PERFORMANCE_FINISHED'
    });
  }

  const comp = db.prepare('SELECT finished_screen_duration FROM competitions WHERE id = ?').get(stage.competition_id) as any;
  const finishDuration = comp ? comp.finished_screen_duration : 3;

  transaction(() => {
    // 1. Stop timer and update performance session
    if (stage.performance_session_id) {
      db.prepare(`
        UPDATE performance_sessions
        SET finished_at = CURRENT_TIMESTAMP, status = 'completed', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(stage.performance_session_id);
    }

    // 2. Mark participant Completed / Finished
    db.prepare(`
      UPDATE participants
      SET status = 'Completed', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(stage.participant_id);

    // 3. Set stage state to PERFORMANCE_FINISHED with display_state = 'FINISHED'
    db.prepare(`
      UPDATE stage_state
      SET stage_status = 'PERFORMANCE_FINISHED', display_state = 'FINISHED',
          timer_paused_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    `).run();
  });

  logAudit(req.body.operator_id || 'operator', 'PRESENTATION_OPERATOR', 'FINISH_PERFORMANCE', 'STAGE', 'participant', stage.participant_id);

  const finishState = getHydratedStageState();
  broadcastEvent('PERFORMANCE_FINISHED', finishState);
  broadcastEvent('STAGE_STATE_UPDATED', finishState);

  // Section 51, 52: After finished duration (default 3s), Audience automatically switches to HOLDING
  setTimeout(() => {
    const current = db.prepare('SELECT stage_status FROM stage_state LIMIT 1').get() as any;
    if (current && current.stage_status === 'PERFORMANCE_FINISHED') {
      transaction(() => {
        db.prepare(`
          UPDATE stage_state
          SET stage_status = 'HOLDING', display_state = 'HOLDING',
              participant_id = NULL, performance_session_id = NULL, active_question_id = NULL,
              question_selection_enabled = 0, timer_started_at = NULL, timer_paused_at = NULL,
              timer_offset = 0, updated_at = CURRENT_TIMESTAMP
        `).run();
      });
      const holdingState = getHydratedStageState();
      broadcastEvent('HOLDING_SCREEN_STARTED', holdingState);
      broadcastEvent('STAGE_STATE_UPDATED', holdingState);
    }
  }, finishDuration * 1000);

  res.json({ success: true, state: finishState });
});

// Explicit HOLDING transition (PERFORMANCE_FINISHED -> HOLDING or Manual return)
app.post('/api/stage/holding', (req, res) => {
  const stage = db.prepare('SELECT * FROM stage_state LIMIT 1').get() as any;
  if (stage && !canTransitionStage(stage.stage_status, 'HOLDING')) {
    return res.status(400).json({
      error: `Invalid stage transition from ${stage.stage_status} to HOLDING.`,
      current_status: stage.stage_status,
      target_status: 'HOLDING'
    });
  }

  transaction(() => {
    db.prepare(`
      UPDATE stage_state
      SET stage_status = 'HOLDING', display_state = 'HOLDING',
          participant_id = NULL, performance_session_id = NULL, active_question_id = NULL,
          question_selection_enabled = 0, timer_started_at = NULL, timer_paused_at = NULL,
          timer_offset = 0, updated_at = CURRENT_TIMESTAMP
    `).run();
  });

  const state = getHydratedStageState();
  broadcastEvent('HOLDING_SCREEN_STARTED', state);
  broadcastEvent('STAGE_STATE_UPDATED', state);
  res.json({ success: true, state });
});

// Unified Stage State Machine Transition endpoint
app.post('/api/stage/transition', (req, res) => {
  const { target_status, operator_id, participant_id, question_number, selection_method } = req.body;
  if (!target_status) {
    return res.status(400).json({ error: 'target_status is required' });
  }

  const stage = db.prepare('SELECT * FROM stage_state LIMIT 1').get() as any;
  const currentStatus = stage?.stage_status || 'HOLDING';

  if (!canTransitionStage(currentStatus, target_status)) {
    return res.status(400).json({
      error: `Invalid stage transition from ${currentStatus} to ${target_status}. Allowed transitions for ${currentStatus}: ${(VALID_STAGE_TRANSITIONS[currentStatus] || []).join(', ')}`,
      current_status: currentStatus,
      target_status
    });
  }

  // Execute transition according to target_status
  switch (target_status) {
    case 'CALLED': {
      if (!participant_id) {
        return res.status(400).json({ error: 'participant_id is required when transitioning to CALLED' });
      }
      const p = db.prepare('SELECT * FROM participants WHERE id = ?').get(participant_id);
      if (!p) return res.status(404).json({ error: 'Participant not found' });
      
      const comp = db.prepare('SELECT id FROM competitions LIMIT 1').get() as any;
      const compId = comp ? comp.id : 'comp-1';
      const sessionId = 'sess-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);

      transaction(() => {
        db.prepare(`
          INSERT INTO performance_sessions (id, competition_id, participant_id, session_number, is_recall, status, called_at, operator_id)
          VALUES (?, ?, ?, 1, 0, 'active', CURRENT_TIMESTAMP, ?)
        `).run(sessionId, compId, participant_id, operator_id || 'operator');

        db.prepare(`UPDATE participants SET status = 'Called', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(participant_id);

        db.prepare(`
          UPDATE stage_state
          SET performance_session_id = ?, participant_id = ?, stage_status = 'CALLED',
              active_question_id = NULL, question_selection_enabled = 0,
              timer_started_at = NULL, timer_paused_at = NULL, timer_offset = 0,
              display_state = 'PARTICIPANT', updated_at = CURRENT_TIMESTAMP
        `).run(sessionId, participant_id);
      });

      const state = getHydratedStageState();
      broadcastEvent('PARTICIPANT_CALLED', state);
      broadcastEvent('STAGE_STATE_UPDATED', state);
      return res.json({ success: true, session_id: sessionId, state });
    }

    case 'QUESTION_SELECTION_ALLOWED': {
      transaction(() => {
        db.prepare(`
          UPDATE stage_state
          SET stage_status = 'QUESTION_SELECTION_ALLOWED', question_selection_enabled = 1,
              display_state = 'GRID', updated_at = CURRENT_TIMESTAMP
        `).run();
      });
      const state = getHydratedStageState();
      broadcastEvent('QUESTION_SELECTION_ENABLED', state);
      broadcastEvent('STAGE_STATE_UPDATED', state);
      return res.json({ success: true, state });
    }

    case 'READY': {
      transaction(() => {
        db.prepare(`
          UPDATE stage_state
          SET stage_status = 'READY', display_state = 'QUESTION', updated_at = CURRENT_TIMESTAMP
        `).run();
      });
      const state = getHydratedStageState();
      broadcastEvent('STAGE_READY', state);
      broadcastEvent('STAGE_STATE_UPDATED', state);
      return res.json({ success: true, state });
    }

    case 'PERFORMING': {
      const now = new Date().toISOString();
      transaction(() => {
        db.prepare(`
          UPDATE stage_state
          SET stage_status = 'PERFORMING', timer_started_at = ?, timer_paused_at = NULL,
              display_state = 'PERFORMING', updated_at = CURRENT_TIMESTAMP
        `).run(now);
        if (stage.performance_session_id) {
          db.prepare(`UPDATE performance_sessions SET started_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(now, stage.performance_session_id);
        }
        if (stage.participant_id) {
          db.prepare(`UPDATE participants SET status = 'Performing', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(stage.participant_id);
        }
      });
      const state = getHydratedStageState();
      broadcastEvent('PERFORMANCE_STARTED', state);
      broadcastEvent('STAGE_STATE_UPDATED', state);
      return res.json({ success: true, state });
    }

    case 'PERFORMANCE_FINISHED': {
      const comp = db.prepare('SELECT finished_screen_duration FROM competitions WHERE id = ?').get(stage.competition_id) as any;
      const finishDuration = comp ? comp.finished_screen_duration : 3;

      transaction(() => {
        if (stage.performance_session_id) {
          db.prepare(`UPDATE performance_sessions SET finished_at = CURRENT_TIMESTAMP, status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(stage.performance_session_id);
        }
        if (stage.participant_id) {
          db.prepare(`UPDATE participants SET status = 'Completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(stage.participant_id);
        }
        db.prepare(`
          UPDATE stage_state
          SET stage_status = 'PERFORMANCE_FINISHED', display_state = 'FINISHED',
              timer_paused_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        `).run();
      });
      const finishState = getHydratedStageState();
      broadcastEvent('PERFORMANCE_FINISHED', finishState);
      broadcastEvent('STAGE_STATE_UPDATED', finishState);

      setTimeout(() => {
        const cur = db.prepare('SELECT stage_status FROM stage_state LIMIT 1').get() as any;
        if (cur && cur.stage_status === 'PERFORMANCE_FINISHED') {
          transaction(() => {
            db.prepare(`
              UPDATE stage_state
              SET stage_status = 'HOLDING', display_state = 'HOLDING',
                  participant_id = NULL, performance_session_id = NULL, active_question_id = NULL,
                  question_selection_enabled = 0, timer_started_at = NULL, timer_paused_at = NULL,
                  timer_offset = 0, updated_at = CURRENT_TIMESTAMP
            `).run();
          });
          const holdingState = getHydratedStageState();
          broadcastEvent('HOLDING_SCREEN_STARTED', holdingState);
          broadcastEvent('STAGE_STATE_UPDATED', holdingState);
        }
      }, finishDuration * 1000);

      return res.json({ success: true, state: finishState });
    }

    case 'HOLDING':
    case 'RESET': {
      transaction(() => {
        db.prepare(`
          UPDATE stage_state
          SET stage_status = 'HOLDING', display_state = 'HOLDING', participant_id = NULL,
              performance_session_id = NULL, active_question_id = NULL, question_selection_enabled = 0,
              timer_started_at = NULL, timer_paused_at = NULL, timer_offset = 0, updated_at = CURRENT_TIMESTAMP
        `).run();
      });
      const state = getHydratedStageState();
      broadcastEvent('HOLDING_SCREEN_STARTED', state);
      broadcastEvent('STAGE_STATE_UPDATED', state);
      return res.json({ success: true, state });
    }

    default:
      return res.status(400).json({ error: `Unsupported target status: ${target_status}` });
  }
});

// Section 57: PARTICIPANT RECALL
app.post('/api/stage/recall', (req, res) => {
  const { participant_id, operator_id, reason } = req.body;
  if (!participant_id) {
    return res.status(400).json({ error: 'participant_id is required' });
  }

  const participant = db.prepare('SELECT * FROM participants WHERE id = ?').get(participant_id) as any;
  if (!participant) {
    return res.status(404).json({ error: 'Participant not found' });
  }

  const comp = db.prepare('SELECT id FROM competitions LIMIT 1').get() as any;
  const compId = comp ? comp.id : 'comp-1';

  // Find previous performance session if any
  const prevSession = db.prepare('SELECT id FROM performance_sessions WHERE participant_id = ? ORDER BY created_at DESC LIMIT 1').get(participant_id) as any;

  let newSessionId = '';
  transaction(() => {
    newSessionId = 'sess-rec-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    // Create NEW recall session. Historical session is NEVER deleted!
    db.prepare(`
      INSERT INTO performance_sessions (
        id, competition_id, participant_id, session_number, is_recall,
        supersedes_session_id, status, called_at, operator_id
      ) VALUES (?, ?, ?, 2, 1, ?, 'active', CURRENT_TIMESTAMP, ?)
    `).run(newSessionId, compId, participant_id, prevSession ? prevSession.id : null, operator_id || 'operator');

    db.prepare(`UPDATE participants SET status = 'Recalled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(participant_id);

    db.prepare(`
      UPDATE stage_state
      SET performance_session_id = ?, participant_id = ?, stage_status = 'CALLED',
          active_question_id = NULL, question_selection_enabled = 0,
          timer_started_at = NULL, timer_paused_at = NULL, timer_offset = 0,
          display_state = 'PARTICIPANT', updated_at = CURRENT_TIMESTAMP
    `).run(newSessionId, participant_id);
  });

  logAudit(
    operator_id || 'operator', 'PRESENTATION_OPERATOR', 'PARTICIPANT_RECALLED',
    'STAGE', 'participant', participant_id, prevSession ? prevSession.id : '', newSessionId, reason || 'Operator recalled participant'
  );

  const state = getHydratedStageState();
  broadcastEvent('STAGE_STATE_UPDATED', state);
  res.json({ success: true, session_id: newSessionId, state });
});

// Reset stage to holding
app.post('/api/stage/reset', (req, res) => {
  transaction(() => {
    db.prepare(`
      UPDATE stage_state
      SET stage_status = 'HOLDING', display_state = 'HOLDING', participant_id = NULL,
          performance_session_id = NULL, active_question_id = NULL, question_selection_enabled = 0,
          timer_started_at = NULL, timer_paused_at = NULL, timer_offset = 0, updated_at = CURRENT_TIMESTAMP
    `).run();
  });

  logAudit(req.body.user_id || 'operator', 'OPERATOR', 'STAGE_RESET', 'STAGE', 'stage_state', 'stage-1');
  const state = getHydratedStageState();
  broadcastEvent('STAGE_STATE_UPDATED', state);
  res.json({ success: true, state });
});

// Section 36 & 37: BELL EVENTS
app.post('/api/bells/trigger', (req, res) => {
  const { bell_type, judge_id, user_role } = req.body;
  if (!bell_type) {
    return res.status(400).json({ error: 'bell_type is required' });
  }

  // Permission check: Designated Bell Judge or Admin
  if (judge_id) {
    const judge = db.prepare('SELECT can_trigger_stage_bells FROM judges WHERE id = ?').get(judge_id) as any;
    if (!judge || !judge.can_trigger_stage_bells) {
      if (user_role !== 'ADMIN') {
        return res.status(403).json({ error: 'This judge does not have bell permissions.' });
      }
    }
  }

  const stage = db.prepare('SELECT * FROM stage_state LIMIT 1').get() as any;
  const bellId = 'bell-' + Date.now();

  transaction(() => {
    db.prepare(`
      INSERT INTO bell_events (id, performance_session_id, judge_id, bell_type, triggered_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(bellId, stage ? stage.performance_session_id : null, judge_id || null, bell_type);
  });

  const judgeInfo = judge_id ? db.prepare('SELECT name FROM judges WHERE id = ?').get(judge_id) as any : null;
  const payload = {
    id: bellId,
    bell_type,
    judge_id,
    judge_name: judgeInfo ? judgeInfo.name : 'Bell Officer',
    triggered_at: new Date().toISOString()
  };

  logAudit(judge_id || 'system', 'JUDGE', 'BELL_TRIGGERED', 'BELLS', 'bell_events', bellId, '', JSON.stringify({ bell_type }));

  broadcastEvent('BELL_TRIGGERED', payload);
  res.json({ success: true, bell: payload });
});

// 7. JUDGE PANEL & SCORING (Sections 39-47, 55)
// Section 40 & 41: Current ongoing performance for judge
app.get('/api/judge/current', (req, res) => {
  const { judge_id } = req.query as any;
  const stage = db.prepare('SELECT * FROM stage_state LIMIT 1').get() as any;

  if (!stage || !stage.participant_id || !stage.performance_session_id) {
    return res.json({ active: false, message: 'No participant currently active on stage.' });
  }

  const participant = db.prepare(`
    SELECT p.*, g.name_dhivehi as grade_name_dhivehi, b.name_dhivehi as branch_name_dhivehi, b.branch_type
    FROM participants p
    LEFT JOIN grades g ON p.grade_id = g.id
    LEFT JOIN branches b ON p.branch_id = b.id
    WHERE p.id = ?
  `).get(stage.participant_id) as any;

  let question = null;
  if (stage.active_question_id) {
    question = db.prepare(`
      SELECT q.*, g.name_dhivehi as grade_name_dhivehi, b.name_dhivehi as branch_name_dhivehi, b.branch_type
      FROM questions q
      LEFT JOIN grades g ON q.grade_id = g.id
      LEFT JOIN branches b ON q.branch_id = b.id
      WHERE q.id = ?
    `).get(stage.active_question_id) as any;
  }

  // Find rubric for this branch type
  const branchType = participant?.branch_type || 'TILAWA';
  const rubric = db.prepare('SELECT * FROM rubrics WHERE branch_type = ? LIMIT 1').get(branchType) as any;
  let criteria: any[] = [];
  if (rubric) {
    criteria = db.prepare('SELECT * FROM rubric_criteria WHERE rubric_id = ? ORDER BY display_order ASC').all(rubric.id) as any[];
    criteria = criteria.map(c => ({
      ...c,
      allowed_deductions: JSON.parse(c.allowed_deductions || '[-0.5, -1.0, -2.0]')
    }));
  }

  // Load existing draft for this judge & performance session if any
  let draftScore = null;
  if (judge_id && stage.performance_session_id) {
    draftScore = db.prepare(`
      SELECT * FROM judge_scores
      WHERE performance_session_id = ? AND judge_id = ?
    `).get(stage.performance_session_id, judge_id) as any;

    if (draftScore) {
      const deductions = db.prepare('SELECT * FROM score_deductions WHERE judge_score_id = ?').all(draftScore.id);
      draftScore.deductions = deductions;
    }
  }

  res.json({
    active: true,
    performance_session_id: stage.performance_session_id,
    stage_status: stage.stage_status,
    participant,
    question,
    rubric: rubric ? { ...rubric, criteria } : null,
    draft_score: draftScore
  });
});

// Section 42: Completed performances list for judges (with pending first!)
app.get('/api/judge/completed-performances', (req, res) => {
  const { judge_id } = req.query as any;

  // Retrieve finished sessions
  const sessions = db.prepare(`
    SELECT s.id as session_id, s.participant_id, s.session_number, s.finished_at, s.called_at,
           p.participant_number, p.name as participant_name, p.name_dhivehi as participant_name_dhivehi,
           g.name_dhivehi as grade_name_dhivehi, b.name_dhivehi as branch_name_dhivehi, b.branch_type,
           q.question_number, q.surah_name, q.surah_name_arabic
    FROM performance_sessions s
    JOIN participants p ON s.participant_id = p.id
    LEFT JOIN grades g ON p.grade_id = g.id
    LEFT JOIN branches b ON p.branch_id = b.id
    LEFT JOIN questions q ON s.active_question_id = q.id
    WHERE s.finished_at IS NOT NULL OR s.status = 'completed'
    ORDER BY s.finished_at DESC
  `).all() as any[];

  // Attach judge's score status for each session
  const results = sessions.map(s => {
    let scoreStatus = 'NOT STARTED';
    let finalScore = null;
    if (judge_id) {
      const score = db.prepare('SELECT submission_status, final_total FROM judge_scores WHERE performance_session_id = ? AND judge_id = ?').get(s.session_id, judge_id) as any;
      if (score) {
        scoreStatus = score.submission_status;
        finalScore = score.final_total;
      }
    }
    return {
      ...s,
      judge_score_status: scoreStatus,
      final_score: finalScore
    };
  });

  // Sort Pending Marks first! (Section 42)
  results.sort((a, b) => {
    const isPendingA = a.judge_score_status === 'NOT STARTED' || a.judge_score_status === 'DRAFT' ? 0 : 1;
    const isPendingB = b.judge_score_status === 'NOT STARTED' || b.judge_score_status === 'DRAFT' ? 0 : 1;
    return isPendingA - isPendingB;
  });

  res.json(results);
});

// Section 43: Give marks after performance (Load exact session & question)
app.get('/api/judge/scores/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { judge_id } = req.query as any;

  const session = db.prepare('SELECT * FROM performance_sessions WHERE id = ?').get(sessionId) as any;
  if (!session) {
    return res.status(404).json({ error: 'Performance session not found' });
  }

  const participant = db.prepare(`
    SELECT p.*, g.name_dhivehi as grade_name_dhivehi, b.name_dhivehi as branch_name_dhivehi, b.branch_type
    FROM participants p
    LEFT JOIN grades g ON p.grade_id = g.id
    LEFT JOIN branches b ON p.branch_id = b.id
    WHERE p.id = ?
  `).get(session.participant_id) as any;

  let question = null;
  if (session.active_question_id) {
    question = db.prepare('SELECT * FROM questions WHERE id = ?').get(session.active_question_id) as any;
  }

  const branchType = participant?.branch_type || 'TILAWA';
  const rubric = db.prepare('SELECT * FROM rubrics WHERE branch_type = ? LIMIT 1').get(branchType) as any;
  let criteria: any[] = [];
  if (rubric) {
    criteria = db.prepare('SELECT * FROM rubric_criteria WHERE rubric_id = ? ORDER BY display_order ASC').all(rubric.id) as any[];
    criteria = criteria.map(c => ({
      ...c,
      allowed_deductions: JSON.parse(c.allowed_deductions || '[-0.5, -1.0, -2.0]')
    }));
  }

  let existingScore = null;
  if (judge_id) {
    existingScore = db.prepare('SELECT * FROM judge_scores WHERE performance_session_id = ? AND judge_id = ?').get(sessionId, judge_id) as any;
    if (existingScore) {
      existingScore.deductions = db.prepare('SELECT * FROM score_deductions WHERE judge_score_id = ?').all(existingScore.id);
    }
  }

  res.json({
    session,
    participant,
    question,
    rubric: rubric ? { ...rubric, criteria } : null,
    score: existingScore
  });
});

// Section 46 & 55: Save Judge Draft Marks (safe draft tied to performance_session_id)
app.post('/api/judge/draft', (req, res) => {
  const { performance_session_id, participant_id, judge_id, rubric_id, deductions, notes } = req.body;
  if (!performance_session_id || !judge_id || !rubric_id) {
    return res.status(400).json({ error: 'performance_session_id, judge_id, and rubric_id are required' });
  }

  let scoreId = '';
  transaction(() => {
    // Check if score record exists
    const existing = db.prepare('SELECT id, submission_status FROM judge_scores WHERE performance_session_id = ? AND judge_id = ?').get(performance_session_id, judge_id) as any;
    if (existing && existing.submission_status === 'SUBMITTED') {
      throw new Error('Marks have already been submitted and cannot be modified as draft.');
    }

    // Calculate deductions total
    let totalDeductions = 0;
    if (Array.isArray(deductions)) {
      for (const d of deductions) {
        totalDeductions += Math.abs(Number(d.value) || 0);
      }
    }

    // Calculate rubric max points
    const criteria = db.prepare('SELECT starting_points FROM rubric_criteria WHERE rubric_id = ?').all(rubric_id) as any[];
    const subtotal = criteria.reduce((sum, c) => sum + (c.starting_points || 0), 0);
    const finalTotal = Math.max(0, subtotal - totalDeductions);

    if (existing) {
      scoreId = existing.id;
      db.prepare(`
        UPDATE judge_scores
        SET subtotal = ?, deductions_total = ?, final_total = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(subtotal, totalDeductions, finalTotal, notes || '', scoreId);

      // Re-insert deductions
      db.prepare('DELETE FROM score_deductions WHERE judge_score_id = ?').run(scoreId);
    } else {
      scoreId = 'score-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
      db.prepare(`
        INSERT INTO judge_scores (
          id, performance_session_id, participant_id, judge_id, rubric_id,
          subtotal, deductions_total, final_total, submission_status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?)
      `).run(scoreId, performance_session_id, participant_id, judge_id, rubric_id, subtotal, totalDeductions, finalTotal, notes || '');
    }

    // Insert deductions chips
    if (Array.isArray(deductions)) {
      const insD = db.prepare(`
        INSERT INTO score_deductions (id, judge_score_id, criterion_id, value, reason)
        VALUES (?, ?, ?, ?, ?)
      `);
      deductions.forEach((d: any, idx: number) => {
        insD.run(`ded-${scoreId}-${idx}`, scoreId, d.criterion_id, d.value, d.reason || '');
      });
    }
  });

  broadcastEvent('SCORE_AUDIT_UPDATED', {
    performance_session_id,
    participant_id,
    judge_id,
    type: 'DRAFT_MARKS'
  });

  res.json({ success: true, score_id: scoreId });
});

// Section 47: Submit Marks permanently with Result calculation
app.post('/api/judge/submit', (req, res) => {
  const { performance_session_id, participant_id, judge_id, rubric_id, deductions, notes } = req.body;
  if (!performance_session_id || !judge_id || !rubric_id) {
    return res.status(400).json({ error: 'Required fields missing' });
  }

  let finalScoreResult = 0;
  transaction(() => {
    const existing = db.prepare('SELECT id, submission_status FROM judge_scores WHERE performance_session_id = ? AND judge_id = ?').get(performance_session_id, judge_id) as any;
    if (existing && existing.submission_status === 'SUBMITTED') {
      throw new Error('Marks have already been submitted.');
    }

    let totalDeductions = 0;
    if (Array.isArray(deductions)) {
      for (const d of deductions) {
        totalDeductions += Math.abs(Number(d.value) || 0);
      }
    }

    const criteria = db.prepare('SELECT starting_points FROM rubric_criteria WHERE rubric_id = ?').all(rubric_id) as any[];
    const subtotal = criteria.reduce((sum, c) => sum + (c.starting_points || 0), 0);
    finalScoreResult = Math.max(0, subtotal - totalDeductions);

    let scoreId = existing ? existing.id : 'score-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    if (existing) {
      db.prepare(`
        UPDATE judge_scores
        SET subtotal = ?, deductions_total = ?, final_total = ?, submission_status = 'SUBMITTED',
            submitted_at = CURRENT_TIMESTAMP, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(subtotal, totalDeductions, finalScoreResult, notes || '', scoreId);
      db.prepare('DELETE FROM score_deductions WHERE judge_score_id = ?').run(scoreId);
    } else {
      db.prepare(`
        INSERT INTO judge_scores (
          id, performance_session_id, participant_id, judge_id, rubric_id,
          subtotal, deductions_total, final_total, submission_status, submitted_at, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', CURRENT_TIMESTAMP, ?)
      `).run(scoreId, performance_session_id, participant_id, judge_id, rubric_id, subtotal, totalDeductions, finalScoreResult, notes || '');
    }

    if (Array.isArray(deductions)) {
      const insD = db.prepare(`
        INSERT INTO score_deductions (id, judge_score_id, criterion_id, value, reason)
        VALUES (?, ?, ?, ?, ?)
      `);
      deductions.forEach((d: any, idx: number) => {
        insD.run(`ded-${scoreId}-${idx}`, scoreId, d.criterion_id, d.value, d.reason || '');
      });
    }

    // Recalculate results for this participant session
    calculateResultsForSession(performance_session_id, participant_id);
  });

  const judge = db.prepare('SELECT name, judge_code FROM judges WHERE id = ?').get(judge_id) as any;
  logAudit(
    judge_id, 'JUDGE', 'SUBMIT_MARKS', 'SCORING', 'judge_scores', performance_session_id,
    '', JSON.stringify({ judge: judge?.judge_code, score: finalScoreResult })
  );

  broadcastEvent('JUDGE_SCORE_SUBMITTED', {
    performance_session_id,
    participant_id,
    judge_id,
    judge_code: judge?.judge_code,
    final_score: finalScoreResult
  });

  broadcastEvent('SCORE_AUDIT_UPDATED', {
    performance_session_id,
    participant_id,
    judge_id,
    judge_code: judge?.judge_code,
    type: 'SUBMIT_MARKS'
  });

  res.json({ success: true, final_score: finalScoreResult });
});

// Admin reopen score for edit
app.post('/api/judge/reopen', (req, res) => {
  const { performance_session_id, judge_id, user_id, reason } = req.body;
  transaction(() => {
    db.prepare(`
      UPDATE judge_scores
      SET submission_status = 'REOPENED', updated_at = CURRENT_TIMESTAMP
      WHERE performance_session_id = ? AND judge_id = ?
    `).run(performance_session_id, judge_id);
  });

  logAudit(user_id || 'admin', 'ADMIN', 'REOPEN_SCORE', 'SCORING', 'judge_scores', performance_session_id, '', '', reason || 'Admin reopened score');
  broadcastEvent('JUDGE_SCORE_REOPENED', { performance_session_id, judge_id });
  broadcastEvent('SCORE_AUDIT_UPDATED', {
    performance_session_id,
    judge_id,
    type: 'REOPEN_SCORE'
  });
  res.json({ success: true });
});

// Helper: Calculate Results for session
function calculateResultsForSession(sessionId: string, participantId: string) {
  const scores = db.prepare(`
    SELECT final_total FROM judge_scores
    WHERE performance_session_id = ? AND submission_status = 'SUBMITTED'
  `).all(sessionId) as any[];

  if (scores.length === 0) return;

  // Average score
  const total = scores.reduce((sum, s) => sum + s.final_total, 0);
  const avg = Number((total / scores.length).toFixed(2));

  const totalJudges = (db.prepare("SELECT count(*) as c FROM judges WHERE status = 'active'").get() as any)?.c || 3;
  const status = scores.length >= totalJudges ? 'CALCULATED' : 'PENDING JUDGES';

  const existingRes = db.prepare('SELECT id, published FROM results WHERE performance_session_id = ?').get(sessionId) as any;
  if (existingRes) {
    db.prepare(`
      UPDATE results
      SET final_score = ?, verification_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(avg, status, existingRes.id);
  } else {
    const resId = 'res-' + Date.now();
    db.prepare(`
      INSERT INTO results (id, performance_session_id, participant_id, final_score, verification_status, published)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(resId, sessionId, participantId, avg, status);
  }

  // Update rankings within same grade & branch
  updateCategoryRankings(participantId);
}

function updateCategoryRankings(participantId: string) {
  const p = db.prepare('SELECT grade_id, branch_id FROM participants WHERE id = ?').get(participantId) as any;
  if (!p) return;

  const list = db.prepare(`
    SELECT r.id, r.final_score
    FROM results r
    JOIN participants part ON r.participant_id = part.id
    WHERE part.grade_id = ? AND part.branch_id = ?
    ORDER BY r.final_score DESC
  `).all(p.grade_id, p.branch_id) as any[];

  let rank = 1;
  for (const item of list) {
    db.prepare('UPDATE results SET rank = ? WHERE id = ?').run(rank++, item.id);
  }
}

// 8. RESULTS ENGINE (Sections 65-68)
app.get(['/api/results', '/api/results/calculate'], (req, res) => {
  const { grade_id, branch_id } = req.query as any;

  let sql = `
    SELECT r.*, p.participant_number, p.name as participant_name, p.name_dhivehi as participant_name_dhivehi,
           p.institution, p.island, p.grade_id, p.branch_id, g.name as grade_name, g.name_dhivehi as grade_name_dhivehi,
           b.name_dhivehi as branch_name_dhivehi, b.name_dhivehi as branch_name, b.branch_type
    FROM results r
    JOIN participants p ON r.participant_id = p.id
    LEFT JOIN grades g ON p.grade_id = g.id
    LEFT JOIN branches b ON p.branch_id = b.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (grade_id && grade_id !== 'ALL') {
    sql += ' AND (p.grade_id = ? OR g.name = ?)';
    params.push(grade_id, grade_id);
  }
  if (branch_id && branch_id !== 'ALL') {
    sql += ' AND (p.branch_id = ? OR b.name_dhivehi = ?)';
    params.push(branch_id, branch_id);
  }
  sql += ' ORDER BY r.final_score DESC, r.rank ASC';

  const rows = db.prepare(sql).all(...params) as any[];

  // Attach judge score breakdown and discrepancy check
  for (const row of rows) {
    const jScores = db.prepare(`
      SELECT js.judge_id, j.judge_code, js.final_total as score, js.submission_status as status
      FROM judge_scores js
      JOIN judges j ON js.judge_id = j.id
      WHERE js.performance_session_id = ?
    `).all(row.performance_session_id) as any[];
    row.judge_scores = jScores;

    const breakdown: Record<string, number> = {};
    jScores.forEach(j => {
      breakdown[j.judge_code] = j.score;
    });
    row.judge_breakdown = breakdown;

    // Discrepancy threshold check: if difference between max and min score is > 10 points
    if (jScores.length >= 2) {
      const vals = jScores.map(s => s.score);
      const diff = Math.max(...vals) - Math.min(...vals);
      row.score_discrepancy = diff >= 10;
      row.discrepancy_delta = Number(diff.toFixed(1));
    }
  }

  res.json(rows);
});

// Verify result (Admin / Result Officer)
app.post('/api/results/verify', (req, res) => {
  const { result_id, user_id } = req.body;
  transaction(() => {
    if (result_id) {
      db.prepare(`UPDATE results SET verification_status = 'VERIFIED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(result_id);
    } else {
      db.prepare(`UPDATE results SET verification_status = 'VERIFIED', updated_at = CURRENT_TIMESTAMP WHERE verification_status != 'VERIFIED'`).run();
    }
  });
  logAudit(user_id || 'officer', 'RESULT_OFFICER', 'VERIFY_RESULT', 'RESULTS', 'results', result_id || 'ALL');
  broadcastEvent('RESULTS_UPDATED', {});
  res.json({ success: true });
});

// Publish results
app.post('/api/results/publish', (req, res) => {
  const { user_id, grade_id, branch_id } = req.body;
  transaction(() => {
    if (grade_id && branch_id) {
      db.prepare(`
        UPDATE results SET published = 1, verification_status = 'PUBLISHED', updated_at = CURRENT_TIMESTAMP
        WHERE participant_id IN (SELECT id FROM participants WHERE grade_id = ? AND branch_id = ?)
      `).run(grade_id, branch_id);
    } else {
      db.prepare(`UPDATE results SET published = 1, verification_status = 'PUBLISHED', updated_at = CURRENT_TIMESTAMP`).run();
      db.prepare('UPDATE competitions SET results_published = 1').run();
    }
  });
  logAudit(user_id || 'admin', 'ADMIN', 'PUBLISH_RESULTS', 'RESULTS', 'competitions', 'comp-1', '', '', 'Official results published to public');
  broadcastEvent('RESULTS_UPDATED', {});
  res.json({ success: true });
});

// Hide results
app.post('/api/results/hide', (req, res) => {
  const { user_id } = req.body;
  transaction(() => {
    db.prepare(`UPDATE results SET published = 0, verification_status = 'HIDDEN', updated_at = CURRENT_TIMESTAMP`).run();
    db.prepare('UPDATE competitions SET results_published = 0').run();
  });
  logAudit(user_id || 'admin', 'ADMIN', 'HIDE_RESULTS', 'RESULTS', 'competitions', 'comp-1', '', '', 'Results hidden from public');
  broadcastEvent('RESULTS_UPDATED', {});
  res.json({ success: true });
});

// Public results endpoint (Section 68 - Show only published results)
app.get('/api/public/results', (req, res) => {
  const { grade_id, branch_id } = req.query as any;

  let sql = `
    SELECT r.rank, r.final_score, p.participant_number, p.name as participant_name,
           p.name_dhivehi as participant_name_dhivehi, p.institution, p.island, p.atoll,
           g.name_dhivehi as grade_name_dhivehi, b.name_dhivehi as branch_name_dhivehi, b.branch_type
    FROM results r
    JOIN participants p ON r.participant_id = p.id
    LEFT JOIN grades g ON p.grade_id = g.id
    LEFT JOIN branches b ON p.branch_id = b.id
    WHERE r.published = 1
  `;
  const params: any[] = [];
  if (grade_id) {
    sql += ' AND p.grade_id = ?';
    params.push(grade_id);
  }
  if (branch_id) {
    sql += ' AND p.branch_id = ?';
    params.push(branch_id);
  }
  sql += ' ORDER BY r.rank ASC, r.final_score DESC';

  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// 9. Judges Management (Section 64)
app.get('/api/judges', (req, res) => {
  const judges = db.prepare(`
    SELECT j.*, u.username, u.role
    FROM judges j
    JOIN users u ON j.user_id = u.id
    ORDER BY j.judge_code ASC
  `).all() as any[];
  res.json(judges.map(j => ({ ...j, can_trigger_stage_bells: Boolean(j.can_trigger_stage_bells) })));
});

app.post('/api/judges', (req, res) => {
  const { judge_code, name, name_dhivehi, username, password, can_trigger_stage_bells } = req.body;
  if (!judge_code || !name || !username || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const userId = 'u-' + Date.now();
  const judgeId = 'j-' + Date.now();

  transaction(() => {
    db.prepare(`
      INSERT INTO users (id, username, name, name_dhivehi, password, role, status)
      VALUES (?, ?, ?, ?, ?, 'JUDGE', 'active')
    `).run(userId, username, name, name_dhivehi || name, password);

    db.prepare(`
      INSERT INTO judges (id, user_id, judge_code, name, name_dhivehi, status, can_trigger_stage_bells)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `).run(judgeId, userId, judge_code, name, name_dhivehi || name, can_trigger_stage_bells ? 1 : 0);
  });

  logAudit(req.body.admin_id || 'admin', 'ADMIN', 'CREATE_JUDGE', 'JUDGES', 'judges', judgeId, '', JSON.stringify({ judge_code, name }));
  res.json({ success: true, judge_id: judgeId });
});

app.put('/api/judges/:id', (req, res) => {
  const { id } = req.params;
  const { name, name_dhivehi, status, can_trigger_stage_bells, password } = req.body;

  const current = db.prepare('SELECT * FROM judges WHERE id = ?').get(id) as any;
  if (!current) return res.status(404).json({ error: 'Judge not found' });

  transaction(() => {
    db.prepare(`
      UPDATE judges
      SET name = ?, name_dhivehi = ?, status = ?, can_trigger_stage_bells = ?
      WHERE id = ?
    `).run(name, name_dhivehi || name, status || 'active', can_trigger_stage_bells ? 1 : 0, id);

    db.prepare('UPDATE users SET name = ?, name_dhivehi = ? WHERE id = ?').run(name, name_dhivehi || name, current.user_id);
    if (password) {
      db.prepare('UPDATE users SET password = ? WHERE id = ?').run(password, current.user_id);
    }
  });

  logAudit(req.body.admin_id || 'admin', 'ADMIN', 'UPDATE_JUDGE', 'JUDGES', 'judges', id);
  res.json({ success: true });
});

// 9.5 Users Management (Admin User Control: details, roles, PIN)
app.get('/api/users', (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.name, u.name_dhivehi, u.password, u.role, u.status, u.created_at, u.updated_at,
           j.id as judge_id, j.judge_code, j.can_trigger_stage_bells
    FROM users u
    LEFT JOIN judges j ON u.id = j.user_id
    ORDER BY
      CASE u.role
        WHEN 'ADMIN' THEN 1
        WHEN 'PRESENTATION_OPERATOR' THEN 2
        WHEN 'JUDGE' THEN 3
        WHEN 'PODIUM' THEN 4
        WHEN 'AUDIENCE' THEN 5
        WHEN 'RESULT_OFFICER' THEN 6
        ELSE 7
      END,
      u.username ASC
  `).all() as any[];

  res.json(users.map(u => ({
    ...u,
    can_trigger_stage_bells: Boolean(u.can_trigger_stage_bells)
  })));
});

app.post('/api/users', (req, res) => {
  const { username, name, name_dhivehi, password, role, status, judge_code, can_trigger_stage_bells } = req.body;
  if (!username || !password || !name || !role) {
    return res.status(400).json({ error: 'Username, password (PIN), name, and role are required.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existing) {
    return res.status(400).json({ error: 'Username is already taken.' });
  }

  const userId = 'u-' + Date.now();
  const userStatus = status || 'active';

  transaction(() => {
    db.prepare(`
      INSERT INTO users (id, username, name, name_dhivehi, password, role, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, username.trim(), name.trim(), name_dhivehi || name, password.trim(), role, userStatus);

    if (role === 'JUDGE') {
      const judgeId = 'j-' + Date.now();
      const code = judge_code || ('J-' + Math.floor(10 + Math.random() * 90));
      db.prepare(`
        INSERT INTO judges (id, user_id, judge_code, name, name_dhivehi, status, can_trigger_stage_bells)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(judgeId, userId, code, name.trim(), name_dhivehi || name, userStatus, can_trigger_stage_bells ? 1 : 0);
    }
  });

  logAudit(req.body.admin_id || 'admin', 'ADMIN', 'CREATE_USER', 'USERS', 'users', userId, '', JSON.stringify({ username, role, name }));
  res.json({ success: true, user_id: userId });
});

app.put('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const { username, name, name_dhivehi, password, role, status, judge_code, can_trigger_stage_bells } = req.body;

  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  if (!current) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (username && username.trim() !== current.username) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username.trim(), id);
    if (existing) {
      return res.status(400).json({ error: 'Username is already taken by another account.' });
    }
  }

  const newUsername = username ? username.trim() : current.username;
  const newName = name ? name.trim() : current.name;
  const newNameDhivehi = name_dhivehi !== undefined ? name_dhivehi : current.name_dhivehi;
  const newPassword = password ? password.trim() : current.password;
  const newRole = role || current.role;
  const newStatus = status || current.status;

  transaction(() => {
    db.prepare(`
      UPDATE users
      SET username = ?, name = ?, name_dhivehi = ?, password = ?, role = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newUsername, newName, newNameDhivehi, newPassword, newRole, newStatus, id);

    const judgeRecord = db.prepare('SELECT * FROM judges WHERE user_id = ?').get(id) as any;
    if (newRole === 'JUDGE') {
      if (judgeRecord) {
        db.prepare(`
          UPDATE judges
          SET name = ?, name_dhivehi = ?, status = ?, judge_code = COALESCE(?, judge_code), can_trigger_stage_bells = ?
          WHERE user_id = ?
        `).run(newName, newNameDhivehi, newStatus, judge_code || judgeRecord.judge_code, can_trigger_stage_bells ? 1 : 0, id);
      } else {
        const judgeId = 'j-' + Date.now();
        const code = judge_code || ('J-' + Math.floor(10 + Math.random() * 90));
        db.prepare(`
          INSERT INTO judges (id, user_id, judge_code, name, name_dhivehi, status, can_trigger_stage_bells)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(judgeId, id, code, newName, newNameDhivehi, newStatus, can_trigger_stage_bells ? 1 : 0);
      }
    } else if (judgeRecord && newRole !== 'JUDGE') {
      db.prepare('UPDATE judges SET status = ? WHERE user_id = ?').run('inactive', id);
    }
  });

  logAudit(req.body.admin_id || 'admin', 'ADMIN', 'UPDATE_USER', 'USERS', 'users', id, JSON.stringify({ role: current.role }), JSON.stringify({ role: newRole, username: newUsername, name: newName }));
  res.json({ success: true });
});

app.delete('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  if (!current) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (current.username === 'admin' || current.id === 'u-admin') {
    return res.status(400).json({ error: 'Default Admin user account cannot be deleted.' });
  }

  transaction(() => {
    db.prepare('DELETE FROM judges WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  });

  logAudit(req.body.admin_id || 'admin', 'ADMIN', 'DELETE_USER', 'USERS', 'users', id, JSON.stringify({ username: current.username, role: current.role }));
  res.json({ success: true });
});

// 10. Rubrics Management
app.get('/api/rubrics', (req, res) => {
  const rubrics = db.prepare('SELECT * FROM rubrics').all() as any[];
  for (const r of rubrics) {
    const criteria = db.prepare('SELECT * FROM rubric_criteria WHERE rubric_id = ? ORDER BY display_order ASC').all(r.id) as any[];
    r.criteria = criteria.map(c => ({
      ...c,
      allowed_deductions: JSON.parse(c.allowed_deductions || '[-0.5, -1.0, -2.0]')
    }));
  }
  res.json(rubrics);
});

// 11. Digital Mushaf & Quran API (Sections 69 & 70)
app.get('/api/quran/surahs', (req, res) => {
  res.json(SURAHS_LIST);
});

app.get('/api/quran/passage', async (req, res) => {
  const surah = Number(req.query.surah) || 1;
  const endSurah = Number(req.query.end_surah) || surah;
  const start = Number(req.query.start || req.query.start_ayah) || 1;
  const end = Number(req.query.end || req.query.end_ayah) || 7;

  if (endSurah <= surah) {
    const passage = await fetchQuranPassage(surah, start, end);
    return res.json({ surah, end_surah: surah, start, end, text_arabic: passage });
  }

  // Multi-surah spanning
  let fullPassage = '';
  for (let sNum = surah; sNum <= endSurah; sNum++) {
    const sMeta = SURAHS_LIST.find(s => s.number === sNum);
    const sStart = sNum === surah ? start : 1;
    const sEnd = sNum === endSurah ? end : (sMeta?.ayah_count || 1);
    const subPassage = await fetchQuranPassage(sNum, sStart, sEnd);
    if (fullPassage) fullPassage += '\n[[ABABEEL_SURAH_DIVIDER]]\n';
    fullPassage += subPassage;
  }
  res.json({ surah, end_surah: endSurah, start, end, text_arabic: fullPassage });
});

// 12. Audit Logs (Section 77)
app.get('/api/audit', (req, res) => {
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100').all();
  res.json(logs);
});

// Alias for audit logs
app.get('/api/audit-logs', (req, res) => {
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100').all();
  res.json(logs);
});

// 12.1 Dedicated Score Audit API (Scoring events, deductions, timestamps, judges, participants)
app.get('/api/score-audit', (req, res) => {
  try {
    const { judge_id, participant_id, event_type, search } = req.query;

    // 1. Fetch all granular deduction events
    const deductionRows = db.prepare(`
      SELECT 
        sd.id as id,
        'DEDUCTION' as event_type,
        sd.value as deduction_value,
        COALESCE(sd.reason, '') as reason,
        sd.created_at as created_at,
        js.id as judge_score_id,
        js.performance_session_id,
        js.subtotal,
        js.deductions_total,
        js.final_total,
        js.submission_status,
        COALESCE(js.notes, '') as notes,
        j.id as judge_id,
        j.judge_code,
        j.name as judge_name,
        j.name_dhivehi as judge_name_dhivehi,
        p.id as participant_id,
        p.participant_number,
        p.name as participant_name,
        p.name_dhivehi as participant_name_dhivehi,
        p.institution,
        p.island,
        g.name_dhivehi as grade_name_dhivehi,
        b.name_dhivehi as branch_name_dhivehi,
        sd.criterion_id,
        COALESCE(rc.name, 
          CASE sd.criterion_id 
            WHEN 'crit-tajweed' THEN 'Tajweed (Rules, Makharij & Sifat)'
            WHEN 'crit-voice' THEN 'Voice & Appropriate Tune'
            WHEN 'crit-fluency' THEN 'Fluency, Waqf & Ibtida'
            WHEN 'crit-hifz' THEN 'Memorization Accuracy'
            WHEN 'crit-h-1' THEN 'Memorization Accuracy (Mistakes & Hesitation)'
            WHEN 'crit-h-2' THEN 'Tajweed & Pronunciation'
            WHEN 'crit-h-3' THEN 'Fluency, Waqf & Voice'
            WHEN 'crit-t-1' THEN 'Tajweed (Rules, Makharij & Sifat)'
            WHEN 'crit-t-2' THEN 'Voice & Appropriate Tune'
            WHEN 'crit-t-3' THEN 'Fluency, Waqf & Ibtida'
            ELSE sd.criterion_id
          END
        ) as criterion_name,
        COALESCE(rc.name_dhivehi,
          CASE sd.criterion_id 
            WHEN 'crit-tajweed' THEN 'ތަޖުވީދުގެ ޙުކުމްތަކާއި މަޚާރިޖު'
            WHEN 'crit-voice' THEN 'އަޑާއި ރާގު އަދި ރީތިކަން'
            WHEN 'crit-fluency' THEN 'ހުއްޓުމާއި ފެށުން އަދި ފަސޭހަކަން'
            WHEN 'crit-hifz' THEN 'ހިތުދަސްކަމާއި ފަރިތަކަން'
            WHEN 'crit-h-1' THEN 'ހިތުދަސްކަމާއި ފަރިތަކަން (ކުށް/ހަނދާންކޮށްދިނުން)'
            WHEN 'crit-h-2' THEN 'ތަޖުވީދާއި މަޚާރިޖުތައް'
            WHEN 'crit-h-3' THEN 'ހުއްޓުމާއި ފެށުން އަދި އަޑުގެ ރީތިކަން'
            WHEN 'crit-t-1' THEN 'ތަޖުވީދުގެ ޙުކުމްތަކާއި މަޚާރިޖު'
            WHEN 'crit-t-2' THEN 'އަޑާއި ރާގު އަދި ރީތިކަން'
            WHEN 'crit-t-3' THEN 'ހުއްޓުމާއި ފެށުން އަދި ފަސޭހަކަން'
            ELSE sd.criterion_id
          END
        ) as criterion_name_dhivehi
      FROM score_deductions sd
      JOIN judge_scores js ON sd.judge_score_id = js.id
      JOIN judges j ON js.judge_id = j.id
      JOIN participants p ON js.participant_id = p.id
      LEFT JOIN grades g ON p.grade_id = g.id
      LEFT JOIN branches b ON p.branch_id = b.id
      LEFT JOIN rubric_criteria rc ON sd.criterion_id = rc.id
    `).all() as any[];

    // 2. Fetch score submission & draft events
    const scoreRows = db.prepare(`
      SELECT 
        'sub-' || js.id as id,
        CASE 
          WHEN js.submission_status = 'SUBMITTED' THEN 'SUBMIT_MARKS'
          WHEN js.submission_status = 'REOPENED' THEN 'REOPEN_SCORE'
          ELSE 'DRAFT_MARKS'
        END as event_type,
        -js.deductions_total as deduction_value,
        COALESCE(js.notes, '') as reason,
        COALESCE(js.submitted_at, js.updated_at, js.created_at) as created_at,
        js.id as judge_score_id,
        js.performance_session_id,
        js.subtotal,
        js.deductions_total,
        js.final_total,
        js.submission_status,
        COALESCE(js.notes, '') as notes,
        j.id as judge_id,
        j.judge_code,
        j.name as judge_name,
        j.name_dhivehi as judge_name_dhivehi,
        p.id as participant_id,
        p.participant_number,
        p.name as participant_name,
        p.name_dhivehi as participant_name_dhivehi,
        p.institution,
        p.island,
        g.name_dhivehi as grade_name_dhivehi,
        b.name_dhivehi as branch_name_dhivehi,
        NULL as criterion_id,
        CASE 
          WHEN js.submission_status = 'SUBMITTED' THEN 'Official Marks Submitted'
          WHEN js.submission_status = 'REOPENED' THEN 'Score Reopened by Admin'
          ELSE 'Draft Scoring Saved'
        END as criterion_name,
        CASE 
          WHEN js.submission_status = 'SUBMITTED' THEN 'ރަސްމީ މާކްސް ހުށަހެޅުން'
          WHEN js.submission_status = 'REOPENED' THEN 'އަލުން ބެލުމަށް ހުޅުވާލެވުނު'
          ELSE 'ޑްރާފްޓް މާކްސް'
        END as criterion_name_dhivehi
      FROM judge_scores js
      JOIN judges j ON js.judge_id = j.id
      JOIN participants p ON js.participant_id = p.id
      LEFT JOIN grades g ON p.grade_id = g.id
      LEFT JOIN branches b ON p.branch_id = b.id
    `).all() as any[];

    // 3. Fetch score reopen audit logs
    const reopenLogs = db.prepare(`
      SELECT 
        al.id as id,
        'REOPEN_SCORE' as event_type,
        0 as deduction_value,
        COALESCE(al.reason, 'Admin reopened score for revision') as reason,
        al.created_at as created_at,
        js.id as judge_score_id,
        al.entity_id as performance_session_id,
        js.subtotal,
        js.deductions_total,
        js.final_total,
        'REOPENED' as submission_status,
        al.reason as notes,
        j.id as judge_id,
        j.judge_code,
        j.name as judge_name,
        j.name_dhivehi as judge_name_dhivehi,
        p.id as participant_id,
        p.participant_number,
        p.name as participant_name,
        p.name_dhivehi as participant_name_dhivehi,
        p.institution,
        p.island,
        g.name_dhivehi as grade_name_dhivehi,
        b.name_dhivehi as branch_name_dhivehi,
        NULL as criterion_id,
        'Score Unlocked / Reopened' as criterion_name,
        'މާކްސް އަލުން ހުޅުވާލުން' as criterion_name_dhivehi
      FROM audit_logs al
      JOIN judge_scores js ON al.entity_id = js.performance_session_id
      JOIN judges j ON js.judge_id = j.id
      JOIN participants p ON js.participant_id = p.id
      LEFT JOIN grades g ON p.grade_id = g.id
      LEFT JOIN branches b ON p.branch_id = b.id
      WHERE al.module = 'SCORING' AND al.action = 'REOPEN_SCORE'
    `).all() as any[];

    let allEvents = [...deductionRows, ...scoreRows, ...reopenLogs];

    // Deduplicate by ID
    const seenIds = new Set<string>();
    allEvents = allEvents.filter(ev => {
      if (seenIds.has(ev.id)) return false;
      seenIds.add(ev.id);
      return true;
    });

    // Sort descending by timestamp
    allEvents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Filter if query params provided
    if (judge_id && judge_id !== 'ALL') {
      allEvents = allEvents.filter(e => e.judge_id === judge_id || e.judge_code === judge_id);
    }
    if (participant_id && participant_id !== 'ALL') {
      allEvents = allEvents.filter(e => e.participant_id === participant_id || e.participant_number === participant_id);
    }
    if (event_type && event_type !== 'ALL') {
      allEvents = allEvents.filter(e => e.event_type === event_type);
    }
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.toLowerCase().trim();
      allEvents = allEvents.filter(e =>
        (e.judge_name && e.judge_name.toLowerCase().includes(q)) ||
        (e.judge_code && e.judge_code.toLowerCase().includes(q)) ||
        (e.participant_name && e.participant_name.toLowerCase().includes(q)) ||
        (e.participant_name_dhivehi && e.participant_name_dhivehi.includes(q)) ||
        (e.participant_number && e.participant_number.includes(q)) ||
        (e.criterion_name && e.criterion_name.toLowerCase().includes(q)) ||
        (e.reason && e.reason.toLowerCase().includes(q)) ||
        (e.institution && e.institution.toLowerCase().includes(q)) ||
        (e.notes && e.notes.toLowerCase().includes(q))
      );
    }

    // Summary calculations
    const totalEvents = allEvents.length;
    const deductionEvents = allEvents.filter(e => e.event_type === 'DEDUCTION');
    const totalDeductionsCount = deductionEvents.length;
    const totalDeductionsPoints = deductionEvents.reduce((sum, e) => sum + Math.abs(Number(e.deduction_value) || 0), 0);
    const totalSubmissions = allEvents.filter(e => e.event_type === 'SUBMIT_MARKS').length;
    const activeJudgesSet = new Set(allEvents.map(e => e.judge_id).filter(Boolean));
    const scoredParticipantsSet = new Set(allEvents.map(e => e.participant_id).filter(Boolean));

    res.json({
      events: allEvents,
      summary: {
        total_events: totalEvents,
        total_deductions_count: totalDeductionsCount,
        total_deductions_points: Number(totalDeductionsPoints.toFixed(2)),
        total_submissions: totalSubmissions,
        active_judges_count: activeJudgesSet.size,
        scored_participants_count: scoredParticipantsSet.size
      }
    });
  } catch (err: any) {
    console.error('Error in /api/score-audit:', err);
    res.status(500).json({ error: 'Failed to retrieve score audit trail', details: err?.message });
  }
});

// 13. Admin Dashboard Summary Metrics (Section 62)
app.get('/api/dashboard/summary', (req, res) => {
  const totalParticipants = (db.prepare('SELECT count(*) as c FROM participants').get() as any)?.c || 0;
  const waitingParticipants = (db.prepare("SELECT count(*) as c FROM participants WHERE status = 'Waiting'").get() as any)?.c || 0;
  const completedParticipants = (db.prepare("SELECT count(*) as c FROM participants WHERE status = 'Completed'").get() as any)?.c || 0;
  const onStageParticipants = (db.prepare("SELECT count(*) as c FROM participants WHERE status IN ('Called', 'On Stage', 'Performing')").get() as any)?.c || 0;

  const totalQuestions = (db.prepare('SELECT count(*) as c FROM questions').get() as any)?.c || 0;
  const usedQuestions = (db.prepare('SELECT count(*) as c FROM questions WHERE used = 1').get() as any)?.c || 0;
  const availableQuestions = totalQuestions - usedQuestions;

  const totalJudges = (db.prepare("SELECT count(*) as c FROM judges WHERE status = 'active'").get() as any)?.c || 0;
  const resultsPending = (db.prepare("SELECT count(*) as c FROM results WHERE verification_status = 'PENDING JUDGES'").get() as any)?.c || 0;
  const resultsVerified = (db.prepare("SELECT count(*) as c FROM results WHERE verification_status = 'VERIFIED' OR published = 1").get() as any)?.c || 0;

  res.json({
    totalParticipants,
    waitingParticipants,
    completedParticipants,
    onStageParticipants,
    totalQuestions,
    usedQuestions,
    availableQuestions,
    totalJudges,
    connectedJudges: wsClients.size,
    resultsPending,
    resultsVerified
  });
});

// ----------------------------------------------------
// Production / Dev Static & SPA Fallback Handler
// ----------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Ababeel] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
