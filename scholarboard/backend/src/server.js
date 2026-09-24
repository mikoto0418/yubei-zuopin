require('dotenv').config();
const app = require('./app');

const PORT = parseInt(process.env.PORT, 10) || 4102;

app.listen(PORT, () => {
  console.log(`✅ ScholarBoard 后端已启动: http://localhost:${PORT}`);
  console.log(`   健康检查: http://localhost:${PORT}/api/health`);
});