// Admin 概览的业务指标。内核已提供 users 计数，这里补充本系统的统计。
'use strict';
module.exports = (db) => () => {
  const one = (sql, ...a) => { try { return db.prepare(sql).get(...a)?.c || 0; } catch { return 0; } };
  return {
    projects_total: one('SELECT COUNT(*) AS c FROM projects'),
    projects_reviewing: one("SELECT COUNT(*) AS c FROM projects WHERE status = 'reviewing'"),
    episodes_total: one('SELECT COUNT(*) AS c FROM episodes'),
    scenes_total: one('SELECT COUNT(*) AS c FROM scenes'),
    scenes_final: one("SELECT COUNT(*) AS c FROM scenes WHERE status = 'final'"),
    characters_total: one('SELECT COUNT(*) AS c FROM characters'),
    dialogues_total: one('SELECT COUNT(*) AS c FROM dialogues'),
    storylines_total: one('SELECT COUNT(*) AS c FROM storylines'),
    notes_total: one('SELECT COUNT(*) AS c FROM notes'),
    notes_todo: one("SELECT COUNT(*) AS c FROM notes WHERE status = 'open' AND kind = 'todo'"),
    revisions_total: one('SELECT COUNT(*) AS c FROM revisions'),
    words_total: one('SELECT COALESCE(SUM(word_count),0) AS c FROM scenes'),
  };
};
