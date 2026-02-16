import { StartClient } from '@tanstack/react-start'
import { router } from './router'
import './styles.css'

export default function App() {
  return <StartClient router={router} />
}
