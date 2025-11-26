import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Gallery } from './components/Gallery'
import { Login } from './components/Login'
import { DeepLink } from './components/DeepLink'

function App() {
  return (
    <div className="dark">
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Gallery scope="public" />} />
          <Route path="/images" element={<Gallery scope="public" filterBy="image" />} />
          <Route path="/videos" element={<Gallery scope="public" filterBy="video" />} />

          {/* Private routes */}
          <Route path="/private" element={<Gallery scope="private" />} />
          <Route path="/private/images" element={<Gallery scope="private" filterBy="image" />} />
          <Route path="/private/videos" element={<Gallery scope="private" filterBy="video" />} />

          {/* Deep links */}
          <Route path="/image/:key" element={<DeepLink type="image" />} />
          <Route path="/video/:key" element={<DeepLink type="video" />} />

          {/* Auth */}
          <Route path="/login" element={<Login />} />
        </Routes>
      </BrowserRouter>
    </div>
  )
}

export default App
