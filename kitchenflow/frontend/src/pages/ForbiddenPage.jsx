// 403 页：角色无权访问时的独立页面。
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/primitives.jsx';
import { ForbiddenState } from '../components/ui/states.jsx';

export default function ForbiddenPage() {
  const navigate = useNavigate();
  return (
    <div className="kf-card" style={{ maxWidth: 520, margin: '48px auto' }}>
      <ForbiddenState message="你的账号角色没有访问该页面的权限。如需操作请使用店长账号，或联系管理员调整角色。" />
      <div className="flex justify-center gap-2" style={{ paddingBottom: 28 }}>
        <Button variant="secondary" onClick={() => navigate(-1)}>返回上一页</Button>
        <Button onClick={() => navigate('/', { replace: true })}>回到首页</Button>
      </div>
    </div>
  );
}
