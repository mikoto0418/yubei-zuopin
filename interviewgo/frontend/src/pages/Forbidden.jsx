import { Button, Stack, Typography } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Forbidden() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ minHeight: '100vh', bgcolor: 'background.default', px: 3, textAlign: 'center' }}>
      <Typography sx={{ fontSize: 64, fontWeight: 700, color: 'text.disabled', lineHeight: 1, letterSpacing: '-0.02em' }}>
        403
      </Typography>
      <LockOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
      <Typography sx={{ fontWeight: 600, fontSize: 22 }}>无权限访问</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400, lineHeight: 1.7 }}>
        当前账号{user ? `（${user.nickname || user.username}）` : ''}没有访问该页面的权限。
        如需管理功能，请使用管理员账号登录。
      </Typography>
      <Stack direction="row" spacing={1.4} sx={{ pt: 1 }}>
        <Button variant="outlined" color="error" onClick={() => { logout(); navigate('/login', { replace: true }); }}>
          切换账号
        </Button>
        <Button variant="contained" onClick={() => navigate('/', { replace: true })}>回到对话区</Button>
      </Stack>
    </Stack>
  );
}
