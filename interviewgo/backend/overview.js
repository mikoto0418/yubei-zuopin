// Admin 概览的业务指标。内核已提供 users 计数，这里补充本系统的统计。
'use strict';
module.exports = (db) => () => {
  const one = (sql, ...a) => { try { return db.prepare(sql).get(...a)?.c || 0; } catch { return 0; } };
  return {
    sessions_total: one('SELECT COUNT(*) AS c FROM interview_sessions'),
    messages_total: one('SELECT COUNT(*) AS c FROM messages'),
    reports_total: one('SELECT COUNT(*) AS c FROM reports'),
    positions_total: one('SELECT COUNT(*) AS c FROM job_positions'),
    questions_total: one('SELECT COUNT(*) AS c FROM question_bank'),
    rounds_total: one('SELECT COUNT(*) AS c FROM interview_rounds'),
    skills_total: one('SELECT COUNT(*) AS c FROM skill_assessments'),
    plans_total: one('SELECT COUNT(*) AS c FROM practice_plans'),
    analyses_total: one('SELECT COUNT(*) AS c FROM answer_analyses'),
    sessions_evaluated: one("SELECT COUNT(*) AS c FROM interview_sessions WHERE status = 'evaluated'"),
  };
};
