import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import Home from './Home'
import AdminHome from './AdminHome'

export default function HomeRole() {
  const { getEffectiveRole } = useAuthStore()
  const role = getEffectiveRole()

  const View = useMemo(() => {
    if (role === 'admin') return AdminHome
    // Both buyers and sellers see Home (sellers can browse as buyers)
    return Home
  }, [role])

  return <View />
}
