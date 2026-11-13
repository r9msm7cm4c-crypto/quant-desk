import { lazy } from 'react'
import { Activity } from 'lucide-react'
import type { FrontendExtension } from '@/extensions/types'

const QuantLabPage = lazy(() => import('./Page').then(module => ({ default: module.QuantLab })))

const extension: FrontendExtension = {
  id: 'official.quant-lab',
  apiVersion: 1,
  routes: [
    { id: 'quant-lab', path: '/quant-lab', component: QuantLabPage },
  ],
  navigation: [
    { id: 'quant-lab', routeId: 'quant-lab', label: '量化研究实验室', icon: Activity, order: 90 },
  ],
}

export default extension
