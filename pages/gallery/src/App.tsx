import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Gallery } from './components/Gallery'
import { Login } from './components/Login'
import { DeepLink } from './components/DeepLink'

function App() {
  return (
    <div className="dark">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Gallery />} />
          <Route path="/images" element={<Gallery filterBy="image" />} />
          <Route path="/videos" element={<Gallery filterBy="video" />} />
          <Route path="/image/:key" element={<DeepLink type="image" />} />
          <Route path="/video/:key" element={<DeepLink type="video" />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </BrowserRouter>
    </div>
  )
}

export default App
