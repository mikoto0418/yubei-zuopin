// 独立种子脚本：node seed.js
'use strict';
const { seedIfNeeded } = require('./db');
seedIfNeeded();
console.log('[seed] 完成');
