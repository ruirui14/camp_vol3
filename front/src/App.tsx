//import { useState } from 'react'
// import reactLogo from './assets/react.svg'
// import viteLogo from '/vite.svg'
import './App.css'
import Home from'./pages/home'
import Camera from './pages/camera'
import Upload from './pages/upload'
import PhotoChange from './pages/photo_change'
import {BrowserRouter as Router, Routes, Route} from 'react-router-dom';

function App() {

  return (
    <>
    <Router basename='/app/'>
        {/* ルートの定義 */}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/camera" element={<Camera />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/photo_change" element={<PhotoChange />} />
        </Routes>
      </Router>
    </>
  )
}

export default App
