// 404 页：未登录与已登录两种文案。
import { Flex, Heading, Text } from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'
import { Btn } from '../components/ui'
import { MapPinIcon } from '../components/Icons'

export default function NotFoundPage({ kicked }) {
  const navigate = useNavigate()
  return (
    <Flex direction="column" align="center" justify="center" textAlign="center" py="90px" px="24px" gap="16px">
      <Flex boxSize="64px" borderRadius="full" bg="fill" color="labelSecondary" align="center" justify="center">
        <MapPinIcon size={30} />
      </Flex>
      <Heading as="h1" fontSize="34px" fontWeight={700} letterSpacing="-0.02em" color="label">
        404
      </Heading>
      <Text fontSize="17px" fontWeight={600} color="label">
        {kicked ? '登录已过期' : '这个页面不在配送范围内'}
      </Text>
      <Text fontSize="15px" color="labelSecondary" maxW="420px">
        {kicked
          ? '你的登录状态已失效，请重新登录后继续操作。'
          : '你访问的地址不存在，或者运单已经被删除。回到运单查询页继续跟踪吧。'}
      </Text>
      <Flex gap="10px" mt="6px" wrap="wrap" justify="center">
        <Btn variant="primary" onClick={() => navigate('/')}>返回运单查询</Btn>
        <Btn variant="plain" onClick={() => navigate(-1)}>返回上一页</Btn>
      </Flex>
    </Flex>
  )
}
