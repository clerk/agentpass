import { StartClient } from '@tanstack/react-start'
import { getRouter } from './router'
import './styles.css'

const router = getRouter()

export default function App() {
  return <StartClient router={router} />
}
