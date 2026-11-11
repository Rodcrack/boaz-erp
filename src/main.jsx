import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'

// Cada aplicación se descarga SOLO cuando se abre su dirección
// (el repartidor ya no baja el ERP completo, ni el cliente el panel interno).
const BoazERP = lazy(() => import('./BoazERP.jsx'))
const BoazTracking = lazy(() => import('./BoazTracking.jsx'))
const BoazApp = lazy(() => import('./BoazApp.jsx'))
const BoazCliente = lazy(() => import('./BoazCliente.jsx'))

// Router simple por URL
const path = window.location.pathname.toLowerCase();
const search = window.location.search.toLowerCase();
const hash = window.location.hash.toLowerCase();
const full = path + search + hash;

let Componente = BoazERP; // default: panel admin

if (full.includes("/tracking") || full.includes("tracking")) {
  Componente = BoazTracking; // portal tracking público
} else if (full.includes("/cliente") || full.includes("cliente=1")) {
  Componente = BoazCliente; // portal de visibilidad para clientes
} else if (full.includes("/app") || full.includes("app=1")) {
  Componente = BoazApp; // app móvil repartidor
}

const Cargando = () => (
  <div style={{ minHeight:"100vh", background:"#0D1E3D", display:"flex", alignItems:"center", justifyContent:"center", color:"#E8780A", fontFamily:"system-ui,sans-serif", fontWeight:800, fontSize:28, letterSpacing:3 }}>
    BOAZ
  </div>
)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Suspense fallback={<Cargando />}>
      <Componente />
    </Suspense>
  </React.StrictMode>
)
