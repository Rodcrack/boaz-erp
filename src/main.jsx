import React from 'react'
import ReactDOM from 'react-dom/client'
import BoazERP from './BoazERP.jsx'
import BoazTracking from './BoazTracking.jsx'
import BoazApp from './BoazApp.jsx'
import BoazCliente from './BoazCliente.jsx'

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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Componente />
  </React.StrictMode>
)
