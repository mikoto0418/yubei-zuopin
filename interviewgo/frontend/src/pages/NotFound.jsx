import { Button, Stack, Typography } from '@mui/material';
import SearchOffRoundedIcon from '@mui/icons-material/SearchOffRounded';
import { useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ minHeight: '100vh', bgcolor: 'background.default', px: 3, textAlign: 'center' }}>
      <Typography sx={{ fontSize: 64, fontWeight: 700, color: 'text.disabled', lineHeight: 1, letterSpacing: '-0.02em' }}>
        404
      </Typography>
      <SearchOffRoundedIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
      <Typography sx={{ fontWeight: 600, fontSize: 22 }}>页面不存在</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 380, lineHeight: 1.7 }}>
        你访问的页面可能已被移动或删除。回到对话区继续你的面试练习吧。
      </Typography>
      <Stack direction="row" spacing={1.4} sx={{ pt: 1 }}>
        <Button variant="outlined" onClick={() => navigate(-1)}>返回上一页</Button>
        <Button variant="contained" onClick={() => navigate('/', { replace: true })}>回到对话区</Button>
      </Stack>
    </Stack>
  );
}
