import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Gallery } from './components/Gallery'
import { Login } from './components/Login'

function App() {
  return (
    <div className="dark">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Gallery />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </BrowserRouter>
    </div>
  )
}

export default App
