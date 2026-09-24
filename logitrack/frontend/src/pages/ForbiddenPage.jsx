// 403 页（路由 /403 与 RequireRole 都用它）。
import { Box, Flex, Text } from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'
import { Btn } from '../components/ui'
import { ShieldIcon } from '../components/Icons'

export default function ForbiddenPage() {
  const navigate = useNavigate()
  return (
    <Flex direction="column" align="center" justify="center" textAlign="center" py="90px" px="24px" gap="16px">
      <Flex boxSize="64px" borderRadius="full" bg="fill" color="labelSecondary" align="center" justify="center">
        <ShieldIcon size={30} />
      </Flex>
      <Text fontSize="13px" fontWeight={700} color="labelTertiary" letterSpacing="0.08em">
        403 FORBIDDEN
      </Text>
      <Text fontSize="22px" fontWeight={600} color="label">
        没有访问该功能的权限
      </Text>
      <Text fontSize="15px" color="labelSecondary" maxW="460px">
        调度台、网点管理、车辆司机与总部概览仅对调度员和管理员开放。
        当前账号的角色是快递员，可使用运单查询、创建运单、节点扫描与通知中心。
      </Text>
      <Box mt="6px">
        <Btn variant="primary" onClick={() => navigate('/')}>返回运单查询</Btn>
      </Box>
    </Flex>
  )
}
