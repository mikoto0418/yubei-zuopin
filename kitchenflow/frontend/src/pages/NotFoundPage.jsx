// 404 页：未登录也能看到，不依赖 AuthProvider 数据。
import { useNavigate } from 'react-router-dom';
import { ChefHat } from 'lucide-react';
import { Button } from '../components/ui/primitives.jsx';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-center" style={{ minHeight: '100vh', padding: 24 }}>
      <div className="kf-card kf-fade-up text-center" style={{ maxWidth: 420, padding: 40 }}>
        <div className="flex items-center justify-center mx-auto mb-5" style={{
          width: 64, height: 64, borderRadius: 'var(--radius-full)',
          background: 'var(--tint-soft)', color: 'var(--tint)',
        }}>
          <ChefHat size={30} strokeWidth={1.6} />
        </div>
        <p className="apple-large-title" style={{ color: 'var(--tint)' }}>404</p>
        <p className="apple-headline mt-2">没有找到这个页面</p>
        <p className="apple-footnote apple-secondary mt-2">
          链接可能已失效，或你输入了一个系统里不存在的地址。
        </p>
        <div className="flex justify-center gap-2 mt-5">
          <Button variant="secondary" onClick={() => navigate(-1)}>返回上一页</Button>
          <Button onClick={() => navigate('/', { replace: true })}>回到首页</Button>
        </div>
      </div>
    </div>
  );
}
